import { describe, expect, it } from "vitest";
import { fixtureComparison } from "@/fixtures/calculation-fixtures";
import { SAMPLE_TREATMENT_VALUES } from "@/fixtures/sample-treatment";
import type { IntakeExtraction } from "@/lib/adapters/types";
import { carePaths, planPaths, timingPaths } from "@/lib/domain/fields";
import {
  analysisStatus,
  currentResult,
  newAnalysisRecord,
  reducer,
  type Action,
  type AnalysisRecord,
  type StoreState,
} from "@/features/analysis/state";
import { evidence, proposal } from "./helpers";

const NOW = "2026-10-03T00:00:00Z";
const ID = "a";
const FEE = carePaths.fee("p1");
const DEADLINE = timingPaths.deadline("p1");
const MAX = planPaths.annualMaximum("y1");

function initial(patient: AnalysisRecord["patient"] = null): StoreState {
  return { epoch: 0, analyses: { [ID]: newAnalysisRecord(ID, "t", patient, NOW) }, profile: null, auth: { status: "guest" } };
}

function run(state: StoreState, ...actions: Action[]): StoreState {
  return actions.reduce(reducer, state);
}

const record = (state: StoreState) => state.analyses[ID];

function extraction(overrides: Partial<IntakeExtraction> = {}): IntakeExtraction {
  const ev = evidence("e1", "report-1");
  return { proposals: [proposal(FEE, "150", "e1")], evidence: [ev], overflow: [], missingFieldPaths: [], reviewNotes: [], ...overrides };
}

const begin = (requestId: string, key: "report" | "calculation" = "report", epoch = 0): Action => ({ type: "beginRequest", analysisId: ID, key, requestId, epoch });
const apply = (requestId: string, ex: IntakeExtraction = extraction(), epoch = 0): Action => ({
  type: "applyExtraction", analysisId: ID, key: "report", requestId, epoch, extraction: ex, keepRequest: false, now: NOW,
});
const edit = (fieldPath: string, value: string): Action => ({ type: "editFact", analysisId: ID, fieldPath, value, now: NOW });

/** A fully entered, confirmed sample analysis ready to calculate. */
function readyState(): StoreState {
  const edits = Object.entries(SAMPLE_TREATMENT_VALUES).map(([path, value]) => ({ type: "editFact", analysisId: ID, fieldPath: path, value, now: NOW }) as Action);
  return run(initial(), ...edits, { type: "setFinancialConfirmed", analysisId: ID, value: true }, { type: "setTimingAffirmed", analysisId: ID, value: true });
}

function calculatedState(): StoreState {
  const ready = readyState();
  const revision = record(ready).draft.revision;
  return run(
    ready,
    { type: "startCalculation", analysisId: ID, requestId: "c1", revision, epoch: 0 },
    {
      type: "calculationSettled", analysisId: ID, requestId: "c1", revision, epoch: 0, now: NOW,
      outcome: { ok: true, value: { kind: "calculated", comparison: fixtureComparison("canonical", revision), sourceMode: "fixturePreview", fixtureName: "x" } },
    },
  );
}

