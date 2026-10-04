/**
 * Plan Registry contracts (spec §3, §4 PlanDefinition). FROZEN (contract v1).
 *
 * Plan rules come ONLY from the server-side registry in data/plans/**. API
 * requests can never carry plan rules (decision D-007). Structured lookup selects
 * rules; retrieval may only display evidence for already-selected rule ids.
 */
import { z } from "zod";
import { RuleStatus } from "./issues";
import { BasisPoints, CdtCode, Cents, Id, IsoDate, IsoDateTime } from "./primitives";

export const PlanType = z.enum(["DPPO", "DHMO", "INDEMNITY", "DISCOUNT"]);
export type PlanType = z.infer<typeof PlanType>;

/** Only DPPO has an adjudicator in v1. Others MUST return UNSUPPORTED_PLAN_TYPE. */
export const SUPPORTED_PLAN_TYPES = ["DPPO"] as const satisfies readonly PlanType[];

export const NetworkTier = z.enum(["in_network", "out_of_network"]);
export type NetworkTier = z.infer<typeof NetworkTier>;

/** Plan-specific service class vocabulary. Which CDT codes map to which class is plan-specific. */
export const ServiceClass = z.enum(["preventive", "basic", "major", "orthodontic"]);
export type ServiceClass = z.infer<typeof ServiceClass>;

// ---------------------------------------------------------------------------
// Evidence and sources
// ---------------------------------------------------------------------------

/**
 * Pointer to the exact authoritative passage. `quote` MUST be a literal substring
 * of the cited page of the source document (validated by the benefits module).
 */
export const EvidenceRef = z.strictObject({
  source_id: Id,
  page: z.number().int().min(1),
  section: z.string().min(1).max(200),
  locator: z.string().min(1).max(200),
  quote: z.string().min(1).max(600),
});
export type EvidenceRef = z.infer<typeof EvidenceRef>;

/**
 * (1.4) PLAN-003: what kind of document a source is. `educational` (general or marketing
 * material) may explain a term but never backs a rule used in a calculation.
 */
export const SourceRole = z.enum([
  "certificate",
  "group_policy",
  "state_rider",
  "amendment",
  "schedule_of_benefits",
  "employer_summary",
  "educational",
]);
export type SourceRole = z.infer<typeof SourceRole>;

/** Roles that may back a VERIFIED rule (every role except `educational`). */
export const AUTHORITATIVE_SOURCE_ROLES: readonly SourceRole[] = SourceRole.options.filter((r) => r !== "educational");

/** An immutable source document. Synthetic sources live in data/sources/** (Planner-seeded, read-only). */
export const SourceDocument = z.strictObject({
  source_id: Id,
  title: z.string().min(1),
  /** (1.4) PLAN-003 document authority. */
  document_role: SourceRole,
  path: z.string().min(1),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  media_type: z.literal("text/markdown"),
  plan_version_id: Id,
  retrieved_at: IsoDateTime,
  synthetic: z.boolean(),
  /**
   * Page texts, split on lines `<!-- page N -->`; text = content after the marker
   * up to the next marker, trimmed. Used to validate evidence quotes and to display
   * passages for already-selected rules. Must reproduce the file exactly
   * (see splitSourcePages).
   */
  pages: z.array(z.strictObject({ page: z.number().int().min(1), text: z.string() })).min(1),
});
export type SourceDocument = z.infer<typeof SourceDocument>;

/** Canonical page splitter for data/sources/*.md. Every module must use this. */
export function splitSourcePages(markdown: string): { page: number; text: string }[] {
  const re = /^<!-- page (\d+) -->[ \t]*$/gm;
  const marks: { page: number; start: number; end: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(markdown)) !== null) {
    marks.push({ page: Number(m[1]), start: m.index, end: m.index + m[0].length });
  }
  return marks.map((mk, i) => ({
    page: mk.page,
    text: markdown.slice(mk.end, i + 1 < marks.length ? marks[i + 1]!.start : markdown.length).trim(),
  }));
}

// ---------------------------------------------------------------------------
// Plan identity (spec §3 "Exact plan identity")
// ---------------------------------------------------------------------------

/** carrier + employer/group + plan option + jurisdiction + network. Coverage period selects the version. */
export const PlanKey = z.strictObject({
  carrier_id: Id,
  group_id: Id,
  plan_option_id: Id,
  jurisdiction: z.string().regex(/^[A-Z]{2}$/),
  network_id: Id,
});
export type PlanKey = z.infer<typeof PlanKey>;

export const DateRange = z
  .strictObject({ start: IsoDate, end: IsoDate })
  .refine((r) => r.start <= r.end, { message: "start must be <= end" });
export type DateRange = z.infer<typeof DateRange>;

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

/** Matching conditions. All keys required; null = "any". */
export const AppliesWhen = z.strictObject({
  network: NetworkTier.nullable(),
  service_class: ServiceClass.nullable(),
  cdt_codes: z.array(CdtCode).nullable(),
});
export type AppliesWhen = z.infer<typeof AppliesWhen>;

