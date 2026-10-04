"use client";

import { useId, useState, type FormEvent, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ChevronDownIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { compareIso, isoFromParts, partsFromIso, todayIso } from "@/lib/domain/dates";
import type { PatientDetails } from "@/lib/domain/types";

// "Who is this analysis for?" — shared by New analysis and Profile so both
// use the same controls (FRONTEND_DESIGN.md §5, §12). Identity never enters
// the benefits calculation.

interface IdentityFormProps {
  initial: PatientDetails | null;
  submitLabel: string;
  onSubmit: (details: PatientDetails) => void;
  /** Extra actions beside the submit button, e.g. "Continue with Google". */
  secondary?: ReactNode;
  busy?: boolean;
  compact?: boolean;
}

type Errors = Partial<Record<"displayName" | "dateOfBirth" | "contactEmail", string>>;

interface Values {
  displayName: string;
  fullName: string;
  month: string;
  day: string;
  year: string;
  contactEmail: string;
}

function validate(values: Values): { errors: Errors; details: PatientDetails | null } {
  const errors: Errors = {};
  const displayName = values.displayName.trim();
  if (!displayName) errors.displayName = "Enter the name to show on this analysis.";
  else if (displayName.length > 80) errors.displayName = "Use 80 characters or fewer.";

  let dateOfBirth: string | undefined;
  const anyDob = values.month || values.day || values.year;
  if (anyDob) {
    const iso = isoFromParts(values.month.trim(), values.day.trim(), values.year.trim());
    if (!iso) errors.dateOfBirth = "Enter a real date as month, day and four-digit year, or leave all three blank.";
    else if (compareIso(iso, todayIso()) > 0) errors.dateOfBirth = "Date of birth can't be in the future.";
    else if (compareIso(iso, "1900-01-01") < 0) errors.dateOfBirth = "Check the year.";
    else dateOfBirth = iso;
  }

  const contactEmail = values.contactEmail.trim();
  if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) errors.contactEmail = "Enter an email like name@example.com, or leave it blank.";

  if (Object.keys(errors).length > 0) return { errors, details: null };
  return {
    errors,
    details: {
      displayName,
      fullName: values.fullName.trim() || undefined,
      dateOfBirth,
      contactEmail: contactEmail || undefined,
    },
  };
}

