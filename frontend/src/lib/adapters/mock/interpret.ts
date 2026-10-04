import { adapterError } from "../shared";
import type { AdapterResult, InterpretAdapter, IntakeExtraction } from "../types";

// Demo mode has no language model. Typed text is kept in the transcript, but
// nothing is extracted from it — we never pretend to understand free text.

export const mockInterpretAdapter: InterpretAdapter = {
  mode: "demo",
  async interpret(): Promise<AdapterResult<IntakeExtraction>> {
    return {
      ok: false,
      error: adapterError("UNAVAILABLE", "AI interpretation isn't connected in demo mode. Your message is kept — add the values in Facts gathered."),
    };
  },
};
