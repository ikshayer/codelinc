import { afterEach, describe, expect, it, vi } from "vitest";
import { createLiveSession } from "@/lib/adapters/live/voice";
import { base64, pcmWav } from "@/lib/adapters/live/voice-audio";
import { proxyVoice } from "@/lib/server/voice";
import type { VoiceEvent } from "@/lib/adapters/types";

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const info = { sessionId: "session", expiresAt: new Date(Date.now() + 60_000).toISOString(), capabilities: { interruption: true, transcription: true, simulated: false } };
const stream = (frames: unknown[]) => new Response(frames.map((frame) => JSON.stringify(frame)).join("\n") + "\n", { headers: { "Content-Type": "application/x-ndjson" } });

describe("live voice", () => {
  it("encodes clipped mono PCM with a correct WAV header", () => {
    const wav = pcmWav(new Float32Array([-2, 0, 2]), 16000), view = new DataView(wav.buffer as ArrayBuffer);
    expect(new TextDecoder().decode(wav.slice(0, 4))).toBe("RIFF");
    expect(view.getUint32(24, true)).toBe(16000);
    expect(view.getUint32(40, true)).toBe(6);
    expect(view.getInt16(44, true)).toBe(-32768); expect(view.getInt16(48, true)).toBe(32767);
    expect(atob(base64(wav)).length).toBe(50);
  });
  it("keeps person and assistant turns separate and preserves proposals when TTS fails", async () => {
    const extraction = { proposals: [], evidence: [], overflow: [], missingFieldPaths: [], reviewNotes: [] };
    const fetcher = vi.fn(async (url: string) => url.endsWith("/turns") ? stream([
      { type: "person", turnId: "t1", text: "Hello" }, { type: "reply", turnId: "t1", text: "Hi." },
      { type: "segment", turnId: "t1", index: 0, text: "Hi." }, { type: "complete", turnId: "t1", text: "Hi.", extraction },
    ]) : url.endsWith("/speech") ? Response.json({ error: { code: "UNAVAILABLE", message: "TTS unavailable", retryable: true } }, { status: 503 }) : new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetcher);
    const handle = createLiveSession(info, "token"), events: VoiceEvent[] = []; handle.subscribe((e) => events.push(e)); handle.sendText("Hello");
    await vi.waitFor(() => expect(events.some((e) => e.type === "error")).toBe(true));
    expect(events.flatMap((e) => e.type === "transcript" && e.final ? [e.turnId] : [])).toEqual(["t1:person", "t1:assistant"]);
    expect(events.some((e) => e.type === "proposals")).toBe(true);
    expect(events.at(-1)).toMatchObject({ type: "state", state: "listening" });
    await handle.end();
    expect(fetcher.mock.calls.at(-1)?.[0]).toBe("/api/voice/sessions/session");
  });
  it("aborts requests on end and discards late events", async () => {
    let finish!: (response: Response) => void, signal: AbortSignal | undefined;
    const fetcher = vi.fn((url: string, init: RequestInit) => {
      if (!url.endsWith("/turns")) return Promise.resolve(new Response(null, { status: 204 }));
      signal = init.signal as AbortSignal; return new Promise<Response>((resolve) => { finish = resolve; });
    });
    vi.stubGlobal("fetch", fetcher);
    const handle = createLiveSession(info, "token"), events: VoiceEvent[] = []; handle.subscribe((e) => events.push(e)); handle.sendText("Hello");
    await handle.end(); expect(signal?.aborted).toBe(true);
    expect(fetcher.mock.calls.at(-1)?.[1]).toMatchObject({ method: "DELETE", keepalive: true });
    const count = events.length; finish(stream([{ type: "person", turnId: "late", text: "discard" }]));
    await new Promise((resolve) => setTimeout(resolve, 10)); expect(events).toHaveLength(count);
  });
  it("does not resume speech when new sentences arrive after Stop speaking", async () => {
    let sink!: ReadableStreamDefaultController<Uint8Array>;
    const fetcher = vi.fn(async (url: string) => url.endsWith("/turns") ? new Response(new ReadableStream<Uint8Array>({ start(controller) { sink = controller; } })) : new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetcher);
    const handle = createLiveSession(info, "token"), events: VoiceEvent[] = []; handle.subscribe((e) => events.push(e)); handle.sendText("Hi");
    await vi.waitFor(() => expect(sink).toBeDefined());
    handle.stopSpeaking();
    sink.enqueue(new TextEncoder().encode([
      { type: "segment", turnId: "t", index: 0, text: "Late sentence." },
      { type: "complete", turnId: "t", text: "Late sentence." },
    ].map((frame) => JSON.stringify(frame)).join("\n") + "\n")); sink.close();
    await vi.waitFor(() => expect(events.some((e) => e.type === "transcript" && e.final)).toBe(true));
    expect(fetcher.mock.calls.some(([url]) => url.endsWith("/speech"))).toBe(false);
    await handle.end();
  });
});

describe("voice proxy", () => {
  it("rejects another origin before calling the backend", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    const response = await proxyVoice(new Request("http://localhost:3000/api/voice/sessions", { method: "POST", headers: { Origin: "https://another-site.example" } }), "/api/voice/sessions");
    expect(response.status).toBe(403); expect(fetcher).not.toHaveBeenCalled();
  });
  it("passes binary audio through without trying to parse JSON", async () => {
    const wav = pcmWav(new Float32Array([0, 0.5]), 16000);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array(wav), { headers: { "Content-Type": "audio/wav" } })));
    const response = await proxyVoice(new Request("http://localhost:3000/api/voice/sessions/s/speech", { method: "POST", body: "{}" }), "/api/voice/sessions/s/speech");
    expect(response.headers.get("content-type")).toBe("audio/wav"); expect(new Uint8Array(await response.arrayBuffer())).toEqual(wav);
  });
});
