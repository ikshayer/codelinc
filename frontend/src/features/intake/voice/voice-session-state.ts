import type { TranscriptTurn } from "@/features/analysis/state";
import type { AdapterError, VoiceAgentState, VoiceEvent } from "@/lib/adapters/types";

import type { MicFailure } from "./microphone";
import type { ProposedValue } from "./voice-extraction";

// UI state for one conversation panel. Pure and synchronous so every status
// can be reasoned about without a microphone or a session.

export type VoicePhase = "ready" | "requestingPermission" | "permissionDenied" | "connecting" | "active" | "failed" | "ended";
export type EndReason = "user" | "provider" | "expired";

export type VoiceStatus =
  | "ready"
  | "requesting"
  | "denied"
  | "connecting"
  | "listening"
  | "thinking"
  | "speaking"
  | "muted"
  | "reconnecting"
  | "failed"
  | "ended";

export interface TurnView {
  /** Unique across sessions: `${sessionId}:${turnId}` or `local:${n}`. */
  key: string;
  speaker: "assistant" | "person";
  text: string;
  /** Partial turns are provisional and never become facts. */
  final: boolean;
}

export interface ProposalBatch {
  id: string;
  sourceLabel: string;
  quote: string | null;
  proposals: ProposedValue[];
}

export interface VoiceUiState {
  phase: VoicePhase;
  agentState: VoiceAgentState;
  muted: boolean;
  turns: TurnView[];
  batches: ProposalBatch[];
  micFailure: MicFailure | null;
  /** The failure that stopped the conversation, or the latest non-fatal error. */
  error: AdapterError | null;
  endReason: EndReason | null;
  simulated: boolean;
  startedAt: number | null;
  endedAt: number | null;
  /** Inline message from typed interpretation (for example, unavailable in demo mode). */
  typedNotice: string | null;
}

export type VoiceAction =
  | { type: "requestMicrophone" }
  | { type: "microphoneFailed"; failure: MicFailure }
  | { type: "connecting" }
  | { type: "connected"; at: number; simulated: boolean }
  | { type: "event"; event: Extract<VoiceEvent, { type: "state" | "transcript" | "error" }> }
  | { type: "localTurn"; turn: TurnView }
  | { type: "batch"; batch: ProposalBatch }
  | { type: "muted"; muted: boolean }
  | { type: "failed"; at: number; fallback: AdapterError }
  | { type: "finished"; at: number; reason: EndReason }
  | { type: "typedNotice"; message: string | null }
  | { type: "dismissError" }
  | { type: "reset" };

export function initialVoiceState(stored: Record<string, TranscriptTurn[]> = {}): VoiceUiState {
  const turns: TurnView[] = Object.entries(stored).flatMap(([sessionId, sessionTurns]) =>
    sessionTurns.map((turn) => ({ key: `${sessionId}:${turn.turnId}`, speaker: turn.speaker, text: turn.text, final: true })),
  );
  return {
    phase: "ready",
    agentState: "connecting",
    muted: false,
    turns,
    batches: [],
    micFailure: null,
    error: null,
    endReason: null,
    simulated: false,
    startedAt: null,
    endedAt: null,
    typedNotice: null,
  };
}

function upsertTurn(turns: TurnView[], next: TurnView): TurnView[] {
  const index = turns.findIndex((turn) => turn.key === next.key);
  if (index === -1) return [...turns, next];
  if (turns[index].final) return turns; // a late partial never replaces a finalized turn
  return turns.map((turn, i) => (i === index ? next : turn));
}

const finalTurnsOnly = (turns: TurnView[]) => turns.filter((turn) => turn.final);

export function voiceReducer(state: VoiceUiState, action: VoiceAction): VoiceUiState {
  switch (action.type) {
    case "requestMicrophone":
      return {
        ...state,
        phase: "requestingPermission",
        micFailure: null,
        error: null,
        endReason: null,
        startedAt: null,
        endedAt: null,
        muted: false,
        agentState: "connecting",
      };
    case "microphoneFailed":
      return { ...state, phase: "permissionDenied", micFailure: action.failure };
    case "connecting":
      return { ...state, phase: "connecting", micFailure: null };
    case "connected":
      return { ...state, phase: "active", agentState: "listening", simulated: action.simulated, startedAt: action.at };
    case "event": {
      const { event } = action;
      if (event.type === "state") return { ...state, agentState: event.state };
      if (event.type === "error") return { ...state, error: event.error };
      return {
        ...state,
        turns: upsertTurn(state.turns, {
          key: `${event.sessionId}:${event.turnId}`,
          speaker: event.speaker,
          text: event.text,
          final: event.final,
        }),
      };
    }
    case "localTurn":
      return { ...state, turns: upsertTurn(state.turns, action.turn) };
    case "batch":
      return { ...state, batches: [...state.batches, action.batch] };
    case "muted":
      return { ...state, muted: action.muted };
    case "failed":
      // Partial text is provisional; it doesn't survive a failure as if it had been heard.
      return { ...state, phase: "failed", error: state.error ?? action.fallback, endedAt: action.at, turns: finalTurnsOnly(state.turns) };
    case "finished": {
      // Cancelling before the conversation began returns to the start screen.
      const began = state.startedAt !== null;
      return {
        ...state,
        phase: began ? "ended" : "ready",
        endReason: began ? action.reason : null,
        endedAt: action.at,
        muted: false,
        turns: finalTurnsOnly(state.turns),
      };
    }
    case "typedNotice":
      return { ...state, typedNotice: action.message };
    case "dismissError":
      return { ...state, error: null };
    case "reset":
      return initialVoiceState();
  }
}

/** True while a microphone, session or pending permission could still be capturing. */
export function isConversationLive(state: VoiceUiState): boolean {
  return state.phase === "requestingPermission" || state.phase === "connecting" || state.phase === "active";
}

export function displayStatus(state: VoiceUiState): VoiceStatus {
  switch (state.phase) {
    case "ready":
      return "ready";
    case "requestingPermission":
      return "requesting";
    case "permissionDenied":
      return "denied";
    case "connecting":
      return "connecting";
    case "failed":
      return "failed";
    case "ended":
      return "ended";
    case "active":
      if (state.agentState === "reconnecting") return "reconnecting";
      if (state.muted || state.agentState === "muted") return "muted";
      if (state.agentState === "connecting") return "connecting";
      if (state.agentState === "thinking" || state.agentState === "speaking") return state.agentState;
      return "listening";
  }
}
