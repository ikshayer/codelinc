"use client";

import type { AdjudicationLine, BenefitPeriodState, CalcStep } from "@engine/benefits";
import type { EvidenceIndexEntry, RouteComparison } from "@engine/optimizer";
import { formatIsoDate } from "@/lib/domain/dates";
import { formatCents } from "@/lib/domain/money";
import { EngineSource, EvidenceList, humanize, IssueList } from "./parts";
import { CLAIM_ROUTE } from "./visit-navigator";

const amount = (cents: number | null) => cents === null ? "Unknown" : formatCents(cents);
const rate = (bps: number | null) => bps === null ? "Unknown" : `${bps / 100}%`;

export function CalculationSteps({ steps }: { steps: CalcStep[] }) {
  return <ol className="mt-3 space-y-4 text-sm">{steps.map((s) => <li key={s.step_id}>
    <p className="font-medium">{s.label}: {s.result_cents !== null ? amount(s.result_cents) : s.result_bps !== null ? rate(s.result_bps) : s.result_text ?? "Unknown"}</p>
    <p className="break-words font-mono text-xs text-muted-foreground">{s.formula}</p>
    <ul className="mt-1 space-y-1">{s.operands.map((o, i) => <li key={`${o.fact_id}-${i}`}>
      {o.name}: {o.cents !== null ? amount(o.cents) : o.bps !== null ? rate(o.bps) : o.text ?? "Unknown"} <code className="break-all text-xs text-muted-foreground">({o.fact_id})</code>
    </li>)}</ul>
  </li>)}</ol>;
}

function LineBreakdown({ line, evidence }: { line: AdjudicationLine; evidence: EvidenceIndexEntry[] }) {
  const values: [string, string][] = [
    ["Office / modeled charge", amount(line.modeled_charge_cents)],
    ["Contracted adjustment", amount(line.contractual_adjustment_cents)],
    ["Patient charge", amount(line.patient_charge_cents)],
    ["Eligible / allowed basis", amount(line.eligible_basis_cents)],
    ["Balance bill", amount(line.balance_bill_cents)],
    ["Deductible applied", amount(line.deductible_applied_cents)],
    ["Plan coverage rate", rate(line.coverage_rate_bps)],
    ["Plan share before caps", amount(line.preliminary_plan_pay_cents)],
    ["Cap applied", line.cap_applied === null ? "Unknown" : humanize(line.cap_applied)],
    ["Plan pays", amount(line.plan_pay_cents)],
    ["Member responsibility", amount(line.member_responsibility_cents)],
    ["Counts toward annual maximum", line.counts_toward_maximum === null ? "Unknown" : line.counts_toward_maximum ? "Yes" : "No"],
  ];
  return <div className="space-y-3">
    <p className="text-xs text-muted-foreground">{humanize(line.status)} · {line.plan_version_id ?? "Plan not resolved"} · {line.network_tier ? humanize(line.network_tier) : "Network unknown"}</p>
    <dl className="grid gap-2 sm:grid-cols-2">{values.map(([label, value]) => <div key={label}><dt className="text-muted-foreground">{label}</dt><dd className="tabular-nums">{value}</dd></div>)}</dl>
    <IssueList issues={line.issues} />
    <details className="rounded-md border p-3">
      <summary className="cursor-pointer font-medium">See how this was calculated</summary>
      <CalculationSteps steps={line.steps} />
      <p className="mt-3 break-words text-xs text-muted-foreground">Input facts: {line.input_ids.join(", ") || "None returned"}</p>
      <EvidenceList evidence={evidence.filter((e) => e.plan_version_id === line.plan_version_id && line.applied_rule_ids.includes(e.rule_id))} />
    </details>
  </div>;
}

export function EventCostBreakdown({ worst, best, evidence }: { worst: AdjudicationLine; best: AdjudicationLine; evidence: EvidenceIndexEntry[] }) {
  // Compare returned detail, never compute the uncertainty interval in the browser.
  const differs = JSON.stringify(worst) !== JSON.stringify(best);
  return <details className="rounded-lg border p-3 text-sm">
    <summary className="cursor-pointer font-medium">Cost breakdown and calculation sources</summary>
    <div className="mt-3 space-y-4">
      {differs && <p className="text-muted-foreground">The engine returned different best and worst cases for uncertain inputs. Inspect each case and its calculation operands and issues below.</p>}
      <div>{differs && <h5 className="mb-2 font-medium">Worst case</h5>}<LineBreakdown line={worst} evidence={evidence} /></div>
      {differs && <div><h5 className="mb-2 font-medium">Best case</h5><LineBreakdown line={best} evidence={evidence} /></div>}
    </div>
  </details>;
}

export function BenefitsAfterEvent({ state }: { state: BenefitPeriodState | undefined }) {
  if (!state) return <p className="text-sm text-muted-foreground">Benefit state after this visit was not returned.</p>;
  const values: [string, number][] = [
    ["Deductible remaining (settled)", state.deductible_remaining_cents],
    ["Pending deductible reservation", state.pending_reserved_deductible_cents],
    ["Deductible after pending", state.deductible_available_cents],
    ["Annual maximum remaining (settled)", state.annual_max_remaining_cents],
    ["Pending maximum reservation", state.pending_reserved_max_cents],
    ["Annual maximum available after pending", state.annual_max_available_cents],
    ["Plan paid in this modeled period", state.simulated_plan_paid_cents],
  ];
  return <details className="rounded-lg border p-3 text-sm">
    <summary className="cursor-pointer font-medium">Benefits left after this visit</summary>
    <p className="my-2 text-muted-foreground">{formatIsoDate(state.period_start)}–{formatIsoDate(state.period_end)} · {state.plan_version_id} · opened from {humanize(state.opened_from)} <EngineSource source={state.source} /></p>
    <dl className="grid gap-2 sm:grid-cols-2">{values.map(([label, value]) => <div key={label}><dt className="text-muted-foreground">{label}</dt><dd className="tabular-nums">{formatCents(value)}</dd></div>)}</dl>
    {state.sublimits.map((s) => <p key={s.rule_id} className="mt-2">{s.rule_id}: {formatCents(s.remaining_cents)} remaining</p>)}
  </details>;
}

export function RouteComparisonCard({ comparison: rc }: { comparison: RouteComparison }) {
  return <section aria-label="Cash versus claim comparison" className="space-y-2 rounded-lg border p-3 text-sm">
    <h5 className="font-medium">Cash versus claim across the whole plan</h5>
    <p>{CLAIM_ROUTE[rc.claim_route]}: {amount(rc.claim_total_cents)} · Self-pay without claim: {amount(rc.cash_total_cents)}</p>
    {rc.winner_claim_route !== null && rc.difference_cents !== null ? <p>{CLAIM_ROUTE[rc.winner_claim_route]} saves {amount(rc.difference_cents)} across your whole plan.</p> : <p className="text-muted-foreground">No route winner is confirmed. Check the missing facts below.</p>}
    <IssueList issues={rc.missing} />
  </section>;
}
