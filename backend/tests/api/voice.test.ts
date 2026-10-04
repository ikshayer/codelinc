import { describe, expect, it, vi } from "vitest";
import { extraction, modelReply, replyPrefix } from "../../src/voice/contracts.js";
import { createGeminiGenerate } from "../../src/voice/gemini.js";
import { createVoiceService } from "../../src/voice/service.js";

const payload = { transcript: "My yearly maximum is 1500", reply: "Thanks. What is your deductible?", proposals: [{ fieldPath: "plan.y1.annualMaximum", value: "1500", quote: "yearly maximum is 1500" }], overflow: [] };
const request = (path: string, body?: unknown, token?: string, method = "POST") => new Request(`http://localhost${path}`, { method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
async function session(service: ReturnType<typeof createVoiceService>) {
  const response = await service.handle(request("/api/voice/sessions", { analysisId: "a1", revision: 0, consent: true }));
  expect(response.status).toBe(201);
  return await response.json() as { sessionId: string; token: string };
}

describe("voice service", () => {
  it("loads member and draft context once and passes it only to that session", async () => {
    const context = { facts: { "care.p1.label": { value: "Crown", status: "proposed" } }, missingFields: ["care.p1.fee"], records: { benefits: { annual_maximum_remaining_cents: 100000 } } };
    const loadContext = vi.fn(async () => context);
    const generate = vi.fn(async function* () { yield JSON.stringify(payload); });
    const service = createVoiceService({ configured: true, generate, synthesize: vi.fn(), loadContext });
    const body = { analysisId: "a1", revision: 2, consent: true, memberId: "SYN-MEMBER-0001", facts: context.facts };
    const response = await service.handle(request("/api/voice/sessions", body));
    expect(response.status).toBe(201);
    const s = await response.json();
    expect(loadContext).toHaveBeenCalledWith(body);
    const turn = await service.handle(request(`/api/voice/sessions/${s.sessionId}/turns`, { text: "hi" }, s.token));
    await turn.text();
    expect(generate).toHaveBeenCalledWith({ text: "hi" }, expect.any(Array), expect.any(AbortSignal), context);
    service.dispose();
  });

  it("does not start a contextless session when the selected member cannot load", async () => {
    const service = createVoiceService({ configured: true, generate: vi.fn(), synthesize: vi.fn(), loadContext: async () => { throw new Error("database unavailable"); } });
    expect((await service.handle(request("/api/voice/sessions", { analysisId: "a1", revision: 0, consent: true, memberId: "SYN-MEMBER-0001" }))).status).toBe(503);
    service.dispose();
  });
  it("requires consent, configuration and a session capability", async () => {
    const generate = vi.fn(async function* () { yield JSON.stringify(payload); });
    const service = createVoiceService({ configured: true, generate, synthesize: vi.fn() });
    expect((await service.handle(request("/api/voice/sessions", { analysisId: "a", revision: 0, consent: false }))).status).toBe(422);
    const s = await session(service);
    const path = `/api/voice/sessions/${s.sessionId}/turns`;
    expect((await service.handle(request(path, { text: "hi" }))).status).toBe(401);
    expect((await service.handle(request(path, { text: "hi" }, "é".repeat(64)))).status).toBe(401);
    expect(generate).not.toHaveBeenCalled();
    expect((await service.handle(request(`/api/voice/sessions/${s.sessionId}`, undefined, s.token, "DELETE"))).status).toBe(204);
    expect((await service.handle(request(path, { text: "hi" }, s.token))).status).toBe(401);
    const unavailable = createVoiceService({ configured: false, generate, synthesize: vi.fn() });
    expect((await unavailable.handle(request("/api/voice/sessions", { analysisId: "a", revision: 0, consent: true }))).status).toBe(503);
  });

  it("streams a sentence before facts complete and permits synthesis only of that reply", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const first = '{"transcript":"My yearly maximum is 1500","reply":"Thanks. ';
    const generate = vi.fn(async function* () { yield first; await gate; yield 'What is your deductible?","proposals":[{"fieldPath":"plan.y1.annualMaximum","value":"1500","quote":"yearly maximum is 1500"}],"overflow":[]}'; });
    const synthesize = vi.fn(async () => new Uint8Array([82, 73, 70, 70]));
    const service = createVoiceService({ configured: true, generate, synthesize });
    const s = await session(service), base = `/api/voice/sessions/${s.sessionId}`;
    const response = await service.handle(request(`${base}/turns`, { text: payload.transcript }, s.token));
    const reader = response.body!.getReader(), frames: Record<string, any>[] = [];
    while (!frames.some((f) => f.type === "segment")) {
      const { value } = await reader.read(); frames.push(...new TextDecoder().decode(value).trim().split("\n").map((line) => JSON.parse(line)));
    }
    expect(frames.some((f) => f.type === "complete")).toBe(false);
    const segment = frames.find((f) => f.type === "segment")!;
    expect((await service.handle(request(`${base}/speech`, { turnId: segment.turnId, index: segment.index }, s.token))).headers.get("content-type")).toBe("audio/wav");
    expect(synthesize).toHaveBeenCalledWith("Thanks.", expect.any(AbortSignal));
    expect((await service.handle(request(`${base}/speech`, { text: "arbitrary text" }, s.token))).status).toBe(404);
    expect((await service.handle(request(`${base}/turns`, { text: "second" }, s.token))).status).toBe(409);
    release();
    while (true) { const { done, value } = await reader.read(); if (done) break; frames.push(...new TextDecoder().decode(value).trim().split("\n").map((line) => JSON.parse(line))); }
    const completed = frames.find((f) => f.type === "complete")!;
    expect(completed.extraction.proposals).toMatchObject([{ fieldPath: "plan.y1.annualMaximum", value: "1500" }]);
    expect(completed.extraction.evidence[0].literalQuote).toBe("yearly maximum is 1500");
    expect((await service.handle(request(`${base}/turns`, { audio: "x".repeat(70), mimeType: "audio/wav" }, s.token))).status).toBe(422);
    service.dispose();
  });

  it("expires sessions and aborts active generation", async () => {
    let clock = 1, aborted: AbortSignal | undefined;
    const generate = async function* (_input: unknown, _history: unknown, signal: AbortSignal) { aborted = signal; yield JSON.stringify(payload); };
    const service = createVoiceService({ configured: true, generate, synthesize: vi.fn(), now: () => clock, ttl: 100 });
    const s = await session(service);
    await service.handle(request(`/api/voice/sessions/${s.sessionId}/turns`, { text: "hi" }, s.token));
    clock = 101; service.reap();
    expect(aborted?.aborted).toBe(true);
    expect((await service.handle(request(`/api/voice/sessions/${s.sessionId}/turns`, { text: "hi" }, s.token))).status).toBe(401);
  });
});

describe("Gemini boundary", () => {
  it("keeps forbidden, malformed and unsupported facts out of the draft", () => {
    const reply = modelReply.parse({ ...payload, proposals: [
      ...payload.proposals, { fieldPath: "care.p1.eligibilityConfirmed", value: true, quote: "1500" },
      { fieldPath: "timing.p1.permission", value: "approved", quote: "1500" },
      { fieldPath: "care.p1.fee", value: "0", quote: "invented fee" },
      { fieldPath: "plan.rules.major.deductibleApplies", value: "true", quote: "1500" },
      { fieldPath: "care.p1.anchorDate", value: "2026-02-30", quote: "1500" },
    ] });
    expect(extraction(reply, payload.transcript, "s", "t").proposals).toHaveLength(1);
    expect(replyPrefix('{"reply":"Hello \\u0021\\nNext \\u00')).toBe("Hello !\nNext ");
  });
  it("parses fragmented SSE and sends the key only in a server header", async () => {
    const encoded = `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] }, finishReason: "STOP" }] })}\n\n`;
    const fetcher = vi.fn(async () => new Response(new ReadableStream({ start(controller) {
      controller.enqueue(new TextEncoder().encode(encoded.slice(0, 17))); controller.enqueue(new TextEncoder().encode(encoded.slice(17))); controller.close();
    } })));
    const generate = createGeminiGenerate({ key: "test-key", fetch: fetcher });
    let result = ""; for await (const part of generate({ text: payload.transcript }, [], new AbortController().signal)) result += part;
    expect(JSON.parse(result)).toEqual(payload);
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).not.toContain("test-key");
    expect(init.headers).toMatchObject({ "x-goog-api-key": "test-key" });
    expect(url).toContain("gemini-3.5-flash-lite");
    expect(JSON.parse(init.body as string).generationConfig.thinkingConfig.thinkingLevel).toBe("MINIMAL");
  });
  it("reports quota errors without leaking provider response bodies", async () => {
    const generate = createGeminiGenerate({ key: "secret", fetch: async () => new Response("private provider details", { status: 429 }) });
    await expect((async () => { for await (const _part of generate({ text: "hi" }, [], new AbortController().signal)) { /* exhaust */ } })()).rejects.toMatchObject({ code: "RATE_LIMITED", status: 429 });
  });
});
