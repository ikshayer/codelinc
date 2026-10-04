/**
 * ProcedureRecommendation (spec §4, §6). FROZEN (contract v1).
 *
 * Clinical facts come from the dentist. AI-extracted values start UNVERIFIED and
 * become optimizer inputs only after the member or dentist confirms them
 * (confirmation.status = CONFIRMED). The optimizer rejects anything else (AT-14).
 */
import { z } from "zod";
import { Specialty } from "./provider";
import { CdtCode, Id, IsoDate, IsoDateTime, SourcedMoney, Tooth } from "./primitives";

/** Dentist-supplied urgency. Maps 1:1 to UX labels (spec §10). Never inferred by AI or code. */
export const Urgency = z.enum(["act_now", "schedule_soon", "can_plan_later"]);
export type Urgency = z.infer<typeof Urgency>;

export const URGENCY_LABEL: Record<Urgency, string> = {
  act_now: "Act now",
  schedule_soon: "Schedule soon",
  can_plan_later: "Can plan later",
};

/** Lexicographic rank used by the optimizer: lower = more urgent. */
export const URGENCY_RANK: Record<Urgency, number> = { act_now: 0, schedule_soon: 1, can_plan_later: 2 };

export const Dependency = z
  .strictObject({
    /** This procedure must happen after `depends_on`. */
    depends_on: Id,
    /** Minimum days between the two service dates (healing interval). */
    min_gap_days: z.number().int().min(0).max(730),
    /** Maximum days allowed between them; null = no maximum stated by the dentist. */
    max_gap_days: z.number().int().min(0).max(730).nullable(),
  })
  .refine((d) => d.max_gap_days === null || d.max_gap_days >= d.min_gap_days, {
    message: "max_gap_days must be >= min_gap_days",
  });
export type Dependency = z.infer<typeof Dependency>;

export const IntakeSourceKind = z.enum(["card_photo", "written_estimate", "manual", "transcript"]);
export type IntakeSourceKind = z.infer<typeof IntakeSourceKind>;

export const ConfirmationStatus = z.enum(["UNVERIFIED", "CONFIRMED", "REJECTED"]);
export type ConfirmationStatus = z.infer<typeof ConfirmationStatus>;

/** Fields the confirmation screen must show for every procedure (spec §6). */
export const CONFIRMABLE_FIELDS = [
  "cdt_code",
  "tooth",
  "dentist_fee",
  "urgency",
  "earliest_safe_date",
  "target_date",
  "latest_safe_date",
  "dependencies",
  "alternative_group_id",
] as const;
export type ConfirmableField = (typeof CONFIRMABLE_FIELDS)[number];

export const ProcedureRecommendation = z.strictObject({
  procedure_id: Id,
  /** Plain description as the dentist said it, e.g. "Crown, tooth 30". */
  description: z.string().min(1).max(200),
  /** CDT code. null when not stated; inferred codes must be listed in inferred_fields. */
  cdt_code: CdtCode.nullable(),
  tooth: Tooth.nullable(),
  /** Fee quoted by the treating office (billed charge). */
  dentist_fee: SourcedMoney,
  urgency: Urgency.nullable(),
  earliest_safe_date: IsoDate.nullable(),
  target_date: IsoDate.nullable(),
  latest_safe_date: IsoDate.nullable(),
  dependencies: z.array(Dependency),
  /** Specialties allowed to perform it (dentist-stated or office referral). */
  allowed_specialties: z.array(Specialty).min(1),
  /**
   * Procedures sharing an alternative_group_id are dentist-approved alternatives:
   * the optimizer schedules exactly one of them. null = required on its own.
   */
  alternative_group_id: Id.nullable(),
  source: z.strictObject({
    kind: IntakeSourceKind,
    document_id: Id,
    /** Verbatim dentist statements supporting the clinical fields (for "Your dentist said…"). */
    dentist_statements: z.array(z.string().min(1).max(500)),
  }),
  /** Fields the extractor inferred rather than read verbatim (UI must highlight them). */
  inferred_fields: z.array(z.enum(CONFIRMABLE_FIELDS)),
  confirmation: z.strictObject({
    status: ConfirmationStatus,
    confirmed_by: z.enum(["member", "dentist"]).nullable(),
    confirmed_at: IsoDateTime.nullable(),
  }),
});
export type ProcedureRecommendation = z.infer<typeof ProcedureRecommendation>;

/**
 * Domain check applied before optimization. A CONFIRMED procedure must have every
 * clinical field present and ordered: earliest <= target <= latest.
 */
export function confirmedProcedureProblems(p: ProcedureRecommendation): string[] {
  const out: string[] = [];
  if (p.confirmation.status !== "CONFIRMED") out.push("procedure is not CONFIRMED");
  if (p.confirmation.status === "CONFIRMED" && (!p.confirmation.confirmed_by || !p.confirmation.confirmed_at)) {
    out.push("CONFIRMED requires confirmed_by and confirmed_at");
  }
  if (p.cdt_code === null) out.push("cdt_code missing");
  if (p.urgency === null) out.push("urgency missing");
  if (p.earliest_safe_date === null) out.push("earliest_safe_date missing");
  if (p.target_date === null) out.push("target_date missing");
  if (p.latest_safe_date === null) out.push("latest_safe_date missing");
  if (p.earliest_safe_date && p.target_date && p.earliest_safe_date > p.target_date) out.push("earliest after target");
  if (p.target_date && p.latest_safe_date && p.target_date > p.latest_safe_date) out.push("target after latest");
  if (p.dentist_fee.value.kind === "unknown") out.push("dentist_fee unknown");
  return out;
}
