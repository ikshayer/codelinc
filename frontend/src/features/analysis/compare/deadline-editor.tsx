"use client";

import { CalendarClockIcon } from "lucide-react";
import { useId, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { isValidIsoDate } from "@/lib/domain/dates";
import type { ConfirmedScenario, ISODate, ProcedureId } from "@/lib/domain/types";

interface DeadlineEditorProps {
  scenario: ConfirmedScenario;
  procedureLabels: Record<ProcedureId, string>;
  /** Hides the current result and recalculates. Called only after the dentist affirmation is checked. */
  onApply: (procedureId: ProcedureId, deadline: ISODate) => void;
}

/** Edit a dentist deadline. Applying removes the current estimate until it is recalculated. */
export function DeadlineEditor({ scenario, procedureLabels, onApply }: DeadlineEditorProps) {
  const ids = { procedure: useId(), date: useId(), affirm: useId(), error: useId() };
  const [open, setOpen] = useState(false);
  const [procedureId, setProcedureId] = useState<ProcedureId | null>(null);
  const [typedDate, setTypedDate] = useState<string | null>(null);
  const [affirmed, setAffirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const editable = scenario.procedures.filter((procedure) => procedure.timingPermission === "dentistApproved");
  if (editable.length === 0) return null;

  const defaultProcedure = editable.find((p) => p.windows.some((w) => w.benefitYearId === "y2")) ?? editable[0];
  const selected = editable.find((p) => p.id === procedureId) ?? defaultProcedure;
  const date = typedDate ?? selected.deadline ?? "";

  function reset() {
    setProcedureId(null);
    setTypedDate(null);
    setAffirmed(false);
    setError(null);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!isValidIsoDate(date)) return setError("Enter the deadline as a real date.");
    if (date === selected.deadline) return setError("That is already the deadline in this estimate. Choose a different date.");
    if (!affirmed) return setError("Check the box to confirm your dentist gave you this deadline.");
    onApply(selected.id, date);
  }

  return (
    <Collapsible
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <CollapsibleTrigger asChild>
        <Button variant="outline">
          <CalendarClockIcon aria-hidden />
          Edit dentist deadline
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <form onSubmit={submit} noValidate className="mt-4 max-w-md space-y-5 rounded-lg border p-5">
          <p className="text-sm text-muted-foreground">Applying a new deadline removes the current estimate and recalculates it.</p>
          {editable.length > 1 && (
            <div className="space-y-2">
              <Label htmlFor={ids.procedure}>Procedure</Label>
              <NativeSelect
                id={ids.procedure}
                className="w-full"
                value={selected.id}
                onChange={(event) => {
                  setProcedureId(event.target.value);
                  setTypedDate(null);
                  setError(null);
                }}
              >
                {editable.map((procedure) => (
                  <NativeSelectOption key={procedure.id} value={procedure.id}>
                    {procedureLabels[procedure.id] ?? procedure.id}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor={ids.date}>Dentist&apos;s deadline{editable.length === 1 ? ` for ${procedureLabels[selected.id] ?? selected.id}` : ""}</Label>
            <Input
              id={ids.date}
              type="date"
              value={date}
              onChange={(event) => {
                setTypedDate(event.target.value);
                setError(null);
              }}
              aria-invalid={error !== null && !isValidIsoDate(date)}
              aria-describedby={error ? ids.error : undefined}
            />
          </div>
          <div className="flex items-start gap-3">
            <Checkbox
              id={ids.affirm}
              checked={affirmed}
              onCheckedChange={(checked) => {
                setAffirmed(checked === true);
                setError(null);
              }}
              aria-required
              aria-describedby={error ? ids.error : undefined}
              className="mt-1"
            />
            <Label htmlFor={ids.affirm} className="text-base leading-snug">
              My dentist gave me this deadline
            </Label>
          </div>
          {error && (
            <p id={ids.error} role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="flex flex-wrap gap-3">
            <Button type="submit">Apply</Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setOpen(false);
                reset();
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      </CollapsibleContent>
    </Collapsible>
  );
}
