// Session-memory switches that let a reviewer exercise each mock failure
// path deterministically (FRONTEND_DESIGN.md §15: success, missing facts,
// conflicts, delay, cancellation and failure). Changed from Profile → Demo data.

export type ReportOutcome = "success" | "unreadable" | "encrypted" | "timeout" | "network";
export type VoiceOutcome = "normal" | "reconnect" | "providerFailure";
export type HistoryOutcome = "normal" | "loadFails" | "saveFails" | "deleteFails";
export type CalculationOutcomeSetting = "normal" | "fails";

export interface DemoScenarios {
  report: ReportOutcome;
  voice: VoiceOutcome;
  history: HistoryOutcome;
  calculation: CalculationOutcomeSetting;
  /** Multiplies mock latency; 0 makes tests fast. */
  latencyScale: number;
}

export const DEFAULT_DEMO_SCENARIOS: DemoScenarios = {
  report: "success",
  voice: "normal",
  history: "normal",
  calculation: "normal",
  latencyScale: 1,
};

let current: DemoScenarios = { ...DEFAULT_DEMO_SCENARIOS };
const listeners = new Set<() => void>();

export function getDemoScenarios(): DemoScenarios {
  return current;
}

export function setDemoScenarios(patch: Partial<DemoScenarios>): void {
  current = { ...current, ...patch };
  for (const listener of listeners) listener();
}

export function subscribeDemoScenarios(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function mockLatency(ms: number): number {
  return Math.round(ms * current.latencyScale);
}
