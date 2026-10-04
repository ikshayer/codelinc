import { z } from "zod";
import { Cents, IsoDate } from "../domain/primitives";
import { sumCents } from "../domain";
import type { ConfirmedScenario, MemberBenefitAdjustments, MemberBenefitContext } from "./types";
import { AnalysisInputError } from "./compare";
import type { MemberIdentity } from "./member-identity";

const coverageRule = z.object({ in_network_plan_share_bps: z.number().int().min(0).max(10000), deductible_applies: z.boolean() });
const memberData = z.object({
  member: z.object({ member_id: z.string(), date_of_birth: IsoDate, plan_version_id: z.string(), member_snapshot_id: z.string().optional(), observed_at: z.string().min(1), coverage_effective_from: IsoDate.optional(),
    benefit_state: z.object({ benefit_year: z.number().int().min(1900).max(9998), annual_maximum_total_cents: Cents, plan_paid_ytd_cents: Cents, annual_maximum_remaining_cents: Cents,
      deductible_remaining_cents: z.object({ in_network: Cents }), rollover_bank_cents: Cents,
      pending_claims: z.array(z.object({ projected_plan_payment_cents: Cents.optional() })), source: z.object({ status: z.string() }) }) }),
  plan: z.object({ plan_version_id: z.string(), display_name: z.string(), effective_from: IsoDate, effective_to: IsoDate, verification_status: z.string(),
    deductible: z.object({ in_network: z.object({ individual_cents: Cents }) }),
    annual_maximum: z.object({ individual_cents: Cents, preventive_counts_toward_maximum: z.boolean(), accumulator_basis: z.literal("plan_paid_amount") }),
    coverage: z.object({ preventive: coverageRule, basic: coverageRule, major: coverageRule }), rollover: z.object({ enabled: z.boolean() }) }),
});

