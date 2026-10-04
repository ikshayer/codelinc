"use client";

import type { AnalysisPlanningContext } from "@analysis/types";
import type { CalculationRecord } from "@/lib/domain/types";
import { formatIsoDate } from "@/lib/domain/dates";
import { formatBasisPoints, formatCents } from "@/lib/domain/money";
import { signedCents } from "@/features/care-window/parts";

export function PlanningDetails({ planning, record, procedureLabels }: { planning: AnalysisPlanningContext; record: CalculationRecord; procedureLabels: Record<string, string> }) {
  const detail = planning.records.find((d) => d.recordId === record.id);
  if (!detail) return null;
  return <details className="rounded-2xl border bg-card p-4 text-sm md:p-5"><summary className="cursor-pointer font-semibold">Financial and benefit details</summary>
    <div className="mt-4 space-y-5">
      <dl className="grid gap-3 sm:grid-cols-2"><div><dt className="text-muted-foreground">Modeled contracted fees</dt><dd>{formatCents(record.totalFeeCents)}</dd></div><div><dt className="text-muted-foreground">Plan pays</dt><dd>{formatCents(record.totalInsurerCents)}</dd></div><div><dt className="text-muted-foreground">You pay</dt><dd>{formatCents(record.totalPatientCents)}</dd></div><div><dt className="text-muted-foreground">Funding gap</dt><dd>{formatCents(detail.fundingGapCents)}</dd></div><div><dt className="text-muted-foreground">Highest monthly cash requirement</dt><dd>{formatCents(detail.peakMonthlyCashCents)}</dd></div><div><dt className="text-muted-foreground">Completion</dt><dd>{formatIsoDate(detail.completionDate)}</dd></div></dl>
      <div><h3 className="font-medium">Cash required by payment month</h3><ul className="mt-2 space-y-2">{detail.monthly.map((m) => <li key={m.month}>{m.month}: {formatCents(m.cashCents)}{m.exceedsHard && <span className="ml-2 text-destructive">Over your hard limit</span>}{m.exceedsPreferred && <span className="ml-2 text-muted-foreground">Over your preferred target</span>}</li>)}</ul></div>
      <details className="rounded-lg border p-3"><summary className="cursor-pointer font-medium">Compared with the original planned dates</summary><ul className="mt-2 space-y-1"><li>You pay: {signedCents(detail.differenceFromBaseline.patientDeltaCents)}</li><li>Plan pays: {signedCents(detail.differenceFromBaseline.insurerDeltaCents)}</li><li>Peak cash month: {signedCents(detail.differenceFromBaseline.peakMonthlyCashDeltaCents)}</li><li>Completion shift: {detail.differenceFromBaseline.completionShiftDays} days</li>{detail.differenceFromBaseline.serviceDateChanges.map((c) => <li key={c.procedureId}>{procedureLabels[c.procedureId] ?? c.procedureId}: {formatIsoDate(c.serviceDate)} instead of {formatIsoDate(c.baselineDate)} ({c.shiftDays} days)</li>)}</ul></details>
      {detail.events.map((event) => <section className="space-y-2 border-t pt-4" key={event.procedureId}><h3 className="font-semibold">{procedureLabels[event.procedureId] ?? event.procedureId} · {formatIsoDate(event.serviceDate)}{event.userLocked && <span className="ml-2 text-primary">Pinned by you</span>}</h3>
        <h4 className="font-medium">Payment schedule</h4><ul className="space-y-1">{event.funding.map((f, i) => <li key={i}>{f.sourceType} · Payment date {formatIsoDate(f.paymentDate)} · {formatCents(f.amountCents)} · Fees {formatCents(f.feesCents)}</li>)}</ul>{event.shortfallCents > 0 && <p>Funding shortfall: {formatCents(event.shortfallCents)}</p>}
        <details className="rounded-lg border p-3"><summary className="cursor-pointer font-medium">Benefits left after this care</summary><dl className="mt-2 grid gap-2 sm:grid-cols-2"><div><dt>Deductible remaining</dt><dd>{formatCents(event.benefitsAfter.deductibleRemainingCents)}</dd></div><div><dt>Annual maximum remaining</dt><dd>{formatCents(event.benefitsAfter.annualMaximumRemainingCents)}</dd></div></dl></details>
        <details className="rounded-lg border p-3"><summary className="cursor-pointer font-medium">See how this was calculated</summary><ol className="mt-3 space-y-3">{event.calculationSteps.map((step, i) => <li key={i}><p className="font-medium">{step.label}: {formatCents(step.resultCents)}</p><p className="break-words font-mono text-xs text-muted-foreground">{step.formula}</p><ul className="mt-1">{step.operands.map((o, n) => <li key={n}>{o.name}: {o.unit === "basisPoints" ? formatBasisPoints(o.value) : formatCents(o.value)}</li>)}</ul></li>)}</ol><p className="mt-3 text-muted-foreground">Select this procedure in the schedule to inspect the confirmed source fields behind these calculations.</p></details>
        {event.issues.length > 0 && <ul className="list-disc space-y-1 pl-5 text-muted-foreground">{event.issues.map((issue) => <li key={issue}>{issue}</li>)}</ul>}
      </section>)}
      {detail.issues.length > 0 && <ul className="list-disc pl-5">{detail.issues.map((issue) => <li key={issue}>{issue}</li>)}</ul>}
    </div>
  </details>;
}
