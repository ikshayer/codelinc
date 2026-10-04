"use client";

import Link from "next/link";
import { useId, useRef } from "react";

import { Notice } from "@/components/shared/feedback";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAnalysis, useAnalysisController } from "@/features/analysis/analysis-provider";
import type { AnalysisRecord } from "@/features/analysis/state";
import { adapterError } from "@/lib/adapters/shared";
import type { AdapterError, IntakeExtraction, ReportStage } from "@/lib/adapters/types";
import { DropZone } from "./drop-zone";
import { FileRow } from "./file-row";
import { ProblemPanel } from "./problem-panel";
import { ProcessingView, UploadingView } from "./progress-views";
import { ReadyView, ReviewFactsButton } from "./ready-view";
import { reportProposalsFromDraft } from "./report-summary";
import { useReportIntake, type IntakePhase } from "./use-report-intake";

// The dentist-report upload panel (FRONTEND_DESIGN.md §7). Every state is
// real: select, upload, process, needs input / failed, ready.

const DEMO_DISCLOSURE = "Demo mode doesn't upload your file; only the sample report can be analyzed.";
const LIVE_DISCLOSURE = "Your PDF goes to CareWindow's report service for extraction.";

/** What the Ready state summarizes, whether it was just extracted or reopened from the draft. */
interface ReadySource {
  proposals: IntakeExtraction["proposals"];
  evidence: IntakeExtraction["evidence"];
  /** Missing fields and quoted notes. Absent when reopening from the draft. */
  details: Pick<IntakeExtraction, "missingFieldPaths" | "reviewNotes"> | null;
  planLimitsMissing: boolean;
  /** The report's facts are in the draft. False when waiting on, or after declining, "Is this your report?". */
  inDraft: boolean;
}

type View =
  | { kind: "empty" }
  | { kind: "selected" }
  | { kind: "uploading"; loaded: number | null; total: number | null }
  | { kind: "processing"; stage: ReportStage | null; progress: number | null }
  | { kind: "problem"; error: AdapterError }
  | { kind: "ready"; source: ReadySource };

const hasPlanFacts = (paths: readonly string[]) => paths.some((path) => path.startsWith("plan."));

function readySourceFromExtraction(extraction: IntakeExtraction, inDraft: boolean): ReadySource {
  return {
    proposals: extraction.proposals,
    evidence: extraction.evidence,
    details: extraction,
    planLimitsMissing: hasPlanFacts(extraction.missingFieldPaths),
    inDraft,
  };
}

/** Returning to this screen: the File is gone, but what it produced is in the draft or waiting on an identity check. */
function reopenedSource(analysis: AnalysisRecord, reportId: string): ReadySource | null {
  if (analysis.identityCheck?.requestKey === "report") return readySourceFromExtraction(analysis.identityCheck.extraction, false);
  const proposals = reportProposalsFromDraft(analysis.draft.facts, analysis.draft.evidence, reportId);
  if (proposals.length === 0) return null;
  return {
    proposals,
    evidence: Object.values(analysis.draft.evidence).filter((item) => item.sourceId === reportId),
    details: null,
    planLimitsMissing: !hasPlanFacts(proposals.map((proposal) => proposal.fieldPath)),
    inDraft: true,
  };
}

/** The visible state follows the store: once the file is gone (Clear, sign-out, removal elsewhere) the panel is empty. */
function resolveView(analysis: AnalysisRecord | null, phase: IntakePhase): View {
  const reportFile = analysis?.reportFile;
  if (!analysis || !reportFile) return { kind: "empty" };
  switch (phase.kind) {
    case "idle": {
      const reopened = reportFile.reportId ? reopenedSource(analysis, reportFile.reportId) : null;
      return reopened ? { kind: "ready", source: reopened } : { kind: "empty" };
    }
    case "ready": {
      const reportId = reportFile.reportId;
      const inDraft = reportId !== null && Object.values(analysis.draft.evidence).some((item) => item.sourceId === reportId);
      return { kind: "ready", source: readySourceFromExtraction(phase.extraction, inDraft) };
    }
    default:
      return phase;
  }
}

