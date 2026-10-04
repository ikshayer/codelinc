import { proposalsFromExtraction } from "@/lib/domain/proposals";
import type { ExtractionResult, IntakeEvidence } from "@/lib/domain/types";
import { adapterError, errorFromHttp, normalizeIssue, requestJson } from "../shared";
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

// Live report adapter for the proposed endpoints in FRONTEND_DESIGN.md §15:
//   POST   /api/reports          multipart file + analysisId + clientRevision + requestId
//   GET    /api/report-jobs/:id  poll status
//   DELETE /api/report-jobs/:id  cancel
// Nothing here falls back to fixtures: a missing endpoint is an honest UNAVAILABLE.

const LIMITS: ReportLimits = { maxBytes: 10 * 1024 * 1024, maxPages: 25, accept: "application/pdf" };

const REPORTS_URL = "/api/reports";
const jobUrl = (jobId: string) => `/api/report-jobs/${encodeURIComponent(jobId)}`;

/** File names by job, so evidence can cite the file the person chose. */
const fileNames = new Map<string, string>();

const JOB_STATES: readonly ReportJobState[] = ["queued", "processing", "ready", "needsInput", "failed"];
const STAGES: readonly ReportStage[] = ["checking", "reading", "extracting"];

/** Wire shape of GET /api/report-jobs/:id. */
interface ReportJobWire {
  jobId: string;
  reportId: string;
  analysisId: string;
  requestId: string;
  revision: number;
  status: string;
  stage?: string | null;
  progress?: number | null;
  retryAfterMs?: number | null;
  extraction?: {
    result: ExtractionResult;
    /** Page number for each entry of result.proposedFacts, by index. */
    factPages?: (number | null)[];
    identity?: { name?: string; dateOfBirth?: string; sourceQuote?: string; page?: number };
  } | null;
  issues?: { code?: string; message?: string; retryable?: boolean; fieldPath?: string }[];
}

function reportError(status: number, body: unknown): AdapterError {
  const error = errorFromHttp(status, body, "report service");
  // A missing upload endpoint means the report service isn't connected.
  return error.code === "NOT_FOUND" ? { ...error, code: "UNAVAILABLE" } : error;
}

function parseReceipt(body: unknown, scope: RequestScope, fileName: string): AdapterResult<ReportUploadReceipt> {
  const value = body as Partial<ReportUploadReceipt> | null;
  if (!value || typeof value.reportId !== "string" || typeof value.jobId !== "string" || !JOB_STATES.includes(value.status as ReportJobState)) {
    return fail(adapterError("UNAVAILABLE", "The report service returned an unreadable response.", true));
  }
  if (scope.signal.aborted) return fail(adapterError("CANCELLED", "Upload cancelled."));
  fileNames.set(value.jobId, fileName);
  return ok({ reportId: value.reportId, jobId: value.jobId, status: value.status as ReportJobState });
}

/** Multipart upload through XMLHttpRequest, the only browser API that reports real upload progress. */
function upload(
  input: { file: File; isSample: boolean; onProgress?: (loaded: number, total: number) => void },
  scope: RequestScope,
): Promise<AdapterResult<ReportUploadReceipt>> {
  return new Promise((resolve) => {
    if (scope.signal.aborted) return resolve(fail(adapterError("CANCELLED", "Upload cancelled.")));

    const form = new FormData();
    form.append("file", input.file, input.file.name);
    form.append("analysisId", scope.analysisId);
    form.append("clientRevision", String(scope.revision));
    form.append("requestId", scope.requestId);

    const xhr = new XMLHttpRequest();
    const onAbort = () => xhr.abort();
    const settle = (result: AdapterResult<ReportUploadReceipt>) => {
      scope.signal.removeEventListener("abort", onAbort);
      resolve(result);
    };

    xhr.open("POST", REPORTS_URL);
    xhr.responseType = "json";
    xhr.timeout = 120_000;
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) input.onProgress?.(event.loaded, event.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) settle(parseReceipt(xhr.response, scope, input.file.name));
      else settle(fail(reportError(xhr.status, xhr.response)));
    };
    xhr.onabort = () => settle(fail(adapterError("CANCELLED", "Upload cancelled.")));
    xhr.ontimeout = () => settle(fail(adapterError("TIMEOUT", "The upload took too long. Try again.", true)));
    xhr.onerror = () => settle(fail(adapterError("NETWORK", "Couldn't reach the report service. Check your connection and try again.", true)));

    scope.signal.addEventListener("abort", onAbort, { once: true });
    xhr.send(form);
  });
}

