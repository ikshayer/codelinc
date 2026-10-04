"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useAnalysisController, type RequestTicket } from "@/features/analysis/analysis-provider";
import { SAMPLE_REPORT_FILE_NAME, SAMPLE_REPORT_URL } from "@/fixtures/sample-report";
import { adapterError, isAbortError, wait } from "@/lib/adapters/shared";
import type { AdapterError, IntakeExtraction, ReportStage } from "@/lib/adapters/types";
import { checkReportFile } from "./file-checks";

// Local state machine for one analysis' PDF intake. The analysis store owns
// the facts; this hook owns only what the screen needs while a file is picked,
// sent and read: the File itself (never persisted), the phase and errors.
// Every send goes through a store ticket, so a late result for a replaced or
// cancelled file can never be applied.

export type IntakePhase =
  | { kind: "idle" }
  | { kind: "selected" }
  | { kind: "uploading"; loaded: number | null; total: number | null }
  | { kind: "processing"; stage: ReportStage | null; progress: number | null }
  | { kind: "ready"; extraction: IntakeExtraction }
  | { kind: "problem"; error: AdapterError };

export interface ReportSelection {
  file: File;
  isSample: boolean;
}

interface ActiveRun {
  ticket: RequestTicket;
  jobId: string | null;
}

const DEFAULT_POLL_MS = 1500;
const MAX_PROCESSING_MS = 120_000;

