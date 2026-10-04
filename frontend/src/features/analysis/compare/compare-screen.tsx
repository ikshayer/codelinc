"use client";

import { FileSearchIcon, TriangleAlertIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { EmptyState, ErrorPanel } from "@/components/shared/feedback";
import { Page, PageHeader } from "@/components/shared/page";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { buildConfirmedScenario } from "@/lib/domain/scenario";
import { timingPaths } from "@/lib/domain/fields";
import { formatCents } from "@/lib/domain/money";
import type { ISODate, ProcedureId, ScenarioComparison, ValidationIssue } from "@/lib/domain/types";
import { fieldContainerId } from "../components/fact-field";
import { useAnalysis, useAnalysisController, type CompareAttempt } from "../analysis-provider";
import { currentResult, labelForField, type AnalysisRecord } from "../state";
import { ComparisonView } from "./comparison-view";
import { ConfirmLinkProvider } from "./confirm-links";
import { DeadlineEditor } from "./deadline-editor";
import { EQUAL_COST_TEXT, hasDeadlineRejection, NO_CHEAPER_TEXT, TIMING_PRIORITY_TEXT } from "./explanations";
import { SaveControls } from "./save-controls";

function announce(comparison: ScenarioComparison): string {
  switch (comparison.status) {
    case "cheaperPermittedAlternative":
      return `Updated comparison: ${formatCents(comparison.patientReductionCents)} lower estimated patient cost under these confirmed assumptions.`;
    case "baselineBest":
      return `Updated comparison: ${NO_CHEAPER_TEXT}${hasDeadlineRejection(comparison) ? ` ${TIMING_PRIORITY_TEXT}` : ""}`;
    case "equalCost":
      return `Updated comparison: ${EQUAL_COST_TEXT}`;
  }
}

function CompareSkeleton() {
  return (
    <div className="space-y-8" role="status" aria-live="polite">
      <span className="sr-only">Calculating your comparison.</span>
      <div className="grid gap-px overflow-hidden rounded-lg border md:grid-cols-2" aria-hidden>
        {[0, 1].map((key) => (
          <div key={key} className="space-y-5 p-8">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-12 w-44" />
            <Skeleton className="h-7 w-32" />
            <Skeleton className="h-16 w-full" />
          </div>
        ))}
      </div>
      <Skeleton className="h-8 w-3/4" aria-hidden />
      <Skeleton className="h-40 w-full" aria-hidden />
    </div>
  );
}

function BlockedIssues({ analysisId, issues }: { analysisId: string; issues: ValidationIssue[] }) {
  return (
    <Alert variant="warning" role="alert" className="mb-6 text-left">
      <TriangleAlertIcon aria-hidden />
      <AlertTitle className="font-medium">Your edit needs another look</AlertTitle>
      <AlertDescription>
        <ul className="mt-1 space-y-1">
          {issues.map((issue) => (
            <li key={`${issue.fieldPath}-${issue.code}`}>
              <Link href={`/analysis/${analysisId}/confirm#${fieldContainerId(issue.fieldPath)}`} className="underline underline-offset-4">
                {labelForField(issue.fieldPath)}
              </Link>
              : {issue.message}
            </li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  );
}

/** Route body for /analysis/[id]/compare. The frame and stepper come from the layout. */
export function CompareScreen({ analysisId }: { analysisId: string }) {
  const router = useRouter();
  const controller = useAnalysisController();
  const analysis = useAnalysis(analysisId);
  const [editApplied, setEditApplied] = useState(false);
  const [blockedIssues, setBlockedIssues] = useState<ValidationIssue[] | null>(null);

  const draft = analysis?.draft;
  const scenario = useMemo(() => {
    const built = draft ? buildConfirmedScenario(draft) : null;
    return built?.ok ? built.scenario : null;
  }, [draft]);

  if (!analysis) return null;

  const confirmHref = `/analysis/${analysisId}/confirm`;
  const current = currentResult(analysis);
  const result = analysis.result;

  function handleAttempt(attempt: CompareAttempt) {
    if (attempt.status === "blocked") setBlockedIssues(attempt.issues);
    else if (attempt.status === "needsConfirmation") router.push(confirmHref);
  }

  function retry() {
    setBlockedIssues(null);
    handleAttempt(controller.compare(analysisId));
  }

  function applyDeadline(procedureId: ProcedureId, deadline: ISODate) {
    setBlockedIssues(null);
    setEditApplied(true);
    // Editing hides the current result immediately; the checkbox is the separate affirmation for this edit.
    controller.editFact(analysisId, timingPaths.deadline(procedureId), deadline);
    controller.setTimingAffirmed(analysisId, true);
    handleAttempt(controller.compare(analysisId));
  }

  function startOver(record: AnalysisRecord) {
    const id = controller.startSampleAnalysis(record.patient);
    router.push(`/analysis/${id}/confirm`);
  }

  const liveMessage = !editApplied
    ? ""
    : result.status === "calculating"
      ? "Updating your comparison."
      : current
        ? announce(current.comparison)
        : result.status === "none"
          ? "The estimate was removed. Review your details to compare again."
          : "";

  let body;
  if (current && scenario) {
    const procedureLabels = Object.fromEntries(scenario.procedures.map((procedure) => [procedure.id, procedure.label]));
    const saved = analysis.saved?.revision === current.revision ? analysis.saved : null;
    body = (
      <>
        <PageHeader
          title="Compare your options"
          description="Estimated costs for the dates your dentist has already approved. Select a procedure to see how it was calculated."
        />
        <ConfirmLinkProvider analysisId={analysisId}>
          <ComparisonView
            comparison={current.comparison}
            scenario={scenario}
            procedureLabels={procedureLabels}
            sourceMode={current.sourceMode}
            fixtureName={current.fixtureName}
            confirmedAt={current.confirmedAt}
            historical={false}
          />
        </ConfirmLinkProvider>
        <section aria-labelledby="actions-heading" className="mt-12 space-y-6 border-t pt-8">
          <h2 id="actions-heading" className="text-xl font-semibold tracking-tight md:text-section">
            Next steps
          </h2>
          <DeadlineEditor scenario={scenario} procedureLabels={procedureLabels} onApply={applyDeadline} />
          <SaveControls analysisId={analysisId} saved={saved} />
        </section>
      </>
    );
  } else if (result.status === "calculating") {
    body = (
      <>
        <PageHeader title="Compare your options" description="Calculating your comparison." />
        <CompareSkeleton />
      </>
    );
  } else if (result.status === "unavailable") {
    body = (
      <EmptyState icon={FileSearchIcon} title="We can't calculate this comparison yet" description={result.message}>
        <Button asChild>
          <Link href={confirmHref}>Review details</Link>
        </Button>
        <Button variant="outline" onClick={() => startOver(analysis)}>
          Start over with the sample
        </Button>
      </EmptyState>
    );
  } else if (result.status === "failed") {
    body = (
      <ErrorPanel title="We couldn't calculate this comparison" error={result.error} onRetry={retry}>
        <Button asChild variant="outline" size="sm">
          <Link href={confirmHref}>Review details</Link>
        </Button>
      </ErrorPanel>
    );
  } else {
    body = (
      <>
        {blockedIssues && <BlockedIssues analysisId={analysisId} issues={blockedIssues} />}
        <EmptyState
          icon={FileSearchIcon}
          title="No current estimate"
          description="Your details changed or haven't been confirmed yet, so there's no estimate to show. Review and confirm your details to compare again."
        >
          <Button asChild>
            <Link href={confirmHref}>Review details</Link>
          </Button>
        </EmptyState>
      </>
    );
  }

  return (
    <Page>
      <div aria-live="polite" className="sr-only">
        {liveMessage}
      </div>
      {body}
    </Page>
  );
}
