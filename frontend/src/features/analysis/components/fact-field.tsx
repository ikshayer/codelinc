"use client";

import { useState } from "react";

import { SourceBadge } from "@/components/shared/source-badge";
import { StatusChip } from "@/components/shared/status-chip";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { EvidenceSheet } from "@/features/intake/pdf/evidence-sheet";
import { factDisplayStatus } from "@/lib/domain/draft";
import { CATEGORIES, CATEGORY_LABELS, carePaths, getFieldDefinition } from "@/lib/domain/fields";
import { formatBasisPoints, formatCents, parseDollarsToCents, parsePercentToBasisPoints } from "@/lib/domain/money";
import { formatIsoDate, isValidIsoDate } from "@/lib/domain/dates";
import type { DraftFact, FieldValue } from "@/lib/domain/types";
import { cn } from "@/lib/utils";
import { useAnalysis, useAnalysisController } from "../analysis-provider";

// One editor for every draft fact, used by manual intake and Confirm. It
// shows the value's source and status, resolves conflicts with both values
// visible, and never turns a blank into zero.

export function fieldDomId(path: string): string {
  return `input-${path.replace(/\./g, "-")}`;
}

export function fieldContainerId(path: string): string {
  return `field-${path}`;
}

/** Human-readable rendering of a draft value (input text, not a calculated result). */
export function displayFactValue(path: string, value: FieldValue, procedureLabel?: (id: string) => string): string {
  if (value === null || value === "") return "Not provided";
  const { kind } = getFieldDefinition(path);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  switch (kind) {
    case "money": {
      const parsed = parseDollarsToCents(value);
      return parsed.ok ? formatCents(parsed.value) : value;
    }
    case "percent": {
      const parsed = parsePercentToBasisPoints(value);
      return parsed.ok ? formatBasisPoints(parsed.value) : value;
    }
    case "date":
      return isValidIsoDate(value) ? formatIsoDate(value) : value;
    case "category":
      return CATEGORY_LABELS[value as keyof typeof CATEGORY_LABELS] ?? value;
    case "permission":
      return value === "dentistApproved" ? "Dentist approved other dates" : "Not known — keep the planned date";
    case "procedureList":
      return value
        .split(",")
        .filter(Boolean)
        .map((id) => procedureLabel?.(id) ?? id)
        .join(", ");
    case "days":
      return `${value} ${value === "1" ? "day" : "days"}`;
    default:
      return value;
  }
}

interface FactFieldProps {
  analysisId: string;
  path: string;
  /** Blocking issue for this field, shown after a Compare attempt. */
  error?: string;
  /** Overrides the registry label (e.g. inside a per-procedure group). */
  label?: string;
  className?: string;
}

