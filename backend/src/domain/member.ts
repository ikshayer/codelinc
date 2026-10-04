/**
 * MemberState (spec §4). FROZEN (contract v1).
 * A timestamped snapshot. Accumulators are labeled (CLAIM_EOB or MEMBER_CONFIRMED).
 * Pending claims are represented separately and are NEVER treated as settled.
 */
import { z } from "zod";
import { PlanKey } from "./plan";
import {
  CdtCode,
  Cents,
  Id,
  IsoDate,
  IsoDateTime,
  LocalTime,
  SourcedMoney,
  SourceLabel,
  Tooth,
  Weekday,
} from "./primitives";

/** Accumulator snapshot for one benefit period (one plan version). */
export const AccumulatorSnapshot = z.strictObject({
  plan_version_id: Id,
  period_start: IsoDate,
  period_end: IsoDate,
  /** Deductible still to satisfy in this period (settled claims only). */
  deductible_remaining: SourcedMoney,
  /** Annual maximum remaining after SETTLED plan payments (pending claims NOT subtracted). */
  annual_max_remaining: SourcedMoney,
  /** Plan payments counted against the annual maximum so far (settled). */
  plan_paid_ytd: SourcedMoney,
  /**
   * (1.5) Carryover already added to this period's annual maximum (CONTRACT §3.9). Optional on input;
   * null = unknown, never treated as 0.
   */
  carryover_balance: SourcedMoney.nullable().default(null),
});
export type AccumulatorSnapshot = z.infer<typeof AccumulatorSnapshot>;

/** A submitted, not-yet-adjudicated claim. Reserved against balances, labeled pending. */
export const PendingClaim = z.strictObject({
  claim_id: Id,
  plan_version_id: Id,
  service_date: IsoDate,
  cdt_code: CdtCode,
  tooth: Tooth.nullable(),
  /** Estimated plan payment that will count against the annual maximum. */
  estimated_plan_pay: SourcedMoney,
  /** Estimated deductible this claim will consume. */
  estimated_deductible_applied: SourcedMoney,
});
export type PendingClaim = z.infer<typeof PendingClaim>;

/** Prior services for frequency / waiting-period checks. */
export const ProcedureHistoryEntry = z.strictObject({
  cdt_code: CdtCode,
  tooth: Tooth.nullable(),
  service_date: IsoDate,
  source: SourceLabel,
  /** false when paid without a claim (does not count toward plan frequency if the plan says so). */
  claimed: z.boolean(),
});
export type ProcedureHistoryEntry = z.infer<typeof ProcedureHistoryEntry>;

export const FundingSourceType = z.enum(["CASH", "FSA", "HRA", "HSA", "PROVIDER_PLAN", "FINANCING"]);
export type FundingSourceType = z.infer<typeof FundingSourceType>;

/**
 * A member-held funding account. CASH uses the monthly budget instead of a balance.
 * Restricted accounts (FSA/HRA) may only fund expenses whose SERVICE DATE is within
 * [eligible_service_from, eligible_service_through].
 */
export const FundingAccount = z.strictObject({
  source_id: Id,
  type: z.enum(["FSA", "HRA", "HSA"]),
  label: z.string().min(1).max(80),
  balance: SourcedMoney,
  eligible_service_from: IsoDate,
  /** Last service date this money can pay for (plan year end + grace). Funds expire after this. */
  eligible_service_through: IsoDate.nullable(),
  /** Deadline to submit reimbursement (display only in v1). */
  claim_deadline: IsoDate.nullable(),
  /** HSA only: balance the member wants to keep untouched. */
  reserve_cents: Cents,
});
export type FundingAccount = z.infer<typeof FundingAccount>;

export const MonthlyBudget = z.strictObject({
  input_id: Id,
  /** Cash that can be paid in any calendar month. Exceeding it is a hard violation (pass 1). */
  hard_monthly_limit_cents: Cents,
  /** Soft target used only for display/warnings in v1. */
  preferred_monthly_limit_cents: Cents,
  source: SourceLabel,
  observed_at: IsoDateTime,
});
export type MonthlyBudget = z.infer<typeof MonthlyBudget>;

/** Recurring weekly availability, local wall-clock. */
export const WeeklyWindow = z.strictObject({
  weekday: Weekday,
  start_time: LocalTime,
  end_time: LocalTime,
});
export type WeeklyWindow = z.infer<typeof WeeklyWindow>;

export const Availability = z.strictObject({
  input_id: Id,
  weekly: z.array(WeeklyWindow),
  /** Inclusive date ranges the member is NOT available (overrides weekly). */
  unavailable: z.array(z.strictObject({ start: IsoDate, end: IsoDate })),
  source: SourceLabel,
  observed_at: IsoDateTime,
});
export type Availability = z.infer<typeof Availability>;

export const TravelLimit = z.strictObject({
  input_id: Id,
  /** Providers farther than this are rejected (hard). */
  hard_max_miles: z.number().min(0).max(500),
  preferred_max_miles: z.number().min(0).max(500).nullable(),
  source: SourceLabel,
  observed_at: IsoDateTime,
});
export type TravelLimit = z.infer<typeof TravelLimit>;

export const SecondaryCoverage = z.strictObject({
  carrier_name: z.string().min(1),
  relationship: z.enum(["self", "spouse", "parent"]),
});

export const MemberState = z.strictObject({
  member_id: Id,
  display_name: z.string().min(1).max(80),
  /** IANA zone, e.g. America/New_York; used to derive the local as-of date. */
  time_zone: z
    .string()
    .min(1)
    .refine(
      (tz) => {
        try {
          new Intl.DateTimeFormat("en-US", { timeZone: tz });
          return true;
        } catch {
          return false;
        }
      },
      { message: "unknown IANA time zone" },
    ),
  plan_key: PlanKey,
  coverage_effective_from: IsoDate,
  observed_at: IsoDateTime,
  accumulators: z.array(AccumulatorSnapshot),
  pending_claims: z.array(PendingClaim),
  procedure_history: z.array(ProcedureHistoryEntry),
  /** Non-null ⇒ COB required ⇒ NEEDS_CONFIRMATION in v1 (not modeled). */
  secondary_coverage: SecondaryCoverage.nullable(),
  funding_accounts: z.array(FundingAccount),
  budget: MonthlyBudget,
  availability: Availability,
  travel: TravelLimit,
});
export type MemberState = z.infer<typeof MemberState>;
