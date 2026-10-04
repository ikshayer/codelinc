"use client";

import { AlertCircleIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";

import { Page, PageHeader } from "@/components/shared/page";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { factDisplayStatus } from "@/lib/domain/draft";
import { carePaths, fieldDefinitions, getFieldDefinition, isKnownFieldPath } from "@/lib/domain/fields";
import { buildConfirmedScenario } from "@/lib/domain/scenario";
import type { ValidationIssue } from "@/lib/domain/types";
import { useAnalysis, useAnalysisController } from "../analysis-provider";
import { fieldContainerId, fieldDomId } from "../components/fact-field";
import { CareGroup, PlanGroup, TimingGroup, type FieldErrors } from "../components/fact-groups";

const GROUP_ANCHORS: Record<string, string> = { plan: "group-plan-title", care: "group-care-title", "care.overflow": "group-care-title" };

function focusIssue(path: string) {
  const input = document.getElementById(fieldDomId(path));
  const container = document.getElementById(fieldContainerId(path)) ?? document.getElementById(GROUP_ANCHORS[path] ?? "");
  container?.scrollIntoView({ block: "center" });
  (input ?? container)?.focus({ preventScroll: true });
}

function issueLabel(issue: ValidationIssue, procedureLabel: (id: string) => string): string {
  if (!isKnownFieldPath(issue.fieldPath)) return issue.fieldPath === "care.overflow" ? "Extra procedures" : "Details";
  const definition = getFieldDefinition(issue.fieldPath);
  return definition.procedureId ? `${procedureLabel(definition.procedureId)}: ${definition.label}` : definition.label;
}

export function ConfirmScreen({ analysisId }: { analysisId: string }) {
  const analysis = useAnalysis(analysisId);
  const controller = useAnalysisController();
  const router = useRouter();
  const [attempted, setAttempted] = useState(false);
  const [confirmationMissing, setConfirmationMissing] = useState<("financial" | "timing")[]>([]);
  const summaryRef = useRef<HTMLDivElement>(null);
  const financialRef = useRef<HTMLButtonElement>(null);
  const timingRef = useRef<HTMLButtonElement>(null);

  const build = useMemo(() => (analysis ? buildConfirmedScenario(analysis.draft) : null), [analysis]);
  if (!analysis || !build) return null;

  // The summary persists after a Compare attempt and updates as issues are fixed.
  const issues = attempted && !build.ok ? build.issues : [];
  const errors: FieldErrors = Object.fromEntries(issues.map((issue) => [issue.fieldPath, issue.message]));

  const fields = fieldDefinitions(analysis.draft.procedureIds);
  const statusCounts = fields.reduce(
    (counts, field) => {
      const status = factDisplayStatus(analysis.draft.facts[field.path]);
      if (status === "conflict") counts.conflict += 1;
      else if (status === "missing" && field.required) counts.missing += 1;
      return counts;
    },
    { missing: 0, conflict: 0 },
  );

  const calculating = analysis.result.status === "calculating";
  const procedureLabel = (id: string) => {
    const value = analysis.draft.facts[carePaths.label(id)]?.value;
    return typeof value === "string" && value ? value : "Unnamed procedure";
  };

  function handleCompare() {
    setAttempted(true);
    const attempt = controller.compare(analysisId);
    if (attempt.status === "blocked") {
      setConfirmationMissing([]);
      requestAnimationFrame(() => {
        summaryRef.current?.focus();
      });
      return;
    }
    if (attempt.status === "needsConfirmation") {
      setConfirmationMissing(attempt.missing);
      (attempt.missing[0] === "financial" ? financialRef : timingRef).current?.focus();
      return;
    }
    router.push(`/analysis/${analysisId}/compare`);
  }

  return (
    <Page>
      <PageHeader
        title="Review your details"
        description="Check every value and where it came from. Nothing is compared until you confirm, and your dentist's timing needs its own confirmation."
      />

      {issues.length > 0 && (
        <div ref={summaryRef} tabIndex={-1} className="mb-8 outline-none">
          <Alert variant="destructive" role="alert">
            <AlertCircleIcon aria-hidden />
            <AlertTitle className="font-medium">
              {issues.length === 1 ? "1 detail needs attention before comparing" : `${issues.length} details need attention before comparing`}
            </AlertTitle>
            <AlertDescription>
              <ul className="mt-2 space-y-1">
                {issues.map((issue) => (
                  <li key={`${issue.fieldPath}-${issue.code}`}>
                    <a
                      href={`#${fieldContainerId(issue.fieldPath)}`}
                      onClick={(event) => {
                        event.preventDefault();
                        focusIssue(issue.fieldPath);
                      }}
                      className="underline underline-offset-4"
                    >
                      {issueLabel(issue, procedureLabel)}
                    </a>
                    : {issue.message}
                  </li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        </div>
      )}

      {!attempted && (statusCounts.missing > 0 || statusCounts.conflict > 0) && (
        <p className="mb-6 text-sm text-muted-foreground">
          {statusCounts.missing > 0 && `${statusCounts.missing} required ${statusCounts.missing === 1 ? "value is" : "values are"} missing. `}
          {statusCounts.conflict > 0 && `${statusCounts.conflict} ${statusCounts.conflict === 1 ? "value has" : "values have"} conflicting sources.`}
        </p>
      )}

      <div className="space-y-8">
        <PlanGroup analysisId={analysisId} errors={errors} />
        <CareGroup analysisId={analysisId} errors={errors} />
        <TimingGroup analysisId={analysisId} errors={errors} />

        <section aria-labelledby="confirm-title" className="rounded-lg border bg-muted/30 px-5 py-6 md:px-6">
          <h2 id="confirm-title" className="text-xl font-semibold tracking-tight">
            Everything look right?
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">Estimates use exactly the values above. Payment is not guaranteed.</p>
          <div className="mt-5 space-y-4">
            <ConfirmCheck
              ref={financialRef}
              id="confirm-financial"
              checked={analysis.confirmation.financialConfirmed}
              onChange={(value) => controller.setFinancialConfirmed(analysisId, value)}
              label="My plan and prescribed care details are correct."
              help="This confirms the plan and care sections together. Editing any value clears it."
              error={confirmationMissing.includes("financial") && !analysis.confirmation.financialConfirmed ? "Confirm your plan and care details to compare." : undefined}
            />
            <ConfirmCheck
              ref={timingRef}
              id="confirm-timing"
              checked={analysis.confirmation.timingAffirmed}
              onChange={(value) => controller.setTimingAffirmed(analysisId, value)}
              label="The timing options came from my dentist, or are the synthetic sample."
              help="CareWindow never decides when care is safe. Confirming the plan doesn't confirm timing."
              error={confirmationMissing.includes("timing") && !analysis.confirmation.timingAffirmed ? "Confirm where the timing came from to compare." : undefined}
            />
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Button size="lg" onClick={handleCompare} disabled={calculating}>
              {calculating ? "Comparing…" : "Compare my options"}
            </Button>
            <Button asChild variant="ghost">
              <Link href={`/analysis/${analysisId}/intake`}>Back to describe</Link>
            </Button>
          </div>
        </section>
      </div>
    </Page>
  );
}

function ConfirmCheck({
  ref,
  id,
  checked,
  onChange,
  label,
  help,
  error,
}: {
  ref: React.Ref<HTMLButtonElement>;
  id: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  help: string;
  error?: string;
}) {
  return (
    <div className="flex gap-3">
      <Checkbox
        ref={ref}
        id={id}
        checked={checked}
        onCheckedChange={(value) => onChange(value === true)}
        aria-describedby={`${id}-help${error ? ` ${id}-error` : ""}`}
        aria-invalid={Boolean(error) || undefined}
        className="mt-0.5 size-5"
      />
      <div>
        <label htmlFor={id} className="cursor-pointer font-medium">
          {label}
        </label>
        <p id={`${id}-help`} className="text-sm text-muted-foreground">
          {help}
        </p>
        {error && (
          <p id={`${id}-error`} className="mt-1 text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
