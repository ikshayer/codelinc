"use client";

import type { MemberState } from "@engine/member";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { IssueList } from "./parts";
import type { Issue } from "@engine/issues";
import { centsToInput, parseDollarsToCents } from "@/lib/domain/money";

export type MemberPreferences = Pick<MemberState, "budget" | "availability" | "travel">;
export const preferenceMember = (member: MemberState, preferences: MemberPreferences): MemberState => ({ ...member, budget: preferences.budget, availability: preferences.availability, travel: preferences.travel });
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function PreferenceEditor({ initial, asOf, onApply, rebuilding, disabled, issues }: { initial: MemberPreferences; asOf: string; onApply: (preferences: MemberPreferences) => void; rebuilding: boolean; disabled: boolean; issues: Issue[] }) {
  const id = useId();
  const [weekly, setWeekly] = useState(initial.availability.weekly);
  const [unavailable, setUnavailable] = useState(initial.availability.unavailable);
  const [error, setError] = useState<string | null>(null);
  return <details className="rounded-lg border p-4">
    <summary className="cursor-pointer font-semibold">Plan preferences</summary>
    <p className="mt-3 text-sm text-muted-foreground">Only your budget, availability and travel preferences are editable. Plan rules, prices and funding balances come from the synthetic demo dataset. Hard values constrain the engine; preferred values are targets.</p>
    <form className="mt-4 space-y-4" onSubmit={(e) => {
      e.preventDefault();
      if (weekly.some((w) => w.start_time >= w.end_time) || unavailable.some((u) => !u.start || !u.end || u.start > u.end)) {
        setError("Each availability window and unavailable date range must end after its start."); return;
      }
      setError(null);
      const fields = new FormData(e.currentTarget);
      const hard = parseDollarsToCents(String(fields.get("hardBudget")));
      const preferred = parseDollarsToCents(String(fields.get("preferredBudget")));
      if (!hard.ok || !preferred.ok) { setError(!hard.ok ? hard.message : !preferred.ok ? preferred.message : "Enter both amounts."); return; }
      if (preferred.value > hard.value) { setError("Your preferred monthly target must be at or below your hard limit."); return; }
      onApply({
        budget: { ...initial.budget, hard_monthly_limit_cents: hard.value, preferred_monthly_limit_cents: preferred.value, source: "MEMBER_CONFIRMED", observed_at: asOf },
        travel: { ...initial.travel, hard_max_miles: Number(fields.get("hardTravel")), preferred_max_miles: fields.get("preferredTravel") === "" ? null : Number(fields.get("preferredTravel")), source: "MEMBER_CONFIRMED", observed_at: asOf },
        availability: { ...initial.availability, weekly, unavailable, source: "MEMBER_CONFIRMED", observed_at: asOf },
      });
    }}>
      <fieldset disabled={disabled} className="space-y-4">
        <legend className="sr-only">Budget, availability and travel</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1"><Label htmlFor={`${id}-hard`}>Hard monthly limit ($)</Label><Input id={`${id}-hard`} name="hardBudget" inputMode="decimal" required defaultValue={centsToInput(initial.budget.hard_monthly_limit_cents)} /></div>
          <div className="space-y-1"><Label htmlFor={`${id}-preferred`}>Preferred monthly target ($)</Label><Input id={`${id}-preferred`} name="preferredBudget" inputMode="decimal" required defaultValue={centsToInput(initial.budget.preferred_monthly_limit_cents)} /></div>
          <div className="space-y-1"><Label htmlFor={`${id}-travel`}>Hard travel limit (miles)</Label><Input id={`${id}-travel`} name="hardTravel" type="number" min="0" max="500" step="0.1" required defaultValue={initial.travel.hard_max_miles} /></div>
          <div className="space-y-1"><Label htmlFor={`${id}-preferred-travel`}>Preferred travel distance (miles, optional)</Label><Input id={`${id}-preferred-travel`} name="preferredTravel" type="number" min="0" max="500" step="0.1" defaultValue={initial.travel.preferred_max_miles ?? ""} /></div>
        </div>
        <div className="space-y-3">
          <p className="text-sm font-medium">Weekly availability (local time)</p>
          {weekly.length === 0 && <p className="text-sm text-muted-foreground">No available windows. Add a window to allow appointment times.</p>}
          {weekly.map((w, i) => <div className="grid gap-2 sm:grid-cols-4" key={i}>
            <div><Label htmlFor={`${id}-day-${i}`}>Day {i + 1}</Label><NativeSelect id={`${id}-day-${i}`} value={w.weekday} onChange={(e) => setWeekly(weekly.map((v, n) => n === i ? { ...v, weekday: Number(e.target.value) } : v))}>{DAYS.map((day, n) => <NativeSelectOption key={day} value={n}>{day}</NativeSelectOption>)}</NativeSelect></div>
            <div><Label htmlFor={`${id}-from-${i}`}>Available from {i + 1}</Label><Input id={`${id}-from-${i}`} type="time" required value={w.start_time} onChange={(e) => setWeekly(weekly.map((v, n) => n === i ? { ...v, start_time: e.target.value } : v))} /></div>
            <div><Label htmlFor={`${id}-to-${i}`}>Available until {i + 1}</Label><Input id={`${id}-to-${i}`} type="time" required value={w.end_time} onChange={(e) => setWeekly(weekly.map((v, n) => n === i ? { ...v, end_time: e.target.value } : v))} /></div>
            <Button type="button" variant="outline" onClick={() => setWeekly(weekly.filter((_, n) => n !== i))}>Remove window {i + 1}</Button>
          </div>)}
          <Button type="button" variant="outline" onClick={() => setWeekly([...weekly, { weekday: 1, start_time: "09:00", end_time: "17:00" }])}>Add availability window</Button>
        </div>
        <div className="space-y-3"><p className="text-sm font-medium">Unavailable dates (hard restriction)</p>
          {unavailable.map((u, i) => <div className="grid gap-2 sm:grid-cols-3" key={i}>
            <div><Label htmlFor={`${id}-blocked-from-${i}`}>Unavailable from {i + 1}</Label><Input id={`${id}-blocked-from-${i}`} type="date" required value={u.start} onChange={(e) => setUnavailable(unavailable.map((v, n) => n === i ? { ...v, start: e.target.value } : v))} /></div>
            <div><Label htmlFor={`${id}-blocked-to-${i}`}>Unavailable through {i + 1}</Label><Input id={`${id}-blocked-to-${i}`} type="date" required value={u.end} onChange={(e) => setUnavailable(unavailable.map((v, n) => n === i ? { ...v, end: e.target.value } : v))} /></div>
            <Button type="button" variant="outline" onClick={() => setUnavailable(unavailable.filter((_, n) => n !== i))}>Remove unavailable range {i + 1}</Button>
          </div>)}
          <Button type="button" variant="outline" onClick={() => setUnavailable([...unavailable, { start: "", end: "" }])}>Add unavailable dates</Button>
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <IssueList issues={issues} />
        <Button type="submit">{rebuilding ? "Apply preferences and rebuild" : "Apply preferences"}</Button>
      </fieldset>
    </form>
  </details>;
}
