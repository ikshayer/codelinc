/**
 * Visit Navigator and Care Plan Optimizer contracts (spec §5–§7). FROZEN (contract v1).
 * The exact ranking rules are normative in docs/contracts/CONTRACT-v1.md §7–§8.
 */
import { z } from "zod";
import { AdjudicationLine, BenefitPeriodState, ClaimRoute } from "./benefits";
import { Issue, IssueCode, ResultStatus } from "./issues";
import { FundingSourceType, MemberState } from "./member";
import { EvidenceRef, NetworkTier } from "./plan";
import { AppointmentSlot, ProviderOption } from "./provider";
import { ProcedureRecommendation } from "./procedure";
import {
  AmountRange,
  CdtCode,
  Cents,
  Id,
  IsoDate,
  IsoDateTime,
  JsonValue,
  SignedCents,
  YearMonth,
} from "./primitives";

// ---------------------------------------------------------------------------
// Shared
// ---------------------------------------------------------------------------

export const DecisionTraceEntry = z.strictObject({
  seq: z.number().int().min(0),
  kind: z.enum([
    "INPUT_VALIDATED",
    "SAFETY_GATE",
    "PROCEDURE_REJECTED",
    "OPTION_EXCLUDED",
    "CANDIDATES_BUILT",
    "CANDIDATE_REJECTED",
    "SEARCH_PASS",
    "SCHEDULE_RANKED",
    "ALTERNATIVE_SELECTED",
  ]),
  message: z.string().min(1).max(300),
  data: z.record(z.string(), JsonValue),
});
export type DecisionTraceEntry = z.infer<typeof DecisionTraceEntry>;

/** Evidence for every rule id applied anywhere in a result (for "Why this plan?"). */
export const EvidenceIndexEntry = z.strictObject({
  rule_id: Id,
  plan_version_id: Id,
  evidence: z.array(EvidenceRef).min(1),
});
export type EvidenceIndexEntry = z.infer<typeof EvidenceIndexEntry>;

// ---------------------------------------------------------------------------
// Before the visit: Visit Navigator (spec §5)
// ---------------------------------------------------------------------------

export const VisitIntent = z.enum(["routine", "new_concern", "follow_up"]);
export type VisitIntent = z.infer<typeof VisitIntent>;

export const Symptoms = z.strictObject({
  severe_pain: z.boolean(),
  swelling: z.boolean(),
  trauma: z.boolean(),
  bleeding: z.boolean(),
  fever: z.boolean(),
});
export type Symptoms = z.infer<typeof Symptoms>;

export const VisitNavigatorRequest = z.strictObject({
  as_of: IsoDateTime,
  member: MemberState,
  providers: z.array(ProviderOption).min(1),
  visit: z.strictObject({
    intent: VisitIntent,
    /** Codes expected at this visit (an ESTIMATE of the visit, not a diagnosis). */
    expected_codes: z.array(CdtCode).min(1),
    symptoms: Symptoms,
  }),
  /** CONFIRMED future procedures the member already has (enables conditional scenarios only). */
  known_procedures: z.array(ProcedureRecommendation),
  max_options: z.number().int().min(1).max(3),
});
export type VisitNavigatorRequest = z.infer<typeof VisitNavigatorRequest>;

export const VisitLabel = z.enum(["best_overall", "lowest_cost", "soonest"]);
export type VisitLabel = z.infer<typeof VisitLabel>;

export const Tradeoff = z.strictObject({
  versus_option_id: Id,
  /** this.member_cost.high − versus.member_cost.high; null if either unknown. */
  cost_delta_cents: SignedCents.nullable(),
  /** this.days_until − versus.days_until (negative = sooner). */
  days_delta: z.number().int(),
  /** this.distance − versus.distance, one decimal (negative = closer). */
  miles_delta: z.number(),
  minutes_delta: z.number().int(),
});
export type Tradeoff = z.infer<typeof Tradeoff>;

