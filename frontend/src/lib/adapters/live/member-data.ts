import type { IntakeExtraction } from "../types";
import type { FieldValue, IntakeEvidence, PatientProfile } from "@/lib/domain/types";
import { adapterError, requestJson } from "../shared";
import type { AdapterResult } from "../types";

export interface MemberData {
  member: {
    member_id: string; display_name: string; date_of_birth?: string; observed_at: string;
    benefit_state: { benefit_year: number; plan_paid_ytd_cents: number; annual_maximum_remaining_cents: number; annual_maximum_total_cents?: number; deductible_remaining_cents: { in_network: number }; pending_claims: unknown[]; rollover_bank_cents?: number; source?: { type: string; status: string; as_of: string } };
  };
  plan: { display_name: string; effective_from: string; effective_to: string; deductible: { in_network: { individual_cents: number } }; annual_maximum: { individual_cents: number; preventive_counts_toward_maximum: boolean }; coverage: Record<string, { in_network_plan_share_bps: number; deductible_applies: boolean }> };
  procedure_card: { procedure_card_id: string; procedures: { procedure_id: string; cdt: string; label: string; dentist_estimated_fee_cents: number; target_by_date: string; earliest_safe_date: string; latest_safe_date: string; confirmation_status: string; dependencies: { procedure_id: string; minimum_gap_days: number; maximum_gap_days?: number | null }[] }[] } | null;
  procedure_catalog: { cdt: string; service_class: string }[];
  claims: { claim_id: string; cdt: string; status: string; service_date: string; plan_payment_cents: number }[];
}

export function memberProfile(data: MemberData): PatientProfile {
  return { id: data.member.member_id, displayName: data.member.display_name, fullName: data.member.display_name, dateOfBirth: data.member.date_of_birth, memberId: data.member.member_id };
}

