"use client";

import { useId, useState } from "react";
import type { AnalysisEngineOptions, AnalysisPlanningContext, AnalysisScheduleLock } from "@analysis/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PrioritySelector } from "@/features/care-window/plan-modes";
import { formatIsoDate } from "@/lib/domain/dates";
import { centsToInput, parseDollarsToCents } from "@/lib/domain/money";

export function PlanningControls({ planning, procedureLabels, onChange, onUndo, canUndo, disabled }: {
  planning: AnalysisPlanningContext; procedureLabels: Record<string, string>;
  onChange: (options: AnalysisEngineOptions) => void; onUndo: () => void; canUndo: boolean; disabled: boolean;
}) {
  const id = useId();
  const [error, setError] = useState<string | null>(null);
  const options = { mode: planning.mode, schedule_locks: planning.locks, ...(planning.budget ? { budget: planning.budget } : {}) };
  function unpin(lock: AnalysisScheduleLock) { onChange({ ...options, schedule_locks: planning.locks.filter((l) => l.procedureId !== lock.procedureId) }); }
  return <section className="space-y-4" aria-label="Plan controls">
    <PrioritySelector value={planning.mode} onChange={(mode) => onChange({ ...options, mode })} disabled={disabled} />
    <details className="rounded-lg border p-3 text-sm"><summary className="cursor-pointer font-medium">Payment preferences</summary>
      <form className="mt-3 space-y-3" onSubmit={(e) => {
        e.preventDefault(); const data = new FormData(e.currentTarget);
        const hard = parseDollarsToCents(String(data.get("hard"))); const preferred = parseDollarsToCents(String(data.get("preferred")));
        if (!hard.ok || !preferred.ok) { setError(!hard.ok ? hard.message : !preferred.ok ? preferred.message : "Enter both amounts."); return; }
        if (preferred.value > hard.value) { setError("Your preferred target must be at or below your hard monthly limit."); return; }
        setError(null); onChange({ ...options, budget: { hardMonthlyLimitCents: hard.value, preferredMonthlyLimitCents: preferred.value } });
      }}>
        <p className="text-muted-foreground">This model funds your responsibility with cash on each service date. Set a hard monthly limit and a preferred target to compare the returned funding requirements.</p>
        <div><Label htmlFor={`${id}-hard`}>Hard monthly limit ($)</Label><Input id={`${id}-hard`} name="hard" inputMode="decimal" required disabled={disabled} defaultValue={planning.budget ? centsToInput(planning.budget.hardMonthlyLimitCents) : ""} /></div>
        <div><Label htmlFor={`${id}-preferred`}>Preferred monthly target ($)</Label><Input id={`${id}-preferred`} name="preferred" inputMode="decimal" required disabled={disabled} defaultValue={planning.budget ? centsToInput(planning.budget.preferredMonthlyLimitCents) : ""} /></div>
        {error && <p role="alert" className="text-destructive">{error}</p>}
        <Button type="submit" disabled={disabled}>Apply preferences and rebuild</Button>
        {planning.budget && <Button type="button" variant="outline" disabled={disabled} onClick={() => onChange({ mode: planning.mode, schedule_locks: planning.locks })}>Remove payment limits</Button>}
      </form>
    </details>
    {planning.locks.length > 0 && <div className="space-y-2"><h3 className="text-sm font-semibold">Your plan · {planning.locks.length} service date{planning.locks.length === 1 ? "" : "s"} pinned</h3><ul className="space-y-2">{planning.locks.map((lock) => <li key={lock.procedureId} className="text-sm">{procedureLabels[lock.procedureId] ?? lock.procedureId} · {formatIsoDate(lock.serviceDate)} <Button size="sm" variant="outline" disabled={disabled} onClick={() => unpin(lock)}>Unpin date</Button></li>)}</ul></div>}
    <div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" disabled={disabled || !canUndo} onClick={onUndo}>Undo last change</Button><Button variant="outline" size="sm" disabled={disabled} onClick={() => onChange({})}>Reset to recommended</Button><Button size="sm" disabled={disabled} onClick={() => onChange(options)}>Re-optimize unpinned care</Button></div>
  </section>;
}
