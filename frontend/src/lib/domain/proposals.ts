import type { OverflowItem } from "./draft";
import { MAX_PROCEDURES, PROCEDURE_IDS, carePaths, planPaths } from "./fields";
import type { BenefitYearId, EvidenceKind, ExtractionResult, FieldValue, IntakeEvidence, IntakeProposal, ProposedFact } from "./types";

// Maps the architecture's ProposedFact (AI output) onto draft field paths.
// AI output can never target dentist timing, eligibility or permission —
// those fields simply have no mapping here.

const YEAR: Record<"current" | "next", BenefitYearId> = { current: "y1", next: "y2" };

export function fieldPathForProposedFact(fact: ProposedFact): string | null {
  switch (fact.targetKind) {
    case "plan": {
      if (!fact.year) return null;
      const y = YEAR[fact.year];
      switch (fact.field) {
        case "annualMaximum": return planPaths.annualMaximum(y);
        case "alreadyUsed": return planPaths.alreadyUsed(y);
        case "deductible": return planPaths.deductible(y);
        case "deductibleSatisfied": return planPaths.deductibleSatisfied(y);
        case "benefitYearStart": return planPaths.startsOn(y);
        case "benefitYearEnd": return planPaths.endsOn(y);
        default: return null;
      }
    }
    case "category": {
      if (!fact.category) return null;
      switch (fact.field) {
        case "insurerPercent": return planPaths.insurerPercent(fact.category);
        case "deductibleApplies": return planPaths.deductibleApplies(fact.category);
        case "maximumApplies": return planPaths.maximumApplies(fact.category);
        default: return null;
      }
    }
    case "procedure": {
      if (fact.procedureIndex === null || fact.procedureIndex < 0 || fact.procedureIndex >= MAX_PROCEDURES) return null;
      const id = PROCEDURE_IDS[fact.procedureIndex];
      switch (fact.field) {
        case "fee": return carePaths.fee(id);
        case "category": return carePaths.category(id);
        case "label": return carePaths.label(id);
        default: return null;
      }
    }
  }
}

function valueFor(fact: ProposedFact): FieldValue {
  if (fact.unit === "BOOLEAN") {
    if (fact.rawValue === "true") return true;
    if (fact.rawValue === "false") return false;
    return null;
  }
  return fact.rawValue;
}

/**
 * Converts an ExtractionResult into source-linked proposals. Facts that can't
 * be mapped are dropped from proposals and reported as review notes, never
 * silently applied; procedures beyond four become overflow items.
 */
export function proposalsFromExtraction(
  result: ExtractionResult,
  source: { kind: Exclude<EvidenceKind, "manual" | "sample">; sourceId: string; sourceLabel: string; receivedAt: string; turnId?: string; pageFor?: (fact: ProposedFact) => number | undefined },
): { proposals: IntakeProposal[]; evidence: IntakeEvidence[]; overflow: OverflowItem[]; reviewNotes: { message: string; evidenceId: string }[] } {
  const proposals: IntakeProposal[] = [];
  const evidence: IntakeEvidence[] = [];
  const overflow: OverflowItem[] = [];
  const reviewNotes: { message: string; evidenceId: string }[] = [];

  result.proposedFacts.forEach((fact, index) => {
    const evidenceId = `${source.sourceId}:f${index}`;
    evidence.push({
      id: evidenceId,
      kind: source.kind,
      sourceId: source.sourceId,
      sourceLabel: source.sourceLabel,
      pageNumber: source.pageFor?.(fact),
      turnId: source.turnId,
      literalQuote: fact.sourceQuote,
      receivedAt: source.receivedAt,
    });
    if (fact.targetKind === "procedure" && fact.procedureIndex !== null && fact.procedureIndex >= MAX_PROCEDURES) {
      if (fact.field === "label") overflow.push({ label: fact.rawValue, evidenceId });
      return;
    }
    const fieldPath = fieldPathForProposedFact(fact);
    if (!fieldPath) {
      reviewNotes.push({ message: `Couldn't use “${fact.sourceQuote}”. Enter this value yourself if it matters.`, evidenceId });
      return;
    }
    proposals.push({ fieldPath, value: valueFor(fact), evidenceId });
  });

  result.ambiguities.forEach((ambiguity, index) => {
    const evidenceId = `${source.sourceId}:a${index}`;
    evidence.push({ id: evidenceId, kind: source.kind, sourceId: source.sourceId, sourceLabel: source.sourceLabel, turnId: source.turnId, literalQuote: ambiguity.sourceQuote, receivedAt: source.receivedAt });
    reviewNotes.push({ message: ambiguity.question, evidenceId });
  });

  return { proposals, evidence, overflow, reviewNotes };
}
