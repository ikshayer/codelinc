import { beforeAll, describe, expect, it } from "vitest";
import { fixtureComparison, type FixtureScenarioName } from "@/fixtures/calculation-fixtures";
import { setDemoScenarios } from "@/lib/adapters/mock/demo-scenarios";
import { matchFixture, mockCalculationAdapter } from "@/lib/adapters/mock/calculation";
import { carePaths, planPaths, timingPaths } from "@/lib/domain/fields";
import type { CalculationRecord, ConfirmedScenario } from "@/lib/domain/types";
import { buildOk, typedSampleDraft } from "./helpers";

// Fixture-data checks only. These do NOT prove the real calculation engine.

const scenarioWith = (overrides: Record<string, string | boolean | null> = {}): ConfirmedScenario => buildOk(typedSampleDraft(overrides));

describe("matchFixture", () => {
  it("canonical for the sample scenario", () => {
    expect(matchFixture(scenarioWith())).toBe("canonical");
  });
  it("deadline when the crown deadline is 2026-12-31", () => {
    expect(matchFixture(scenarioWith({ [timingPaths.deadline("p4")]: "2026-12-31" }))).toBe("deadline");
  });
  it("fullCurrentAllowance when current-year already-used is 0", () => {
    expect(matchFixture(scenarioWith({ [planPaths.alreadyUsed("y1")]: "0" }))).toBe("fullCurrentAllowance");
  });
  it("unknownPermission when crown permission is unknown", () => {
    expect(matchFixture(scenarioWith({ [timingPaths.permission("p4")]: "unknown" }))).toBe("unknownPermission");
  });
  it("null when a fee changes", () => {
    expect(matchFixture(scenarioWith({ [carePaths.fee("p2")]: "250" }))).toBeNull();
  });
  it("null when two variations are combined", () => {
    expect(matchFixture(scenarioWith({ [timingPaths.deadline("p4")]: "2026-12-31", [planPaths.alreadyUsed("y1")]: "0" }))).toBeNull();
  });
  it("ignores labels, which do not affect money", () => {
    expect(matchFixture(scenarioWith({ [carePaths.label("p1")]: "Exam" }))).toBe("canonical");
  });
});

describe("mockCalculationAdapter.compare", () => {
  const scope = (revision: number) => ({ analysisId: "a", requestId: "r", revision, signal: new AbortController().signal });
  beforeAll(() => setDemoScenarios({ latencyScale: 0 }));

  it("returns unavailable, never totals, for unmatched input", async () => {
    const result = await mockCalculationAdapter.compare(scenarioWith({ [carePaths.fee("p2")]: "250" }), scope(1));
    expect(result).toMatchObject({ ok: true, value: { kind: "unavailable" } });
    if (result.ok) expect(result.value).not.toHaveProperty("comparison");
  });

  it("returns a comparison stamped with the scenario revision for the canonical input", async () => {
    const scenario = scenarioWith();
    const result = await mockCalculationAdapter.compare(scenario, scope(scenario.revision));
    expect(result.ok).toBe(true);
    if (!result.ok || result.value.kind !== "calculated") throw new Error("expected calculated outcome");
    expect(result.value.comparison.inputRevision).toBe(scenario.revision);
    expect(result.value.sourceMode).toBe("fixturePreview");
  });

  it("reports a calculation failure setting as an error, not data", async () => {
    setDemoScenarios({ calculation: "fails" });
    try {
      const result = await mockCalculationAdapter.compare(scenarioWith(), scope(1));
      expect(result.ok).toBe(false);
    } finally {
      setDemoScenarios({ calculation: "normal" });
    }
  });
});

