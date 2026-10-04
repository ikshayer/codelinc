"use client";

import { useId, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { StatusChip } from "@/components/shared/status-chip";
import { factDisplayStatus } from "@/lib/domain/draft";
import { isValidIsoDate } from "@/lib/domain/dates";
import { CATEGORIES, CATEGORY_LABELS, getFieldDefinition } from "@/lib/domain/fields";
import { parseDollarsToCents, parsePercentToBasisPoints } from "@/lib/domain/money";
import type { DraftFact, FieldValue } from "@/lib/domain/types";
import { cn } from "@/lib/utils";

import { formatProposedValue } from "./voice-extraction";

function toEditText(value: FieldValue): string {
  if (value === null) return "";
  return typeof value === "boolean" ? (value ? "yes" : "no") : value;
}

/** Returns the value to store, or an error message. Mirrors the checks the Confirm screen applies. */
function readEdit(fieldPath: string, text: string): { ok: true; value: FieldValue } | { ok: false; message: string } {
  const trimmed = text.trim();
  switch (getFieldDefinition(fieldPath).kind) {
    case "boolean":
      return { ok: true, value: trimmed === "yes" };
    case "money": {
      const parsed = parseDollarsToCents(trimmed);
      return parsed.ok ? { ok: true, value: trimmed } : { ok: false, message: parsed.message };
    }
    case "percent": {
      const parsed = parsePercentToBasisPoints(trimmed);
      return parsed.ok ? { ok: true, value: trimmed } : { ok: false, message: parsed.message };
    }
    case "date":
      return isValidIsoDate(trimmed) ? { ok: true, value: trimmed } : { ok: false, message: "Enter a date like 2026-12-31." };
    default:
      return trimmed === "" ? { ok: false, message: "Enter a value." } : { ok: true, value: trimmed };
  }
}

/** A gathered value with its review status and an inline correction. Edits go through the shared draft. */
export function EditableFactRow({ fact, label, onEdit }: { fact: DraftFact; label: string; onEdit(fieldPath: string, value: FieldValue): void }) {
  const inputId = useId();
  const errorId = useId();
  const definition = getFieldDefinition(fact.fieldPath);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);

  const begin = () => {
    setText(toEditText(fact.value));
    setError(null);
    setEditing(true);
  };

  const save = (event: FormEvent) => {
    event.preventDefault();
    const result = readEdit(fact.fieldPath, text);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    onEdit(fact.fieldPath, result.value);
    setEditing(false);
  };

  if (editing) {
    return (
      <form onSubmit={save} className="space-y-2 py-3">
        <label htmlFor={inputId} className="text-sm font-medium">
          {label}
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          {definition.kind === "boolean" ? (
            <NativeSelect id={inputId} value={text} onChange={(event) => setText(event.target.value)} className="w-full sm:w-48">
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </NativeSelect>
          ) : definition.kind === "category" ? (
            <NativeSelect id={inputId} value={text} onChange={(event) => setText(event.target.value)} className="w-full sm:w-48">
              {CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {CATEGORY_LABELS[category]}
                </option>
              ))}
            </NativeSelect>
          ) : (
            <Input
              id={inputId}
              value={text}
              onChange={(event) => setText(event.target.value)}
              aria-invalid={error !== null}
              aria-describedby={error ? errorId : undefined}
              inputMode={definition.kind === "money" || definition.kind === "percent" ? "decimal" : undefined}
              className="sm:max-w-xs"
              autoFocus
            />
          )}
          <div className="flex gap-2">
            <Button type="submit">Save</Button>
            <Button type="button" variant="outline" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </div>
        {error && (
          <p id={errorId} className="text-sm text-destructive">
            {error}
          </p>
        )}
      </form>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3">
      <div className="min-w-0">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className={cn("font-medium", definition.kind === "money" && "tabular")}>{formatProposedValue(fact.fieldPath, fact.value)}</p>
      </div>
      <div className="flex items-center gap-3">
        <StatusChip status={factDisplayStatus(fact)} />
        <Button variant="ghost" size="sm" onClick={begin} aria-label={`Edit ${label}`}>
          Edit
        </Button>
      </div>
    </div>
  );
}
