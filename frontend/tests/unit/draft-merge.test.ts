import { describe, expect, it } from "vitest";
import { applyProposals, editFact, emptyDraft, markConfirmed, removeSource, resolveConflict } from "@/lib/domain/draft";
import { carePaths, planPaths } from "@/lib/domain/fields";
import { evidence, proposal } from "./helpers";

const MAX = planPaths.annualMaximum("y1");
const evA = evidence("a1", "report-A");
const evA2 = evidence("a2", "report-A");
const evB = evidence("b1", "report-B");

describe("applyProposals", () => {
  it("a new proposal is proposed, never confirmed", () => {
    const draft = applyProposals(emptyDraft(), [proposal(MAX, "1,500", "a1")], [evA]);
    expect(draft.facts[MAX]).toMatchObject({ value: "1,500", status: "proposed", userEdited: false, confirmedAtRevision: null, evidenceIds: ["a1"] });
  });

  it("rejects unknown field paths and missing evidence loudly", () => {
    expect(() => applyProposals(emptyDraft(), [proposal("plan.nope", "1", "a1")], [evA])).toThrow();
    expect(() => applyProposals(emptyDraft(), [proposal(MAX, "1", "missing")], [evA])).toThrow();
  });

  it("same value from another source corroborates: evidence added, value kept", () => {
    let draft = applyProposals(emptyDraft(), [proposal(MAX, "1,500", "a1")], [evA]);
    draft = applyProposals(draft, [proposal(MAX, "$1500", "b1")], [evB]);
    expect(draft.facts[MAX]).toMatchObject({ value: "1,500", status: "proposed" });
    expect([...draft.facts[MAX].evidenceIds].sort()).toEqual(["a1", "b1"]);
  });

  it("different value from another source becomes a conflict with both candidates", () => {
    let draft = applyProposals(emptyDraft(), [proposal(MAX, "1,500", "a1")], [evA]);
    draft = applyProposals(draft, [proposal(MAX, "2,000", "b1")], [evB]);
    const fact = draft.facts[MAX];
    expect(fact.status).toBe("conflict");
    expect(fact.candidates.map((c) => c.value)).toEqual(["1,500", "2,000"]);
  });

  it("a user-edited field is never overwritten by a later proposal", () => {
    let draft = editFact(emptyDraft(), MAX, "1,200");
    draft = applyProposals(draft, [proposal(MAX, "2,000", "a1")], [evA]);
    const fact = draft.facts[MAX];
    expect(fact.status).toBe("conflict");
    expect(fact.candidates.map((c) => c.value)).toEqual(["1,200", "2,000"]);
    expect(fact.value).toBe("1,200");
  });

  it("an untouched value from the same source is refreshed", () => {
    let draft = applyProposals(emptyDraft(), [proposal(MAX, "1,500", "a1")], [evA]);
    draft = applyProposals(draft, [proposal(MAX, "1,800", "a2")], [evA2]);
    expect(draft.facts[MAX]).toMatchObject({ value: "1,800", status: "proposed", evidenceIds: ["a2"] });
  });

  it("holds at most four procedures and rejects a fifth procedure path", () => {
    const labels = ["p1", "p2", "p3", "p4"].map((p, i) => proposal(carePaths.label(p), `Care ${i}`, "a1"));
    const draft = applyProposals(emptyDraft(), labels, [evA]);
    expect(draft.procedureIds).toEqual(["p1", "p2", "p3", "p4"]);
    expect(() => applyProposals(draft, [proposal("care.p5.label", "Extra", "a1")], [evA])).toThrow();
  });

  it("adds a new value to an existing conflict as another candidate", () => {
    let draft = applyProposals(emptyDraft(), [proposal(MAX, "1,500", "a1")], [evA]);
    draft = applyProposals(draft, [proposal(MAX, "2,000", "b1")], [evB]);
    draft = applyProposals(draft, [proposal(MAX, "2,500", "c1")], [evidence("c1", "report-C")]);
    expect(draft.facts[MAX].candidates).toHaveLength(3);
  });
});

