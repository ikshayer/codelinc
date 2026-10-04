import { FIXTURE_LABELS, fixtureComparison, type FixtureScenarioName } from "@/fixtures/calculation-fixtures";
import { SAMPLE_TREATMENT_VALUES } from "@/fixtures/sample-treatment";
import { compareIso } from "@/lib/domain/dates";
import { emptyDraft, editFact } from "@/lib/domain/draft";
import { buildConfirmedScenario } from "@/lib/domain/scenario";
import type { ConfirmedScenario } from "@/lib/domain/types";
import { adapterError, isAbortError, wait } from "../shared";
import type { AdapterResult, CalculationAdapter, CalculationOutcome, RequestScope } from "../types";
import { getDemoScenarios, mockLatency } from "./demo-scenarios";

// Fixture-preview calculation. It recognizes only the named synthetic
// scenarios (gates A–D) by exact input signature and returns their
// precomputed records. Any other input is reported as unavailable — it never
// invents totals. This cannot pass the real-engine gate.

/** Inputs that determine money and feasibility. Labels and provenance are excluded. */
function signature(scenario: ConfirmedScenario): string {
  return JSON.stringify({
    years: scenario.plan.years.map((y) => [y.id, y.startsOn, y.endsOn, y.annualMaximumCents, y.deductibleCents, y.utilization, y.ruleStatus, y.rules]),
    procedures: [...scenario.procedures]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((p) => [p.id, p.category, p.contractedFeeCents, p.anchorDate, p.timingPermission, p.deadline, p.windows.map((w) => [w.benefitYearId, w.earliestDate, w.latestDate])]),
    dependencies: scenario.dependencies.map((d) => [d.beforeProcedureId, d.afterProcedureId, d.minGapDays]).sort(),
  });
}

let canonicalCache: ConfirmedScenario | null = null;
function canonicalScenario(): ConfirmedScenario {
  if (canonicalCache) return canonicalCache;
  let draft = emptyDraft();
  for (const [path, value] of Object.entries(SAMPLE_TREATMENT_VALUES)) draft = editFact(draft, path, value);
  const built = buildConfirmedScenario(draft);
  if (!built.ok) throw new Error(`Sample treatment fixture is invalid: ${built.issues.map((i) => i.fieldPath).join(", ")}`);
  canonicalCache = built.scenario;
  return canonicalCache;
}

function withCrown(scenario: ConfirmedScenario, patch: (crown: ConfirmedScenario["procedures"][number]) => ConfirmedScenario["procedures"][number]): ConfirmedScenario {
  return { ...scenario, procedures: scenario.procedures.map((p) => (p.id === "p4" ? patch(p) : p)) };
}

export function matchFixture(scenario: ConfirmedScenario): FixtureScenarioName | null {
  const canonical = canonicalScenario();
  const target = signature(canonical);
  if (signature(scenario) === target) return "canonical";

  const crown = scenario.procedures.find((p) => p.id === "p4");
  const canonicalCrown = canonical.procedures.find((p) => p.id === "p4")!;

  // Gate B: a dentist deadline inside the current year, on or after the planned date.
  if (crown?.deadline && compareIso(crown.deadline, canonicalCrown.anchorDate) >= 0 && compareIso(crown.deadline, "2026-12-31") <= 0) {
    if (signature(withCrown(scenario, (p) => ({ ...p, deadline: canonicalCrown.deadline }))) === target) return "deadline";
  }

  // Gate C: no prior plan payments this year.
  const [y1, y2] = scenario.plan.years;
  if (y1.utilization.priorInsurerPaymentsCents === 0) {
    const restored: ConfirmedScenario = {
      ...scenario,
      plan: { ...scenario.plan, years: [{ ...y1, utilization: { ...y1.utilization, priorInsurerPaymentsCents: canonical.plan.years[0].utilization.priorInsurerPaymentsCents } }, y2] },
    };
    if (signature(restored) === target) return "fullCurrentAllowance";
  }

  // Gate D: crown permission unknown — fixed to its confirmed anchor.
  if (crown?.timingPermission === "unknown") {
    const restored = withCrown(scenario, (p) => ({ ...p, timingPermission: "dentistApproved", windows: canonicalCrown.windows }));
    if (signature(restored) === target) return "unknownPermission";
  }
  return null;
}

export const mockCalculationAdapter: CalculationAdapter = {
  mode: "demo",
  async compare(scenario: ConfirmedScenario, scope: RequestScope): Promise<AdapterResult<CalculationOutcome>> {
    try {
      await wait(mockLatency(700), scope.signal);
    } catch (error) {
      if (isAbortError(error)) return { ok: false, error: adapterError("CANCELLED", "Calculation cancelled.") };
      throw error;
    }
    if (getDemoScenarios().calculation === "fails") {
      return { ok: false, error: adapterError("UNAVAILABLE", "The calculation service failed. Your confirmed details are kept — try again.", true) };
    }
    const fixture = matchFixture(scenario);
    if (!fixture) {
      return {
        ok: true,
        value: {
          kind: "unavailable",
          message:
            "The calculation engine isn't connected in this demo, and these values don't match a named sample scenario. Your details are kept; connect the engine for a real estimate, or reload the sample.",
        },
      };
    }
    return {
      ok: true,
      value: { kind: "calculated", comparison: fixtureComparison(fixture, scenario.revision), sourceMode: "fixturePreview", fixtureName: FIXTURE_LABELS[fixture] },
    };
  },
};
