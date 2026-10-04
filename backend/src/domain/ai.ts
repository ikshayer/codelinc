/**
 * AI adapter contracts (spec §9). FROZEN (contract v1).
 *
 * AI has exactly four jobs: extract candidate plan rules, extract candidate
 * procedures/dentist statements, retrieve evidence for already-selected rule ids,
 * and explain a finalized deterministic result. It never calculates, never sets
 * urgency/timing, and never mutates plan rules or optimizer inputs.
 */
import { z } from "zod";
import { Issue, RuleStatus } from "./issues";
import { CarePlanResult, VisitNavigatorResult } from "./optimizer";
import { PlanRule } from "./plan";
import { ProcedureRecommendation, IntakeSourceKind } from "./procedure";
import { Id, IsoDateTime } from "./primitives";

export const AiMode = z.enum(["synthetic", "live"]);
export type AiMode = z.infer<typeof AiMode>;

// ---------------------------------------------------------------------------
// Procedure extraction (card photo, written estimate, manual text, consented transcript)
// ---------------------------------------------------------------------------

export const ExtractionRequest = z
  .strictObject({
    as_of: IsoDateTime,
    document_id: Id,
    kind: IntakeSourceKind,
    /** OCR text, estimate text, manual notes or transcript text. */
    text: z.string().max(20_000).nullable(),
    /** Card/estimate photo for live mode. Never persisted. */
    image: z
      .strictObject({ media_type: z.enum(["image/png", "image/jpeg"]), base64: z.string().max(7_000_000) })
      .nullable(),
    consent: z.strictObject({
      /** Required true for kind = transcript. */
      recording_consent: z.boolean(),
      /** v1: raw audio is never retained. */
      retain_audio: z.literal(false),
    }),
  })
  .refine((r) => r.text !== null || r.image !== null, { message: "text or image required" })
  .refine((r) => r.kind !== "transcript" || r.consent.recording_consent, {
    message: "transcripts require recording_consent",
  });
export type ExtractionRequest = z.infer<typeof ExtractionRequest>;

export const ExtractionResult = z.strictObject({
  contract_version: z.string(),
  mode: AiMode,
  document_id: Id,
  /** Every procedure has confirmation.status = UNVERIFIED. */
  procedures: z.array(ProcedureRecommendation),
  /** Instruction-like text found in the document and ignored (prompt-injection defense). */
  ignored_instructions: z.array(z.strictObject({ text: z.string().max(500), reason: z.string().max(200) })),
  warnings: z.array(Issue),
  /** Always false: raw text/audio/images are not stored or logged. */
  raw_retained: z.literal(false),
});
export type ExtractionResult = z.infer<typeof ExtractionResult>;

/** Candidate plan rules from a plan document; all UNVERIFIED until human review. */
export const PlanRuleExtractionResult = z.strictObject({
  contract_version: z.string(),
  mode: AiMode,
  source_id: Id,
  candidate_rules: z.array(PlanRule),
  warnings: z.array(Issue),
});
export type PlanRuleExtractionResult = z.infer<typeof PlanRuleExtractionResult>;

// ---------------------------------------------------------------------------
// Explanation (spec §9 response contract)
// ---------------------------------------------------------------------------

export const ExplanationInput = z.strictObject({
  contract_version: z.string(),
  result_kind: z.enum(["care_plan", "visit_navigator"]),
  care_plan: CarePlanResult.nullable(),
  visit_navigator: VisitNavigatorResult.nullable(),
  /** Which alternative/option to explain (null = recommended/first). */
  focus_id: Id.nullable(),
  /** Status of every rule in the member's plan versions (lets the validator reject unverified or wrong-version citations). */
  rule_catalog: z.array(z.strictObject({ rule_id: Id, plan_version_id: Id, status: RuleStatus })),
  /** Short evidence passages for the applied rule ids only. */
  evidence_passages: z.array(z.strictObject({ rule_id: Id, plan_version_id: Id, quote: z.string().max(600) })),
  /** Confirmed clinical facts, each with its proc: fact id. */
  confirmed_facts: z.array(z.strictObject({ fact_id: z.string(), text: z.string().max(300) })),
  /** Explicitly missing fields; the explanation must list every one in missing_data. */
  missing_fields: z.array(z.string().max(500)),
});
export type ExplanationInput = z.infer<typeof ExplanationInput>;

/** Exactly the response contract in spec §9. */
export const Explanation = z.strictObject({
  summary: z.string().min(1).max(600),
  claims: z.array(
    z.strictObject({
      text: z.string().min(1).max(400),
      fact_ids: z.array(z.string().min(1)).min(1),
    }),
  ),
  missing_data: z.array(z.string().max(500)),
});
export type Explanation = z.infer<typeof Explanation>;

export const ExplanationViolationCode = z.enum([
  "SCHEMA_INVALID",
  "DOLLAR_AMOUNT_NOT_IN_RESULT",
  "CLAIM_WITHOUT_FACT_ID",
  "UNKNOWN_FACT_ID",
  "WRONG_PLAN_VERSION",
  "UNVERIFIED_RULE_CITED",
  "MISSING_DATA_OMITTED",
  "DATE_NOT_IN_RESULT",
  "URGENCY_CHANGED",
  "FORBIDDEN_PHRASE",
]);
export type ExplanationViolationCode = z.infer<typeof ExplanationViolationCode>;

export const ExplanationValidation = z.strictObject({
  ok: z.boolean(),
  violations: z.array(
    z.strictObject({
      code: ExplanationViolationCode,
      detail: z.string().max(300),
      /** -1 = summary or missing_data; otherwise index into claims. */
      claim_index: z.number().int().min(-1),
    }),
  ),
});
export type ExplanationValidation = z.infer<typeof ExplanationValidation>;

export const ExplainOutcome = z.strictObject({
  contract_version: z.string(),
  mode: z.enum(["template", "live"]),
  explanation: Explanation,
  validation: ExplanationValidation,
  /** true when a live explanation was rejected and the deterministic template was returned instead. */
  fell_back_to_template: z.boolean(),
});
export type ExplainOutcome = z.infer<typeof ExplainOutcome>;