/** The original category model can use settled base benefits, but cannot invent pending deductible or carry-bank rules. */
export function authoritativeMemberScenario(submitted: ConfirmedScenario, identity: MemberIdentity, raw: unknown): { scenario: ConfirmedScenario; context: MemberBenefitContext; adjustments: MemberBenefitAdjustments; limitations: string[] } {
  const parsed = memberData.safeParse(raw);
  if (!parsed.success) throw new AnalysisInputError("The stored member benefits are incomplete or unsupported. Review the benefit source before calculating.", "memberIdentity");
  const { member, plan } = parsed.data;
  if (member.member_id !== identity.memberId || member.date_of_birth !== identity.dateOfBirth || member.plan_version_id !== plan.plan_version_id) throw new AnalysisInputError("The member identity or linked plan could not be verified.", "memberIdentity");
  const state = member.benefit_state;
  const pendingKnown = state.pending_claims.every((claim) => claim.projected_plan_payment_cents !== undefined);
  const pending = pendingKnown ? sumCents(state.pending_claims.map((claim) => claim.projected_plan_payment_cents!)) : null;
  const issues: string[] = [];
  const blockingIssues: string[] = [];
  if (state.pending_claims.length) issues.push("Conservative estimate: projected pending plan payments are reserved separately from settled usage. Pending deductible impact is unknown, so the stored remaining deductible is left unchanged; adjudication may change the estimate.");
  if (!pendingKnown) blockingIssues.push("A pending claim has no projected plan payment. Its benefit reserve must be confirmed before calculating.");
  if (state.rollover_bank_cents > 0) issues.push("Conservative estimate: the stored rollover bank is excluded from modeled payments because the linked plan does not supply its spending order or forfeiture rules. It remains separate from the base annual maximum.");
  if (state.source.status !== "VERIFIED_DEMO" || plan.verification_status !== "VERIFIED_DEMO") blockingIssues.push("The member snapshot or linked plan source is stale or unverified. Confirm current benefits before calculating.");
  if (state.annual_maximum_total_cents !== plan.annual_maximum.individual_cents || state.plan_paid_ytd_cents + state.annual_maximum_remaining_cents !== state.annual_maximum_total_cents || state.deductible_remaining_cents.in_network > plan.deductible.in_network.individual_cents) blockingIssues.push("The stored base benefit balances do not reconcile with the linked plan limits.");
  const conservative = state.pending_claims.length > 0 || state.rollover_bank_cents > 0;
  const context: MemberBenefitContext = { memberId: member.member_id, planVersionId: plan.plan_version_id, planName: plan.display_name, snapshotId: member.member_snapshot_id ?? null, observedAt: member.observed_at, benefitYear: state.benefit_year, sourceStatus: state.source.status,
    annualMaximumCents: state.annual_maximum_total_cents, settledPlanPaidCents: state.plan_paid_ytd_cents, baseRemainingCents: state.annual_maximum_remaining_cents, pendingProjectedPlanPaymentCents: pending,
    baseAvailableAfterPendingCents: pending === null ? null : Math.max(0, state.annual_maximum_remaining_cents - pending), deductibleRemainingCents: state.deductible_remaining_cents.in_network, rolloverBankCents: state.rollover_bank_cents,
    rolloverSpendingStatus: state.rollover_bank_cents > 0 ? "NEEDS_CONFIRMATION" : "NOT_APPLICABLE", status: blockingIssues.length ? "NEEDS_CONFIRMATION" : conservative ? "CONSERVATIVE" : "READY", issues: [...blockingIssues, ...issues],
    estimateKind: conservative ? "CONSERVATIVE_BASE_ONLY" : "SETTLED_BASE", pendingTreatment: !state.pending_claims.length ? "NONE" : pendingKnown ? "RESERVED_PROJECTED" : "UNKNOWN", pendingDeductibleTreatment: state.pending_claims.length ? "UNCHANGED_CONSERVATIVE" : "NONE", rolloverTreatment: state.rollover_bank_cents > 0 ? "EXCLUDED_UNCONFIRMED" : "NONE" };
  const scenario = structuredClone(submitted);
  const currentYear = state.benefit_year;
  const coverageStart = member.coverage_effective_from && member.coverage_effective_from > plan.effective_from ? member.coverage_effective_from : plan.effective_from;
  if (plan.effective_from > `${currentYear}-01-01` || plan.effective_to < `${currentYear + 1}-12-31`) {
    context.issues.push("The linked plan does not establish both full benefit years required by this comparison."); context.status = "NEEDS_CONFIRMATION";
  }
  for (const [index, year] of scenario.plan.years.entries()) {
    year.startsOn = `${currentYear + index}-01-01`; year.endsOn = `${currentYear + index}-12-31`;
    year.annualMaximumCents = plan.annual_maximum.individual_cents; year.deductibleCents = plan.deductible.in_network.individual_cents;
    if (index === 0) { year.utilization.priorInsurerPaymentsCents = state.plan_paid_ytd_cents; year.utilization.priorDeductibleSatisfiedCents = year.deductibleCents - state.deductible_remaining_cents.in_network; }
    for (const category of ["preventive", "basic", "major"] as const) year.rules[category] = { category, insurerBasisPoints: plan.coverage[category].in_network_plan_share_bps, deductibleApplies: plan.coverage[category].deductible_applies, annualMaximumApplies: category === "preventive" ? plan.annual_maximum.preventive_counts_toward_maximum : true };
    year.ruleStatus = "suppliedConfirmed";
  }
  for (const procedure of scenario.procedures) {
    if (procedure.anchorDate < coverageStart || procedure.anchorDate > plan.effective_to) {
      context.issues.push("A planned service date falls outside the member's stored coverage dates."); context.status = "NEEDS_CONFIRMATION";
    }
    procedure.windows = procedure.windows.map((window) => ({ ...window, earliestDate: window.earliestDate < coverageStart ? coverageStart : window.earliestDate, latestDate: window.latestDate > plan.effective_to ? plan.effective_to : window.latestDate })).filter((window) => window.earliestDate <= window.latestDate);
  }
  return { scenario, context, adjustments: { pendingReserveCents: pending ?? 0, rolloverExcludedCents: state.rollover_bank_cents }, limitations: [...issues, ...(conservative ? ["This is a conservative modeled estimate, not a guaranteed upper bound: actual pending adjudication or eligibility changes may increase or decrease costs."] : []), "The server reloaded this exact member ID and date of birth, its latest matched snapshot and its linked plan. Submitted current balances, limits and coverage rules were replaced with those stored facts.", "Future-year utilization is a user-confirmed assumption, not a stored member balance. Contracted procedure fees, eligibility and dentist-approved timing remain user confirmations.", ...(plan.rollover.enabled ? ["Prospective rollover awards are not modeled. No carry-bank spending rule was borrowed from another plan."] : [])] };
}
