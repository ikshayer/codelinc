import {
  DEMO_TYPED_REPLY,
  FAILURE_AFTER_TURN_ID,
  RECONNECT_AFTER_TURN_ID,
  SAMPLE_CONVERSATION,
  SIMULATED_SOURCE_LABEL,
  type ScriptedTurn,
} from "@/fixtures/sample-conversation";
import type { IntakeEvidence } from "@/lib/domain/types";

import { adapterError, isAbortError, newId, wait } from "../shared";
import type { AdapterResult, IntakeExtraction, RequestScope, VoiceAdapter, VoiceAgentState, VoiceEvent, VoiceSessionHandle } from "../types";
import { getDemoScenarios, mockLatency, type VoiceOutcome } from "./demo-scenarios";

// Demo mode plays a scripted conversation. Nothing is recognized from audio:
// the microphone stream is ignored, and the session says so through
// `capabilities.simulated`. Proposals carry evidence labeled "Simulated
// conversation" and never include dentist timing permission or eligibility.

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
type EventBody = DistributiveOmit<VoiceEvent, "sessionId" | "sequence">;

const SESSION_LIFETIME_MS = 15 * 60 * 1000;
const WORDS_PER_ASSISTANT_CHUNK = 3;
const WORDS_PER_PERSON_CHUNK = 2;

function extractionFor(sessionId: string, turn: Extract<ScriptedTurn, { speaker: "person" }>): IntakeExtraction | null {
  if (!turn.proposals || turn.proposals.length === 0) return null;
  const evidence: IntakeEvidence = {
    id: `ev_${sessionId}_${turn.turnId}`,
    kind: "voice",
    sourceId: sessionId,
    sourceLabel: SIMULATED_SOURCE_LABEL,
    turnId: turn.turnId,
    literalQuote: turn.text,
    receivedAt: new Date().toISOString(),
  };
  return {
    proposals: turn.proposals.map((proposal) => ({ fieldPath: proposal.fieldPath, value: proposal.value, evidenceId: evidence.id })),
    evidence: [evidence],
    overflow: [],
    missingFieldPaths: [],
    reviewNotes: [],
  };
}

