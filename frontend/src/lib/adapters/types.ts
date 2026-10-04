import type { OverflowItem } from "@/lib/domain/draft";
import type { AnalysisEngineOptions, AnalysisPlanningContext } from "@analysis/types";
import type {
  AnalysisSnapshot,
  CalculationSourceMode,
  ConfirmedScenario,
  EvidenceKind,
  IntakeEvidence,
  IntakeProposal,
  ScenarioComparison,
  ServiceMode,
} from "@/lib/domain/types";

// Typed service boundary (FRONTEND_DESIGN.md §14–15). Screens call these
// interfaces only — never provider SDKs or raw fetch. Mock implementations
// return named synthetic fixtures and say so; live implementations call the
// proposed endpoints and report "unavailable" honestly when they're missing.

export type AdapterErrorCode =
  | "UNAVAILABLE"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "TOO_LARGE"
  | "UNSUPPORTED_TYPE"
  | "ENCRYPTED"
  | "UNREADABLE"
  | "TOO_MANY_PAGES"
  | "INVALID"
  | "RATE_LIMITED"
  | "TIMEOUT"
  | "NETWORK"
  | "CANCELLED"
  | "CONFLICT"
  | "UNKNOWN";

export interface AdapterError {
  code: AdapterErrorCode;
  message: string;
  retryable: boolean;
  fieldPath?: string;
}

export interface EngineEnvelopeMetadata {
  contract_version: string;
  request_id: string;
  generated_by: "engine" | "mock";
  synthetic_data: true;
}

export type AdapterResult<T> = { ok: true; value: T; metadata?: EngineEnvelopeMetadata } | { ok: false; error: AdapterError };

export const ok = <T>(value: T): AdapterResult<T> => ({ ok: true, value });
export const fail = <T = never>(error: AdapterError): AdapterResult<T> => ({ ok: false, error });

/** Every async request is scoped so late responses can be rejected. */
export interface RequestScope {
  analysisId: string;
  requestId: string;
  revision: number;
  signal: AbortSignal;
  engineOptions?: EngineCalculationOptions;
}

/** Proposals plus their evidence, as returned by PDF, voice or typed intake. */
export interface IntakeExtraction {
  proposals: IntakeProposal[];
  evidence: IntakeEvidence[];
  overflow: OverflowItem[];
  /** Patient identity found in the source, used only for the "Is this your report?" check. */
  identity?: { name?: string; dateOfBirth?: string; evidenceId: string };
  /** Facts the source didn't supply. Shown as Missing; never defaulted. */
  missingFieldPaths: string[];
  /** Text quoted for review that cannot set values by itself (e.g. clinical timing language). */
  reviewNotes: { message: string; evidenceId: string }[];
}

// --- Report (PDF) -----------------------------------------------------------

export interface ReportLimits {
  maxBytes: number;
  maxPages: number;
  accept: "application/pdf";
}

export type ReportJobState = "queued" | "processing" | "ready" | "needsInput" | "failed";
export type ReportStage = "checking" | "reading" | "extracting";

export interface ReportUploadReceipt {
  reportId: string;
  jobId: string;
  status: ReportJobState;
}

export interface ReportJobStatus {
  jobId: string;
  reportId: string;
  analysisId: string;
  requestId: string;
  revision: number;
  status: ReportJobState;
  stage: ReportStage | null;
  /** Real progress from the backend, 0–1, when supplied. Never fabricated. */
  progress: number | null;
  retryAfterMs: number | null;
  extraction: IntakeExtraction | null;
  issues: AdapterError[];
}

export interface ReportAdapter {
  readonly mode: ServiceMode;
  readonly limits: ReportLimits;
  upload(
    input: { file: File; isSample: boolean; onProgress?: (loaded: number, total: number) => void },
    scope: RequestScope,
  ): Promise<AdapterResult<ReportUploadReceipt>>;
  getJob(jobId: string, scope: RequestScope): Promise<AdapterResult<ReportJobStatus>>;
  cancelJob(jobId: string): Promise<AdapterResult<void>>;
}

// --- Voice ------------------------------------------------------------------

export type VoiceAgentState = "connecting" | "listening" | "thinking" | "speaking" | "muted" | "reconnecting" | "ended" | "failed";

export interface VoiceSessionInfo {
  sessionId: string;
  expiresAt: string;
  capabilities: { interruption: boolean; transcription: boolean; simulated: boolean };
}

export type VoiceEvent =
  | { type: "state"; sessionId: string; sequence: number; state: VoiceAgentState }
  | { type: "transcript"; sessionId: string; sequence: number; turnId: string; speaker: "assistant" | "person"; text: string; final: boolean }
  | { type: "proposals"; sessionId: string; sequence: number; turnId: string; extraction: IntakeExtraction }
  | { type: "error"; sessionId: string; sequence: number; error: AdapterError }
  | { type: "ended"; sessionId: string; sequence: number; reason: "user" | "provider" | "expired" };

