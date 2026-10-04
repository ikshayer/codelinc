import type { ServiceMode } from "@/lib/domain/types";
import { liveAuthAdapter } from "./live/auth";
import { liveCalculationAdapter } from "./live/calculation";
import { liveHistoryRepository } from "./live/history";
import { liveInterpretAdapter } from "./live/interpret";
import { liveReportAdapter } from "./live/report";
import { liveVoiceAdapter } from "./live/voice";
import { mockAuthAdapter } from "./mock/auth";
import { mockCalculationAdapter } from "./mock/calculation";
import { createMockHistoryRepository } from "./mock/history";
import { mockInterpretAdapter } from "./mock/interpret";
import { mockReportAdapter } from "./mock/report";
import { mockVoiceAdapter } from "./mock/voice";
import type { Adapters } from "./types";

/**
 * Service mode comes from NEXT_PUBLIC_CAREWINDOW_MODE ("demo" | "live").
 * Demo is the default and is always labeled in the UI. Live mode never falls
 * back to fixtures: missing services report themselves unavailable.
 */
export function serviceMode(): ServiceMode {
  const value = process.env.NEXT_PUBLIC_CAREWINDOW_MODE;
  if (value === undefined || value === "" || value === "demo") return "demo";
  if (value === "live") return "live";
  throw new Error(`NEXT_PUBLIC_CAREWINDOW_MODE must be "demo" or "live", got "${value}"`);
}

export function getAdapters(mode: ServiceMode = serviceMode()): Adapters {
  if (mode === "live") {
    return {
      mode,
      report: liveReportAdapter,
      voice: liveVoiceAdapter,
      interpret: liveInterpretAdapter,
      calculation: liveCalculationAdapter,
      history: liveHistoryRepository,
      auth: liveAuthAdapter,
    };
  }
  return {
    mode,
    report: mockReportAdapter,
    voice: mockVoiceAdapter,
    interpret: mockInterpretAdapter,
    calculation: mockCalculationAdapter,
    history: createMockHistoryRepository(),
    auth: mockAuthAdapter,
  };
}
