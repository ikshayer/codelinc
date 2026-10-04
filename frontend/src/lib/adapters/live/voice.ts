import { adapterError, requestJson } from "../shared";
import type {
  AdapterError,
  AdapterResult,
  IntakeExtraction,
  RequestScope,
  VoiceAdapter,
  VoiceAgentState,
  VoiceEvent,
  VoiceSessionHandle,
  VoiceSessionInfo,
} from "../types";

// Proposed contract (FRONTEND_DESIGN.md §15), not a claim that the endpoints exist.
//
//   POST   /api/voice/sessions      {analysisId, revision, consent: true}
//                                   -> {sessionId, transportUrl, expiresAt, capabilities}
//   WebSocket transportUrl          server -> client: JSON VoiceEvent text frames
//                                   client -> server: binary frames = audio chunks (MediaRecorder,
//                                   provider-neutral container) and JSON text frames
//                                   {type: "text", text} | {type: "mute", muted} | {type: "interrupt"} | {type: "end"}
//   DELETE /api/voice/sessions/:id  releases the session
//
// The server echoes typed text as a final person transcript event so every
// client shows the same transcript. No provider keys reach the browser; any
// credential in `transportUrl` must be short-lived and issued by the backend.

const OPEN_TIMEOUT_MS = 10_000;
const MAX_TIMER_MS = 2_147_483_647;
const AUDIO_TIMESLICE_MS = 250;
const AGENT_STATES: readonly VoiceAgentState[] = ["connecting", "listening", "thinking", "speaking", "muted", "reconnecting", "ended", "failed"];
const END_REASONS = ["user", "provider", "expired"] as const;

interface SessionResponse {
  sessionId: string;
  transportUrl: string;
  expiresAt: string;
  capabilities: VoiceSessionInfo["capabilities"];
}

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSessionResponse(value: unknown): value is SessionResponse {
  if (!isRecord(value) || !isRecord(value.capabilities)) return false;
  const { capabilities } = value;
  return (
    typeof value.sessionId === "string" &&
    value.sessionId.length > 0 &&
    typeof value.transportUrl === "string" &&
    typeof value.expiresAt === "string" &&
    typeof capabilities.interruption === "boolean" &&
    typeof capabilities.transcription === "boolean" &&
    typeof capabilities.simulated === "boolean"
  );
}

function isAdapterError(value: unknown): value is AdapterError {
  return isRecord(value) && typeof value.code === "string" && typeof value.message === "string" && typeof value.retryable === "boolean";
}

function isExtraction(value: unknown): value is IntakeExtraction {
  return (
    isRecord(value) &&
    Array.isArray(value.proposals) &&
    Array.isArray(value.evidence) &&
    Array.isArray(value.overflow) &&
    Array.isArray(value.missingFieldPaths) &&
    Array.isArray(value.reviewNotes)
  );
}

/** Returns a VoiceEvent only when the frame is well formed and belongs to this session. */
function parseVoiceEvent(raw: unknown, sessionId: string): VoiceEvent | null {
  if (!isRecord(raw) || raw.sessionId !== sessionId || typeof raw.sequence !== "number" || !Number.isInteger(raw.sequence)) return null;
  const { sequence } = raw;
  switch (raw.type) {
    case "state":
      return AGENT_STATES.includes(raw.state as VoiceAgentState) ? { type: "state", sessionId, sequence, state: raw.state as VoiceAgentState } : null;
    case "transcript":
      return typeof raw.turnId === "string" &&
        (raw.speaker === "assistant" || raw.speaker === "person") &&
        typeof raw.text === "string" &&
        typeof raw.final === "boolean"
        ? { type: "transcript", sessionId, sequence, turnId: raw.turnId, speaker: raw.speaker, text: raw.text, final: raw.final }
        : null;
    case "proposals":
      return typeof raw.turnId === "string" && isExtraction(raw.extraction)
        ? { type: "proposals", sessionId, sequence, turnId: raw.turnId, extraction: raw.extraction }
        : null;
    case "error":
      return isAdapterError(raw.error) ? { type: "error", sessionId, sequence, error: raw.error } : null;
    case "ended":
      return END_REASONS.includes(raw.reason as (typeof END_REASONS)[number])
        ? { type: "ended", sessionId, sequence, reason: raw.reason as (typeof END_REASONS)[number] }
        : null;
    default:
      return null;
  }
}

