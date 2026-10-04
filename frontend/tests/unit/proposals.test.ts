import { describe, expect, it } from "vitest";
import { isKnownFieldPath } from "@/lib/domain/fields";
import { fieldPathForProposedFact, proposalsFromExtraction } from "@/lib/domain/proposals";
import type { CoverageCategory, ExtractionResult, ProposedFact } from "@/lib/domain/types";

type Field = ProposedFact["field"];
const FIELDS: Field[] = [
  "annualMaximum", "alreadyUsed", "deductible", "deductibleSatisfied", "benefitYearStart", "benefitYearEnd",
  "insurerPercent", "deductibleApplies", "maximumApplies", "fee", "category", "label",
];
const KINDS: ProposedFact["targetKind"][] = ["plan", "category", "procedure"];
const YEARS: ProposedFact["year"][] = [null, "current", "next"];
const CATEGORIES: (CoverageCategory | null)[] = [null, "preventive", "basic", "major"];
const INDEXES = [null, -1, 0, 1, 2, 3, 4, 5];

function fact(overrides: Partial<ProposedFact>): ProposedFact {
  return { targetKind: "procedure", field: "fee", year: null, category: null, procedureIndex: 0, rawValue: "150", unit: "USD", sourceQuote: "quote", ...overrides };
}

describe("fieldPathForProposedFact", () => {
  it("never targets timing paths, eligibility, or anchor dates for any input", () => {
    for (const targetKind of KINDS) for (const field of FIELDS) for (const year of YEARS) for (const category of CATEGORIES) for (const procedureIndex of INDEXES) {
      const path = fieldPathForProposedFact(fact({ targetKind, field, year, category, procedureIndex }));
      if (path === null) continue;
      expect(path.startsWith("timing."), path).toBe(false);
      expect(path.endsWith(".eligibilityConfirmed"), path).toBe(false);
      expect(path.endsWith(".anchorDate"), path).toBe(false);
      expect(isKnownFieldPath(path), path).toBe(true);
    }
  });

  it("maps representative facts to their draft paths", () => {
    expect(fieldPathForProposedFact(fact({ targetKind: "plan", field: "annualMaximum", year: "current" }))).toBe("plan.y1.annualMaximum");
    expect(fieldPathForProposedFact(fact({ targetKind: "plan", field: "deductible", year: "next" }))).toBe("plan.y2.deductible");
    expect(fieldPathForProposedFact(fact({ targetKind: "category", field: "insurerPercent", category: "basic" }))).toBe("plan.rules.basic.insurerPercent");
    expect(fieldPathForProposedFact(fact({ targetKind: "procedure", field: "fee", procedureIndex: 3 }))).toBe("care.p4.fee");
  });

  it("returns null when the year or category it needs is missing", () => {
    expect(fieldPathForProposedFact(fact({ targetKind: "plan", field: "annualMaximum", year: null }))).toBeNull();
    expect(fieldPathForProposedFact(fact({ targetKind: "category", field: "insurerPercent", category: null }))).toBeNull();
  });
});

describe("proposalsFromExtraction", () => {
  const source = { kind: "pdf" as const, sourceId: "rep-1", sourceLabel: "report.pdf", receivedAt: "2026-10-03T00:00:00Z" };
  const extraction = (proposedFacts: ProposedFact[]): ExtractionResult => ({ proposedFacts, ambiguities: [], missingFields: [] });

  it("routes a fifth-procedure label (index 4) to overflow, not proposals", () => {
    const result = proposalsFromExtraction(extraction([fact({ field: "label", procedureIndex: 4, rawValue: "Night guard", unit: "TEXT" })]), source);
    expect(result.proposals).toEqual([]);
    expect(result.overflow).toEqual([{ label: "Night guard", evidenceId: "rep-1:f0" }]);
  });

  it("drops other fields of a fifth procedure without proposing them", () => {
    const result = proposalsFromExtraction(extraction([fact({ field: "fee", procedureIndex: 4 })]), source);
    expect(result.proposals).toEqual([]);
    expect(result.overflow).toEqual([]);
  });

  it("converts BOOLEAN true/false to booleans and anything else to null", () => {
    const facts = ["true", "false", "yes"].map((rawValue) =>
      fact({ targetKind: "category", field: "deductibleApplies", category: "basic", procedureIndex: null, rawValue, unit: "BOOLEAN" }),
    );
    const { proposals } = proposalsFromExtraction(extraction(facts), source);
    expect(proposals.map((p) => p.value)).toEqual([true, false, null]);
  });

  it("keeps non-boolean raw values as text", () => {
    const { proposals } = proposalsFromExtraction(extraction([fact({ rawValue: "$1,500" })]), source);
    expect(proposals).toEqual([{ fieldPath: "care.p1.fee", value: "$1,500", evidenceId: "rep-1:f0" }]);
  });

  it("reports unmappable facts as review notes instead of proposing them", () => {
    const result = proposalsFromExtraction(extraction([fact({ targetKind: "plan", field: "annualMaximum", year: null })]), source);
    expect(result.proposals).toEqual([]);
    expect(result.reviewNotes).toHaveLength(1);
  });

  it("every proposal references evidence it returned", () => {
    const result = proposalsFromExtraction(extraction([fact({}), fact({ procedureIndex: 1 })]), source);
    const ids = new Set(result.evidence.map((e) => e.id));
    expect(result.proposals.every((p) => ids.has(p.evidenceId))).toBe(true);
  });
});