function buildExtraction(job: ReportJobWire, wire: NonNullable<ReportJobWire["extraction"]>): IntakeExtraction {
  const receivedAt = new Date().toISOString();
  const { result, factPages = [], identity } = wire;
  const source = {
    kind: "pdf" as const,
    sourceId: job.reportId,
    sourceLabel: fileNames.get(job.jobId) ?? "Dentist report",
    receivedAt,
    pageFor: (fact: ExtractionResult["proposedFacts"][number]) => factPages[result.proposedFacts.indexOf(fact)] ?? undefined,
  };
  const { proposals, evidence, overflow, reviewNotes } = proposalsFromExtraction(result, source);

  let identityResult: IntakeExtraction["identity"];
  if (identity && (identity.name || identity.dateOfBirth)) {
    const identityEvidence: IntakeEvidence = {
      id: `${job.reportId}:identity`,
      kind: "pdf",
      sourceId: job.reportId,
      sourceLabel: source.sourceLabel,
      pageNumber: identity.page,
      literalQuote: identity.sourceQuote,
      receivedAt,
    };
    evidence.push(identityEvidence);
    identityResult = { name: identity.name, dateOfBirth: identity.dateOfBirth, evidenceId: identityEvidence.id };
  }

  return { proposals, evidence, overflow, identity: identityResult, missingFieldPaths: result.missingFields, reviewNotes };
}

function parseJob(body: ReportJobWire, scope: RequestScope): AdapterResult<ReportJobStatus> {
  if (body.analysisId !== scope.analysisId || body.requestId !== scope.requestId || body.revision !== scope.revision) {
    return fail(adapterError("CONFLICT", "The report service answered for a different request, so the result was ignored.", true));
  }
  if (!JOB_STATES.includes(body.status as ReportJobState)) {
    return fail(adapterError("UNAVAILABLE", "The report service returned an unrecognized status.", true));
  }
  const status = body.status as ReportJobState;
  const issues = (body.issues ?? []).map((issue) => normalizeIssue(issue, adapterError("UNKNOWN", "The report couldn't be analyzed.")));

  let extraction: IntakeExtraction | null = null;
  if (status === "ready") {
    if (!body.extraction?.result) return fail(adapterError("UNAVAILABLE", "The report service finished without results. Try again.", true));
    extraction = buildExtraction(body, body.extraction);
  }

  return ok({
    jobId: body.jobId,
    reportId: body.reportId,
    analysisId: body.analysisId,
    requestId: body.requestId,
    revision: body.revision,
    status,
    stage: STAGES.includes(body.stage as ReportStage) ? (body.stage as ReportStage) : null,
    progress: typeof body.progress === "number" && body.progress >= 0 && body.progress <= 1 ? body.progress : null,
    retryAfterMs: typeof body.retryAfterMs === "number" && body.retryAfterMs > 0 ? body.retryAfterMs : null,
    extraction,
    issues,
  });
}

async function getJob(jobId: string, scope: RequestScope): Promise<AdapterResult<ReportJobStatus>> {
  const response = await requestJson<ReportJobWire>(jobUrl(jobId), { signal: scope.signal });
  if (!response.ok) return response;
  return parseJob(response.value, scope);
}

async function cancelJob(jobId: string): Promise<AdapterResult<void>> {
  const response = await requestJson<void>(jobUrl(jobId), { method: "DELETE" });
  // A finished or unknown job needs no cancellation.
  if (!response.ok && response.error.code !== "NOT_FOUND") return response;
  fileNames.delete(jobId);
  return ok(undefined);
}

export const liveReportAdapter: ReportAdapter = {
  mode: "live",
  limits: LIMITS,
  upload,
  getJob,
  cancelJob,
};
