/**
 * Benefit engine contracts (spec §7.3). FROZEN (contract v1).
 *
 * Adjudication is chronological by SERVICE DATE (ties: event_id ascending).
 * Claim/adjudication date and payment date never select the plan period (AT-10).
 * Every money field is integer cents. Reconciliation invariant (AT-5), per line:
 *   modeled_charge = plan_pay + member_responsibility + contractual_adjustment
 */
import { z } from "zod";
import { Issue, LineStatus, ResultStatus, RuleStatus } from "./issues";
import { MemberState, ProcedureHistoryEntry } from "./member";
import { NetworkTier, PlanDefinition, ServiceClass } from "./plan";
import { ProviderOption } from "./provider";
import {
  AmountRange,
  BasisPoints,
  CdtCode,
  Cents,
  Id,
  IsoDate,
  IsoDateTime,
  Scenario,
  SourceLabel,
  Tooth,
} from "./primitives";

/** Pricing/claim route (spec §2). Separate from the funding source. */
export const ClaimRoute = z.enum(["IN_NETWORK_CLAIM", "OUT_OF_NETWORK_CLAIM", "SELF_PAY_NO_CLAIM"]);
export type ClaimRoute = z.infer<typeof ClaimRoute>;

/** One modeled service to adjudicate. */
export const ClaimEvent = z.strictObject({
  event_id: Id,
  procedure_id: Id,
  cdt_code: CdtCode,
  tooth: Tooth.nullable(),
  /** Selects the plan version and benefit period. */
  service_date: IsoDate,
  /** When the claim is submitted/processed. Informational; never selects the period. */
  claim_date: IsoDate.nullable(),
  provider_id: Id,
  claim_route: ClaimRoute,
});
export type ClaimEvent = z.infer<typeof ClaimEvent>;

/** One operand cited by a calculation step. Exactly one value field is non-null. */
export const CalcOperand = z.strictObject({
  name: z.string().min(1).max(80),
  cents: Cents.nullable(),
  bps: BasisPoints.nullable(),
  text: z.string().max(120).nullable(),
  /** Fact id (rule:/input:/calc:) — see fact-ids.ts. */
  fact_id: z.string().min(1),
});
export type CalcOperand = z.infer<typeof CalcOperand>;

/** A single arithmetic step, shown behind "See how this was calculated". */
export const CalcStep = z.strictObject({
  /** `<line_id>.<CalcStepName>` */
  step_id: z.string().min(1),
  label: z.string().min(1).max(120),
  /** Human-readable formula with operand names, e.g. "min(deductible_remaining, eligible_basis)". */
  formula: z.string().min(1).max(200),
  operands: z.array(CalcOperand),
  result_cents: Cents.nullable(),
  result_bps: BasisPoints.nullable(),
  result_text: z.string().max(120).nullable(),
});
export type CalcStep = z.infer<typeof CalcStep>;

/** State of one benefit period (one plan version) at a point in the simulation. */
export const BenefitPeriodState = z.strictObject({
  plan_version_id: Id,
  period_start: IsoDate,
  period_end: IsoDate,
  /** snapshot = from MemberState accumulators; plan_rules = period not started at as_of, opened fresh. */
  opened_from: z.enum(["snapshot", "plan_rules"]),
  deductible_remaining_cents: Cents,
  /** Settled view (excludes pending reservations). */
  annual_max_remaining_cents: Cents,
  /** Estimated plan pay of pending claims reserved against the maximum. */
  pending_reserved_max_cents: Cents,
  /** Estimated deductible of pending claims reserved against the deductible. */
  pending_reserved_deductible_cents: Cents,
  /** max(0, annual_max_remaining - pending_reserved_max). The cap used for new claims. */
  annual_max_available_cents: Cents,
  /** max(0, deductible_remaining - pending_reserved_deductible). The deductible used for new claims. */
  deductible_available_cents: Cents,
  sublimits: z.array(z.strictObject({ rule_id: Id, remaining_cents: Cents })),
  /** Plan payments added by this simulation in this period. */
  simulated_plan_paid_cents: Cents,
  /** Labels of the snapshot values (CLAIM_EOB / MEMBER_CONFIRMED / PLAN_VERIFIED for fresh periods). */
  source: SourceLabel,
});
export type BenefitPeriodState = z.infer<typeof BenefitPeriodState>;