/** Exact pair only. A successful but different member response is rejected. */
export async function lookupMember(identity: { memberId: string; dateOfBirth: string }, signal: AbortSignal): Promise<AdapterResult<MemberData>> {
  const result = await requestJson<MemberData>("/api/demo/member-lookup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(identity), signal, service: "synthetic member lookup" });
  if (!result.ok) return result;
  if (result.value.member?.member_id !== identity.memberId || result.value.member?.date_of_birth !== identity.dateOfBirth) return { ok: false, error: adapterError("CONFLICT", "No matching synthetic member was returned for this member ID and date of birth. Check both fields and try again.", false) };
  return result;
}

/** Benefits are imported before the member chooses their existing treatment intake. */
export function memberBenefitsExtraction(data: MemberData): IntakeExtraction {
  return memberExtraction({ ...data, procedure_card: null });
}

export function supportsConservativeMemberEstimate(data: MemberData): boolean {
  return data.member.benefit_state.source?.status === "VERIFIED_DEMO" && data.member.benefit_state.pending_claims.every((pending) => {
    if (!pending || typeof pending !== "object") return false;
    const projection = (pending as Record<string, unknown>).projected_plan_payment_cents;
    return typeof projection === "number" && Number.isSafeInteger(projection) && projection >= 0;
  });
}

/** Database facts enter the same review flow as manual intake; no automatic confirmation. */
export function memberExtraction(data: MemberData): IntakeExtraction {
  const evidenceId = `database:${data.member.member_id}:${data.member.observed_at}`;
  const values: Record<string, FieldValue> = {};
  const blockingIssues: NonNullable<IntakeEvidence["blockingIssues"]> = [];
  const conservativeSupported = supportsConservativeMemberEstimate(data);
  if (data.member.benefit_state.pending_claims.length > 0 && !conservativeSupported) blockingIssues.push({ fieldPath: "plan.y1.alreadyUsed", code: "PENDING_CLAIMS", message: "The member source or pending plan-payment projection needs confirmation before this comparison can reserve pending benefits." });
  if ((data.member.benefit_state.rollover_bank_cents ?? 0) > 0 && !conservativeSupported) blockingIssues.push({ fieldPath: "plan.y1.annualMaximum", code: "ROLLOVER", message: "The source for this member's rollover balance needs confirmation before a conservative estimate can exclude its spending effects." });
  if (data.member.benefit_state.source && data.member.benefit_state.source.status !== "VERIFIED_DEMO") blockingIssues.push({ fieldPath: "plan.y1.alreadyUsed", code: "MEMBER_SOURCE_UNCONFIRMED", message: "This stored member benefit source is stale or unverified. Confirm a current source before calculating." });
  const dollars = (cents: number) => {
    if (!Number.isSafeInteger(cents) || cents < 0) throw new Error("Invalid benefit amount returned by the backend.");
    return (cents / 100).toFixed(2);
  };
  const year = data.member.benefit_state.benefit_year;
  const deductible = data.plan.deductible.in_network.individual_cents;
  values["plan.y1.startsOn"] = `${year}-01-01`;
  values["plan.y1.endsOn"] = `${year}-12-31`;
  values["plan.y1.annualMaximum"] = dollars(data.plan.annual_maximum.individual_cents);
  values["plan.y1.alreadyUsed"] = dollars(data.member.benefit_state.plan_paid_ytd_cents);
  values["plan.y1.deductible"] = dollars(deductible);
  values["plan.y1.deductibleSatisfied"] = dollars(deductible - data.member.benefit_state.deductible_remaining_cents.in_network);
  if (data.plan.effective_to >= `${year + 1}-12-31`) {
    values["plan.y2.startsOn"] = `${year + 1}-01-01`;
    values["plan.y2.endsOn"] = `${year + 1}-12-31`;
    values["plan.y2.annualMaximum"] = dollars(data.plan.annual_maximum.individual_cents);
    values["plan.y2.deductible"] = dollars(deductible);
    // Future utilization and confirmation of unchanged rules stay unanswered.
  }
  for (const category of ["preventive", "basic", "major"]) {
    const rule = data.plan.coverage[category];
    if (!rule) continue;
    values[`plan.rules.${category}.insurerPercent`] = String(rule.in_network_plan_share_bps / 100);
    values[`plan.rules.${category}.deductibleApplies`] = rule.deductible_applies;
    values[`plan.rules.${category}.maximumApplies`] = category === "preventive" ? data.plan.annual_maximum.preventive_counts_toward_maximum : true;
  }
  const procedures = data.procedure_card?.procedures ?? [];
  const ids = new Map(procedures.slice(0, 4).map((p, i) => [p.procedure_id, `p${i + 1}`]));
  procedures.slice(0, 4).forEach((p, i) => {
    const id = `p${i + 1}`;
    values[`care.${id}.label`] = `${p.label} (${p.cdt})`;
    const category = data.procedure_catalog.find((item) => item.cdt === p.cdt)?.service_class;
    if (category && ["preventive", "basic", "major"].includes(category)) values[`care.${id}.category`] = category;
    // The stored dentist estimate is not a contracted price or eligibility verification.
    values[`care.${id}.anchorDate`] = p.target_by_date;
    values[`timing.${id}.deadline`] = p.latest_safe_date;
    for (const [y, yid] of [[year, "y1"], [year + 1, "y2"]] as const) {
      const earliest = p.earliest_safe_date > `${y}-01-01` ? p.earliest_safe_date : `${y}-01-01`;
      const latest = p.latest_safe_date < `${y}-12-31` ? p.latest_safe_date : `${y}-12-31`;
      if (earliest <= latest) { values[`timing.${id}.${yid}.earliest`] = earliest; values[`timing.${id}.${yid}.latest`] = latest; }
    }
    const dependencies = p.dependencies ?? [];
    if (dependencies.length > 0) {
      const mapped = dependencies.map((d) => ids.get(d.procedure_id));
      const gaps = new Set(dependencies.map((d) => d.minimum_gap_days));
      if (mapped.every(Boolean) && gaps.size === 1) {
        values[`timing.${id}.after`] = mapped.join(",");
        values[`timing.${id}.minGapDays`] = String(dependencies[0].minimum_gap_days);
      } else {
        blockingIssues.push({ fieldPath: `timing.${id}.after`, code: "UNSUPPORTED_DEPENDENCY", message: `The required procedures or different spacing rules for ${p.label} cannot be represented in this comparison. Its dentist constraints must be supported before calculating.` });
      }
      if (dependencies.some((d) => d.maximum_gap_days != null)) blockingIssues.push({ fieldPath: `timing.${id}.minGapDays`, code: "UNSUPPORTED_MAXIMUM_GAP", message: `Your dentist specified a maximum interval before ${p.label}. This comparison cannot enforce that interval, so it cannot calculate this treatment plan yet.` });
    }
  });
  return {
    proposals: Object.entries(values).map(([fieldPath, value]) => ({ fieldPath, value, evidenceId })),
    evidence: [{ id: evidenceId, kind: "manual", sourceId: data.member.member_id, sourceLabel: `Database record: ${data.member.member_id}`, receivedAt: data.member.observed_at, blockingIssues }],
    overflow: procedures.slice(4).map((p) => ({ label: p.label, evidenceId })), missingFieldPaths: [],
    reviewNotes: [{ message: conservativeSupported && (data.member.benefit_state.pending_claims.length > 0 || (data.member.benefit_state.rollover_bank_cents ?? 0) > 0) ? "Conservative base-benefit estimate: the server reserves supplied pending plan-payment projections, leaves pending deductible effects unchanged, and excludes the unconfirmed rollover bank. This is not a complete claim-settlement estimate. Confirm treatment fees, eligibility and dentist timing separately." : "Review imported benefit and treatment facts. Contracted fees, eligibility and permission to change dates need confirmation. The server rechecks stored member benefits before calculating.", evidenceId }],
  };
}