export function PdfIntake({ analysisId }: { analysisId: string }) {
  const analysis = useAnalysis(analysisId);
  const { adapters, loadSample } = useAnalysisController();
  const intake = useReportIntake(analysisId);
  const inputRef = useRef<HTMLInputElement>(null);
  const headingId = useId();

  if (!analysis) return null;

  const demo = adapters.mode === "demo";
  const disclosure = demo ? DEMO_DISCLOSURE : LIVE_DISCLOSURE;
  const manualHref = `/analysis/${analysisId}/intake?method=manual`;
  const reportFile = analysis.reportFile;
  const awaitingIdentityCheck = analysis.identityCheck?.requestKey === "report";
  const view = resolveView(analysis, intake.phase);
  const busy = view.kind === "uploading" || view.kind === "processing";

  function openPicker() {
    inputRef.current?.click();
  }

  function handleFiles(files: File[]) {
    if (files.length === 0) return;
    if (files.length > 1) {
      intake.showPickError(adapterError("INVALID", "Choose one PDF at a time."));
      return;
    }
    void intake.choose(files[0]);
  }

  const recovery = {
    analysisId,
    mode: adapters.mode,
    onReplace: openPicker,
    onUseSampleReport: () => void intake.chooseSample(),
    onUseSampleTreatment: () => loadSample(analysisId),
    loadingSample: intake.loadingSample,
  };

  return (
    <section aria-labelledby={headingId} className="space-y-6">
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = ""; // lets the same file be chosen again after Remove
          handleFiles(files);
        }}
      />

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h2 id={headingId} className="text-section">
            Upload a dentist report
          </h2>
          {demo && <Badge variant="outline">Simulated analysis</Badge>}
        </div>
        <p className="text-muted-foreground">
          We read procedures, fees and any dentist timing notes. Plan rules and coverage may still need separate confirmation.
        </p>
      </div>

      {intake.notice && <Notice tone="warning">{intake.notice}</Notice>}

      {intake.pickError && <ProblemPanel {...recovery} error={intake.pickError} canRetry={false} onRetry={() => undefined} />}

      {view.kind === "empty" && (
        <div className="space-y-3">
          <DropZone
            limits={adapters.report.limits}
            onFiles={handleFiles}
            onChoose={openPicker}
            onUseSample={() => void intake.chooseSample()}
            loadingSample={intake.loadingSample}
          >
            <Button variant="link" asChild>
              <Link href={manualHref}>Enter details manually</Link>
            </Button>
          </DropZone>
          <p className="text-sm text-muted-foreground">{disclosure}</p>
        </div>
      )}

      {view.kind !== "empty" && reportFile && (
        <div className="space-y-6">
          <FileRow name={reportFile.name} sizeBytes={reportFile.sizeBytes} isSample={reportFile.isSample}>
            {!busy && (
              <>
                <Button variant="outline" onClick={openPicker}>
                  Replace
                </Button>
                <RemoveButton confirm={view.kind === "ready" && (view.source.inDraft || awaitingIdentityCheck)} onRemove={intake.remove} />
              </>
            )}
          </FileRow>

          {view.kind === "selected" && (
            <div className="space-y-2">
              <Button onClick={() => void intake.send()}>Send for analysis</Button>
              <p className="text-sm text-muted-foreground">{disclosure}</p>
            </div>
          )}

          {view.kind === "uploading" && <UploadingView loaded={view.loaded} total={view.total} onCancel={intake.cancel} />}

          {view.kind === "processing" && <ProcessingView stage={view.stage} progress={view.progress} onCancel={intake.cancel} />}

          {view.kind === "problem" && (
            <ProblemPanel {...recovery} error={view.error} canRetry={intake.canRetry} onRetry={() => void intake.send()} />
          )}

          {view.kind === "ready" && (
            <ReadyPanel analysisId={analysisId} source={view.source} awaitingIdentityCheck={awaitingIdentityCheck} manualHref={manualHref} />
          )}
        </div>
      )}
    </section>
  );
}

function ReadyPanel({ analysisId, source, awaitingIdentityCheck, manualHref }: { analysisId: string; source: ReadySource; awaitingIdentityCheck: boolean; manualHref: string }) {
  const declined = !awaitingIdentityCheck && !source.inDraft && source.proposals.length > 0;
  return (
    <div className="space-y-6">
      {declined ? (
        <Notice title="This report isn't being used">You chose not to use it, so nothing from it was added. Replace the file or remove it.</Notice>
      ) : (
        <ReadyView
          analysisId={analysisId}
          proposals={source.proposals}
          evidence={source.evidence}
          details={source.details}
          planLimitsMissing={source.planLimitsMissing}
          awaitingIdentityCheck={awaitingIdentityCheck}
        />
      )}
      <div className="flex flex-wrap items-center gap-3">
        <ReviewFactsButton analysisId={analysisId} disabled={awaitingIdentityCheck || declined} />
        <Button variant="link" asChild>
          <Link href={manualHref}>Enter details manually</Link>
        </Button>
      </div>
    </div>
  );
}

function RemoveButton({ confirm, onRemove }: { confirm: boolean; onRemove: () => void }) {
  if (!confirm) {
    return (
      <Button variant="outline" onClick={onRemove}>
        Remove
      </Button>
    );
  }
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline">Remove</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove this report?</AlertDialogTitle>
          <AlertDialogDescription>Values read from it that you haven&apos;t edited are removed from this analysis. Values you typed or confirmed stay.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep report</AlertDialogCancel>
          <AlertDialogAction onClick={onRemove}>Remove report</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