describe("extraction request matching", () => {
  it("applies an extraction for the active request", () => {
    const state = run(initial(), begin("r1"), apply("r1"));
    expect(record(state).draft.facts[FEE]?.value).toBe("150");
    expect(record(state).requests.report).toBeUndefined();
  });

  it("ignores an extraction whose requestId is not the active one", () => {
    const state = run(initial(), begin("r1"), apply("other"));
    expect(record(state).draft.facts[FEE]).toBeUndefined();
  });

  it("a replaced request makes the first one's late extraction ignored", () => {
    const state = run(initial(), begin("r1"), begin("r2"), apply("r1"));
    expect(record(state).draft.facts[FEE]).toBeUndefined();
    const accepted = reducer(state, apply("r2"));
    expect(record(accepted).draft.facts[FEE]?.value).toBe("150");
  });

  it("clearDraft makes a late extraction and a late calculation ignored", () => {
    const ready = readyState();
    const revision = record(ready).draft.revision;
    const state = run(
      ready,
      begin("r1"),
      { type: "startCalculation", analysisId: ID, requestId: "c1", revision, epoch: 0 },
      { type: "clearDraft", analysisId: ID, now: NOW },
      apply("r1"),
      {
        type: "calculationSettled", analysisId: ID, requestId: "c1", revision, epoch: 0, now: NOW,
        outcome: { ok: true, value: { kind: "calculated", comparison: fixtureComparison("canonical", revision), sourceMode: "fixturePreview", fixtureName: null } },
      },
    );
    expect(Object.keys(record(state).draft.facts)).toEqual([]);
    expect(record(state).result).toEqual({ status: "none" });
  });

  it("an action carrying the old epoch is ignored after resetSession", () => {
    const base = run(initial(), begin("r1"));
    const reset = reducer(base, { type: "resetSession", analyses: base.analyses, profile: null });
    expect(reset.epoch).toBe(1);
    expect(record(run(reset, apply("r1", extraction(), 0))).draft.facts[FEE]).toBeUndefined();
    expect(record(run(reset, begin("r9", "report", 0))).requests.report?.requestId).toBe("r1");
    expect(record(run(reset, apply("r1", extraction(), 1))).draft.facts[FEE]?.value).toBe("150");
  });
});

describe("calculation results and staleness", () => {
  it("calculationSettled for an old revision is ignored after an edit", () => {
    const ready = readyState();
    const revision = record(ready).draft.revision;
    const state = run(
      ready,
      { type: "startCalculation", analysisId: ID, requestId: "c1", revision, epoch: 0 },
      edit(MAX, "1,600"),
      {
        type: "calculationSettled", analysisId: ID, requestId: "c1", revision, epoch: 0, now: NOW,
        outcome: { ok: true, value: { kind: "calculated", comparison: fixtureComparison("canonical", revision), sourceMode: "fixturePreview", fixtureName: null } },
      },
    );
    expect(record(state).result).toEqual({ status: "none" });
    expect(currentResult(record(state))).toBeNull();
  });

  it("editFact sets the result to none so stale results disappear", () => {
    const state = reducer(calculatedState(), edit(FEE, "175"));
    expect(record(state).result).toEqual({ status: "none" });
  });

  it("a successful calculation is compared with a current result; any later edit removes both", () => {
    const state = calculatedState();
    expect(analysisStatus(record(state))).toBe("compared");
    expect(currentResult(record(state))?.comparison.baseline.totalPatientCents).toBe(150000);
    const edited = reducer(state, edit(FEE, "175"));
    expect(currentResult(record(edited))).toBeNull();
    expect(analysisStatus(record(edited))).toBe("needsReview");
  });

  it("a result for a mismatched comparison revision becomes a failure, not a result", () => {
    const ready = readyState();
    const revision = record(ready).draft.revision;
    const state = run(
      ready,
      { type: "startCalculation", analysisId: ID, requestId: "c1", revision, epoch: 0 },
      {
        type: "calculationSettled", analysisId: ID, requestId: "c1", revision, epoch: 0, now: NOW,
        outcome: { ok: true, value: { kind: "calculated", comparison: fixtureComparison("canonical", revision + 5), sourceMode: "fixturePreview", fixtureName: null } },
      },
    );
    expect(record(state).result.status).toBe("failed");
    expect(currentResult(record(state))).toBeNull();
  });

  it("startCalculation without both confirmations throws", () => {
    const entered = run(initial(), edit(FEE, "150"));
    const revision = record(entered).draft.revision;
    const start: Action = { type: "startCalculation", analysisId: ID, requestId: "c1", revision, epoch: 0 };
    expect(() => reducer(entered, start)).toThrow();
    const financialOnly = reducer(entered, { type: "setFinancialConfirmed", analysisId: ID, value: true });
    expect(() => reducer(financialOnly, start)).toThrow();
    const timingOnly = reducer(entered, { type: "setTimingAffirmed", analysisId: ID, value: true });
    expect(() => reducer(timingOnly, start)).toThrow();
  });
});