describe("gate A: canonical fixture numbers", () => {
  const c = fixtureComparison("canonical", 1);
  const alt = c.cheaperAlternative!;

  it("baseline totals and per-event split", () => {
    expect(c.baseline.totalPatientCents).toBe(150000);
    expect(c.baseline.totalInsurerCents).toBe(55000);
    const events = c.baseline.ledgers.flatMap((l) => l.procedures);
    expect(events.map((e) => e.patientCents)).toEqual([0, 4000, 4000, 142000]);
    expect(events.map((e) => e.insurerCents)).toEqual([15000, 16000, 16000, 8000]);
  });
  it("alternative totals and reduction", () => {
    expect(alt.totalPatientCents).toBe(85500);
    expect(alt.totalInsurerCents).toBe(119500);
    expect(c.patientReductionCents).toBe(64500);
    expect(c.baseline.totalPatientCents - alt.totalPatientCents).toBe(c.patientReductionCents);
    expect(c.best).toBe(alt);
    expect(c.status).toBe("cheaperPermittedAlternative");
  });
  it("benefit remaining after each year", () => {
    expect(c.baseline.ledgers.map((l) => l.maximum.remainingCents)).toEqual([0, 150000]);
    expect(alt.ledgers.map((l) => l.maximum.remainingCents)).toEqual([8000, 77500]);
  });
  it("every record carries the requested input revision", () => {
    expect(fixtureComparison("canonical", 7).baseline.inputRevision).toBe(7);
    expect(fixtureComparison("canonical", 7).cheaperAlternative?.inputRevision).toBe(7);
  });
});

describe("gate B: deadline fixture", () => {
  const c = fixtureComparison("deadline", 1);
  it("has no cheaper alternative and keeps the baseline", () => {
    expect(c.cheaperAlternative).toBeNull();
    expect(c.best.totalPatientCents).toBe(150000);
    expect(c.status).toBe("baselineBest");
  });
  it("rejects the next-year crown with AFTER_DEADLINE", () => {
    expect(c.rejectedCandidates).toContainEqual(expect.objectContaining({ issueCodes: ["AFTER_DEADLINE"], procedureIds: ["p4"] }));
  });
});

describe("gate C: full current allowance fixture", () => {
  const c = fixtureComparison("fullCurrentAllowance", 1);
  it("best patient cost is 83000 with no cheaper alternative", () => {
    expect(c.best.totalPatientCents).toBe(83000);
    expect(c.cheaperAlternative).toBeNull();
  });
  it("keeps the feasible later record at 85500", () => {
    expect(c.feasibleRecords.map((r) => r.totalPatientCents)).toContain(85500);
  });
});

describe("gate D: unknown permission fixture", () => {
  it("has no alternative", () => {
    expect(fixtureComparison("unknownPermission", 1).cheaperAlternative).toBeNull();
  });
});

describe("gate J: conservation holds for every record in every fixture", () => {
  const names: FixtureScenarioName[] = ["canonical", "deadline", "fullCurrentAllowance", "unknownPermission"];
  const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

  function checkRecord(record: CalculationRecord) {
    for (const ledger of record.ledgers) {
      for (const e of ledger.procedures) {
        expect(e.insurerCents + e.patientCents, `${record.id} ${e.procedureId} fee`).toBe(e.feeCents);
        expect(e.deductibleAppliedCents + e.patientCoinsuranceCents + e.patientDueToMaximumCents, `${record.id} ${e.procedureId} patient`).toBe(e.patientCents);
      }
      expect(sum(ledger.procedures.map((e) => e.feeCents)), `${record.id} ${ledger.benefitYearId} fee`).toBe(ledger.totalFeeCents);
      expect(sum(ledger.procedures.map((e) => e.insurerCents)), `${record.id} ${ledger.benefitYearId} insurer`).toBe(ledger.totalInsurerCents);
      expect(sum(ledger.procedures.map((e) => e.patientCents)), `${record.id} ${ledger.benefitYearId} patient`).toBe(ledger.totalPatientCents);
    }
    expect(sum(record.ledgers.map((l) => l.totalFeeCents)), `${record.id} fee`).toBe(record.totalFeeCents);
    expect(sum(record.ledgers.map((l) => l.totalInsurerCents)), `${record.id} insurer`).toBe(record.totalInsurerCents);
    expect(sum(record.ledgers.map((l) => l.totalPatientCents)), `${record.id} patient`).toBe(record.totalPatientCents);
  }

  it.each(names)("%s", (name) => {
    const c = fixtureComparison(name, 1);
    const records = [c.baseline, c.best, ...(c.cheaperAlternative ? [c.cheaperAlternative] : []), ...c.feasibleRecords];
    expect(records.length).toBeGreaterThan(0);
    records.forEach(checkRecord);
  });
});