export function IdentityForm({ initial, submitLabel, onSubmit, secondary, busy, compact = false }: IdentityFormProps) {
  const id = useId();
  const dob = partsFromIso(initial?.dateOfBirth);
  const [values, setValues] = useState<Values>({
    displayName: initial?.displayName ?? "",
    fullName: initial?.fullName ?? "",
    month: dob.month,
    day: dob.day,
    year: dob.year,
    contactEmail: initial?.contactEmail ?? "",
  });
  // Errors appear after blur or submit, not on every keystroke.
  const [touched, setTouched] = useState<Partial<Record<keyof Errors, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);
  const [optionalOpen, setOptionalOpen] = useState(!compact);
  const { errors } = validate(values);
  const visible = (key: keyof Errors) => (submitted || touched[key] ? errors[key] : undefined);

  const set = (key: keyof Values) => (event: React.ChangeEvent<HTMLInputElement>) => setValues((v) => ({ ...v, [key]: event.target.value }));
  const blur = (key: keyof Errors) => () => setTouched((t) => ({ ...t, [key]: true }));

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitted(true);
    const result = validate(values);
    if (!result.details) {
      const first = Object.keys(result.errors)[0];
      const target = first === "dateOfBirth" ? `${id}-dob-month` : `${id}-${first}`;
      if (first === "contactEmail") setOptionalOpen(true);
      requestAnimationFrame(() => document.getElementById(target)?.focus());
      return;
    }
    onSubmit(result.details);
  }

  const dobError = visible("dateOfBirth");

  return (
    <form onSubmit={handleSubmit} noValidate className={cn("space-y-6", compact && "rounded-xl border bg-card p-5 shadow-xs sm:p-7")}>
      <FieldGroup>
        <Field data-invalid={Boolean(visible("displayName"))}>
          <FieldLabel htmlFor={`${id}-displayName`}>Name</FieldLabel>
          <Input
            id={`${id}-displayName`}
            value={values.displayName}
            onChange={set("displayName")}
            onBlur={blur("displayName")}
            autoComplete="name"
            placeholder="e.g. Alex Morgan"
            aria-invalid={Boolean(visible("displayName"))}
            aria-describedby={`${id}-displayName-help${visible("displayName") ? ` ${id}-displayName-error` : ""}`}
            className="max-w-md"
          />
          <FieldDescription id={`${id}-displayName-help`}>Shown on your analysis and saved comparisons.</FieldDescription>
          {visible("displayName") && <FieldError id={`${id}-displayName-error`}>{visible("displayName")}</FieldError>}
        </Field>

        <FieldSet aria-describedby={`${id}-dob-help${dobError ? ` ${id}-dob-error` : ""}`} data-invalid={Boolean(dobError)}>
          <FieldLegend variant="label">
            Date of birth <span className="font-normal text-muted-foreground">(optional)</span>
          </FieldLegend>
          <div className="grid max-w-[296px] grid-cols-[1fr_1fr_1.4fr] gap-3">
            {(
              [
                ["month", "Month", "MM", 2],
                ["day", "Day", "DD", 2],
                ["year", "Year", "YYYY", 4],
              ] as const
            ).map(([key, label, placeholder, maxLength]) => (
              <Field key={key} className="min-w-0">
                <FieldLabel htmlFor={`${id}-dob-${key}`} className="text-sm font-normal text-muted-foreground">
                  {label}
                </FieldLabel>
                <Input
                  id={`${id}-dob-${key}`}
                  value={values[key]}
                  onChange={(event) => setValues((v) => ({ ...v, [key]: event.target.value.replace(/\D/g, "").slice(0, maxLength) }))}
                  onBlur={blur("dateOfBirth")}
                  inputMode="numeric"
                  autoComplete={`bday-${key}`}
                  placeholder={placeholder}
                  aria-invalid={Boolean(dobError)}
                  className="tabular"
                />
              </Field>
            ))}
          </div>
          <FieldDescription id={`${id}-dob-help`}>Not needed for the benefits estimate and never sent to the calculation.</FieldDescription>
          {dobError && <FieldError id={`${id}-dob-error`}>{dobError}</FieldError>}
        </FieldSet>

        <details open={optionalOpen} onToggle={(event) => setOptionalOpen(event.currentTarget.open)} className="group rounded-lg border bg-muted/20 px-4">
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-2 text-sm font-medium [&::-webkit-details-marker]:hidden">
            More details (optional)
            <ChevronDownIcon aria-hidden className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
          </summary>
          <div className="space-y-5 border-t py-5">
            <Field>
              <FieldLabel htmlFor={`${id}-fullName`}>Full name <span className="font-normal text-muted-foreground">(optional)</span></FieldLabel>
              <Input id={`${id}-fullName`} value={values.fullName} onChange={set("fullName")} autoComplete="name" className="max-w-md" />
            </Field>
            <Field data-invalid={Boolean(visible("contactEmail"))}>
              <FieldLabel htmlFor={`${id}-contactEmail`}>
                Email <span className="font-normal text-muted-foreground">(optional)</span>
              </FieldLabel>
              <Input
                id={`${id}-contactEmail`}
                type="email"
                value={values.contactEmail}
                onChange={set("contactEmail")}
                onBlur={blur("contactEmail")}
                autoComplete="email"
                aria-invalid={Boolean(visible("contactEmail"))}
                aria-describedby={visible("contactEmail") ? `${id}-contactEmail-error` : undefined}
                className="max-w-md"
              />
              {visible("contactEmail") && <FieldError id={`${id}-contactEmail-error`}>{visible("contactEmail")}</FieldError>}
            </Field>
          </div>
        </details>
      </FieldGroup>

      {submitted && Object.keys(errors).length > 0 && (
        <p role="alert" className="text-sm text-destructive">
          Fix the highlighted {Object.keys(errors).length === 1 ? "field" : "fields"} to continue.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={busy} className={compact ? "w-full sm:w-auto" : undefined}>
          {submitLabel}
        </Button>
        {secondary}
      </div>
    </form>
  );
}
