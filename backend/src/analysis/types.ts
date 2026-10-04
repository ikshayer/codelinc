import type { RecommendationMode } from "../domain/optimizer";
import type { ConfirmedScenario, CalculationRecord, ScenarioComparison } from "../../../frontend/src/lib/domain/types";

export type { ConfirmedScenario, CalculationRecord, ScenarioComparison };
export interface AnalysisScheduleLock { procedureId: string; serviceDate: string }
export interface AnalysisEngineOptions {
  mode?: RecommendationMode;
  schedule_locks?: AnalysisScheduleLock[];
  budget?: { hardMonthlyLimitCents: number; preferredMonthlyLimitCents: number };
}
export interface AnalysisRecordDetail {
  recordId: string;
  completionDate: string;
  peakMonthlyCashCents: number;
  fundingGapCents: number;
  monthly: { month: string; cashCents: number; exceedsHard: boolean; exceedsPreferred: boolean }[];
  events: {
    procedureId: string;
    serviceDate: string;
    benefitYearId: "y1" | "y2";
    userLocked: boolean;
    funding: { sourceType: "CASH"; paymentDate: string; amountCents: number; feesCents: number }[];
    shortfallCents: number;
    benefitsAfter: { deductibleRemainingCents: number; annualMaximumRemainingCents: number };
    issues: string[];
    calculationSteps: { label: string; formula: string; operands: { name: string; value: number; unit: "cents" | "basisPoints" }[]; resultCents: number }[];
  }[];
  differenceFromBaseline: {
    patientDeltaCents: number;
    insurerDeltaCents: number;
    peakMonthlyCashDeltaCents: number;
    completionShiftDays: number;
    serviceDateChanges: { procedureId: string; baselineDate: string; serviceDate: string; shiftDays: number }[];
  };
  issues: string[];
}
export interface AnalysisPlanningContext {
  syntheticData: true;
  engineVersion: "cw-1";
  model: "confirmed-in-network-assumptions";
  mode: RecommendationMode;
  locks: AnalysisScheduleLock[];
  budget: AnalysisEngineOptions["budget"] | null;
  recommendedRecordId: string;
  records: AnalysisRecordDetail[];
  alternatives: { recordId: string; labels: string[] }[];
  search: { evaluated: number; feasible: number; bounded: boolean };
  status: "OK" | "BUDGET_SHORTFALL";
  issues: string[];
  limitations: string[];
}
export interface MemberBenefitContext {
  memberId: string;
  planVersionId: string;
  planName: string;
  snapshotId: string | null;
  observedAt: string;
  benefitYear: number;
  sourceStatus: string;
  annualMaximumCents: number;
  settledPlanPaidCents: number;
  baseRemainingCents: number;
  pendingProjectedPlanPaymentCents: number | null;
  baseAvailableAfterPendingCents: number | null;
  deductibleRemainingCents: number;
  rolloverBankCents: number;
  rolloverSpendingStatus: "NOT_APPLICABLE" | "NEEDS_CONFIRMATION";
  status: "READY" | "CONSERVATIVE" | "NEEDS_CONFIRMATION";
  estimateKind: "SETTLED_BASE" | "CONSERVATIVE_BASE_ONLY";
  pendingTreatment: "NONE" | "RESERVED_PROJECTED" | "UNKNOWN";
  pendingDeductibleTreatment: "NONE" | "UNCHANGED_CONSERVATIVE";
  rolloverTreatment: "NONE" | "EXCLUDED_UNCONFIRMED";
  issues: string[];
}
export interface MemberBenefitAdjustments { pendingReserveCents: number; rolloverExcludedCents: number }
export type AnalysisComparison = ScenarioComparison & { planning: AnalysisPlanningContext; memberBenefitContext?: MemberBenefitContext };