export function useReportIntake(analysisId: string) {
  const controller = useAnalysisController();
  const controllerRef = useRef(controller);
  useEffect(() => {
    controllerRef.current = controller;
  });
  const adapter = controller.adapters.report;

  const [selection, setSelection] = useState<ReportSelection | null>(null);
  const [phase, setPhase] = useState<IntakePhase>({ kind: "idle" });
  const [pickError, setPickError] = useState<AdapterError | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loadingSample, setLoadingSample] = useState(false);

  const runRef = useRef<ActiveRun | null>(null);
  const selectionToken = useRef(0);
  const unregisterTeardown = useRef<(() => void) | null>(null);

  const requestJobCancel = useCallback(
    (jobId: string) => {
      const report = (reason: string) =>
        setNotice(`We stopped waiting for the report, but couldn't confirm the service cancelled it (${reason}). Its results will be ignored.`);
      adapter.cancelJob(jobId).then(
        (result) => {
          if (!result.ok) report(result.error.message);
        },
        (error: unknown) => report(error instanceof Error ? error.message : "unknown error"),
      );
    },
    [adapter],
  );

  const endRun = useCallback((run: ActiveRun) => {
    if (runRef.current === run) runRef.current = null;
    unregisterTeardown.current?.();
    unregisterTeardown.current = null;
  }, []);

  /** Aborts the active send (if any) and asks the service to cancel its job. */
  const stopRun = useCallback((): void => {
    const run = runRef.current;
    if (!run) return;
    endRun(run);
    controllerRef.current.cancelRequest(run.ticket);
    if (run.jobId) requestJobCancel(run.jobId);
  }, [endRun, requestJobCancel]);

  useEffect(() => stopRun, [stopRun]);

  /** Drops the current report: cancels work, discards a pending identity check and removes its untouched facts. */
  const discardCurrentReport = useCallback(() => {
    stopRun();
    const store = controllerRef.current;
    const record = store.state.analyses[analysisId];
    if (record?.identityCheck?.requestKey === "report") store.resolveIdentityCheck(analysisId, false);
    if (record?.reportFile?.reportId) store.removeSource(analysisId, record.reportFile.reportId);
  }, [analysisId, stopRun]);

  const select = useCallback(
    (file: File, isSample: boolean) => {
      discardCurrentReport();
      controllerRef.current.setReportFile(analysisId, { name: file.name, sizeBytes: file.size, isSample, reportId: null });
      setSelection({ file, isSample });
      setPhase({ kind: "selected" });
      setPickError(null);
      setNotice(null);
    },
    [analysisId, discardCurrentReport],
  );

  /** Validates and selects a file. Never uploads. */
  const choose = useCallback(
    async (file: File, isSample = false) => {
      const token = ++selectionToken.current;
      const check = await checkReportFile(file, adapter.limits);
      if (token !== selectionToken.current) return; // a newer choice won
      if (!check.ok) {
        setPickError(check.error);
        return;
      }
      select(file, isSample);
    },
    [adapter, select],
  );

  const chooseSample = useCallback(async () => {
    setLoadingSample(true);
    setPickError(null);
    try {
      const response = await fetch(SAMPLE_REPORT_URL);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      await choose(new File([blob], SAMPLE_REPORT_FILE_NAME, { type: "application/pdf" }), true);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "unknown error";
      setPickError(adapterError("NETWORK", `Couldn't load the sample report (${reason}). Check your connection and try again.`, true));
    } finally {
      setLoadingSample(false);
    }
  }, [choose]);

  const remove = useCallback(() => {
    selectionToken.current++;
    discardCurrentReport();
    controllerRef.current.setReportFile(analysisId, null);
    setSelection(null);
    setPhase({ kind: "idle" });
    setPickError(null);
    setNotice(null);
  }, [analysisId, discardCurrentReport]);

  const send = useCallback(async () => {
    if (!selection) return;
    const store = controllerRef.current;
    stopRun();
    setNotice(null);

    const ticket = store.startRequest(analysisId, "report");
    const run: ActiveRun = { ticket, jobId: null };
    runRef.current = run;
    unregisterTeardown.current = store.registerTeardown(analysisId, stopRun);
    const scope = { analysisId, requestId: ticket.requestId, revision: ticket.revision, signal: ticket.signal };
    const isCurrent = () => runRef.current === run && !ticket.signal.aborted;

    const fail = (error: AdapterError) => {
      endRun(run);
      controllerRef.current.finishRequest(ticket);
      setPhase({ kind: "problem", error });
    };

    setPhase({ kind: "uploading", loaded: null, total: null });
    const uploaded = await adapter.upload(
      {
        file: selection.file,
        isSample: selection.isSample,
        onProgress: (loaded, total) => {
          if (isCurrent()) setPhase({ kind: "uploading", loaded, total });
        },
      },
      scope,
    );
    if (!isCurrent()) {
      // Cancelled or replaced mid-upload, but the server accepted it: release that job too.
      if (uploaded.ok) requestJobCancel(uploaded.value.jobId);
      return;
    }
    if (!uploaded.ok) return fail(uploaded.error);

    run.jobId = uploaded.value.jobId;
    controllerRef.current.setReportFile(analysisId, {
      name: selection.file.name,
      sizeBytes: selection.file.size,
      isSample: selection.isSample,
      reportId: uploaded.value.reportId,
    });
    setPhase({ kind: "processing", stage: "checking", progress: null });

    const startedAt = Date.now();
    for (;;) {
      const polled = await adapter.getJob(uploaded.value.jobId, scope);
      if (!isCurrent()) return;
      if (!polled.ok) return fail(polled.error);

      const job = polled.value;
      if (job.status === "ready") {
        if (!job.extraction) return fail(adapterError("UNAVAILABLE", "The report service finished without results. Try again.", true));
        endRun(run);
        controllerRef.current.applyExtraction(ticket, job.extraction);
        setPhase({ kind: "ready", extraction: job.extraction });
        return;
      }
      if (job.status === "needsInput" || job.status === "failed") {
        return fail(job.issues[0] ?? adapterError("UNKNOWN", "The report couldn't be analyzed.", job.status === "failed"));
      }
      if (Date.now() - startedAt > MAX_PROCESSING_MS) {
        requestJobCancel(uploaded.value.jobId);
        return fail(adapterError("TIMEOUT", "Reading the report took too long. Try again.", true));
      }

      setPhase({ kind: "processing", stage: job.stage ?? "checking", progress: job.progress });
      try {
        await wait(job.retryAfterMs ?? DEFAULT_POLL_MS, ticket.signal);
      } catch (error) {
        if (isAbortError(error)) return;
        throw error;
      }
    }
  }, [adapter, analysisId, endRun, requestJobCancel, selection, stopRun]);

  const cancel = useCallback(() => {
    stopRun();
    setPhase({ kind: "selected" });
  }, [stopRun]);

  return {
    phase,
    pickError,
    notice,
    loadingSample,
    choose,
    chooseSample,
    send,
    cancel,
    remove,
    showPickError: setPickError,
    canRetry: selection !== null,
  };
}
