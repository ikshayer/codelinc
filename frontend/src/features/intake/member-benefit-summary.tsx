"use client";

import { supportsConservativeMemberEstimate, type MemberData } from "@/lib/adapters/live/member-data";
import { formatCents } from "@/lib/domain/money";
import { formatIsoDate } from "@/lib/domain/dates";

export function MemberBenefitSummary({ data }: { data: MemberData }) {
  const benefit = data.member.benefit_state;
  const hasPending = benefit.pending_claims.length > 0;
  const hasRollover = benefit.rollover_bank_cents !== undefined && benefit.rollover_bank_cents > 0;
  const conservativeSupported = supportsConservativeMemberEstimate(data);
  return <section aria-label="Matched member benefits" className="space-y-3 rounded-xl border bg-card p-4 text-sm">
    <p className="font-semibold">Synthetic member record · {data.member.display_name} · {data.member.member_id}</p>
    <p className="text-muted-foreground">{data.plan.display_name} · {formatIsoDate(data.plan.effective_from)}–{formatIsoDate(data.plan.effective_to)} · Observed {data.member.observed_at}</p>
    <dl className="grid gap-3 sm:grid-cols-2"><div><dt className="text-muted-foreground">Annual maximum (base plan)</dt><dd>{formatCents(benefit.annual_maximum_total_cents ?? data.plan.annual_maximum.individual_cents)}</dd></div><div><dt className="text-muted-foreground">Plan paid year to date (settled)</dt><dd>{formatCents(benefit.plan_paid_ytd_cents)}</dd></div><div><dt className="text-muted-foreground">Annual maximum remaining (settled, before pending)</dt><dd>{formatCents(benefit.annual_maximum_remaining_cents)}</dd></div><div><dt className="text-muted-foreground">In-network deductible remaining</dt><dd>{formatCents(benefit.deductible_remaining_cents.in_network)}</dd></div><div><dt className="text-muted-foreground">Pending claims</dt><dd>{benefit.pending_claims.length}</dd></div><div><dt className="text-muted-foreground">Rollover bank (separate from base remaining)</dt><dd>{benefit.rollover_bank_cents === undefined ? "Not supplied" : formatCents(benefit.rollover_bank_cents)}</dd></div></dl>
    {hasPending && <ul className="space-y-1">{benefit.pending_claims.map((pending, i) => {
      const claim = pending && typeof pending === "object" ? pending as Record<string, unknown> : {};
      return <li key={i}>Pending claim {typeof claim.claim_id === "string" ? claim.claim_id : i + 1} · Estimated plan payment reservation: {typeof claim.projected_plan_payment_cents === "number" ? formatCents(claim.projected_plan_payment_cents) : "Not supplied"}</li>;
    })}</ul>}
    {benefit.source && <p className="text-muted-foreground">Source: {benefit.source.type} · {benefit.source.status} · As of {benefit.source.as_of}</p>}
    <p className="text-muted-foreground">Stored benefit and plan facts stay with this member. Treatment intake adds your care details; calculations recheck the stored member and plan on the server.</p>
    {(hasPending || hasRollover) && <p role="status" className="font-medium text-primary">{conservativeSupported ? "Conservative base-benefit estimate only: the server reserves supplied pending plan-payment projections, keeps pending deductible effects unchanged, and excludes the unconfirmed rollover bank. A complete claim-settlement estimate still needs confirmed deductible and rollover spending rules." : "This member’s benefit source or pending projections need confirmation. You can describe and review treatment, but a complete cost estimate is unavailable until those facts are supported."}</p>}
  </section>;
}