export function FactField({ analysisId, path, error, label, className }: FactFieldProps) {
  const analysis = useAnalysis(analysisId);
  const controller = useAnalysisController();
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  if (!analysis) return null;

  const definition = getFieldDefinition(path);
  const fact: DraftFact | undefined = analysis.draft.facts[path];
  const status = factDisplayStatus(fact);
  const inputId = fieldDomId(path);
  const helpId = `${inputId}-help`;
  const errorId = `${inputId}-error`;
  const describedBy = [definition.help ? helpId : null, error ? errorId : null].filter(Boolean).join(" ") || undefined;
  const firstEvidence = fact?.evidenceIds.map((id) => analysis.draft.evidence[id]).find(Boolean);
  const procedureLabel = (id: string) => {
    const value = analysis.draft.facts[carePaths.label(id)]?.value;
    return typeof value === "string" && value ? value : "Unnamed procedure";
  };

  const commit = (value: FieldValue) => controller.editFact(analysisId, path, value);
  const commitText = (raw: string) => {
    const next = raw.trim() === "" ? null : raw.trim();
    const current = fact?.value ?? null;
    if (next === current) return;
    commit(next);
  };

  const invalid = Boolean(error);
  const value = fact?.status === "conflict" ? null : (fact?.value ?? null);

  return (
    <div id={fieldContainerId(path)} className={cn("scroll-mt-24 py-4", className)}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <label htmlFor={definition.kind === "boolean" || definition.kind === "permission" || definition.kind === "procedureList" ? undefined : inputId} id={`${inputId}-label`} className="text-[15px] font-medium">
          {label ?? definition.label}
        </label>
        <div className="flex flex-wrap items-center gap-3">
          {fact && fact.evidenceIds.length > 0 ? (
            <button
              type="button"
              onClick={() => setEvidenceOpen(true)}
              className="inline-flex min-h-8 items-center rounded-sm underline-offset-4 hover:underline"
              aria-label={`View source for ${label ?? definition.label}`}
            >
              <SourceBadge kind={fact.origin} evidence={fact.userEdited ? undefined : firstEvidence} />
            </button>
          ) : (
            fact && <SourceBadge kind={fact.origin} />
          )}
          <StatusChip status={status} />
        </div>
      </div>
      {definition.help && (
        <p id={helpId} className="mt-1 text-sm text-muted-foreground">
          {definition.help}
        </p>
      )}

      {fact?.status === "conflict" && (
        <div className="mt-3 rounded-md border border-destructive/30 p-3" role="group" aria-label="Conflicting values">
          <p className="text-sm">These sources disagree. Choose the right value or type a correction below.</p>
          <ul className="mt-2 divide-y">
            {fact.candidates.map((candidate, index) => {
              const evidence = candidate.evidenceIds.map((id) => analysis.draft.evidence[id]).find(Boolean);
              return (
                <li key={index} className="flex flex-wrap items-center justify-between gap-3 py-2">
                  <span className="flex flex-col">
                    <span className="tabular font-medium">{displayFactValue(path, candidate.value, procedureLabel)}</span>
                    <SourceBadge kind={candidate.origin} evidence={evidence} />
                    {evidence?.literalQuote && <span className="mt-1 text-sm text-muted-foreground">“{evidence.literalQuote}”</span>}
                  </span>
                  <Button variant="outline" size="sm" onClick={() => controller.resolveConflict(analysisId, path, candidate)}>
                    Use this value
                  </Button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="mt-2">
        <FieldInput
          kind={definition.kind}
          inputId={inputId}
          labelId={`${inputId}-label`}
          value={value}
          invalid={invalid}
          describedBy={describedBy}
          onCommit={commit}
          onCommitText={commitText}
          otherProcedures={analysis.draft.procedureIds.filter((id) => id !== definition.procedureId).map((id) => ({ id, label: procedureLabel(id) }))}
        />
      </div>

      {error && (
        <p id={errorId} className="mt-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {fact && fact.evidenceIds.length > 0 && (
        <EvidenceSheet analysisId={analysisId} evidenceIds={fact.evidenceIds} open={evidenceOpen} onOpenChange={setEvidenceOpen} title={`Source for ${label ?? definition.label}`} />
      )}
    </div>
  );
}

interface FieldInputProps {
  kind: ReturnType<typeof getFieldDefinition>["kind"];
  inputId: string;
  labelId: string;
  value: FieldValue;
  invalid: boolean;
  describedBy?: string;
  onCommit: (value: FieldValue) => void;
  onCommitText: (raw: string) => void;
  otherProcedures: { id: string; label: string }[];
}

function FieldInput({ kind, inputId, labelId, value, invalid, describedBy, onCommit, onCommitText, otherProcedures }: FieldInputProps) {
  const common = { id: inputId, "aria-invalid": invalid || undefined, "aria-describedby": describedBy };
  const textValue = typeof value === "string" ? value : "";
  // Uncontrolled text inputs re-mount when the stored value changes (e.g. a conflict is resolved).
  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") onCommitText(event.currentTarget.value);
  };

  switch (kind) {
    case "money":
    case "percent":
      return (
        <div className="relative max-w-56">
          {kind === "money" && <span aria-hidden className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground">$</span>}
          <Input
            key={textValue}
            {...common}
            defaultValue={textValue}
            inputMode="decimal"
            autoComplete="off"
            placeholder={kind === "money" ? "Unknown" : "Unknown"}
            className={cn("tabular", kind === "money" ? "pl-7" : "pr-8")}
            onBlur={(event) => onCommitText(event.currentTarget.value)}
            onKeyDown={onKeyDown}
          />
          {kind === "percent" && <span aria-hidden className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground">%</span>}
        </div>
      );
    case "days":
      return (
        <Input
          key={textValue}
          {...common}
          defaultValue={textValue}
          inputMode="numeric"
          className="tabular max-w-32"
          placeholder="Days"
          onBlur={(event) => onCommitText(event.currentTarget.value)}
          onKeyDown={onKeyDown}
        />
      );
    case "text":
      return <Input key={textValue} {...common} defaultValue={textValue} className="max-w-md" onBlur={(event) => onCommitText(event.currentTarget.value)} onKeyDown={onKeyDown} />;
    case "date":
      return (
        <Input
          key={textValue}
          {...common}
          type="date"
          defaultValue={textValue}
          className="tabular max-w-52"
          onChange={(event) => {
            // Native date inputs report "" until a full valid date is entered.
            if (event.currentTarget.value === "" || isValidIsoDate(event.currentTarget.value)) onCommitText(event.currentTarget.value);
          }}
        />
      );
    case "category":
      return (
        <NativeSelect {...common} value={textValue} onChange={(event) => onCommit(event.currentTarget.value || null)} className="max-w-56">
          <NativeSelectOption value="">Choose a category</NativeSelectOption>
          {CATEGORIES.map((category) => (
            <NativeSelectOption key={category} value={category}>
              {CATEGORY_LABELS[category]}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      );
    case "boolean":
      return (
        <ToggleGroup
          type="single"
          variant="outline"
          aria-labelledby={labelId}
          aria-describedby={describedBy}
          value={value === true ? "yes" : value === false ? "no" : ""}
          onValueChange={(next) => onCommit(next === "yes" ? true : next === "no" ? false : null)}
          className="gap-2"
        >
          <ToggleGroupItem id={inputId} value="yes" className="min-w-20 data-[state=on]:border-primary data-[state=on]:bg-accent data-[state=on]:font-medium data-[state=on]:text-accent-foreground">
            Yes
          </ToggleGroupItem>
          <ToggleGroupItem value="no" className="min-w-20 data-[state=on]:border-primary data-[state=on]:bg-accent data-[state=on]:font-medium data-[state=on]:text-accent-foreground">
            No
          </ToggleGroupItem>
        </ToggleGroup>
      );
    case "permission":
      return (
        <RadioGroup aria-labelledby={labelId} aria-describedby={describedBy} value={textValue} onValueChange={(next) => onCommit(next)} className="gap-1">
          {[
            ["dentistApproved", "Yes — my dentist gave me other dates I may choose"],
            ["unknown", "I don't know — keep the planned date"],
          ].map(([optionValue, optionLabel], index) => (
            <label key={optionValue} htmlFor={index === 0 ? inputId : `${inputId}-${optionValue}`} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-1">
              <RadioGroupItem id={index === 0 ? inputId : `${inputId}-${optionValue}`} value={optionValue} aria-invalid={invalid || undefined} />
              <span>{optionLabel}</span>
            </label>
          ))}
        </RadioGroup>
      );
    case "procedureList": {
      const selected = new Set(textValue.split(",").filter(Boolean));
      if (otherProcedures.length === 0) return <p className="text-sm text-muted-foreground">Add other procedures to set an order.</p>;
      return (
        <div role="group" aria-labelledby={labelId} aria-describedby={describedBy} className="flex flex-wrap gap-x-5 gap-y-1">
          {otherProcedures.map((procedure, index) => {
            const checkboxId = index === 0 ? inputId : `${inputId}-${procedure.id}`;
            return (
              <label key={procedure.id} htmlFor={checkboxId} className="flex min-h-11 cursor-pointer items-center gap-2">
                <Checkbox
                  id={checkboxId}
                  checked={selected.has(procedure.id)}
                  onCheckedChange={(checked) => {
                    const next = new Set(selected);
                    if (checked === true) next.add(procedure.id);
                    else next.delete(procedure.id);
                    onCommit(next.size > 0 ? [...next].sort().join(",") : null);
                  }}
                />
                {procedure.label}
              </label>
            );
          })}
        </div>
      );
    }
  }
}
