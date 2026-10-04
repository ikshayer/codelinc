/**
 * ProviderOption (spec §4). FROZEN (contract v1).
 * Network status, slots and prices are timestamped observations, not facts forever.
 */
import { z } from "zod";
import { NetworkTier } from "./plan";
import { BasisPoints, CdtCode, Cents, Id, IsoDate, IsoDateTime, LocalTime, SourcedMoney, SourceLabel } from "./primitives";

export const Specialty = z.enum([
  "general",
  "endodontist",
  "prosthodontist",
  "periodontist",
  "oral_surgeon",
  "pediatric",
  "orthodontist",
]);
export type Specialty = z.infer<typeof Specialty>;

export const AppointmentSlot = z.strictObject({
  slot_id: Id,
  date: IsoDate,
  start_time: LocalTime,
  end_time: LocalTime,
  /** exam = new-patient/limited exam visit; treatment = procedure chair time. */
  kind: z.enum(["exam", "treatment"]),
});
export type AppointmentSlot = z.infer<typeof AppointmentSlot>;

export const ProcedurePrice = z.strictObject({
  cdt_code: CdtCode,
  /** Office's full charge (billed amount). */
  provider_charge: SourcedMoney,
  /** In-network contracted allowed amount; null for out-of-network offices. */
  contracted_allowed: SourcedMoney.nullable(),
  /** Verified cash price for self-pay/no-claim; null when the office has not quoted one. */
  cash_quote: SourcedMoney.nullable(),
  /** (1.4) Last service date the cash quote is honored; null = validity unknown, so the quote is not definitive. */
  cash_quote_valid_through: IsoDate.nullable(),
});
export type ProcedurePrice = z.infer<typeof ProcedurePrice>;

/** Office-offered payment plan. Used only when verified. */
export const ProviderPaymentPlan = z.strictObject({
  payment_plan_id: Id,
  input_id: Id,
  verified: z.boolean(),
  kind: z.enum(["zero_interest", "financing"]),
  term_months: z.number().int().min(1).max(60),
  /** Down payment due on the service date, as a share of member responsibility. */
  down_payment_bps: BasisPoints,
  /** Total verified fees/interest for the term (0 for zero_interest). */
  total_fees_cents: Cents,
  /** Funding before the service date is never allowed in v1. */
  allows_prepayment: z.literal(false),
  observed_at: IsoDateTime,
});
export type ProviderPaymentPlan = z.infer<typeof ProviderPaymentPlan>;

export const ProviderOption = z.strictObject({
  provider_id: Id,
  location_id: Id,
  name: z.string().min(1).max(120),
  specialty: Specialty,
  network: z.strictObject({
    input_id: Id,
    /** (1.4) null = network status unknown. */
    tier: NetworkTier.nullable(),
    /**
     * (1.4) The plan network this status was verified against. The status counts only when it
     * equals the resolved plan version's key.network_id; null = not verified for any plan.
     */
    network_id: Id.nullable(),
    source: SourceLabel,
    /** When network participation was last verified. */
    observed_at: IsoDateTime,
  }),
  travel: z.strictObject({
    input_id: Id,
    distance_miles: z.number().min(0).max(500),
    travel_minutes: z.number().int().min(0).max(600),
    source: SourceLabel,
    observed_at: IsoDateTime,
  }),
  slots: z.strictObject({
    input_id: Id,
    source: SourceLabel,
    observed_at: IsoDateTime,
    items: z.array(AppointmentSlot),
  }),
  pricing: z.array(ProcedurePrice),
  self_pay: z.strictObject({
    input_id: Id,
    /** Office confirmed it accepts direct payment without a claim. null = unknown. */
    permitted_by_office: z.boolean().nullable(),
    source: SourceLabel,
    observed_at: IsoDateTime,
  }),
  payment_plans: z.array(ProviderPaymentPlan),
});
export type ProviderOption = z.infer<typeof ProviderOption>;