describe("editFact", () => {
  it("clears confirmation and marks the value user-edited", () => {
    let draft = applyProposals(emptyDraft(), [proposal(MAX, "1,500", "a1")], [evA]);
    draft = markConfirmed(draft, [MAX]);
    expect(draft.facts[MAX].status).toBe("confirmed");
    draft = editFact(draft, MAX, "1,600");
    expect(draft.facts[MAX]).toMatchObject({ value: "1,600", status: "proposed", userEdited: true, confirmedAtRevision: null });
  });

  it("rejects unknown field paths", () => {
    expect(() => editFact(emptyDraft(), "plan.bogus", "1")).toThrow();
  });
});

describe("resolveConflict", () => {
  it("picks a candidate, marks it user-edited, and clears the conflict", () => {
    let draft = applyProposals(emptyDraft(), [proposal(MAX, "1,500", "a1")], [evA]);
    draft = applyProposals(draft, [proposal(MAX, "2,000", "b1")], [evB]);
    const pick = draft.facts[MAX].candidates[1];
    draft = resolveConflict(draft, MAX, pick);
    expect(draft.facts[MAX]).toMatchObject({ value: "2,000", status: "proposed", userEdited: true, candidates: [], evidenceIds: ["b1"] });
  });

  it("throws when there is no conflict", () => {
    const draft = applyProposals(emptyDraft(), [proposal(MAX, "1,500", "a1")], [evA]);
    expect(() => resolveConflict(draft, MAX, { value: "1", origin: "pdf", evidenceIds: [] })).toThrow();
  });
});

describe("removeSource", () => {
  const DED = planPaths.deductible("y1");

  it("drops untouched values only that source supplied", () => {
    let draft = applyProposals(emptyDraft(), [proposal(MAX, "1,500", "a1")], [evA]);
    draft = applyProposals(draft, [proposal(DED, "50", "b1")], [evB]);
    draft = removeSource(draft, "report-A");
    expect(draft.facts[MAX]).toBeUndefined();
    expect(draft.facts[DED]).toBeDefined();
    expect(draft.evidence["a1"]).toBeUndefined();
  });

  it("keeps user-edited values even when their evidence came from the removed source", () => {
    let draft = applyProposals(emptyDraft(), [proposal(MAX, "1,500", "a1")], [evA]);
    draft = editFact(draft, MAX, "1,600");
    draft = removeSource(draft, "report-A");
    expect(draft.facts[MAX]).toMatchObject({ value: "1,600", userEdited: true });
  });

  it("keeps confirmed values", () => {
    let draft = applyProposals(emptyDraft(), [proposal(MAX, "1,500", "a1")], [evA]);
    draft = markConfirmed(draft, [MAX]);
    draft = removeSource(draft, "report-A");
    expect(draft.facts[MAX]?.status).toBe("confirmed");
  });

  it("keeps a value corroborated by another source", () => {
    let draft = applyProposals(emptyDraft(), [proposal(MAX, "1,500", "a1")], [evA]);
    draft = applyProposals(draft, [proposal(MAX, "1,500", "b1")], [evB]);
    draft = removeSource(draft, "report-A");
    expect(draft.facts[MAX]).toMatchObject({ value: "1,500", evidenceIds: ["b1"] });
  });

  it("reduces a conflict to the remaining candidate when one source is removed", () => {
    let draft = applyProposals(emptyDraft(), [proposal(MAX, "1,500", "a1")], [evA]);
    draft = applyProposals(draft, [proposal(MAX, "2,000", "b1")], [evB]);
    draft = removeSource(draft, "report-B");
    expect(draft.facts[MAX]).toMatchObject({ value: "1,500", status: "proposed", candidates: [], evidenceIds: ["a1"] });
  });

  it("reduces a conflict between a typed value and a source to the typed value", () => {
    let draft = editFact(emptyDraft(), MAX, "1,200");
    draft = applyProposals(draft, [proposal(MAX, "2,000", "a1")], [evA]);
    draft = removeSource(draft, "report-A");
    expect(draft.facts[MAX]).toMatchObject({ value: "1,200", status: "proposed", candidates: [] });
  });

  it("is a no-op for an unknown source", () => {
    const draft = applyProposals(emptyDraft(), [proposal(MAX, "1,500", "a1")], [evA]);
    expect(removeSource(draft, "nope")).toBe(draft);
  });
});
