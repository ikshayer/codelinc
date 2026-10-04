import { planPaths } from "@/lib/domain/fields";
import type { CalculationRecord, ProcedureId, ScenarioComparison } from "@/lib/domain/types";

// Deterministic, record-bound explanation templates (architecture digest §8).
// Each sentence is chosen by a field of the records; nothing is generated and
// no money is computed here.

export type ExplanationId =
  | "cheaperPermitted"
  | "noCheaperAlternative"
  | "equalCost"
  | "timingConstraint"
  | "noOtherDates"
  | "maximumLimited"
  | "deductibleReset"
  | "preventiveExempt";

export interface Explanation {
  id: ExplanationId;
  text: string;
}

export const TIMING_PRIORITY_TEXT = "The dentist's timing requirement takes priority. We cannot compare a later crown date.";
export const NO_CHEAPER_TEXT = "No cheaper modeled permitted alternative.";
export const EQUAL_COST_TEXT = "Equal-cost schedules; we show the earliest modeled care. This is a tie-break, not medical advice.";

export function hasDeadlineRejection(comparison: ScenarioComparison): boolean {
  return comparison.rejectedCandidates.some((candidate) => candidate.issueCodes.includes("AFTER_DEADLINE"));
}

/** Whether the best record is a different schedule from the baseline. */
export function hasDistinctBest(comparison: ScenarioComparison): boolean {
  return comparison.best.id !== comparison.baseline.id;
}

export function hasNextYearAssumptions(records: CalculationRecord[]): boolean {
  return records.some((record) => record.assumptionFieldPaths.length > 0);
}

export function assumesNextYearUnused(records: CalculationRecord[]): boolean {
  return records.some((record) => record.assumptionFieldPaths.includes(planPaths.alreadyUsed("y2")));
}

function listLabels(ids: ProcedureId[], labels: Record<ProcedureId, string>): string {
  return ids.map((id) => labels[id] ?? id).join(", ");
}

export function explainComparison(comparison: ScenarioComparison, labels: Record<ProcedureId, string>): Explanation[] {
  const { baseline, best, status } = comparison;
  const explanations: Explanation[] = [];

  if (status === "cheaperPermittedAlternative") {
    explanations.push({ id: "cheaperPermitted", text: "A schedule your dentist permits has a lower estimated patient cost than the baseline." });
  } else if (status === "baselineBest") {
    explanations.push({ id: "noCheaperAlternative", text: NO_CHEAPER_TEXT });
  } else {
    explanations.push({ id: "equalCost", text: EQUAL_COST_TEXT });
  }

  if (hasDeadlineRejection(comparison)) {
    explanations.push({ id: "timingConstraint", text: TIMING_PRIORITY_TEXT });
  } else if (status === "baselineBest" && comparison.feasibleRecords.length <= 1) {
    explanations.push({ id: "noOtherDates", text: "Only one dentist-permitted schedule was available to compare, so the baseline is shown." });
  }

  const baselineProcedures = baseline.ledgers.flatMap((ledger) => ledger.procedures);
  const limited = baselineProcedures.filter((p) => p.patientDueToMaximumCents > 0).map((p) => p.procedureId);
  if (limited.length > 0) {
    explanations.push({
      id: "maximumLimited",
      text: `The current-year limit reduces the estimated plan payment for: ${listLabels(limited, labels)}.`,
    });
  }

  if (hasDistinctBest(comparison) && best.ledgers[1].deductible.appliedInScheduleCents > 0) {
    explanations.push({
      id: "deductibleReset",
      text: "The permitted next-year option uses a fresh confirmed allowance and a new deductible.",
    });
  }

  const exempt = baselineProcedures.filter((p) => !p.annualMaximumApplies).map((p) => p.procedureId);
  if (exempt.length > 0) {
    explanations.push({
      id: "preventiveExempt",
      text: `Care that doesn't count toward the yearly limit doesn't use up benefit: ${listLabels(exempt, labels)}.`,
    });
  }

  return explanations;
}

export type CashVsClaimVerdict = "payCash" | "fileClaim" | "confirmFirst";

/** Chosen by the comparison's winner field only (backend CONTRACT §5.9); no money is compared here. */
export function cashVsClaimVerdict(winnerClaimRoute: string | null): CashVsClaimVerdict {
  if (winnerClaimRoute === null) return "confirmFirst";
  return winnerClaimRoute === "SELF_PAY_NO_CLAIM" ? "payCash" : "fileClaim";
}
