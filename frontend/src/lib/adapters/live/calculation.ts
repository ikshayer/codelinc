import type { ConfirmedScenario, ScenarioComparison } from "@/lib/domain/types";
import { adapterError, requestJson } from "../shared";
import type { AdapterResult, CalculationAdapter, CalculationOutcome, RequestScope } from "../types";

// Live calculation through the shared engine. Proposed endpoint:
// POST /api/calculate { requestId, analysisId, revision, scenario } → ScenarioComparison.
// A missing endpoint is reported as unavailable; nothing falls back to fixtures.

export const liveCalculationAdapter: CalculationAdapter = {
  mode: "live",
  async compare(scenario: ConfirmedScenario, scope: RequestScope): Promise<AdapterResult<CalculationOutcome>> {
    const result = await requestJson<ScenarioComparison>("/api/calculate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId: scope.requestId, analysisId: scope.analysisId, revision: scope.revision, scenario }),
      signal: scope.signal,
    });
    if (!result.ok) {
      if (result.error.code === "NOT_FOUND" || result.error.code === "UNAVAILABLE") {
        return { ok: true, value: { kind: "unavailable", message: "The calculation engine isn't connected. Your confirmed details are kept." } };
      }
      return result;
    }
    if (result.value.inputRevision !== scope.revision) {
      return { ok: false, error: adapterError("CONFLICT", "The engine answered for an older version of your details. Try again.", true) };
    }
    return { ok: true, value: { kind: "calculated", comparison: result.value, sourceMode: "live", fixtureName: null } };
  },
};
