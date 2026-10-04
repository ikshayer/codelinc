"use client";

import { AlertCircleIcon } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { EASE_OUT, Stagger, StaggerItem } from "@/components/motion/reveal";
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
  const details = container?.closest("details");
  if (details) details.open = true;
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
  useEffect(() => {
    function revealHash() {
      let id: string;
      try { id = decodeURIComponent(window.location.hash.slice(1)); } catch { return; }
      if (!id) return;
      const target = document.getElementById(id);
      const details = target?.closest("details");
      if (details) details.open = true;
      requestAnimationFrame(() => target?.scrollIntoView({ block: "start" }));
    }
    revealHash();
    window.addEventListener("hashchange", revealHash);
    return () => window.removeEventListener("hashchange", revealHash);
  }, []);
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
  const importedIssues = Object.values(analysis.draft.evidence).flatMap((item) => item.blockingIssues ?? []);
  const reviewNotes = [...new Set(Object.values(analysis.draft.evidence).flatMap((item) => item.reviewNotes ?? []))];
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
        description="Review your plan, prescribed care and dentist-approved timing. Then confirm the details to compare."
      />

      {importedIssues.length > 0 && (
        <Alert variant="destructive" role="alert" className="mb-6">
          <AlertCircleIcon aria-hidden />
          <AlertTitle>This member&apos;s plan needs a supported calculation service</AlertTitle>
          <AlertDescription><ul className="list-disc space-y-1 pl-4">{importedIssues.map((issue, index) => <li key={`${issue.code}-${index}`}>{issue.message}</li>)}</ul></AlertDescription>
        </Alert>
      )}
      {reviewNotes.length > 0 && (
        <div className="mb-6 space-y-2 text-sm text-muted-foreground">{reviewNotes.map((note) => <p key={note}>{note}</p>)}</div>
      )}

      <AnimatePresence>
      {issues.length > 0 && (
        <motion.div
          ref={summaryRef}
          tabIndex={-1}
          initial={{ opacity: 0, y: -8, height: 0 }}
          animate={{ opacity: 1, y: 0, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.3, ease: EASE_OUT }}
          className="mb-8 overflow-hidden outline-none"
        >
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
        </motion.div>
      )}
      </AnimatePresence>

      {!attempted && (statusCounts.missing > 0 || statusCounts.conflict > 0) && (
        <p className="mb-6 text-sm text-muted-foreground">
          {statusCounts.missing > 0 && `${statusCounts.missing} required ${statusCounts.missing === 1 ? "value is" : "values are"} missing. `}
          {statusCounts.conflict > 0 && `${statusCounts.conflict} ${statusCounts.conflict === 1 ? "value has" : "values have"} conflicting sources.`}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-12 lg:items-start">
      <div className="min-w-0 lg:col-span-8">
      <nav aria-label="Review sections" className="sticky top-14 z-20 mb-6 grid grid-cols-4 gap-1 rounded-lg border bg-background/95 p-1 backdrop-blur md:top-16">
        {[['group-plan-title', 'Plan'], ['group-care-title', 'Care'], ['group-timing-title', 'Timing'], ['confirm-title', 'Confirm']].map(([id, label]) => (
          <a key={id} href={`#${id}`} className="flex min-h-11 items-center justify-center rounded-md px-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-primary" onClick={() => {
            const details = document.getElementById(id)?.closest("details");
            if (details) details.open = true;
          }}>{label}</a>
        ))}
      </nav>

      <Stagger className="space-y-5" gap={0.08}>
        <StaggerItem><PlanGroup analysisId={analysisId} errors={errors} collapsible /></StaggerItem>
        <StaggerItem><CareGroup analysisId={analysisId} errors={errors} collapsible /></StaggerItem>
        <StaggerItem><TimingGroup analysisId={analysisId} errors={errors} collapsible /></StaggerItem>
      </Stagger>
      </div>

        <motion.section
          aria-labelledby="confirm-title"
          initial={{ opacity: 0, x: 16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.55, delay: 0.25, ease: EASE_OUT }}
          className="rounded-xl border border-t-4 border-t-brand bg-card px-5 py-6 shadow-[0_24px_48px_-28px_rgba(101,0,48,0.35)] md:px-6 lg:sticky lg:top-24 lg:col-span-4"
        >
          <h2 id="confirm-title" className="scroll-mt-36 font-display text-2xl font-semibold tracking-tight">
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
          <div className="mt-6 flex flex-col gap-2">
            <motion.div whileTap={{ scale: 0.98 }}>
              <Button size="lg" onClick={handleCompare} disabled={calculating} className="w-full">
                {calculating ? "Comparing…" : "Compare my options"}
              </Button>
            </motion.div>
            <Button asChild variant="ghost" className="w-full">
              <Link href={`/analysis/${analysisId}/intake`}>Back to describe</Link>
            </Button>
          </div>
        </motion.section>
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
