"use client";

import type { AlternativeDifference, CarePlanRequest, RecommendationMode, SolverMeta } from "@engine/optimizer";
import { useId } from "react";

import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { formatIsoDate } from "@/lib/domain/dates";
import { formatCents } from "@/lib/domain/money";
import { humanize, signedCents } from "./parts";

// UI-002 / UI-011 (contract 1.7): the priority selector, the per-alternative deltas and the
// solver line. Every number is an engine field; this file only formats.

export const DEFAULT_MODE: RecommendationMode = "BALANCED";

export const MODE_OPTIONS: { mode: RecommendationMode; label: string }[] = [
  { mode: "BALANCED", label: "Balanced" },
  { mode: "LOWEST_TOTAL_COST", label: "Lowest cost" },
  { mode: "EARLIEST_SAFE_COMPLETION", label: "Earliest safe" },
  { mode: "SMOOTHEST_PAYMENTS", label: "Smoothest payments" },
];

/** The same care-plan request with the chosen priority. Explanations reuse this request unchanged. */
export function withMode(request: CarePlanRequest, mode: RecommendationMode): CarePlanRequest {
  return { ...request, preferences: { mode } };
}

export function PrioritySelector({ value, onChange, disabled }: { value: RecommendationMode; onChange: (mode: RecommendationMode) => void; disabled?: boolean }) {
  const id = useId();
  return (
    <fieldset className="space-y-2" disabled={disabled}>
      <legend className="text-sm font-medium" id={`${id}-legend`}>
        What matters most?
      </legend>
      <RadioGroup
        aria-labelledby={`${id}-legend`}
        className="flex flex-wrap gap-x-6 gap-y-2"
        value={value}
        onValueChange={(next) => {
          const option = MODE_OPTIONS.find((o) => o.mode === next);
          if (option) onChange(option.mode);
        }}
        disabled={disabled}
      >
        {MODE_OPTIONS.map((o) => (
          <div key={o.mode} className="flex items-center gap-2">
            <RadioGroupItem id={`${id}-${o.mode}`} value={o.mode} />
            <Label htmlFor={`${id}-${o.mode}`} className="font-normal">
              {o.label}
            </Label>
          </div>
        ))}
      </RadioGroup>
    </fieldset>
  );
}

export function SolverLine({ meta }: { meta: SolverMeta }) {
  if (meta.status === "OPTIMAL") return <p className="text-sm text-muted-foreground">Checked all {meta.schedules_evaluated.toLocaleString("en-US")} possible schedules</p>;
  if (meta.status === "BOUNDED_BEST_FOUND") return <p className="text-sm text-muted-foreground">Best plan found within search limits</p>;
  return null;
}

const signed = (cents: number) => (cents === 0 ? "No change" : signedCents(cents));
const signedRange = (r: { low_cents: number; high_cents: number }) => (r.low_cents === r.high_cents ? signed(r.low_cents) : `${signed(r.low_cents)} to ${signed(r.high_cents)}`);
const daysPhrase = (days: number) => (days === 0 ? "same day" : `${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} ${days > 0 ? "later" : "earlier"}`);

/** "Compared with the recommended plan": the engine's deltas, worst case, no scores. */
export function DifferenceList({ difference: d, procedureName }: { difference: AlternativeDifference; procedureName: (procedureId: string) => string }) {
  return (
    <section className="space-y-2 rounded-lg border px-4 py-3 text-sm" aria-label="Compared with the recommended plan">
      <p className="font-medium">Compared with the recommended plan</p>
      <ul className="space-y-1 tabular-nums">
        <li>You pay in total: {signed(d.member_cost_delta_cents)}</li>
        <li>Plan pays: {signed(d.plan_pay_delta_cents)}</li>
        <li>Highest month out of pocket: {signed(d.peak_monthly_cash_delta_cents)}</li>
        {d.monthly
          .filter((m) => m.cash_delta_cents !== 0)
          .map((m) => (
            <li key={m.month} className="text-muted-foreground">
              {m.month}: {signed(m.cash_delta_cents)}
            </li>
          ))}
        {d.completion_shift_days !== null && <li className="tabular-nums">Finishes {daysPhrase(d.completion_shift_days)}</li>}
        {d.service_date_changes.map((c) => (
          <li key={c.procedure_id}>
            {procedureName(c.procedure_id)}: {c.this_date ? formatIsoDate(c.this_date) : "not scheduled"} instead of {c.recommended_date ? formatIsoDate(c.recommended_date) : "not scheduled"}
            {c.shift_days !== null && ` (${daysPhrase(c.shift_days)})`}
          </li>
        ))}
        {d.rollover_final_bank_delta && <li>Carryover to next year: {signedRange(d.rollover_final_bank_delta)}</li>}
        {d.annual_max_remaining_delta
          .filter((a) => a.delta_cents !== 0)
          .map((a) => (
            <li key={a.plan_version_id}>
              Plan can still pay {formatCents(Math.abs(a.delta_cents))} {a.delta_cents > 0 ? "more" : "less"} ({a.plan_version_id})
            </li>
          ))}
        {d.warnings_added.map((code) => (
          <li key={`add-${code}`}>New warning: {humanize(code)}</li>
        ))}
        {d.warnings_removed.map((code) => (
          <li key={`rem-${code}`}>Warning avoided: {humanize(code)}</li>
        ))}
      </ul>
    </section>
  );
}
