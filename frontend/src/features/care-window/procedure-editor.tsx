"use client";

import type { ProcedureRecommendation, Urgency } from "@engine/procedure";
import type { Specialty } from "@engine/provider";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { EngineSource, humanize } from "./parts";

const SPECIALTIES: Specialty[] = ["general", "endodontist", "prosthodontist", "periodontist", "oral_surgeon", "pediatric", "orthodontist"];
export function ProcedureEditor({ procedure: p, all, included, affirmed, confirmed, onInclude, onAffirm, onEdit, asOf, disabled }: {
  procedure: ProcedureRecommendation; all: ProcedureRecommendation[]; included: boolean; affirmed: boolean; confirmed: boolean;
  onInclude: (value: boolean) => void; onAffirm: (value: boolean) => void; onEdit: (value: ProcedureRecommendation) => void; asOf: string; disabled: boolean;
}) {
  const id = p.procedure_id;
  const mark = (field: string, missing = false) => `${p.inferred_fields.some((f) => f === field) ? " · inferred, check" : ""}${missing ? " · missing" : ""}`;
  const edit = (changes: Partial<ProcedureRecommendation>) => onEdit({ ...p, ...changes });
  const fee = p.dentist_fee.value;
  const setFee = (value: ProcedureRecommendation["dentist_fee"]["value"]) => edit({ dentist_fee: { ...p.dentist_fee, value, source: "MEMBER_CONFIRMED", observed_at: asOf } });
  return <article className="space-y-3 rounded-lg border p-4">
    <h4 className="font-semibold">{p.description}</h4>
    <p className="text-xs text-muted-foreground">{confirmed ? "Confirmed by the engine" : "Check every extracted fact before confirmation"} · Document {p.source.document_id} · {humanize(p.source.kind)}</p>
    <fieldset disabled={disabled} className="space-y-3">
      <legend className="sr-only">Edit facts for {p.description}</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><Label htmlFor={`${id}-description`}>Description</Label><Input id={`${id}-description`} value={p.description} maxLength={200} onChange={(e) => edit({ description: e.target.value })} /></div>
        <div><Label htmlFor={`${id}-code`}>CDT code{mark("cdt_code", p.cdt_code === null)}</Label><Input id={`${id}-code`} placeholder="D2740" value={p.cdt_code ?? ""} onChange={(e) => edit({ cdt_code: e.target.value.toUpperCase() || null })} /></div>
        <div><Label htmlFor={`${id}-tooth`}>Tooth (optional){mark("tooth")}</Label><Input id={`${id}-tooth`} value={p.tooth ?? ""} onChange={(e) => edit({ tooth: e.target.value.toUpperCase() || null })} /></div>
        <div><Label htmlFor={`${id}-urgency`}>Dentist urgency{mark("urgency", p.urgency === null)}</Label><NativeSelect id={`${id}-urgency`} value={p.urgency ?? ""} onChange={(e) => edit({ urgency: (e.target.value || null) as Urgency | null })}><NativeSelectOption value="">Missing — ask dentist</NativeSelectOption><NativeSelectOption value="act_now">Act now</NativeSelectOption><NativeSelectOption value="schedule_soon">Schedule soon</NativeSelectOption><NativeSelectOption value="can_plan_later">Can plan later</NativeSelectOption></NativeSelect></div>
        <div><Label htmlFor={`${id}-fee-kind`}>Office fee type{mark("dentist_fee", fee.kind === "unknown")}</Label><NativeSelect id={`${id}-fee-kind`} value={fee.kind} onChange={(e) => setFee(e.target.value === "exact" ? { kind: "exact", cents: 0 } : e.target.value === "range" ? { kind: "range", low_cents: 0, high_cents: 0 } : { kind: "unknown" })}><NativeSelectOption value="unknown">Missing</NativeSelectOption><NativeSelectOption value="exact">Exact quote</NativeSelectOption><NativeSelectOption value="range">Quoted range</NativeSelectOption></NativeSelect></div>
        {fee.kind === "exact" && <div><Label htmlFor={`${id}-fee`}>Office fee (cents)</Label><Input id={`${id}-fee`} type="number" min="0" step="1" value={fee.cents} onChange={(e) => setFee({ kind: "exact", cents: Number(e.target.value) })} /></div>}
        {fee.kind === "range" && <><div><Label htmlFor={`${id}-fee-low`}>Lowest quoted fee (cents)</Label><Input id={`${id}-fee-low`} type="number" min="0" step="1" value={fee.low_cents} onChange={(e) => setFee({ ...fee, low_cents: Number(e.target.value) })} /></div><div><Label htmlFor={`${id}-fee-high`}>Highest quoted fee (cents)</Label><Input id={`${id}-fee-high`} type="number" min="0" step="1" value={fee.high_cents} onChange={(e) => setFee({ ...fee, high_cents: Number(e.target.value) })} /></div></>}
        <div><Label htmlFor={`${id}-group`}>Dentist-approved alternative group (optional){mark("alternative_group_id")}</Label><Input id={`${id}-group`} value={p.alternative_group_id ?? ""} onChange={(e) => edit({ alternative_group_id: e.target.value || null })} /></div>
      </div>
      <p className="text-xs text-muted-foreground">Fee source: <EngineSource source={p.dentist_fee.source} /> · observed {p.dentist_fee.observed_at} · fact {p.dentist_fee.input_id}</p>
      <div className="grid gap-3 sm:grid-cols-3">{(["earliest_safe_date", "target_date", "latest_safe_date"] as const).map((field) => <div key={field}><Label htmlFor={`${id}-${field}`}>{humanize(field)}{mark(field, !p[field])}</Label><Input id={`${id}-${field}`} type="date" value={p[field] ?? ""} onChange={(e) => edit({ [field]: e.target.value || null })} /></div>)}</div>
      <details className="rounded-md border p-3"><summary className="cursor-pointer text-sm font-medium">Dependencies, specialties and dentist statements{mark("dependencies")}</summary>
        <div className="mt-3 space-y-3">
          {p.dependencies.map((d, i) => <div key={i} className="grid gap-2 sm:grid-cols-4">
            <div><Label htmlFor={`${id}-dep-${i}`}>After procedure {i + 1}</Label><NativeSelect id={`${id}-dep-${i}`} value={d.depends_on} onChange={(e) => edit({ dependencies: p.dependencies.map((v, n) => n === i ? { ...v, depends_on: e.target.value } : v) })}>{all.filter((o) => o.procedure_id !== id).map((o) => <NativeSelectOption value={o.procedure_id} key={o.procedure_id}>{o.description}</NativeSelectOption>)}</NativeSelect></div>
            <div><Label htmlFor={`${id}-gap-min-${i}`}>Minimum days {i + 1}</Label><Input id={`${id}-gap-min-${i}`} type="number" min="0" max="730" step="1" value={d.min_gap_days} onChange={(e) => edit({ dependencies: p.dependencies.map((v, n) => n === i ? { ...v, min_gap_days: Number(e.target.value) } : v) })} /></div>
            <div><Label htmlFor={`${id}-gap-max-${i}`}>Maximum days {i + 1} (optional)</Label><Input id={`${id}-gap-max-${i}`} type="number" min="0" max="730" step="1" value={d.max_gap_days ?? ""} onChange={(e) => edit({ dependencies: p.dependencies.map((v, n) => n === i ? { ...v, max_gap_days: e.target.value === "" ? null : Number(e.target.value) } : v) })} /></div>
            <Button type="button" variant="outline" onClick={() => edit({ dependencies: p.dependencies.filter((_, n) => n !== i) })}>Remove dependency {i + 1}</Button>
          </div>)}
          <Button type="button" variant="outline" disabled={all.length < 2} onClick={() => edit({ dependencies: [...p.dependencies, { depends_on: all.find((o) => o.procedure_id !== id)!.procedure_id, min_gap_days: 0, max_gap_days: null }] })}>Add dependency</Button>
          <p className="text-sm font-medium">Dentist-approved specialties</p>
          <div className="flex flex-wrap gap-3">{SPECIALTIES.map((s) => <label className="flex items-center gap-2 text-sm" key={s}><input type="checkbox" checked={p.allowed_specialties.includes(s)} onChange={(e) => edit({ allowed_specialties: e.target.checked ? [...p.allowed_specialties, s] : p.allowed_specialties.filter((v) => v !== s) })} />{humanize(s)}</label>)}</div>
          <Label htmlFor={`${id}-statements`}>Dentist statements (one per line)</Label><textarea id={`${id}-statements`} className="min-h-24 w-full rounded-md border p-2 text-sm" value={p.source.dentist_statements.join("\n")} onChange={(e) => edit({ source: { ...p.source, dentist_statements: e.target.value.split("\n").filter(Boolean) } })} />
        </div>
      </details>
      <div className="flex items-center gap-3"><Checkbox id={`include-${id}`} checked={included} onCheckedChange={(v) => onInclude(v === true)} /><Label htmlFor={`include-${id}`} className="font-normal">Include this procedure in my plan</Label></div>
      <div className="flex items-center gap-3"><Checkbox id={`affirm-${id}`} checked={affirmed} onCheckedChange={(v) => onAffirm(v === true)} /><Label htmlFor={`affirm-${id}`} className="font-normal">I checked these facts against my dentist’s plan</Label></div>
    </fieldset>
  </article>;
}
