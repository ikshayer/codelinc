import { SAMPLE_REPORT_SHA256, buildSampleReportExtraction } from "@/fixtures/sample-report";
import { adapterError, isAbortError, newId, wait } from "../shared";
import { fail, ok } from "../types";
import type {
  AdapterError,
  AdapterResult,
  IntakeExtraction,
  ReportAdapter,
  ReportJobState,
  ReportJobStatus,
  ReportLimits,
  ReportStage,
  ReportUploadReceipt,
  RequestScope,
} from "../types";
import { getDemoScenarios, mockLatency, type ReportOutcome } from "./demo-scenarios";

// Demo report adapter. Only the labeled sample report gets results; any other
// PDF ends in "needs input" with an honest explanation (FRONTEND_DESIGN.md §7).
// Stages advance over a couple of seconds so every processing state is real.

const LIMITS: ReportLimits = { maxBytes: 10 * 1024 * 1024, maxPages: 25, accept: "application/pdf" };

const UPLOAD_MS = 700;
const STAGE_MS = { checking: 700, reading: 1000, extracting: 900 } as const;
const POLL_MS = 500;

export const DEMO_ONLY_SAMPLE_MESSAGE = "Demo mode can analyze only the sample report. Connect the report service to analyze your own PDF.";

interface MockJob {
  jobId: string;
  reportId: string;
  fileName: string;
  scope: Pick<RequestScope, "analysisId" | "requestId" | "revision">;
  outcome: ReportOutcome;
  isSample: boolean;
  createdAt: number;
  cancelled: boolean;
}

const jobs = new Map<string, MockJob>();

async function sha256Hex(file: File): Promise<string | null> {
  if (typeof crypto === "undefined" || !crypto.subtle) return null;
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function isBundledSample(file: File, flaggedSample: boolean): Promise<boolean> {
  if (flaggedSample) return true;
  return (await sha256Hex(file)) === SAMPLE_REPORT_SHA256;
}

function stageAt(elapsedMs: number): { stage: ReportStage; done: boolean } {
  const { checking, reading, extracting } = STAGE_MS;
  const scale = (ms: number) => mockLatency(ms);
  if (elapsedMs < scale(checking)) return { stage: "checking", done: false };
  if (elapsedMs < scale(checking + reading)) return { stage: "reading", done: false };
  if (elapsedMs < scale(checking + reading + extracting)) return { stage: "extracting", done: false };
  return { stage: "extracting", done: true };
}

function terminalIssue(job: MockJob): { status: ReportJobState; issue: AdapterError } | null {
  switch (job.outcome) {
    case "unreadable":
      return {
        status: "needsInput",
        issue: adapterError("UNREADABLE", "This looks like a scan, and the demo can't read scanned pages. Type your details instead or use the sample report."),
      };
    case "encrypted":
      return {
        status: "needsInput",
        issue: adapterError("ENCRYPTED", "This PDF is password-protected. Remove the password and choose it again, or type your details instead."),
      };
    case "timeout":
      return { status: "failed", issue: adapterError("TIMEOUT", "Reading the report took too long. Try again.", true) };
    case "network": // surfaced at upload; unreachable here
    case "success":
      return job.isSample ? null : { status: "needsInput", issue: adapterError("UNAVAILABLE", DEMO_ONLY_SAMPLE_MESSAGE) };
  }
}

function extractionFor(job: MockJob): IntakeExtraction {
  return buildSampleReportExtraction({ reportId: job.reportId, fileName: job.fileName, receivedAt: new Date().toISOString() });
}

function statusOf(job: MockJob, state: ReportJobState, stage: ReportStage | null, extraction: IntakeExtraction | null, issues: AdapterError[]): ReportJobStatus {
  return {
    jobId: job.jobId,
    reportId: job.reportId,
    analysisId: job.scope.analysisId,
    requestId: job.scope.requestId,
    revision: job.scope.revision,
    status: state,
    stage,
    // The demo has no real progress value, so none is reported.
    progress: null,
    retryAfterMs: state === "ready" || state === "needsInput" || state === "failed" ? null : mockLatency(POLL_MS),
    extraction,
    issues,
  };
}

async function upload(
  input: { file: File; isSample: boolean },
  scope: RequestScope,
): Promise<AdapterResult<ReportUploadReceipt>> {
  const { file, isSample } = input;
  try {
    await wait(mockLatency(UPLOAD_MS), scope.signal);
    const outcome = getDemoScenarios().report;
    if (outcome === "network") return fail(adapterError("NETWORK", "Couldn't reach the report service. Check your connection and try again.", true));
    if (file.size > LIMITS.maxBytes) return fail(adapterError("TOO_LARGE", "That file is larger than 10 MB."));
    const sample = await isBundledSample(file, isSample);
    if (scope.signal.aborted) return fail(adapterError("CANCELLED", "Upload cancelled."));
    const job: MockJob = {
      jobId: newId("job"),
      reportId: newId("report"),
      fileName: file.name,
      scope: { analysisId: scope.analysisId, requestId: scope.requestId, revision: scope.revision },
      outcome,
      isSample: sample,
      createdAt: Date.now(),
      cancelled: false,
    };
    jobs.set(job.jobId, job);
    return ok({ reportId: job.reportId, jobId: job.jobId, status: "queued" });
  } catch (error) {
    if (isAbortError(error)) return fail(adapterError("CANCELLED", "Upload cancelled."));
    throw error;
  }
}

async function getJob(jobId: string, scope: RequestScope): Promise<AdapterResult<ReportJobStatus>> {
  try {
    await wait(mockLatency(150), scope.signal);
  } catch (error) {
    if (isAbortError(error)) return fail(adapterError("CANCELLED", "Request cancelled."));
    throw error;
  }
  const job = jobs.get(jobId);
  if (!job || job.scope.analysisId !== scope.analysisId) return fail(adapterError("NOT_FOUND", "This report job isn't available anymore."));
  if (job.cancelled) return fail(adapterError("CANCELLED", "This report job was cancelled."));

  const { stage, done } = stageAt(Date.now() - job.createdAt);
  if (!done) return ok(statusOf(job, stage === "checking" ? "queued" : "processing", stage, null, []));

  const terminal = terminalIssue(job);
  if (terminal) return ok(statusOf(job, terminal.status, "extracting", null, [terminal.issue]));
  return ok(statusOf(job, "ready", "extracting", extractionFor(job), []));
}

async function cancelJob(jobId: string): Promise<AdapterResult<void>> {
  const job = jobs.get(jobId);
  if (job) job.cancelled = true;
  return ok(undefined);
}

export const mockReportAdapter: ReportAdapter = {
  mode: "demo",
  limits: LIMITS,
  upload,
  getJob,
  cancelJob,
};