const ruleBase = {
  rule_id: Id,
  status: RuleStatus,
  effective_from: IsoDate,
  effective_to: IsoDate,
  applies_when: AppliesWhen,
  evidence: z.array(EvidenceRef),
  /** Rule ids this rule conflicts with (status CONFLICT). */
  conflicts_with: z.array(Id),
  /** Normalizer note, e.g. why UNKNOWN. Never used in calculation. */
  note: z.string().max(500).nullable(),
};

function rule<T extends string, V extends z.ZodType>(type: T, value: V) {
  return z.strictObject({ ...ruleBase, rule_type: z.literal(type), value: value.nullable() });
}

export const BenefitPeriodValue = z.strictObject({
  period_start: IsoDate,
  period_end: IsoDate,
  /** Which date selects the period. v1 supports only service_date. */
  accumulator_basis: z.literal("service_date"),
});

export const DeductibleValue = z.strictObject({
  individual_cents: Cents,
  applies_to_classes: z.array(ServiceClass),
  shared_across_networks: z.boolean(),
});

export const AnnualMaximumValue = z.strictObject({
  individual_cents: Cents,
  /** Classes whose plan payments count against (and are capped by) the maximum. */
  counts_classes: z.array(ServiceClass),
  shared_across_networks: z.boolean(),
});

export const LifetimeMaximumValue = z.strictObject({
  individual_cents: Cents,
  service_class: ServiceClass,
});

export const PlanShareValue = z.strictObject({
  rate_bps: BasisPoints,
  /** in-network: contracted allowed amount; out-of-network: plan's OON allowance. Always after deductible. */
  basis: z.enum(["allowed_amount_after_deductible", "oon_allowance_after_deductible"]),
});

export const ServiceClassMapValue = z.strictObject({
  service_class: ServiceClass,
  cdt_codes: z.array(CdtCode).min(1),
});

export const OonAllowanceScheduleValue = z.strictObject({
  allowances: z.array(z.strictObject({ cdt_code: CdtCode, cents: Cents })).min(1),
  balance_billing_permitted: z.boolean(),
});

export const WaitingPeriodValue = z.strictObject({ months: z.number().int().min(0).max(60) });

export const FrequencyLimitValue = z.strictObject({
  cdt_codes: z.array(CdtCode).min(1),
  max_count: z.number().int().min(0),
  window: z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("benefit_period") }),
    z.strictObject({ kind: z.literal("rolling_months"), months: z.number().int().min(1).max(240) }),
  ]),
  scope: z.enum(["per_member", "per_tooth"]),
});

export const ExclusionValue = z.strictObject({ cdt_codes: z.array(CdtCode).min(1) });

export const AlternateBenefitValue = z.strictObject({ cdt_code: CdtCode, paid_as_cdt_code: CdtCode });

export const SublimitValue = z.strictObject({
  cents: Cents,
  cdt_codes: z.array(CdtCode).min(1),
  per: z.literal("benefit_period"),
});

/**
 * (1.5) Maximum carryover (CONTRACT §3.9). Each enum lists only the values a seeded source
 * documents; extend it (with a contract change) when a new source needs another.
 */
export const RolloverValue = z.strictObject({
  /** Only documented basis: incurred plan payments that count toward the annual maximum. */
  qualification_basis: z.enum(["INCURRED_PLAN_PAID_TOWARD_MAXIMUM"]),
  threshold_cents: Cents,
  /** LT: qualifying < threshold; LTE: qualifying <= threshold. */
  threshold_comparison: z.enum(["LT", "LTE"]),
  base_award_cents: Cents,
  network_bonus_cents: Cents,
  /** Documented conditions only. */
  network_bonus_condition: z.enum(["NONE", "ANY_IN_NETWORK_CLAIM"]),
  /** Maximum carryover balance. */
  bank_cap_cents: Cents,
  requires_at_least_one_eligible_claim: z.boolean(),
  /** Documented treatments only: add the award to the prior balance (then cap), or replace it. */
  existing_bank_treatment: z.enum(["ADD_AND_CAP", "REPLACE"]),
  /** Documented treatment only: a year that does not qualify ends the prior balance. */
  bank_when_not_qualified: z.enum(["FORFEIT"]),
  /** Exact next plan versions the carryover applies to (never an assumed renewal). */
  applies_to_next_plan_version_ids: z.array(Id).min(1),
});

export const ClaimSubmissionValue = z.strictObject({
  /** Member may ask the office not to submit a claim and pay directly. */
  member_may_decline_claim: z.boolean(),
  /** In-network offices are contractually required to submit every claim. */
  network_provider_must_submit: z.boolean(),
  /** Services paid without a claim reduce deductible/maximum? */
  self_pay_counts_toward_accumulators: z.boolean(),
  /** Services paid without a claim count toward frequency limits? */
  self_pay_counts_toward_frequency: z.boolean(),
  /** Network fee schedule applies to self-paid services? (false = price set between member and office) */
  network_fee_schedule_applies_to_self_pay: z.boolean(),
});

