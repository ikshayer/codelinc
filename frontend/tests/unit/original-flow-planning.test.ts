import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AnalysisPlanningContext } from "@analysis/types";
import { fixtureComparison } from "@/fixtures/calculation-fixtures";
import { liveCalculationAdapter } from "@/lib/adapters/live/calculation";
import { currentResult, newAnalysisRecord, reducer, type StoreState } from "@/features/analysis/state";
import { PlanningDetails } from "@/features/analysis/compare/planning-details";
import { buildOk, typedSampleDraft } from "./helpers";

const comparison = fixtureComparison("canonical", 0);
const planning: AnalysisPlanningContext = {
  syntheticData: true, engineVersion: "cw-1", model: "confirmed-in-network-assumptions", mode: "BALANCED", locks: [{ procedureId: "p4", serviceDate: "2027-01-04" }],
  budget: { hardMonthlyLimitCents: 100000, preferredMonthlyLimitCents: 75000 }, recommendedRecordId: comparison.best.id,
  records: [{ recordId: comparison.best.id, completionDate: "2027-01-04", peakMonthlyCashCents: 80000, fundingGapCents: 0,
    monthly: [{ month: "2027-01", cashCents: 80000, exceedsHard: false, exceedsPreferred: true }],
    events: [{ procedureId: "p4", serviceDate: "2027-01-04", benefitYearId: "y2", userLocked: true, funding: [{ sourceType: "CASH", paymentDate: "2027-01-04", amountCents: 80000, feesCents: 0 }], shortfallCents: 0,
      benefitsAfter: { deductibleRemainingCents: 0, annualMaximumRemainingCents: 60000 }, issues: [],
      calculationSteps: [{ label: "Plan share", formula: "eligible * share", operands: [{ name: "share", value: 5000, unit: "basisPoints" }], resultCents: 70000 }],
    }], differenceFromBaseline: { patientDeltaCents: -64500, insurerDeltaCents: 64500, peakMonthlyCashDeltaCents: -42000, completionShiftDays: 42, serviceDateChanges: [{ procedureId: "p4", baselineDate: "2026-11-23", serviceDate: "2027-01-04", shiftDays: 42 }] }, issues: [],
  }], alternatives: [{ recordId: comparison.best.id, labels: ["Lowest total cost"] }], search: { evaluated: 10, feasible: 8, bounded: false }, status: "OK", issues: [], limitations: ["Funding accounts and provider appointments are not modeled."],
};

afterEach(() => vi.unstubAllGlobals());

describe("original flow planning bridge", () => {
  it("sends the confirmed scenario and explicit options unchanged, preserving returned context", async () => {
    const scenario = buildOk(typedSampleDraft());
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => new Response(JSON.stringify({ ...comparison, inputRevision: scenario.revision, planning }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const options = { mode: "EARLIEST_SAFE_COMPLETION" as const, schedule_locks: planning.locks, budget: planning.budget! };
    const outcome = await liveCalculationAdapter.compare(scenario, { analysisId: "a", requestId: "r", revision: scenario.revision, signal: new AbortController().signal, engineOptions: options });
    expect(JSON.parse(fetchMock.mock.calls[0][1]!.body as string)).toEqual({ analysisId: "a", requestId: "r", revision: scenario.revision, scenario, engineOptions: options });
    expect(outcome).toMatchObject({ ok: true, value: { kind: "calculated", sourceMode: "live", planning } });
    if (outcome.ok && outcome.value.kind === "calculated") expect(outcome.value.comparison).not.toHaveProperty("planning");
  });

  it("stores planning context under the same request/revision/epoch guard as the comparison", () => {
    const now = "2026-10-04T12:00:00Z";
    const initial: StoreState = { epoch: 0, analyses: { a: { ...newAnalysisRecord("a", "Original flow", null, now), confirmation: { financialConfirmed: true, timingAffirmed: true } } }, profile: null, auth: { status: "guest" } };
    const started = reducer(initial, { type: "startCalculation", analysisId: "a", requestId: "r", revision: 0, epoch: 0 });
    const outcome = { ok: true as const, value: { kind: "calculated" as const, comparison, sourceMode: "live" as const, fixtureName: null, planning } };
    const settled = reducer(started, { type: "calculationSettled", analysisId: "a", requestId: "r", revision: 0, epoch: 0, outcome, now });
    expect(currentResult(settled.analyses.a)?.planning).toEqual(planning);
    const late = reducer(started, { type: "calculationSettled", analysisId: "a", requestId: "old", revision: 0, epoch: 0, outcome, now });
    expect(currentResult(late.analyses.a)).toBeNull();
  });

  it("renders only supplied financial, payment, benefit and difference values", () => {
    const html = renderToStaticMarkup(createElement(PlanningDetails, { planning, record: comparison.best, procedureLabels: { p4: "Crown" } }));
    for (const text of ["Financial and benefit details", "Pinned by you", "Over your preferred target", "Payment date", "$800", "Annual maximum remaining", "$600", "eligible * share", "50%", "−$645"]) expect(html).toContain(text);
  });
});
