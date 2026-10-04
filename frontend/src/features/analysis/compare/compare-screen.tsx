"use client";

import { FileSearchIcon, TriangleAlertIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { Reveal } from "@/components/motion/reveal";

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
import { Press } from "./press";
import { SaveControls } from "./save-controls";
import { PlanningControls } from "./planning-controls";
import type { AnalysisEngineOptions, AnalysisScheduleLock } from "@analysis/types";

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
      <div className="grid items-start gap-5 md:grid-cols-12 md:gap-6" aria-hidden>
        {[5, 7].map((span) => (
          <div key={span} className={`space-y-5 rounded-2xl border bg-card p-8 ${span === 5 ? "md:col-span-5" : "md:col-span-7 md:-mt-3 md:pb-12"}`}>
            <Skeleton className="h-6 w-40" />
            <Skeleton className={span === 5 ? "h-10 w-36" : "h-14 w-52"} />
            <Skeleton className="h-7 w-32" />
            <Skeleton className="h-16 w-full" />
          </div>
        ))}
      </div>
      <Skeleton className="h-16 w-full rounded-2xl" aria-hidden />
      <Skeleton className="h-40 w-full rounded-2xl" aria-hidden />
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
  const [planningOptions, setPlanningOptions] = useState<AnalysisEngineOptions>({});
  const [planningHistory, setPlanningHistory] = useState<AnalysisEngineOptions[]>([]);

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
    handleAttempt(controller.compare(analysisId, planningOptions));
  }

  function changePlanning(options: AnalysisEngineOptions, history?: AnalysisEngineOptions[]) {
    const previous: AnalysisEngineOptions = current?.planning ? { mode: current.planning.mode, schedule_locks: current.planning.locks, ...(current.planning.budget ? { budget: current.planning.budget } : {}) } : planningOptions;
    const key = (value: AnalysisEngineOptions) => JSON.stringify({ mode: value.mode ?? "BALANCED", schedule_locks: value.schedule_locks ?? [], budget: value.budget ?? null });
    setPlanningOptions(options);
    if (history) setPlanningHistory(history);
    else if (key(options) !== key(previous)) setPlanningHistory([...planningHistory, previous]);
    setBlockedIssues(null);
    handleAttempt(controller.compare(analysisId, options));
  }

  function pinDate(lock: AnalysisScheduleLock) {
    const planning = current?.planning;
    if (!planning) return;
    changePlanning({ mode: planning.mode, schedule_locks: [...planning.locks.filter((l) => l.procedureId !== lock.procedureId), lock], ...(planning.budget ? { budget: planning.budget } : {}) });
  }

  function applyDeadline(procedureId: ProcedureId, deadline: ISODate) {
    setBlockedIssues(null);
    setEditApplied(true);
    setPlanningOptions({});
    setPlanningHistory([]);
    // Editing hides the current result immediately; the checkbox is the separate affirmation for this edit.
    controller.editFact(analysisId, timingPaths.deadline(procedureId), deadline);
    controller.setTimingAffirmed(analysisId, true);
    handleAttempt(controller.compare(analysisId));
  }

  function startOver(record: AnalysisRecord) {
    const id = record.memberData ? controller.createAnalysis(record.patient, "Sample treatment", record.memberData) : controller.startSampleAnalysis(record.patient);
    if (record.memberData) { controller.setMethod(id, "manual"); controller.loadSample(id); }
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
          actions={current.planning ? undefined : <SaveControls analysisId={analysisId} saved={saved} />}
        />
        <div className="grid gap-10 lg:grid-cols-12 lg:gap-12">
          <div className="min-w-0 lg:col-span-8">
            <ConfirmLinkProvider analysisId={analysisId}>
              <ComparisonView
                comparison={current.comparison}
                scenario={scenario}
                procedureLabels={procedureLabels}
                sourceMode={current.sourceMode}
                fixtureName={current.fixtureName}
                confirmedAt={current.confirmedAt}
                historical={false}
                planning={current.planning}
                onPinDate={current.planning ? pinDate : undefined}
              />
            </ConfirmLinkProvider>
          </div>
          <aside aria-labelledby="actions-heading" className="lg:sticky lg:top-24 lg:col-span-4 lg:self-start">
            <Reveal delay={0.5} className="space-y-5 rounded-2xl border bg-card p-5 shadow-[0_1px_2px_rgba(35,31,32,0.04),0_8px_24px_-12px_rgba(101,0,48,0.12)] md:p-6">
              <h2 id="actions-heading" className="font-display text-xl font-semibold tracking-tight">
                Next steps
              </h2>
              <DeadlineEditor scenario={scenario} procedureLabels={procedureLabels} onApply={applyDeadline} />
              {current.planning && <PlanningControls key={JSON.stringify(current.planning.budget)} planning={current.planning} procedureLabels={procedureLabels} onChange={changePlanning} onUndo={() => changePlanning(planningHistory[planningHistory.length - 1], planningHistory.slice(0, -1))} canUndo={planningHistory.length > 0} disabled={false} />}
              <Press className="flex">
                <Button asChild variant="outline" className="w-full justify-start">
                  <Link href={confirmHref}>Review or edit details</Link>
                </Button>
              </Press>
            </Reveal>
          </aside>
        </div>
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
        <Button variant="outline" size="sm" onClick={() => changePlanning({})}>Reset plan constraints</Button>
        {planningHistory.length > 0 && <Button variant="outline" size="sm" onClick={() => changePlanning(planningHistory[planningHistory.length - 1], planningHistory.slice(0, -1))}>Undo last change</Button>}
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