export const VisitOption = z.strictObject({
  option_id: Id,
  labels: z.array(VisitLabel).min(1),
  status: z.enum(["OK", "NEEDS_CONFIRMATION"]),
  provider_id: Id,
  location_id: Id,
  provider_name: z.string(),
  network_tier: NetworkTier,
  network_observed_at: IsoDateTime,
  network_stale: z.boolean(),
  slot: AppointmentSlot,
  /** Calendar days from the as-of local date to the slot date. */
  days_until: z.number().int().min(0),
  distance_miles: z.number(),
  travel_minutes: z.number().int(),
  claim_route: ClaimRoute,
  modeled_charge: AmountRange.nullable(),
  plan_pay: AmountRange.nullable(),
  member_cost: AmountRange.nullable(),
  deductible_applied: AmountRange.nullable(),
  annual_max_used: AmountRange.nullable(),
  exceeds_hard_monthly_limit: z.boolean().nullable(),
  tradeoffs: z.array(Tradeoff),
  /** Worst-case adjudication lines for the expected codes. */
  lines: z.array(AdjudicationLine),
  issues: z.array(Issue),
});
export type VisitOption = z.infer<typeof VisitOption>;

/** "Save benefits for future care" — always conditional before diagnosis (spec §5, §8). */
export const ConditionalScenario = z.strictObject({
  scenario_id: Id,
  premise_procedure_ids: z.array(Id).min(1),
  compared: z.array(
    z.strictObject({ claim_route: ClaimRoute, horizon_member_cost: AmountRange.nullable(), option_id: Id }),
  ),
  /** null unless every Section-8 fact is verified AND one route is cheaper over the full horizon. */
  winner_claim_route: ClaimRoute.nullable(),
  missing: z.array(Issue),
});
export type ConditionalScenario = z.infer<typeof ConditionalScenario>;

export const VisitNavigatorResult = z.strictObject({
  contract_version: z.string(),
  engine_id: z.string(),
  status: ResultStatus,
  as_of: IsoDateTime,
  as_of_date: IsoDate,
  safety: z.strictObject({
    urgent: z.boolean(),
    triggered_by: z.array(z.string()),
    message: z.string().nullable(),
  }),
  /** At most 3, non-dominated, distinct providers/slots. Order: best_overall, lowest_cost, soonest (first label wins). */
  options: z.array(VisitOption).max(3),
  excluded: z.array(z.strictObject({ provider_id: Id, reasons: z.array(IssueCode).min(1) })),
  conditional_scenarios: z.array(ConditionalScenario),
  evidence: z.array(EvidenceIndexEntry),
  issues: z.array(Issue),
  decision_trace: z.array(DecisionTraceEntry),
});
export type VisitNavigatorResult = z.infer<typeof VisitNavigatorResult>;

// ---------------------------------------------------------------------------
// After the visit: Care Plan Optimizer (spec §6, §7)
// ---------------------------------------------------------------------------

export const CarePlanRequest = z.strictObject({
  as_of: IsoDateTime,
  member: MemberState,
  providers: z.array(ProviderOption).min(1),
  procedures: z.array(ProcedureRecommendation).min(1),
  /** Last date considered; must be >= every latest_safe_date. */
  planning_horizon_end: IsoDate,
  max_alternatives: z.number().int().min(1).max(3),
});
export type CarePlanRequest = z.infer<typeof CarePlanRequest>;

export const AlternativeLabel = z.enum(["lowest_total_cost", "earliest_safe_completion", "smoothest_monthly_payments"]);
export type AlternativeLabel = z.infer<typeof AlternativeLabel>;

export const ReasonCode = z.enum([
  "WITHIN_SAFE_WINDOW",
  "MEETS_DENTIST_TARGET",
  "AFTER_DENTIST_TARGET",
  "EARLIEST_COMPATIBLE_SLOT",
  "HEALING_INTERVAL",
  "AFTER_PLAN_RESET",
  "BEFORE_PLAN_RESET",
  "USES_EXPIRING_FUNDS",
  "FITS_MONTHLY_BUDGET",
  "SELF_PAY_LOWER_PORTFOLIO_COST",
]);
export type ReasonCode = z.infer<typeof ReasonCode>;

export const NextAction = z.strictObject({
  kind: z.enum([
    "REQUEST_APPOINTMENT",
    "REQUEST_PRETREATMENT_ESTIMATE",
    "CONFIRM_SELF_PAY_WITH_OFFICE",
    "CONFIRM_MISSING_DATA",
    "CONTACT_DENTIST_NOW",
    "SUBMIT_FSA_CLAIM",
  ]),
  provider_id: Id.nullable(),
  slot_id: Id.nullable(),
  by_date: IsoDate.nullable(),
});
export type NextAction = z.infer<typeof NextAction>;

/** One payment from one source. Payment date >= service date (no prepayment in v1). */
export const FundingAllocation = z.strictObject({
  allocation_id: Id,
  event_id: Id,
  /** "cash" for CASH; account source_id otherwise. */
  source_id: Id,
  source_type: FundingSourceType,
  payment_date: IsoDate,
  amount_cents: Cents,
  fees_cents: Cents,
  /** Fact id of the balance/budget used. */
  input_id: Id,
});
export type FundingAllocation = z.infer<typeof FundingAllocation>;

