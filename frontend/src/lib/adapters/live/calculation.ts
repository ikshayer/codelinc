import type { ConfirmedScenario, ScenarioComparison } from "@/lib/domain/types";
import { adapterError, requestJson } from "../shared";
import type { AdapterResult, CalculationAdapter, CalculationOutcome, PlanningContext, RequestScope } from "../types";
import type { MemberBenefitContext } from "@analysis/types";

// Live calculation through the backend's original-intake compatibility endpoint:
// POST /api/calculate { requestId, analysisId, revision, scenario, engineOptions? }
// → ScenarioComparison with server-produced planning details.
// A missing endpoint is reported as unavailable; nothing falls back to fixtures.

export const liveCalculationAdapter: CalculationAdapter = {
  mode: "live",
  async compare(scenario: ConfirmedScenario, scope: RequestScope): Promise<AdapterResult<CalculationOutcome>> {
    const result = await requestJson<ScenarioComparison & { planning?: PlanningContext; memberBenefitContext?: MemberBenefitContext }>("/api/calculate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId: scope.requestId, analysisId: scope.analysisId, revision: scope.revision, scenario, ...(scope.engineOptions ? { engineOptions: scope.engineOptions } : {}), ...(scope.memberIdentity ? { memberIdentity: scope.memberIdentity } : {}) }),
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
    const { planning, memberBenefitContext, ...comparison } = result.value;
    return { ok: true, value: { kind: "calculated", comparison, sourceMode: "live", fixtureName: null, ...(planning ? { planning } : {}), ...(memberBenefitContext ? { memberBenefitContext } : {}) } };
  },
};
