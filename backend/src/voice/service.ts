import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { extraction, modelReply, replyPrefix, sessionInput, turnInput } from "./contracts.js";
import { VoiceFailure, type ConversationTurn, type Generate } from "./gemini.js";

type Session = { token: string; expires: number; history: ConversationTurn[]; segments: Map<string, string[]>; busy: boolean; controller: AbortController | null; lifetime: AbortController; speechBusy: boolean; turns: number };
export type Synthesize = (text: string, signal: AbortSignal) => Promise<Uint8Array>;
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
export function createVoiceService(options: { generate: Generate; synthesize: Synthesize; configured: boolean; now?: () => number; ttl?: number }) {
  const sessions = new Map<string, Session>();
  const now = options.now ?? Date.now;
  const close = (id: string) => { sessions.get(id)?.controller?.abort(); sessions.get(id)?.lifetime.abort(); sessions.delete(id); };
  const reap = () => { for (const [id, s] of sessions) if (s.expires <= now()) close(id); };
  const authorize = (request: Request, id: string) => {
    reap(); const session = sessions.get(id);
    const token = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
    if (!session || !/^[a-f0-9]{64}$/.test(token) || !timingSafeEqual(Buffer.from(token), Buffer.from(session.token))) throw new VoiceFailure(401, "UNAUTHORIZED", "This conversation expired or is no longer available. Start a new conversation.");
    return session;
  };
  return {
    dispose() { for (const id of sessions.keys()) close(id); },
    reap,
    async handle(request: Request): Promise<Response> {
      try {
        const path = new URL(request.url).pathname;
        if (path === "/health" && request.method === "GET") return json({ service: "voice", geminiConfigured: options.configured, activeSessions: sessions.size });
        if (path === "/api/voice/sessions" && request.method === "POST") {
          sessionInput.parse(await request.json());
          if (!options.configured) throw new VoiceFailure(503, "UNAVAILABLE", "Add GEMINI_API_KEY to backend/.env.local and restart the voice service.");
          reap();
          if (sessions.size >= 20) throw new VoiceFailure(429, "RATE_LIMITED", "The voice service is busy. Try again shortly.", true);
          const sessionId = randomUUID(), token = randomBytes(32).toString("hex"), expires = now() + (options.ttl ?? 15 * 60_000);
          sessions.set(sessionId, { token, expires, history: [], segments: new Map(), busy: false, controller: null, lifetime: new AbortController(), speechBusy: false, turns: 0 });
          return json({ sessionId, token, expiresAt: new Date(expires).toISOString(), capabilities: { interruption: true, transcription: true, simulated: false } }, 201);
        }
        const match = /^\/api\/voice\/sessions\/([\da-f-]{36})(?:\/(turns|speech))?$/.exec(path);
        if (!match) throw new VoiceFailure(404, "NOT_FOUND", "Voice route not found.");
        const [, id, action] = match;
        const session = authorize(request, id);
        if (!action && request.method === "DELETE") { close(id); return new Response(null, { status: 204 }); }
        if (action === "speech" && request.method === "POST") {
          const body = await request.json() as { turnId?: string; index?: number };
          const segment = typeof body.turnId === "string" && Number.isInteger(body.index) && (body.index ?? -1) >= 0 ? session.segments.get(body.turnId)?.[body.index!] : undefined;
          if (!segment) throw new VoiceFailure(404, "NOT_FOUND", "That spoken reply is no longer available.");
          if (session.speechBusy) throw new VoiceFailure(409, "CONFLICT", "A spoken reply is already being generated.", true);
          session.speechBusy = true;
          try {
            const audio = await options.synthesize(segment, AbortSignal.any([request.signal, session.lifetime.signal]));
            if (!sessions.has(id)) throw new VoiceFailure(401, "UNAUTHORIZED", "The conversation ended.");
            return new Response(new Uint8Array(audio), { headers: { "Content-Type": "audio/wav", "Cache-Control": "no-store" } });
          } finally { session.speechBusy = false; }
        }
        if (action !== "turns" || request.method !== "POST") throw new VoiceFailure(405, "INVALID", "Method not allowed.");
        const input = turnInput.parse(await request.json());
        if ("audio" in input) {
          const wav = Buffer.from(input.audio, "base64");
          if (wav.toString("base64") !== input.audio || wav.toString("ascii", 0, 4) !== "RIFF" || wav.toString("ascii", 8, 12) !== "WAVE") throw new VoiceFailure(422, "INVALID", "Audio must be a complete WAV recording.");
        }
        if (session.busy) throw new VoiceFailure(409, "CONFLICT", "Wait for the current reply before sending another message.", true);
        if (session.turns >= 40) throw new VoiceFailure(429, "RATE_LIMITED", "This conversation reached its message limit. Start a new conversation.");
        session.turns++; session.busy = true;
        const controller = new AbortController(); session.controller = controller;
        const signal = AbortSignal.any([controller.signal, request.signal]);
        const turnId = randomUUID();
        const segments: string[] = []; session.segments.set(turnId, segments);
        // Keep only a few recent replies for bounded memory and speech lookups.
        if (session.segments.size > 3) session.segments.delete(session.segments.keys().next().value!);
        const stream = new ReadableStream<Uint8Array>({
          start: (sink) => {
            const encoder = new TextEncoder();
            const emit = (event: Record<string, unknown>) => { if (!signal.aborted) sink.enqueue(encoder.encode(`${JSON.stringify(event)}\n`)); };
            const sendSegment = (text: string) => {
              const clean = text.trim(); if (!clean) return;
              const index = segments.push(clean) - 1;
              emit({ type: "segment", turnId, index, text: clean });
            };
            void (async () => {
              let raw = "", spokenLength = 0;
              try {
                if ("text" in input) emit({ type: "person", turnId, text: input.text });
                for await (const chunk of options.generate(input, session.history, signal)) {
                  if (signal.aborted) break;
                  raw += chunk;
                  if (raw.length > 40_000) throw new VoiceFailure(502, "UNREADABLE", "The assistant's reply was too long. Try again.", true);
                  const partial = replyPrefix(raw).slice(0, 480);
                  emit({ type: "reply", turnId, text: partial });
                  const pending = partial.slice(spokenLength);
                  // Ignore decimal points; send complete sentences while Gemini is still generating.
                  const boundary = /[.!?](?=\s)/g;
                  let sentence: RegExpExecArray | null;
                  let consumed = 0;
                  while ((sentence = boundary.exec(pending))) {
                    const end = sentence.index + 1;
                    sendSegment(pending.slice(consumed, end)); consumed = end;
                  }
                  spokenLength += consumed;
                }
                if (signal.aborted) return;
                const parsed = modelReply.parse(JSON.parse(raw));
                const transcript = "text" in input ? input.text : parsed.transcript;
                if (!("text" in input)) emit({ type: "person", turnId, text: transcript });
                sendSegment(parsed.reply.slice(spokenLength));
                session.history.push({ person: transcript, assistant: parsed.reply });
                session.history = session.history.slice(-10);
                emit({ type: "complete", turnId, text: parsed.reply, extraction: extraction(parsed, transcript, id, `${turnId}:person`) });
              } catch (error) {
                if (!signal.aborted) {
                  const failure = error instanceof VoiceFailure ? error : new VoiceFailure(502, "UNAVAILABLE", "The assistant couldn't finish that reply. Try again.", true);
                  emit({ type: "error", error: { code: failure.code, message: failure.message, retryable: failure.retryable } });
                }
              } finally {
                session.busy = false; session.controller = null;
                try { sink.close(); } catch { /* client cancelled */ }
              }
            })();
          },
          cancel() { controller.abort(); },
        });
        return new Response(stream, { headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store", "X-Accel-Buffering": "no" } });
      } catch (error) {
        const failure = error instanceof VoiceFailure ? error : new VoiceFailure(422, "INVALID", "The voice request is invalid.");
        return json({ error: { code: failure.code, message: failure.message, retryable: failure.retryable } }, failure.status);
      }
    },
  };
}

export function createChatterboxSynthesize(base: string): Synthesize {
  const url = new URL(base);
  // Private local service only; no audio or text sent to third-party TTS.
  if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) throw new Error("CHATTERBOX_URL must point to a loopback address.");
  return async (text, signal) => {
    try {
      const response = await fetch(new URL("/synthesize", url), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }), signal: AbortSignal.any([signal, AbortSignal.timeout(90_000)]) });
      if (!response.ok || !response.headers.get("content-type")?.includes("audio/wav")) throw new Error("TTS not ready");
      return new Uint8Array(await response.arrayBuffer());
    } catch {
      throw new VoiceFailure(503, "UNAVAILABLE", "Chatterbox isn't ready. The written reply is available; check the local voice service for GPU or model setup errors.", true);
    }
  };
}