describe("confirmation groups", () => {
  const both = () => run(initial(), edit(FEE, "150"), { type: "setFinancialConfirmed", analysisId: ID, value: true }, { type: "setTimingAffirmed", analysisId: ID, value: true });

  it("editing a timing path clears timingAffirmed but keeps financialConfirmed", () => {
    const state = reducer(both(), edit(DEADLINE, "2026-10-15"));
    expect(record(state).confirmation).toEqual({ financialConfirmed: true, timingAffirmed: false });
  });

  it("editing a plan path clears financialConfirmed but keeps timingAffirmed", () => {
    const state = reducer(both(), edit(MAX, "1,500"));
    expect(record(state).confirmation).toEqual({ financialConfirmed: false, timingAffirmed: true });
  });
});

describe("identity check", () => {
  const patient = { displayName: "Sam Rivera" };
  const other = (): IntakeExtraction => extraction({ identity: { name: "Jordan Lee", evidenceId: "e1" } });

  it("a differently named report goes to identityCheck instead of merging", () => {
    const state = run(initial(patient), begin("r1"), apply("r1", other()));
    expect(record(state).identityCheck?.reportName).toBe("Jordan Lee");
    expect(record(state).draft.facts[FEE]).toBeUndefined();
  });

  it("a matching name merges directly", () => {
    const matching = extraction({ identity: { name: "Sam Rivera", evidenceId: "e1" } });
    const state = run(initial(patient), begin("r1"), apply("r1", matching));
    expect(record(state).identityCheck).toBeNull();
    expect(record(state).draft.facts[FEE]?.value).toBe("150");
  });

  it("resolveIdentityCheck accept merges the held extraction", () => {
    const state = run(initial(patient), begin("r1"), apply("r1", other()), { type: "resolveIdentityCheck", analysisId: ID, accept: true, now: NOW });
    expect(record(state).identityCheck).toBeNull();
    expect(record(state).draft.facts[FEE]?.value).toBe("150");
  });

  it("resolveIdentityCheck reject discards it", () => {
    const state = run(initial(patient), begin("r1"), apply("r1", other()), { type: "resolveIdentityCheck", analysisId: ID, accept: false, now: NOW });
    expect(record(state).identityCheck).toBeNull();
    expect(record(state).draft.facts[FEE]).toBeUndefined();
  });
});

describe("saved snapshot references", () => {
  const saved = (revision: number) => ({ snapshotId: "s1", version: 1, revision, idempotencyKey: "k1" });

  it("markSaved applies only to the current calculated revision", () => {
    const state = calculatedState();
    const revision = record(state).draft.revision;
    expect(record(run(state, { type: "markSaved", analysisId: ID, saved: saved(revision), now: NOW })).saved?.snapshotId).toBe("s1");
  });

  it("a save acknowledged after Clear does not mark the cleared draft as saved", () => {
    const state = calculatedState();
    const revision = record(state).draft.revision;
    const cleared = run(state, { type: "clearDraft", analysisId: ID, now: NOW }, { type: "markSaved", analysisId: ID, saved: saved(revision), now: NOW });
    expect(record(cleared).saved).toBeNull();
  });

  it("deleting a snapshot clears analyses that pointed at it", () => {
    const state = calculatedState();
    const revision = record(state).draft.revision;
    const savedState = run(state, { type: "markSaved", analysisId: ID, saved: saved(revision), now: NOW });
    expect(record(run(savedState, { type: "clearSavedSnapshot", snapshotId: "s1" })).saved).toBeNull();
    expect(run(savedState, { type: "clearSavedSnapshot", snapshotId: "other" })).toBe(savedState);
  });
});