export const PretreatmentEstimateValue = z.strictObject({ recommended_above_cents: Cents });

export const LimitationsIndexValue = z.strictObject({
  /** Source lists every frequency limitation; codes without a listed limit have none. */
  frequency_limits_complete: z.boolean(),
  exclusions_complete: z.boolean(),
  alternate_benefits_complete: z.boolean(),
  sublimits_complete: z.boolean(),
});

export const CoordinationOfBenefitsValue = z.strictObject({
  method: z.enum(["standard", "non_duplication", "carve_out"]),
});

export const PlanRule = z.discriminatedUnion("rule_type", [
  rule("benefit_period", BenefitPeriodValue),
  rule("deductible", DeductibleValue),
  rule("annual_maximum", AnnualMaximumValue),
  rule("lifetime_maximum", LifetimeMaximumValue),
  rule("plan_share", PlanShareValue),
  rule("service_class_map", ServiceClassMapValue),
  rule("oon_allowance_schedule", OonAllowanceScheduleValue),
  rule("waiting_period", WaitingPeriodValue),
  rule("frequency_limit", FrequencyLimitValue),
  rule("exclusion", ExclusionValue),
  rule("alternate_benefit", AlternateBenefitValue),
  rule("sublimit", SublimitValue),
  rule("rollover", RolloverValue),
  rule("claim_submission", ClaimSubmissionValue),
  rule("pretreatment_estimate", PretreatmentEstimateValue),
  rule("limitations_index", LimitationsIndexValue),
  rule("coordination_of_benefits", CoordinationOfBenefitsValue),
]);
export type PlanRule = z.infer<typeof PlanRule>;
export type PlanRuleType = PlanRule["rule_type"];
export type RuleOf<T extends PlanRuleType> = Extract<PlanRule, { rule_type: T }>;

export const PLAN_RULE_TYPES = PlanRule.options.map((o) => o.shape.rule_type.value) as PlanRuleType[];

/**
 * Structural invariants every rule must satisfy (checked by contract tests and by
 * the benefits validator): VERIFIED ⇒ value present and ≥1 evidence;
 * UNKNOWN/NOT_APPLICABLE ⇒ value null; CONFLICT ⇒ conflicts_with non-empty.
 */
export function ruleStructuralProblems(r: PlanRule): string[] {
  const p: string[] = [];
  if (r.effective_from > r.effective_to) p.push("effective_from after effective_to");
  if (r.status === "VERIFIED") {
    if (r.value === null) p.push("VERIFIED rule must have a value");
    if (r.evidence.length === 0) p.push("VERIFIED rule must cite evidence");
  }
  if ((r.status === "UNKNOWN" || r.status === "NOT_APPLICABLE") && r.value !== null) {
    p.push(`${r.status} rule must have value null`);
  }
  if (r.status === "CONFLICT" && r.conflicts_with.length === 0) p.push("CONFLICT rule must list conflicts_with");
  if (r.status !== "UNKNOWN" && r.evidence.length === 0) p.push(`${r.status} rule must cite evidence`);
  return p;
}

// ---------------------------------------------------------------------------
// Plan definition and registry
// ---------------------------------------------------------------------------

export const PlanDefinition = z.strictObject({
  plan_id: Id,
  plan_version_id: Id,
  plan_type: PlanType,
  key: PlanKey,
  carrier_name: z.string().min(1),
  plan_name: z.string().min(1),
  coverage_period: DateRange,
  /** true for every plan in this hackathon build. */
  synthetic: z.boolean(),
  source_documents: z.array(z.strictObject({ source_id: Id, sha256: z.string().regex(/^[a-f0-9]{64}$/) })).min(1),
  /** (1.4) PLAN-003: the plan packet's source ids, highest authority first; a permutation of source_documents. */
  source_precedence: z.array(Id).min(1),
  review: z.strictObject({
    status: z.enum(["REVIEWED", "DRAFT"]),
    reviewed_by: z.string().min(1),
    reviewed_at: IsoDateTime,
  }),
  rules: z.array(PlanRule),
});
export type PlanDefinition = z.infer<typeof PlanDefinition>;

export const PlanRegistry = z.strictObject({
  registry_version: z.string().min(1),
  plans: z.array(PlanDefinition),
  sources: z.array(SourceDocument),
});
export type PlanRegistry = z.infer<typeof PlanRegistry>;

/** Same identity check used by every module: never borrow from a similar plan. */
export function samePlanKey(a: PlanKey, b: PlanKey): boolean {
  return (
    a.carrier_id === b.carrier_id &&
    a.group_id === b.group_id &&
    a.plan_option_id === b.plan_option_id &&
    a.jurisdiction === b.jurisdiction &&
    a.network_id === b.network_id
  );
}