export const ScheduledEvent = z.strictObject({
  event_id: Id,
  procedure_id: Id,
  service_date: IsoDate,
  slot_id: Id,
  provider_id: Id,
  location_id: Id,
  claim_route: ClaimRoute,
  /** Adjudication under worst_case and best_case (identical when inputs are exact). */
  line_worst: AdjudicationLine,
  line_best: AdjudicationLine,
  member_cost: AmountRange,
  plan_pay: AmountRange,
  funding: z.array(FundingAllocation),
  /** Member responsibility (worst case) not covered by any source. */
  shortfall_cents: Cents,
  reasons: z.array(ReasonCode).min(1),
  next_actions: z.array(NextAction),
});
export type ScheduledEvent = z.infer<typeof ScheduledEvent>;

export const MonthlyRequirement = z.strictObject({
  month: YearMonth,
  /** New out-of-pocket money that month: CASH + PROVIDER_PLAN + FINANCING installments (excludes FSA/HRA/HSA). */
  cash_cents: Cents,
  by_source: z.array(z.strictObject({ source_type: FundingSourceType, amount_cents: Cents })),
  exceeds_preferred: z.boolean(),
  exceeds_hard: z.boolean(),
});
export type MonthlyRequirement = z.infer<typeof MonthlyRequirement>;

/** Lexicographic objective (spec §7.5), all values worst-case. Lower is better for every field. */
export const ObjectiveVector = z.strictObject({
  /** [act_now, schedule_soon, can_plan_later] */
  unscheduled_by_urgency: z.tuple([z.number().int(), z.number().int(), z.number().int()]),
  lateness_days_by_urgency: z.tuple([z.number().int(), z.number().int(), z.number().int()]),
  funding_shortfall_cents: Cents,
  total_member_cost_cents: Cents,
  total_fees_cents: Cents,
  peak_monthly_cash_cents: Cents,
  travel_minutes_total: z.number().int(),
  visit_days: z.number().int(),
  wait_days_total: z.number().int(),
  expiring_funds_unused_cents: Cents,
  completion_date: IsoDate.nullable(),
});
export type ObjectiveVector = z.infer<typeof ObjectiveVector>;

export const Alternative = z.strictObject({
  alternative_id: Id,
  labels: z.array(AlternativeLabel).min(1),
  /** Canonical key: procedure_id@date@provider@route joined by "|" in procedure_id order. */
  schedule_key: z.string(),
  /** Chronological by service_date, then event_id. */
  events: z.array(ScheduledEvent),
  unscheduled: z.array(z.strictObject({ procedure_id: Id, reason: IssueCode, message: z.string() })),
  totals: z.strictObject({
    modeled_charge: AmountRange,
    contractual_adjustment: AmountRange,
    plan_pay: AmountRange,
    member_cost: AmountRange,
    fees_cents: Cents,
  }),
  funding_gap_cents: Cents,
  monthly: z.array(MonthlyRequirement),
  /** Benefit state after every event (spec §4 OptimizationResult). */
  benefit_states: z.array(z.strictObject({ event_id: Id, state_after: BenefitPeriodState })),
  objective: ObjectiveVector,
  applied_rule_ids: z.array(Id),
  issues: z.array(Issue),
});
export type Alternative = z.infer<typeof Alternative>;

export const CarePlanResult = z.strictObject({
  contract_version: z.string(),
  engine_id: z.string(),
  status: ResultStatus,
  as_of: IsoDateTime,
  as_of_date: IsoDate,
  recommended_alternative_id: Id.nullable(),
  /** At most 3 distinct schedules; order: lowest_total_cost, earliest_safe_completion, smoothest (first label wins). */
  alternatives: z.array(Alternative).max(3),
  evidence: z.array(EvidenceIndexEntry),
  /** Missing/unconfirmed/stale facts the member should resolve. */
  unresolved: z.array(Issue),
  decision_trace: z.array(DecisionTraceEntry),
  search_stats: z.strictObject({
    candidates_built: z.number().int().min(0),
    schedules_evaluated: z.number().int().min(0),
    schedules_feasible: z.number().int().min(0),
    pass: z.union([z.literal(1), z.literal(2)]),
  }),
});
export type CarePlanResult = z.infer<typeof CarePlanResult>;
