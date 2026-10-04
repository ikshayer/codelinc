import { adapterError, errorFromHttp, requestJson } from "../shared";
import type { AdapterError, AdapterResult, IntakeExtraction, VoiceAdapter, VoiceAgentState, VoiceEvent, VoiceSessionHandle, VoiceSessionInfo } from "../types";
import { captureUtterances } from "./voice-audio";

interface SessionResponse extends VoiceSessionInfo { token: string }
type StreamFrame = { type: "person" | "reply" | "segment" | "complete"; turnId: string; text: string; index?: number; extraction?: IntakeExtraction } | { type: "error"; error: AdapterError };
type EventBody = VoiceEvent extends infer E ? E extends VoiceEvent ? Omit<E, "sessionId" | "sequence"> : never : never;

export function createLiveSession(info: VoiceSessionInfo, token: string): VoiceSessionHandle {
  const listeners = new Set<(event: VoiceEvent) => void>();
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, url = `/api/voice/sessions/${encodeURIComponent(info.sessionId)}`;
  let sequence = 0, ended = false, muted = false, busy = false, speechEpoch = 0;
  let capture: ReturnType<typeof captureUtterances> | null = null, turnController: AbortController | null = null;
  let speechController = new AbortController(), downloadChain = Promise.resolve(), playChain = Promise.resolve();
  let player: HTMLAudioElement | null = null, stopPlayer: (() => void) | null = null;
  let pendingSpeech = 0, audioFailed = false, suppressSpeech = false;
  const emit = (event: EventBody) => { if (!ended) { sequence++; for (const listener of [...listeners]) listener({ ...event, sessionId: info.sessionId, sequence } as VoiceEvent); } };
  const state = (value: VoiceAgentState) => emit({ type: "state", state: value });
  const error = (value: AdapterError) => emit({ type: "error", error: value });
  const idle = () => { if (!ended && !busy && !pendingSpeech) { state(muted ? "muted" : "listening"); capture?.setActive(!muted); } };
  const stopSpeech = () => {
    speechEpoch++; speechController.abort(); speechController = new AbortController();
    stopPlayer?.(); player?.pause(); player = null; stopPlayer = null;
    pendingSpeech = 0; downloadChain = Promise.resolve(); playChain = Promise.resolve(); idle();
  };
  const enqueueSpeech = (turnId: string, index: number) => {
    if (suppressSpeech) return;
    const epoch = speechEpoch, signal = speechController.signal; pendingSpeech++;
    // Synthesize the next sentence while the preceding sentence plays.
    const download = downloadChain.then(async () => {
      if (ended || epoch !== speechEpoch || audioFailed) return null;
      const response = await fetch(`${url}/speech`, { method: "POST", headers, body: JSON.stringify({ turnId, index }), signal: AbortSignal.any([signal, AbortSignal.timeout(95_000)]), credentials: "same-origin" });
      if (!response.ok) throw errorFromHttp(response.status, await response.json().catch(() => null), "speech service");
      if (!response.headers.get("content-type")?.includes("audio/wav")) throw adapterError("UNREADABLE", "The spoken reply couldn't be played. Read the written reply instead.", true);
      return await response.blob();
    });
    const safeDownload = download.catch((failure: unknown) => {
      if (!signal.aborted && !ended && epoch === speechEpoch) { audioFailed = true; error(failure && typeof failure === "object" && "code" in failure ? failure as AdapterError : adapterError("UNAVAILABLE", "The spoken reply isn't available. You can continue with the written reply.", true)); }
      return null;
    });
    downloadChain = safeDownload.then(() => undefined);
    playChain = playChain.then(async () => {
      const blob = await safeDownload; if (!blob || ended || epoch !== speechEpoch) return;
      const objectUrl = URL.createObjectURL(blob), audio = new Audio(objectUrl); player = audio;
      try {
        await new Promise<void>((resolve, reject) => {
          stopPlayer = resolve; audio.onended = () => resolve(); audio.onerror = () => reject(new Error("playback"));
          state("speaking"); capture?.setActive(!muted && !busy);
          void audio.play().catch(reject);
        });
      } catch { if (!ended && epoch === speechEpoch) { audioFailed = true; error(adapterError("UNAVAILABLE", "Your browser couldn't play the reply. Allow sound for this site or continue typing.", true)); } }
      finally { audio.pause(); audio.src = ""; URL.revokeObjectURL(objectUrl); if (player === audio) { player = null; stopPlayer = null; } }
    }).finally(() => { if (epoch === speechEpoch) { pendingSpeech--; idle(); } });
  };
  const sendTurn = async (input: { text: string } | { audio: string; mimeType: "audio/wav" }) => {
    if (ended) return;
    if (busy) { error(adapterError("CONFLICT", "Wait for the current reply before sending another message.", true)); return; }
    stopSpeech(); busy = true; audioFailed = false; suppressSpeech = false; state("thinking"); capture?.setActive(false);
    const controller = new AbortController(); turnController = controller;
    const timeout = AbortSignal.timeout(65_000); let complete = false;
    try {
      const response = await fetch(`${url}/turns`, { method: "POST", headers, body: JSON.stringify(input), signal: AbortSignal.any([controller.signal, timeout]), credentials: "same-origin" });
      if (!response.ok) { error(errorFromHttp(response.status, await response.json().catch(() => null), "voice service")); return; }
      if (!response.body) throw new Error("Missing voice stream");
      const reader = response.body.getReader(), decoder = new TextDecoder(); let buffer = "";
      try {
        while (!ended) {
          const { value, done } = await reader.read(); buffer += decoder.decode(value, { stream: !done });
          let newline: number;
          while ((newline = buffer.indexOf("\n")) >= 0) {
            const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1); if (!line.trim()) continue;
            const frame = JSON.parse(line) as StreamFrame;
            if (frame.type === "error") { error(frame.error); complete = true; stopSpeech(); continue; }
            if (frame.type === "person") emit({ type: "transcript", turnId: `${frame.turnId}:person`, speaker: "person", text: frame.text, final: true });
            if (frame.type === "reply" && frame.text) emit({ type: "transcript", turnId: `${frame.turnId}:assistant`, speaker: "assistant", text: frame.text, final: false });
            if (frame.type === "segment" && Number.isInteger(frame.index)) enqueueSpeech(frame.turnId, frame.index!);
            if (frame.type === "complete") { complete = true; emit({ type: "transcript", turnId: `${frame.turnId}:assistant`, speaker: "assistant", text: frame.text, final: true }); if (frame.extraction) emit({ type: "proposals", turnId: `${frame.turnId}:person`, extraction: frame.extraction }); }
          }
          if (done) break;
        }
      } finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
      if (!complete && !ended) throw new Error("Incomplete voice stream");
    } catch { if (!ended && !controller.signal.aborted) { stopSpeech(); error(adapterError(timeout.aborted ? "TIMEOUT" : "NETWORK", "The reply was interrupted. Please try again.", true)); } }
    finally { busy = false; turnController = null; if (player) capture?.setActive(!muted); idle(); }
  };
  const expiry = setTimeout(() => { emit({ type: "ended", reason: "expired" }); void handle.end(); }, Math.max(0, Date.parse(info.expiresAt) - Date.now()));
  const handle: VoiceSessionHandle = {
    info, subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    attachMicrophone(stream) {
      if (ended || capture) return;
      try { capture = captureUtterances(stream, (audio) => { void sendTurn({ audio, mimeType: "audio/wav" }); }, () => { if (player) { suppressSpeech = true; stopSpeech(); } }, () => { error(adapterError("UNSUPPORTED_TYPE", "Audio capture failed. You can type instead.", true)); capture?.setActive(false); }); }
      catch { error(adapterError("UNSUPPORTED_TYPE", "This browser can't record audio. Type instead.")); }
    },
    setMuted(value) { muted = value; capture?.setActive(!muted && !busy); if (muted) state("muted"); else idle(); },
    stopSpeaking() { suppressSpeech = true; stopSpeech(); }, sendText(text) { if (text.trim()) void sendTurn({ text: text.trim() }); },
    async end() { if (ended) return; ended = true; clearTimeout(expiry); turnController?.abort(); stopSpeech(); capture?.close(); listeners.clear(); await requestJson<void>(url, { method: "DELETE", headers, keepalive: true, timeoutMs: 5000 }); },
  };
  return handle;
}

export const liveVoiceAdapter: VoiceAdapter = {
  mode: "live",
  async createSession(input, scope): Promise<AdapterResult<VoiceSessionHandle>> {
    const created = await requestJson<SessionResponse>("/api/voice/sessions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ analysisId: scope.analysisId, revision: scope.revision, consent: input.consent }), signal: scope.signal, timeoutMs: 10_000, service: "voice service" });
    if (!created.ok) return created;
    const s = created.value;
    if (typeof s.sessionId !== "string" || typeof s.token !== "string" || !Number.isFinite(Date.parse(s.expiresAt)) || s.capabilities?.simulated !== false) return { ok: false, error: adapterError("UNREADABLE", "The voice service returned an unusable session.", true) };
    const handle = createLiveSession({ sessionId: s.sessionId, expiresAt: s.expiresAt, capabilities: s.capabilities }, s.token);
    if (scope.signal.aborted) { await handle.end(); return { ok: false, error: adapterError("CANCELLED", "Request cancelled.") }; }
    return { ok: true, value: handle };
  },
};
