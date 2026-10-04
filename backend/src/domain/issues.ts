/**
 * Status and issue vocabulary. FROZEN (contract v1).
 * Modules may not invent new codes; request one through a contract change.
 */
import { z } from "zod";
import { Id } from "./primitives";

/** Status of a single plan rule in the registry (spec §3). */
export const RuleStatus = z.enum(["VERIFIED", "UNVERIFIED", "UNKNOWN", "CONFLICT", "NOT_APPLICABLE"]);
export type RuleStatus = z.infer<typeof RuleStatus>;

/**
 * Overall status of an engine/optimizer/API result.
 * - OK: complete result from verified rules and confirmed inputs.
 * - NEEDS_CONFIRMATION: a required rule/input is missing, unverified, unknown or conflicting.
 * - UNSUPPORTED_PLAN_TYPE: plan type has no adjudicator (only DPPO in v1).
 * - URGENT_CARE_ROUTE: safety gate fired; route to a dentist now (pre-visit only).
 * - BUDGET_SHORTFALL: no schedule meets the hard monthly limit; safest schedule + exact gap returned.
 * - NO_FEASIBLE_SCHEDULE: a required procedure cannot be scheduled inside its dentist window.
 * - INVALID_INPUT: request failed schema/domain validation.
 */
export const ResultStatus = z.enum([
  "OK",
  "NEEDS_CONFIRMATION",
  "UNSUPPORTED_PLAN_TYPE",
  "URGENT_CARE_ROUTE",
  "BUDGET_SHORTFALL",
  "NO_FEASIBLE_SCHEDULE",
  "INVALID_INPUT",
]);
export type ResultStatus = z.infer<typeof ResultStatus>;

/** Status of one adjudicated claim line. */
export const LineStatus = z.enum([
  "OK",
  "NOT_COVERED",
  "NEEDS_CONFIRMATION",
  "UNSUPPORTED_PLAN_TYPE",
]);
export type LineStatus = z.infer<typeof LineStatus>;

export const IssueCode = z.enum([
  // Plan registry / rules
  "PLAN_NOT_FOUND",
  "PLAN_VERSION_NOT_EFFECTIVE",
  "PLAN_TYPE_UNSUPPORTED",
  "RULE_MISSING",
  "RULE_UNVERIFIED",
  "RULE_UNKNOWN",
  "RULE_CONFLICT",
  "RULE_EXPIRED",
  "RULE_TYPE_UNSUPPORTED",
  "RULE_EVIDENCE_MISSING",
  "SOURCE_CHECKSUM_MISMATCH",
  "SOURCE_NOT_AUTHORITATIVE",
  "SOURCE_PRECEDENCE_INVALID",
  // (1.5) Year-close carryover (CONTRACT §3.9)
  "ROLLOVER_UNCERTAIN",
  "ROLLOVER_NEXT_PLAN_UNKNOWN",
  "ROLLOVER_NEXT_PLAN_INELIGIBLE",
  // Coverage outcomes (informational, not errors)
  "EXCLUDED_SERVICE",
  "WAITING_PERIOD",
  "FREQUENCY_LIMIT",
  "ANNUAL_MAXIMUM_REACHED",
  "SUBLIMIT_REACHED",
  // Inputs
  "INPUT_MISSING",
  "INPUT_STALE",
  "INPUT_INCONSISTENT",
  "INPUT_RANGE",
  "PENDING_CLAIMS_PRESENT",
  "SECONDARY_COVERAGE_NOT_MODELED",
  "OON_CHARGE_UNKNOWN",
  "ALLOWED_AMOUNT_UNKNOWN",
  "SELF_PAY_NOT_VERIFIED",
  "CLAIM_ROUTE_INVALID",
  "NETWORK_STATUS_UNKNOWN",
  "PRICE_QUOTE_EXPIRED",
  // Clinical / confirmation
  "PROCEDURE_UNCONFIRMED",
  "DEPENDENCY_INVALID",
  "ALTERNATIVE_NOT_APPROVED",
  "DEADLINE_UNMET",
  "NO_SLOT_IN_WINDOW",
  "URGENT_SYMPTOMS",
  // Access / logistics
  "AVAILABILITY_NO_INTERSECTION",
  "TRAVEL_LIMIT_EXCEEDED",
  "SPECIALTY_MISMATCH",
  // Funding
  "BUDGET_SHORTFALL",
  "FUNDING_SOURCE_INELIGIBLE",
  "FSA_FUNDS_UNUSED",
  // AI / explanation guardrails
  "EXTRACTION_UNVERIFIED",
  "PROMPT_INJECTION_SUSPECTED",
  "EXPLANATION_REJECTED",
  "AI_UNAVAILABLE",
  // Request
  "SCHEMA_INVALID",
]);
export type IssueCode = z.infer<typeof IssueCode>;

export const IssueSeverity = z.enum(["blocking", "warning", "info"]);
export type IssueSeverity = z.infer<typeof IssueSeverity>;

/**
 * A machine-readable problem or notice. `field` is a JSON-path-like string
 * (e.g. "member.accumulators[0].annual_max_remaining") for UI focus.
 * `message` is plain English for the member; it must not contain dollar amounts
 * that are not also present as numbers in the result.
 */
export const Issue = z.strictObject({
  code: IssueCode,
  severity: IssueSeverity,
  message: z.string().min(1).max(500),
  field: z.string().max(256).nullable(),
  rule_id: Id.nullable(),
  input_id: Id.nullable(),
  procedure_id: Id.nullable(),
  provider_id: Id.nullable(),
});
export type Issue = z.infer<typeof Issue>;

/** Convenience constructor with null defaults. */
export function issue(
  code: IssueCode,
  severity: IssueSeverity,
  message: string,
  refs: Partial<Pick<Issue, "field" | "rule_id" | "input_id" | "procedure_id" | "provider_id">> = {},
): Issue {
  return {
    code,
    severity,
    message,
    field: refs.field ?? null,
    rule_id: refs.rule_id ?? null,
    input_id: refs.input_id ?? null,
    procedure_id: refs.procedure_id ?? null,
    provider_id: refs.provider_id ?? null,
  };
}

/** Thrown by stubs until the owning agent implements the module. */
export class NotImplementedError extends Error {
  constructor(what: string) {
    super(`NOT_IMPLEMENTED: ${what}`);
    this.name = "NotImplementedError";
  }
}