function createMockSession(outcome: VoiceOutcome): VoiceSessionHandle {
  const sessionId = newId("voice");
  const listeners = new Set<(event: VoiceEvent) => void>();
  const stop = new AbortController();
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const unmuteWaiters = new Set<() => void>();
  let sequence = 0;
  let ended = false;
  let muted = false;
  let started = false;
  let speaking = false;
  let skipSpeech = false;
  let typedCount = 0;

  const emit = (body: EventBody) => {
    sequence += 1;
    const event: VoiceEvent = { ...body, sessionId, sequence };
    for (const listener of [...listeners]) listener(event);
  };
  const setState = (state: VoiceAgentState) => emit({ type: "state", state });
  const sleep = (ms: number) => wait(mockLatency(ms), stop.signal);
  const emitTranscript = (turnId: string, speaker: "assistant" | "person", text: string, final: boolean) =>
    emit({ type: "transcript", turnId, speaker, text, final });

  /** Simulated people stop "speaking" while the microphone is muted. */
  const whileMuted = async () => {
    while (muted) {
      await new Promise<void>((resolve) => unmuteWaiters.add(resolve));
      stop.signal.throwIfAborted();
    }
  };

  const playAssistant = async (turn: ScriptedTurn, thinkFirst: boolean) => {
    if (thinkFirst) {
      setState("thinking");
      await sleep(800);
    }
    setState("speaking");
    speaking = true;
    skipSpeech = false;
    const words = turn.text.split(" ");
    let spoken = 0;
    while (spoken < words.length) {
      spoken = Math.min(words.length, spoken + WORDS_PER_ASSISTANT_CHUNK);
      emitTranscript(turn.turnId, "assistant", words.slice(0, spoken).join(" "), false);
      await sleep(260);
      if (skipSpeech) break;
    }
    speaking = false;
    // An interrupted turn keeps only what was already "spoken".
    const finalText = spoken < words.length ? `${words.slice(0, spoken).join(" ")}…` : turn.text;
    emitTranscript(turn.turnId, "assistant", finalText, true);
    setState("listening");
  };

  const playPerson = async (turn: Extract<ScriptedTurn, { speaker: "person" }>) => {
    setState("listening");
    await sleep(1200);
    await whileMuted();
    const words = turn.text.split(" ");
    for (let spoken = WORDS_PER_PERSON_CHUNK; ; spoken += WORDS_PER_PERSON_CHUNK) {
      const shown = Math.min(words.length, spoken);
      emitTranscript(turn.turnId, "person", words.slice(0, shown).join(" "), false);
      if (shown === words.length) break;
      await sleep(280);
      await whileMuted();
    }
    await sleep(320);
    emitTranscript(turn.turnId, "person", turn.text, true);
    const extraction = extractionFor(sessionId, turn);
    if (extraction) {
      await sleep(250);
      emit({ type: "proposals", turnId: turn.turnId, extraction });
    }
  };

  /** Returns false when the scenario ends the session early. */
  const runScenarioAfter = async (turnId: string): Promise<boolean> => {
    if (outcome === "reconnect" && turnId === RECONNECT_AFTER_TURN_ID) {
      setState("reconnecting");
      await sleep(2800);
      setState("listening");
    }
    if (outcome === "providerFailure" && turnId === FAILURE_AFTER_TURN_ID) {
      emit({
        type: "error",
        error: adapterError("UNAVAILABLE", "The simulated voice service stopped responding. What was gathered so far is kept.", true),
      });
      setState("failed");
      return false;
    }
    return true;
  };

  const runScript = async () => {
    await sleep(400);
    let previous: ScriptedTurn | null = null;
    for (const turn of SAMPLE_CONVERSATION) {
      if (turn.speaker === "assistant") await playAssistant(turn, previous?.speaker === "person");
      else await playPerson(turn);
      if (!(await runScenarioAfter(turn.turnId))) return;
      previous = turn;
    }
  };

  const start = () => {
    if (started || ended) return;
    started = true;
    runScript().catch((error: unknown) => {
      if (isAbortError(error)) return;
      console.error("Simulated conversation failed", error);
      emit({ type: "error", error: adapterError("UNKNOWN", "The simulated conversation stopped unexpectedly.") });
      setState("failed");
    });
  };

  return {
    info: {
      sessionId,
      expiresAt: new Date(Date.now() + SESSION_LIFETIME_MS).toISOString(),
      capabilities: { interruption: true, transcription: false, simulated: true },
    },
    subscribe(listener) {
      listeners.add(listener);
      start();
      return () => {
        listeners.delete(listener);
      };
    },
    attachMicrophone() {
      // Demo mode never reads audio.
    },
    setMuted(next) {
      if (ended || muted === next) return;
      muted = next;
      if (!next) {
        for (const resolve of unmuteWaiters) resolve();
        unmuteWaiters.clear();
      }
    },
    stopSpeaking() {
      if (speaking) skipSpeech = true;
    },
    sendText(text) {
      if (ended) return;
      typedCount += 1;
      const n = typedCount;
      emitTranscript(`typed_${n}`, "person", text, true);
      const timer = setTimeout(() => {
        timers.delete(timer);
        emitTranscript(`typed_reply_${n}`, "assistant", DEMO_TYPED_REPLY, true);
      }, mockLatency(600));
      timers.add(timer);
    },
    async end() {
      if (ended) return;
      emit({ type: "ended", reason: "user" });
      ended = true;
      stop.abort();
      for (const timer of timers) clearTimeout(timer);
      timers.clear();
      for (const resolve of unmuteWaiters) resolve();
      unmuteWaiters.clear();
      listeners.clear();
    },
  };
}

export const mockVoiceAdapter: VoiceAdapter = {
  mode: "demo",
  async createSession(_input, scope: RequestScope): Promise<AdapterResult<VoiceSessionHandle>> {
    try {
      await wait(mockLatency(600), scope.signal);
    } catch (error) {
      if (isAbortError(error)) return { ok: false, error: adapterError("CANCELLED", "Request cancelled.") };
      throw error;
    }
    return { ok: true, value: createMockSession(getDemoScenarios().voice) };
  },
};