export const BenefitLedger = z.strictObject({
  periods: z.array(BenefitPeriodState),
  /** Member-level history used by frequency rules (includes simulated claimed events). */
  history: z.array(ProcedureHistoryEntry),
});
export type BenefitLedger = z.infer<typeof BenefitLedger>;

export const CapApplied = z.enum(["none", "annual_maximum", "sublimit", "lifetime_maximum"]);
export type CapApplied = z.infer<typeof CapApplied>;

/**
 * The adjudication of one event. Money fields are null only when status is
 * NEEDS_CONFIRMATION or UNSUPPORTED_PLAN_TYPE.
 */
export const AdjudicationLine = z.strictObject({
  line_id: Id,
  event_id: Id,
  procedure_id: Id,
  cdt_code: CdtCode,
  tooth: Tooth.nullable(),
  service_date: IsoDate,
  claim_date: IsoDate.nullable(),
  provider_id: Id,
  /** null only when the provider is not in the request (line is NEEDS_CONFIRMATION). */
  network_tier: NetworkTier.nullable(),
  claim_route: ClaimRoute,
  status: LineStatus,
  plan_version_id: Id.nullable(),
  service_class: ServiceClass.nullable(),
  /** Reconciliation base: provider charge for claims; verified cash quote for self-pay. */
  modeled_charge_cents: Cents.nullable(),
  /** In-network: provider charge − allowed. Out-of-network and self-pay: 0. */
  contractual_adjustment_cents: Cents.nullable(),
  /** What the member and plan together owe: modeled_charge − contractual_adjustment. */
  patient_charge_cents: Cents.nullable(),
  /** Amount the plan rule recognizes (allowed amount or OON allowance, capped at charge). */
  eligible_basis_cents: Cents.nullable(),
  /** OON only: patient_charge − eligible_basis (included in member_responsibility). */
  balance_bill_cents: Cents.nullable(),
  deductible_applied_cents: Cents.nullable(),
  coverage_rate_bps: BasisPoints.nullable(),
  /** rate × (eligible_basis − deductible_applied), round half up, before caps. */
  preliminary_plan_pay_cents: Cents.nullable(),
  cap_applied: CapApplied.nullable(),
  plan_pay_cents: Cents.nullable(),
  member_responsibility_cents: Cents.nullable(),
  counts_toward_maximum: z.boolean().nullable(),
  state_before: BenefitPeriodState.nullable(),
  state_after: BenefitPeriodState.nullable(),
  applied_rule_ids: z.array(Id),
  input_ids: z.array(Id),
  steps: z.array(CalcStep),
  issues: z.array(Issue),
});
export type AdjudicationLine = z.infer<typeof AdjudicationLine>;

export const SimulationRequest = z.strictObject({
  as_of: IsoDateTime,
  scenario: Scenario,
  member: MemberState,
  providers: z.array(ProviderOption),
  events: z.array(ClaimEvent),
});
export type SimulationRequest = z.infer<typeof SimulationRequest>;

export const SimulationTotals = z.strictObject({
  modeled_charge_cents: Cents,
  contractual_adjustment_cents: Cents,
  plan_pay_cents: Cents,
  member_responsibility_cents: Cents,
});
export type SimulationTotals = z.infer<typeof SimulationTotals>;

/** (1.5) Year-close carryover status (CONTRACT §3.9). Never "guaranteed" before the year is closed. */
export const RolloverStatus = z.enum(["EARNED", "CONDITIONAL", "NOT_EARNED", "UNCERTAIN", "NEEDS_CONFIRMATION"]);
export type RolloverStatus = z.infer<typeof RolloverStatus>;

