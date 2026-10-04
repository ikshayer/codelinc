/**
 * Primitive value contracts shared by every module. FROZEN (contract v1).
 *
 * Money is integer US cents. Rates are integer basis points (10000 = 100%).
 * Calendar dates are `YYYY-MM-DD` with no time zone. Instants are ISO-8601
 * with an explicit offset. Appointment times are local wall-clock `HH:MM`.
 * Never use binary floating point for money or rates.
 */
import { z } from "zod";

// ---------------------------------------------------------------------------
// Money and rates
// ---------------------------------------------------------------------------

/** Largest money magnitude accepted anywhere: $10,000,000.00. */
export const MAX_CENTS = 1_000_000_000;

/** Signed integer cents (deltas, savings). */
export const SignedCents = z
  .number()
  .int()
  .min(-MAX_CENTS)
  .max(MAX_CENTS);
export type SignedCents = z.infer<typeof SignedCents>;

/** Non-negative integer cents. Every stored balance, charge and payment. */
export const Cents = z.number().int().min(0).max(MAX_CENTS);
export type Cents = z.infer<typeof Cents>;

/** Integer basis points in [0, 10000]. 8000 = 80%. */
export const BasisPoints = z.number().int().min(0).max(10_000);
export type BasisPoints = z.infer<typeof BasisPoints>;

/**
 * A money input that may be exact, a range, or unknown.
 * Unknown is NEVER zero. Ranges are inclusive, low <= high.
 */
export const MoneyInput = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("exact"), cents: Cents }),
  z
    .strictObject({ kind: z.literal("range"), low_cents: Cents, high_cents: Cents })
    .refine((v) => v.low_cents <= v.high_cents, { message: "low_cents must be <= high_cents" }),
  z.strictObject({ kind: z.literal("unknown") }),
]);
export type MoneyInput = z.infer<typeof MoneyInput>;

/**
 * Evaluation scenario for inputs that are ranges.
 * - `best_case`: every range resolves to the value that minimizes member cost.
 * - `worst_case`: every range resolves to the value that maximizes member cost.
 * Exact inputs are identical in both. Ranking and hard budget checks use
 * `worst_case`; displays show best..worst. See docs/contracts/CONTRACT-v1.md §5.
 */
export const Scenario = z.enum(["best_case", "worst_case"]);
export type Scenario = z.infer<typeof Scenario>;

/**
 * A computed money output that may be a range: numeric [min, max] across the two
 * scenarios. For member cost, low = best_case and high = worst_case; for plan pay
 * it is the reverse (worst case pays less). Exact results have low == high.
 */
export const AmountRange = z
  .strictObject({ low_cents: Cents, high_cents: Cents })
  .refine((v) => v.low_cents <= v.high_cents, { message: "low_cents must be <= high_cents" });
export type AmountRange = z.infer<typeof AmountRange>;

// ---------------------------------------------------------------------------
// Dates and times
// ---------------------------------------------------------------------------

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** True for a real Gregorian calendar date such as 2026-02-28 (rejects 2026-02-30). */
export function isValidIsoDate(value: string): boolean {
  const m = ISO_DATE_RE.exec(value);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1) return false;
  const dim = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  return d <= dim;
}

/** Calendar date `YYYY-MM-DD`, no time zone. Service dates, windows, deadlines. */
export const IsoDate = z.string().refine(isValidIsoDate, { message: "expected a valid YYYY-MM-DD date" });
export type IsoDate = z.infer<typeof IsoDate>;

/** ISO-8601 instant with explicit offset, e.g. 2026-10-15T21:00:00Z. Observation timestamps. */
export const IsoDateTime = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/, {
    message: "expected ISO-8601 date-time with offset",
  })
  .refine((v) => isValidIsoDate(v.slice(0, 10)) && !Number.isNaN(Date.parse(v)), {
    message: "invalid date-time",
  });
export type IsoDateTime = z.infer<typeof IsoDateTime>;

/** Local wall-clock time `HH:MM` (24h) in the member/practice time zone. */
export const LocalTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, { message: "expected HH:MM" });
export type LocalTime = z.infer<typeof LocalTime>;

/** Calendar month bucket `YYYY-MM`. */
export const YearMonth = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, { message: "expected YYYY-MM" });
export type YearMonth = z.infer<typeof YearMonth>;

/** 0 = Sunday ... 6 = Saturday (JavaScript getUTCDay convention). */
export const Weekday = z.number().int().min(0).max(6);
export type Weekday = z.infer<typeof Weekday>;

// ---------------------------------------------------------------------------
// Identifiers
// ---------------------------------------------------------------------------

/** Stable machine identifier: lowercase letters, digits, `.`, `_`, `-`, `:`. */
export const Id = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-z0-9][a-z0-9._:-]*$/, { message: "ids are lowercase [a-z0-9._:-]" });
export type Id = z.infer<typeof Id>;

/** CDT procedure code, e.g. D2740. Plan-specific classification is NOT implied. */
export const CdtCode = z.string().regex(/^D\d{4}$/, { message: "expected CDT code like D2740" });
export type CdtCode = z.infer<typeof CdtCode>;

/** Universal tooth number 1-32 or primary A-T, or null for non-tooth procedures. */
export const Tooth = z.string().regex(/^([1-9]|[12]\d|3[0-2]|[A-T])$/, { message: "expected tooth 1-32 or A-T" });
export type Tooth = z.infer<typeof Tooth>;

// ---------------------------------------------------------------------------
// Provenance (spec §10: every input is labeled)
// ---------------------------------------------------------------------------

/**
 * Where an input value came from. Exactly the labels in spec §10.
 * - PLAN_VERIFIED: a VERIFIED rule in the plan registry (rules only).
 * - CLAIM_EOB: claims/EOB/accumulator data from the carrier.
 * - PROVIDER: the dental office (prices, slots, network self-report, payment terms).
 * - DENTIST: the treating dentist (clinical facts), as confirmed.
 * - MEMBER_CONFIRMED: the member entered or confirmed it.
 * - ESTIMATE: a modeled estimate (e.g. a price range), never authoritative.
 * - NEEDS_CONFIRMATION: present but not yet usable for calculation.
 */
export const SourceLabel = z.enum([
  "PLAN_VERIFIED",
  "CLAIM_EOB",
  "PROVIDER",
  "DENTIST",
  "MEMBER_CONFIRMED",
  "ESTIMATE",
  "NEEDS_CONFIRMATION",
]);
export type SourceLabel = z.infer<typeof SourceLabel>;

/**
 * A labeled, timestamped input value. `input_id` is a stable, globally unique
 * fact id (see fact-ids.ts) so traces and explanations can cite it.
 */
export function sourced<T extends z.ZodType>(value: T) {
  return z.strictObject({
    input_id: Id,
    value,
    source: SourceLabel,
    observed_at: IsoDateTime,
  });
}

export const SourcedMoney = sourced(MoneyInput);
export type SourcedMoney = z.infer<typeof SourcedMoney>;

export const SourcedBoolean = sourced(z.boolean().nullable());
export type SourcedBoolean = z.infer<typeof SourcedBoolean>;

export const SourcedDate = sourced(IsoDate.nullable());
export type SourcedDate = z.infer<typeof SourcedDate>;

/** JSON-safe value used in traces. */
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
export const JsonValue: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(JsonValue), z.record(z.string(), JsonValue)]),
);