export interface VoiceSessionHandle {
  readonly info: VoiceSessionInfo;
  /** Subscribe to ordered events. Returns an unsubscribe function. */
  subscribe(listener: (event: VoiceEvent) => void): () => void;
  /** Sends captured audio when a live transport exists. Mock sessions ignore it. */
  attachMicrophone(stream: MediaStream): void;
  setMuted(muted: boolean): void;
  stopSpeaking(): void;
  sendText(text: string): void;
  /** Ends the session and releases provider resources. Idempotent. */
  end(): Promise<void>;
}

export interface VoiceAdapter {
  readonly mode: ServiceMode;
  createSession(input: { consent: true; memberId?: string; facts?: Record<string, { value: string | boolean | null; status: string }> }, scope: RequestScope): Promise<AdapterResult<VoiceSessionHandle>>;
}

// --- Typed interpretation (/api/interpret) ----------------------------------

export interface InterpretAdapter {
  readonly mode: ServiceMode;
  interpret(text: string, scope: RequestScope): Promise<AdapterResult<IntakeExtraction>>;
}

// --- Calculation ------------------------------------------------------------

/** Server-provided engine details for the original intake → confirm → compare flow. */
export type EngineCalculationOptions = AnalysisEngineOptions;
export type PlanningContext = AnalysisPlanningContext;

export type CalculationOutcome =
  | { kind: "calculated"; comparison: ScenarioComparison; sourceMode: CalculationSourceMode; fixtureName: string | null; planning?: PlanningContext }
  /** No engine and no fixture for these values. Honest, not an error. */
  | { kind: "unavailable"; message: string };

export interface CalculationAdapter {
  readonly mode: ServiceMode;
  compare(scenario: ConfirmedScenario, scope: RequestScope): Promise<AdapterResult<CalculationOutcome>>;
}

// --- History ----------------------------------------------------------------

export type HistoryStatusFilter = "all" | "draft" | "needsReview" | "compared";

export interface HistoryQuery {
  search: string;
  cursor: string | null;
  limit: number;
}

export interface SnapshotSummary {
  id: string;
  analysisId: string;
  version: number;
  title: string;
  patientDisplayName: string;
  createdAt: string;
  savedAt: string;
  confirmedAt: string;
  inputKinds: EvidenceKind[];
  baselinePatientCents: number;
  bestPatientCents: number;
  sourceMode: CalculationSourceMode;
  procedureLabels: string[];
}

export interface HistoryPage {
  items: SnapshotSummary[];
  nextCursor: string | null;
}

export interface SaveSnapshotInput {
  idempotencyKey: string;
  snapshot: Omit<AnalysisSnapshot, "id" | "version" | "savedAt">;
}

export interface HistoryRepository {
  readonly mode: ServiceMode;
  /** Where saved analyses live, for honest persistence copy. */
  readonly persistence: "session" | "account";
  list(query: HistoryQuery, signal: AbortSignal): Promise<AdapterResult<HistoryPage>>;
  get(id: string, signal: AbortSignal): Promise<AdapterResult<AnalysisSnapshot>>;
  /** Repeating a save with the same idempotency key returns the same snapshot. */
  save(input: SaveSnapshotInput): Promise<AdapterResult<AnalysisSnapshot>>;
  rename(id: string, title: string): Promise<AdapterResult<SnapshotSummary>>;
  remove(id: string): Promise<AdapterResult<void>>;
  /** Demo only: restores the seeded synthetic history. */
  reset?(): Promise<AdapterResult<void>>;
}

// --- Auth -------------------------------------------------------------------

export interface AccountIdentity {
  accountId: string;
  name: string | null;
  email: string | null;
}

export type AuthState =
  | { status: "guest" }
  | { status: "signedIn"; account: AccountIdentity }
  | { status: "expired" };

export interface AuthAdapter {
  readonly mode: ServiceMode;
  /** Whether a real Google provider is configured. Demo mode is always false. */
  googleAvailability(signal: AbortSignal): Promise<AdapterResult<{ available: boolean; reason: string | null }>>;
  getSession(signal: AbortSignal): Promise<AdapterResult<AuthState>>;
  /** Starts the real provider redirect. Resolves only if the redirect could not start. */
  signInWithGoogle(callbackUrl: string): Promise<AdapterResult<void>>;
  signOut(): Promise<AdapterResult<void>>;
}


export interface Adapters {
  mode: ServiceMode;
  report: ReportAdapter;
  voice: VoiceAdapter;
  interpret: InterpretAdapter;
  calculation: CalculationAdapter;
  history: HistoryRepository;
  auth: AuthAdapter;
}