/** (1.5) Outcome of closing one benefit period under a VERIFIED rollover rule (CONTRACT §3.9). */
export const RolloverOutcome = z.strictObject({
  rule_id: Id,
  closing_plan_version_id: Id,
  closing_period_end: IsoDate,
  /** Resolved plan version on the day after the period ends; null when none resolves. */
  next_plan_version_id: Id.nullable(),
  status: RolloverStatus,
  threshold_cents: Cents,
  threshold_comparison: z.enum(["LT", "LTE"]),
  /** Settled plan payments toward the maximum (snapshot plan_paid_ytd; 0 for a fresh period); null = unknown. */
  settled_plan_paid_cents: Cents.nullable(),
  /** High estimate of pending claims in the period; null = unknown. */
  pending_plan_pay_cents: Cents.nullable(),
  /** low = settled + simulated; high = low + pending. */
  qualifying_plan_paid: AmountRange.nullable(),
  base_award_cents: Cents,
  network_bonus: AmountRange,
  /** Carryover balance before this close; null = unknown. */
  prior_bank_cents: Cents.nullable(),
  bank_cap_cents: Cents,
  /** Carryover available in the next period; null = needs confirmation. */
  final_bank: AmountRange.nullable(),
  lost_to_cap_cents: Cents.nullable(),
  forfeited_cents: Cents.nullable(),
  applied_rule_ids: z.array(Id),
  input_ids: z.array(Id),
  steps: z.array(CalcStep),
  issues: z.array(Issue),
});
export type RolloverOutcome = z.infer<typeof RolloverOutcome>;

export const SimulationResult = z.strictObject({
  contract_version: z.string(),
  engine_id: z.string(),
  status: ResultStatus,
  scenario: Scenario,
  /** Chronological: service_date asc, then event_id asc. */
  lines: z.array(AdjudicationLine),
  ledger_before: BenefitLedger,
  ledger_after: BenefitLedger,
  /** null unless every line is OK or NOT_COVERED. */
  totals: SimulationTotals.nullable(),
  applied_rule_ids: z.array(Id),
  issues: z.array(Issue),
  /** (1.5) One outcome per closed period with a VERIFIED rollover rule, by closing_period_end. */
  rollover: z.array(RolloverOutcome),
});
export type SimulationResult = z.infer<typeof SimulationResult>;

export const PlanResolution = z.discriminatedUnion("ok", [
  z.strictObject({ ok: z.literal(true), plan: PlanDefinition, issues: z.array(Issue) }),
  z.strictObject({ ok: z.literal(false), status: ResultStatus, issues: z.array(Issue).min(1) }),
]);
export type PlanResolution = z.infer<typeof PlanResolution>;

export const PlanValidationReport = z.strictObject({
  plan_version_id: Id,
  ok: z.boolean(),
  rule_counts: z.record(RuleStatus, z.number().int().min(0)),
  issues: z.array(Issue),
});
export type PlanValidationReport = z.infer<typeof PlanValidationReport>;

/** One line of the Benefit Passport (demo step 1). Exactly one value field is non-null. */
export const PassportItem = z.strictObject({
  item_id: Id,
  label: z.string().min(1).max(120),
  value_cents: Cents.nullable(),
  value_range: AmountRange.nullable(),
  value_bps: BasisPoints.nullable(),
  value_date: IsoDate.nullable(),
  value_text: z.string().max(120).nullable(),
  source: SourceLabel,
  rule_status: RuleStatus.nullable(),
  rule_ids: z.array(Id),
  input_ids: z.array(Id),
  observed_at: IsoDateTime.nullable(),
});
export type PassportItem = z.infer<typeof PassportItem>;

export const BenefitPassport = z.strictObject({
  contract_version: z.string(),
  as_of: IsoDateTime,
  member_id: Id,
  plan_version_id: Id,
  plan_name: z.string(),
  carrier_name: z.string(),
  synthetic: z.boolean(),
  coverage_period_start: IsoDate,
  coverage_period_end: IsoDate,
  /** First day of the next benefit period (what resets, and when). */
  next_reset_date: IsoDate,
  current_period: BenefitPeriodState,
  sections: z.array(
    z.strictObject({
      section_id: z.enum(["balances", "coverage_in_network", "coverage_out_of_network", "rules", "funding"]),
      title: z.string(),
      items: z.array(PassportItem),
    }),
  ),
  issues: z.array(Issue),
});
export type BenefitPassport = z.infer<typeof BenefitPassport>;