/** Resolves a backend-issued transport URL to a WebSocket URL. Anything else is rejected. */
function resolveTransportUrl(transportUrl: string): URL | null {
  let url: URL;
  try {
    url = new URL(transportUrl, window.location.href);
  } catch (error) {
    console.warn("Voice transport URL is not valid", error);
    return null;
  }
  if (url.protocol === "http:") url.protocol = "ws:";
  else if (url.protocol === "https:") url.protocol = "wss:";
  return url.protocol === "ws:" || url.protocol === "wss:" ? url : null;
}

function openSocket(url: URL, signal: AbortSignal): Promise<AdapterResult<WebSocket>> {
  return new Promise((resolve) => {
    const socket = new WebSocket(url);
    const finish = (result: AdapterResult<WebSocket>) => {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      socket.removeEventListener("open", onOpen);
      socket.removeEventListener("error", onError);
      if (!result.ok) socket.close();
      resolve(result);
    };
    const onOpen = () => finish({ ok: true, value: socket });
    const onError = () => finish({ ok: false, error: adapterError("NETWORK", "Couldn't connect to the voice service. Check your connection and try again.", true) });
    const onAbort = () => finish({ ok: false, error: adapterError("CANCELLED", "Request cancelled.") });
    const timer = setTimeout(
      () => finish({ ok: false, error: adapterError("TIMEOUT", "The voice service took too long to connect. Try again.", true) }),
      OPEN_TIMEOUT_MS,
    );
    socket.addEventListener("open", onOpen);
    socket.addEventListener("error", onError);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function releaseSession(sessionId: string): Promise<AdapterResult<void>> {
  return requestJson<void>(`/api/voice/sessions/${encodeURIComponent(sessionId)}`, { method: "DELETE", timeoutMs: 5000 });
}

function preferredAudioType(): string | undefined {
  return ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/mp4"].find((type) => MediaRecorder.isTypeSupported(type));
}

function createLiveSession(info: VoiceSessionInfo, socket: WebSocket): VoiceSessionHandle {
  const { sessionId } = info;
  const listeners = new Set<(event: VoiceEvent) => void>();
  let lastSequence = 0;
  let ended = false;
  /** The server announced the end, so the socket closing afterwards is expected. */
  let serverEnded = false;
  let recorder: MediaRecorder | null = null;
  let expiryTimer: ReturnType<typeof setTimeout> | null = null;

  const deliver = (event: VoiceEvent) => {
    for (const listener of [...listeners]) listener(event);
  };

  /** Events created by the adapter itself (connection loss, local failures) continue the server's sequence. */
  const deliverLocal = (body: { type: "error"; error: AdapterError } | { type: "state"; state: VoiceAgentState } | { type: "ended"; reason: "expired" }) => {
    lastSequence += 1;
    deliver({ ...body, sessionId, sequence: lastSequence });
  };

  const sendJson = (payload: UnknownRecord): boolean => {
    if (socket.readyState !== WebSocket.OPEN) return false;
    socket.send(JSON.stringify(payload));
    return true;
  };

  const stopRecorder = () => {
    if (recorder && recorder.state !== "inactive") recorder.stop();
    recorder = null;
  };

  const release = async () => {
    ended = true;
    if (expiryTimer) clearTimeout(expiryTimer);
    stopRecorder();
    sendJson({ type: "end" });
    socket.close(1000, "ended");
    listeners.clear();
    const released = await releaseSession(sessionId);
    if (!released.ok) console.warn("Voice session could not be released", released.error);
  };

  socket.addEventListener("message", (message: MessageEvent) => {
    if (ended || typeof message.data !== "string") return;
    let raw: unknown;
    try {
      raw = JSON.parse(message.data);
    } catch (error) {
      console.warn("Dropped an unreadable voice event", error);
      return;
    }
    const event = parseVoiceEvent(raw, sessionId);
    // Other sessions' events and out-of-order or replayed events never reach the UI.
    if (!event || event.sequence <= lastSequence) return;
    lastSequence = event.sequence;
    if (event.type === "ended") serverEnded = true;
    deliver(event);
  });

  socket.addEventListener("close", () => {
    if (ended || serverEnded) return;
    stopRecorder();
    deliverLocal({ type: "error", error: adapterError("NETWORK", "The connection to the voice service was lost. What was gathered so far is kept.", true) });
    deliverLocal({ type: "state", state: "failed" });
  });

  const msUntilExpiry = Date.parse(info.expiresAt) - Date.now();
  if (Number.isFinite(msUntilExpiry)) {
    expiryTimer = setTimeout(() => {
      if (!ended) deliverLocal({ type: "ended", reason: "expired" });
    }, Math.min(Math.max(msUntilExpiry, 0), MAX_TIMER_MS));
  }

  return {
    info,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    attachMicrophone(stream) {
      if (ended || recorder) return;
      if (typeof MediaRecorder === "undefined") {
        deliverLocal({ type: "error", error: adapterError("UNSUPPORTED_TYPE", "This browser can't stream audio. Type instead.") });
        return;
      }
      const mimeType = preferredAudioType();
      const next = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      next.addEventListener("dataavailable", (chunk: BlobEvent) => {
        if (chunk.data.size > 0 && socket.readyState === WebSocket.OPEN) socket.send(chunk.data);
      });
      next.start(AUDIO_TIMESLICE_MS);
      recorder = next;
    },
    setMuted(muted) {
      if (ended) return;
      if (recorder?.state === "recording" && muted) recorder.pause();
      else if (recorder?.state === "paused" && !muted) recorder.resume();
      sendJson({ type: "mute", muted });
    },
    stopSpeaking() {
      if (!ended && info.capabilities.interruption) sendJson({ type: "interrupt" });
    },
    sendText(text) {
      if (ended) return;
      if (!sendJson({ type: "text", text })) {
        deliverLocal({ type: "error", error: adapterError("NETWORK", "That message wasn't sent because the connection is closed.", true) });
      }
    },
    async end() {
      if (ended) return;
      await release();
    },
  };
}

export const liveVoiceAdapter: VoiceAdapter = {
  mode: "live",
  async createSession(input, scope: RequestScope): Promise<AdapterResult<VoiceSessionHandle>> {
    const created = await requestJson<unknown>("/api/voice/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ analysisId: scope.analysisId, revision: scope.revision, consent: input.consent }),
      signal: scope.signal,
      timeoutMs: 10_000,
    });
    if (!created.ok) {
      if (created.error.code === "NOT_FOUND") {
        return { ok: false, error: adapterError("UNAVAILABLE", "Voice isn't connected here. Type instead, upload a report or enter your details manually.") };
      }
      return created;
    }
    if (!isSessionResponse(created.value)) {
      return { ok: false, error: adapterError("UNAVAILABLE", "The voice service returned an unusable reply. Try again or type instead.", true) };
    }
    const session = created.value;
    const url = resolveTransportUrl(session.transportUrl);
    const release = async (error: AdapterError): Promise<AdapterResult<VoiceSessionHandle>> => {
      const released = await releaseSession(session.sessionId);
      if (!released.ok) console.warn("Voice session could not be released", released.error);
      return { ok: false, error };
    };
    if (!url) return release(adapterError("UNAVAILABLE", "The voice service returned an unusable connection address.", true));

    const socket = await openSocket(url, scope.signal);
    if (!socket.ok) return release(socket.error);
    const info: VoiceSessionInfo = { sessionId: session.sessionId, expiresAt: session.expiresAt, capabilities: session.capabilities };
    return { ok: true, value: createLiveSession(info, socket.value) };
  },
};
