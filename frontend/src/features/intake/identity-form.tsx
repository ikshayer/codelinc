"use client";

import { useId, useState, type FormEvent, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { compareIso, isoFromParts, partsFromIso, todayIso } from "@/lib/domain/dates";
import type { PatientDetails } from "@/lib/domain/types";

// "Who is this analysis for?" — shared by New analysis and Profile so both
// use the same required name and birth-date controls. Member lookup is handled
// by the New analysis screen before any member benefits are imported.

interface IdentityFormProps {
  initial: PatientDetails | null;
  submitLabel: string;
  onSubmit: (details: PatientDetails) => void;
  /** Extra actions beside the submit button, e.g. "Continue with Google". */
  secondary?: ReactNode;
  busy?: boolean;
  compact?: boolean;
}

type Errors = Partial<Record<"memberId" | "dateOfBirth", string>>;

interface Values {
  displayName: string;
  fullName: string;
  month: string;
  day: string;
  year: string;
  contactEmail: string;
  memberId: string;
}

export function validateIdentity(values: Values): { errors: Errors; details: PatientDetails | null } {
  const errors: Errors = {};
  const memberId = values.memberId.trim();
  if (!memberId) errors.memberId = "Enter the member ID.";
  else if (memberId.length > 128) errors.memberId = "Use 128 characters or fewer.";
  const displayName = values.displayName.trim() || memberId;

  let dateOfBirth: string | undefined;
  const anyDob = values.month || values.day || values.year;
  if (anyDob) {
    const iso = isoFromParts(values.month.trim(), values.day.trim(), values.year.trim());
    if (!iso) errors.dateOfBirth = "Enter a real date as month, day and four-digit year, ";
    else if (compareIso(iso, todayIso()) > 0) errors.dateOfBirth = "Date of birth can't be in the future.";
    else if (compareIso(iso, "1900-01-01") < 0) errors.dateOfBirth = "Check the year.";
    else dateOfBirth = iso;
  }

  const contactEmail = values.contactEmail.trim();
  if (!dateOfBirth && !errors.dateOfBirth) errors.dateOfBirth = "Enter the date of birth to look up this member’s benefits.";

  if (Object.keys(errors).length > 0) return { errors, details: null };
  return {
    errors,
    details: {
      displayName,
      fullName: values.fullName.trim() || undefined,
      dateOfBirth,
      contactEmail: contactEmail || undefined,
      memberId,
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
    memberId: initial?.memberId ?? "",
  });
  // Errors appear after blur or submit, not on every keystroke.
  const [touched, setTouched] = useState<Partial<Record<keyof Errors, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);
  const { errors } = validateIdentity(values);
  const visible = (key: keyof Errors) => (submitted || touched[key] ? errors[key] : undefined);

  const set = (key: keyof Values) => (event: React.ChangeEvent<HTMLInputElement>) => setValues((v) => ({ ...v, [key]: event.target.value }));
  const blur = (key: keyof Errors) => () => setTouched((t) => ({ ...t, [key]: true }));

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitted(true);
    const result = validateIdentity(values);
    if (!result.details) {
      const first = Object.keys(result.errors)[0];
      const target = first === "dateOfBirth" ? `${id}-dob-month` : `${id}-${first}`;
      requestAnimationFrame(() => document.getElementById(target)?.focus());
      return;
    }
    onSubmit(result.details);
  }

  const dobError = visible("dateOfBirth");

  return (
    <form onSubmit={handleSubmit} noValidate className={cn("space-y-6", compact && "rounded-xl border bg-card p-5 shadow-xs sm:p-7")}>
      <fieldset disabled={busy} className="contents"><FieldGroup>
        <Field data-invalid={Boolean(visible("memberId"))}>
          <FieldLabel htmlFor={`${id}-memberId`}>Member ID</FieldLabel>
          <Input id={`${id}-memberId`} value={values.memberId} onChange={set("memberId")} onBlur={blur("memberId")} required aria-required="true" autoComplete="off" placeholder="e.g. SYN-MEMBER-0002" aria-invalid={Boolean(visible("memberId"))} aria-describedby={`${id}-memberId-help`} className="max-w-md" />
          <FieldDescription id={`${id}-memberId-help`}>Use the member ID from the synthetic member record.</FieldDescription>
          {visible("memberId") && <FieldError>{visible("memberId")}</FieldError>}
        </Field>

        <FieldSet aria-describedby={`${id}-dob-help${dobError ? ` ${id}-dob-error` : ""}`} data-invalid={Boolean(dobError)}>
          <FieldLegend variant="label">
            Date of birth
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
                  required
                  aria-required="true"
                  inputMode="numeric"
                  autoComplete={`bday-${key}`}
                  placeholder={placeholder}
                  aria-invalid={Boolean(dobError)}
                  className="tabular"
                />
              </Field>
            ))}
          </div>
          <FieldDescription id={`${id}-dob-help`}>Member ID and date of birth are required. Both must match the synthetic record to load benefits.</FieldDescription>
          {dobError && <FieldError id={`${id}-dob-error`}>{dobError}</FieldError>}
        </FieldSet>


      </FieldGroup></fieldset>

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
