import type { AdapterError, AuthState, CalculationOutcome, IntakeExtraction } from "@/lib/adapters/types";
import {
  addProcedure,
  applyProposals,
  editFact,
  emptyDraft,
  markConfirmed,
  removeProcedure,
  removeSource,
  resolveConflict,
  type IntakeDraft,
} from "@/lib/domain/draft";
import { getFieldDefinition } from "@/lib/domain/fields";
import { groupFieldPaths } from "@/lib/domain/scenario";
import type {
  CalculationSourceMode,
  FactCandidate,
  FieldValue,
  PatientDetails,
  PatientProfile,
  ProcedureId,
  ScenarioComparison,
} from "@/lib/domain/types";

// One analysis controller (FRONTEND_DESIGN.md §14). Auth identity, intake
// evidence, confirmation and calculated results are separate slices. Every
// async result is accepted only when its analysis, request ID, revision and
// session epoch still match — Clear, sign-out and edits reject late replies.

export type IntakeMethod = "pdf" | "voice" | "manual";
export type RequestKey = "report" | "voice" | "interpret" | "calculation";

export interface ActiveRequest {
  requestId: string;
  revision: number;
}

export type ResultState =
  | { status: "none" }
  | { status: "calculating"; requestId: string; revision: number }
  | {
      status: "calculated";
      revision: number;
      comparison: ScenarioComparison;
      sourceMode: CalculationSourceMode;
      fixtureName: string | null;
      confirmedAt: string;
    }
  | { status: "unavailable"; revision: number; message: string }
  | { status: "failed"; revision: number; error: AdapterError };

export interface PendingIdentityCheck {
  requestKey: RequestKey;
  reportName: string | null;
  reportDateOfBirth: string | null;
  extraction: IntakeExtraction;
}

export interface TranscriptTurn {
  turnId: string;
  speaker: "assistant" | "person";
  text: string;
  at: string;
}

export interface ReportFileMeta {
  name: string;
  sizeBytes: number;
  isSample: boolean;
  /** Report ID once the backend accepted the upload; evidence uses it as sourceId. */
  reportId: string | null;
}

export interface SavedReference {
  snapshotId: string;
  version: number;
  revision: number;
  idempotencyKey: string;
}

export interface AnalysisRecord {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  patient: PatientDetails | null;
  method: IntakeMethod | null;
  draft: IntakeDraft;
  confirmation: { financialConfirmed: boolean; timingAffirmed: boolean };
  identityCheck: PendingIdentityCheck | null;
  requests: Partial<Record<RequestKey, ActiveRequest>>;
  result: ResultState;
  reportFile: ReportFileMeta | null;
  voiceTurns: Record<string, TranscriptTurn[]>;
  saved: SavedReference | null;
}

export type AuthUiState = { status: "loading" } | AuthState;

export interface StoreState {
  /** Advances on Clear all / sign-out / reset so stale callbacks are rejected. */
  epoch: number;
  analyses: Record<string, AnalysisRecord>;
  profile: PatientProfile | null;
  auth: AuthUiState;
}

export type Action =
  | { type: "createAnalysis"; id: string; title: string; patient: PatientDetails | null; now: string }
  | { type: "setPatient"; analysisId: string; patient: PatientDetails; now: string }
  | { type: "setMethod"; analysisId: string; method: IntakeMethod }
  | { type: "renameAnalysis"; analysisId: string; title: string; now: string }
  | { type: "deleteAnalysis"; analysisId: string }
  | { type: "editFact"; analysisId: string; fieldPath: string; value: FieldValue; now: string }
  | { type: "resolveConflict"; analysisId: string; fieldPath: string; candidate: FactCandidate; now: string }
  | { type: "addProcedure"; analysisId: string; now: string }
  | { type: "removeProcedure"; analysisId: string; procedureId: ProcedureId; now: string }
  | { type: "beginRequest"; analysisId: string; key: RequestKey; requestId: string; epoch: number }
  | { type: "endRequest"; analysisId: string; key: RequestKey; requestId: string }
  | {
      type: "applyExtraction";
      analysisId: string;
      key: RequestKey;
      requestId: string;
      epoch: number;
      extraction: IntakeExtraction;
      /** Voice sessions deliver many proposal batches under one request. */
      keepRequest: boolean;
      now: string;
    }
  | { type: "applyDirectProposals"; analysisId: string; extraction: IntakeExtraction; now: string }
  | { type: "resolveIdentityCheck"; analysisId: string; accept: boolean; now: string }
  | { type: "removeSource"; analysisId: string; sourceId: string; now: string }
  | { type: "setReportFile"; analysisId: string; file: ReportFileMeta | null }
  | { type: "appendVoiceTurn"; analysisId: string; sessionId: string; requestId: string; epoch: number; turn: TranscriptTurn }
  | { type: "setFinancialConfirmed"; analysisId: string; value: boolean }
  | { type: "setTimingAffirmed"; analysisId: string; value: boolean }
  | { type: "startCalculation"; analysisId: string; requestId: string; revision: number; epoch: number }
  | {
      type: "calculationSettled";
      analysisId: string;
      requestId: string;
      revision: number;
      epoch: number;
      outcome: { ok: true; value: CalculationOutcome } | { ok: false; error: AdapterError };
      now: string;
    }
  | { type: "markSaved"; analysisId: string; saved: SavedReference; now: string }
  | { type: "clearSavedSnapshot"; snapshotId: string }
  | { type: "clearDraft"; analysisId: string; now: string }
  | { type: "setProfile"; profile: PatientProfile | null }
  | { type: "setAuth"; auth: AuthUiState }
  | { type: "resetSession"; analyses: Record<string, AnalysisRecord>; profile: PatientProfile | null };

export function newAnalysisRecord(id: string, title: string, patient: PatientDetails | null, now: string): AnalysisRecord {
  return {
    id,
    title,
    createdAt: now,
    updatedAt: now,
    patient,
    method: null,
    draft: emptyDraft(),
    confirmation: { financialConfirmed: false, timingAffirmed: false },
    identityCheck: null,
    requests: {},
    result: { status: "none" },
    reportFile: null,
    voiceTurns: {},
    saved: null,
  };
}

/** Applies a draft change: precise results disappear and affected group confirmations reset. */
function withDraftChange(record: AnalysisRecord, draft: IntakeDraft, now: string, changedPaths: readonly string[]): AnalysisRecord {
  if (draft === record.draft) return record;
  const groups = new Set(changedPaths.map((path) => (path.startsWith("timing.") ? "timing" : "financial")));
  const structural = changedPaths.length === 0;
  const { calculation: pendingCalculation, ...otherRequests } = record.requests;
  void pendingCalculation;
  return {
    ...record,
    draft,
    updatedAt: now,
    confirmation: {
      financialConfirmed: record.confirmation.financialConfirmed && !structural && !groups.has("financial"),
      timingAffirmed: record.confirmation.timingAffirmed && !structural && !groups.has("timing"),
    },
    // Stale estimates must not remain visible while edits are pending.
    result: { status: "none" },
    requests: otherRequests,
  };
}

function isNameMismatch(patient: PatientDetails | null, identity: IntakeExtraction["identity"]): boolean {
  if (!patient || !identity) return false;
  const normalize = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z]/gi, "").toLowerCase();
  const names = [patient.displayName, patient.fullName].filter((n): n is string => Boolean(n)).map(normalize);
  const nameMismatch = identity.name ? !names.some((n) => n === normalize(identity.name!) || normalize(identity.name!).includes(n) || n.includes(normalize(identity.name!))) : false;
  const dobMismatch = Boolean(identity.dateOfBirth && patient.dateOfBirth && identity.dateOfBirth !== patient.dateOfBirth);
  return nameMismatch || dobMismatch;
}

function mergeExtraction(record: AnalysisRecord, extraction: IntakeExtraction, now: string): AnalysisRecord {
  const draft = applyProposals(record.draft, extraction.proposals, extraction.evidence, extraction.overflow);
  return withDraftChange(record, draft, now, extraction.proposals.map((p) => p.fieldPath));
}

function updateAnalysis(state: StoreState, analysisId: string, update: (record: AnalysisRecord) => AnalysisRecord): StoreState {
  const record = state.analyses[analysisId];
  if (!record) return state;
  const next = update(record);
  return next === record ? state : { ...state, analyses: { ...state.analyses, [analysisId]: next } };
}

function isActive(record: AnalysisRecord, key: RequestKey, requestId: string): boolean {
  return record.requests[key]?.requestId === requestId;
}

export function reducer(state: StoreState, action: Action): StoreState {
  switch (action.type) {
    case "createAnalysis":
      return { ...state, analyses: { ...state.analyses, [action.id]: newAnalysisRecord(action.id, action.title, action.patient, action.now) } };

    case "setPatient":
      return updateAnalysis(state, action.analysisId, (r) => ({ ...r, patient: action.patient, updatedAt: action.now }));

    case "setMethod":
      return updateAnalysis(state, action.analysisId, (r) => (r.method === action.method ? r : { ...r, method: action.method }));

    case "renameAnalysis":
      return updateAnalysis(state, action.analysisId, (r) => ({ ...r, title: action.title, updatedAt: action.now }));

    case "deleteAnalysis": {
      if (!state.analyses[action.analysisId]) return state;
      const { [action.analysisId]: removed, ...rest } = state.analyses;
      void removed;
      return { ...state, analyses: rest };
    }

    case "editFact":
      return updateAnalysis(state, action.analysisId, (r) =>
        withDraftChange(r, editFact(r.draft, action.fieldPath, action.value), action.now, [action.fieldPath]),
      );

    case "resolveConflict":
      return updateAnalysis(state, action.analysisId, (r) =>
        withDraftChange(r, resolveConflict(r.draft, action.fieldPath, action.candidate), action.now, [action.fieldPath]),
      );

    case "addProcedure":
      return updateAnalysis(state, action.analysisId, (r) => withDraftChange(r, addProcedure(r.draft), action.now, []));

    case "removeProcedure":
      return updateAnalysis(state, action.analysisId, (r) => withDraftChange(r, removeProcedure(r.draft, action.procedureId), action.now, []));

    case "beginRequest":
      if (action.epoch !== state.epoch) return state;
      return updateAnalysis(state, action.analysisId, (r) => ({
        ...r,
        requests: { ...r.requests, [action.key]: { requestId: action.requestId, revision: r.draft.revision } },
      }));

    case "endRequest":
      return updateAnalysis(state, action.analysisId, (r) => {
        if (!isActive(r, action.key, action.requestId)) return r;
        const requests = { ...r.requests };
        delete requests[action.key];
        return { ...r, requests };
      });

    case "applyExtraction":
      if (action.epoch !== state.epoch) return state;
      return updateAnalysis(state, action.analysisId, (r) => {
        if (!isActive(r, action.key, action.requestId)) return r; // late or replaced source
        const requests = { ...r.requests };
        if (!action.keepRequest) delete requests[action.key];
        const settled = { ...r, requests };
        if (isNameMismatch(r.patient, action.extraction.identity)) {
          return {
            ...settled,
            identityCheck: {
              requestKey: action.key,
              reportName: action.extraction.identity?.name ?? null,
              reportDateOfBirth: action.extraction.identity?.dateOfBirth ?? null,
              extraction: action.extraction,
            },
          };
        }
        return mergeExtraction(settled, action.extraction, action.now);
      });

    case "applyDirectProposals":
      return updateAnalysis(state, action.analysisId, (r) => mergeExtraction(r, action.extraction, action.now));

    case "resolveIdentityCheck":
      return updateAnalysis(state, action.analysisId, (r) => {
        if (!r.identityCheck) return r;
        const cleared = { ...r, identityCheck: null };
        return action.accept ? mergeExtraction(cleared, r.identityCheck.extraction, action.now) : cleared;
      });

    case "removeSource":
      return updateAnalysis(state, action.analysisId, (r) => {
        const draft = removeSource(r.draft, action.sourceId);
        const changed = Object.keys(r.draft.facts).filter((path) => r.draft.facts[path] !== draft.facts[path]);
        return withDraftChange(r, draft, action.now, changed);
      });

    case "setReportFile":
      return updateAnalysis(state, action.analysisId, (r) => ({ ...r, reportFile: action.file }));

    case "appendVoiceTurn":
      if (action.epoch !== state.epoch) return state;
      return updateAnalysis(state, action.analysisId, (r) => {
        if (!isActive(r, "voice", action.requestId)) return r;
        const turns = r.voiceTurns[action.sessionId] ?? [];
        if (turns.some((t) => t.turnId === action.turn.turnId)) return r;
        return { ...r, voiceTurns: { ...r.voiceTurns, [action.sessionId]: [...turns, action.turn] } };
      });

    case "setFinancialConfirmed":
      return updateAnalysis(state, action.analysisId, (r) => ({ ...r, confirmation: { ...r.confirmation, financialConfirmed: action.value } }));

    case "setTimingAffirmed":
      return updateAnalysis(state, action.analysisId, (r) => ({ ...r, confirmation: { ...r.confirmation, timingAffirmed: action.value } }));

    case "startCalculation":
      if (action.epoch !== state.epoch) return state;
      return updateAnalysis(state, action.analysisId, (r) => {
        if (action.revision !== r.draft.revision) return r;
        if (!r.confirmation.financialConfirmed || !r.confirmation.timingAffirmed) {
          throw new Error("startCalculation requires both the financial confirmation and the separate timing affirmation");
        }
        const paths = [...groupFieldPaths(r.draft, "plan"), ...groupFieldPaths(r.draft, "care"), ...groupFieldPaths(r.draft, "timing")];
        return {
          ...r,
          draft: markConfirmed(r.draft, paths),
          requests: { ...r.requests, calculation: { requestId: action.requestId, revision: action.revision } },
          result: { status: "calculating", requestId: action.requestId, revision: action.revision },
        };
      });

    case "calculationSettled":
      if (action.epoch !== state.epoch) return state;
      return updateAnalysis(state, action.analysisId, (r) => {
        if (!isActive(r, "calculation", action.requestId) || action.revision !== r.draft.revision) return r;
        const requests = { ...r.requests };
        delete requests.calculation;
        const { outcome } = action;
        let result: ResultState;
        if (!outcome.ok) result = { status: "failed", revision: action.revision, error: outcome.error };
        else if (outcome.value.kind === "unavailable") result = { status: "unavailable", revision: action.revision, message: outcome.value.message };
        else if (outcome.value.comparison.inputRevision !== action.revision) {
          result = { status: "failed", revision: action.revision, error: { code: "CONFLICT", message: "The result was for an older version of your details. Try again.", retryable: true } };
        } else {
          result = {
            status: "calculated",
            revision: action.revision,
            comparison: outcome.value.comparison,
            sourceMode: outcome.value.sourceMode,
            fixtureName: outcome.value.fixtureName,
            confirmedAt: action.now,
          };
        }
        return { ...r, requests, result, updatedAt: action.now };
      });

    case "markSaved":
      // A save acknowledged after Clear or an edit must not mark the new draft as saved.
      return updateAnalysis(state, action.analysisId, (r) =>
        currentResult(r)?.revision === action.saved.revision ? { ...r, saved: action.saved, updatedAt: action.now } : r,
      );

    case "clearSavedSnapshot": {
      let changed = false;
      const analyses = Object.fromEntries(
        Object.entries(state.analyses).map(([id, r]) => {
          if (r.saved?.snapshotId !== action.snapshotId) return [id, r];
          changed = true;
          return [id, { ...r, saved: null }];
        }),
      );
      return changed ? { ...state, analyses } : state;
    }

    case "clearDraft":
      return updateAnalysis(state, action.analysisId, (r) => ({
        ...newAnalysisRecord(r.id, r.title, r.patient, r.createdAt),
        updatedAt: action.now,
      }));

    case "setProfile":
      return { ...state, profile: action.profile };

    case "setAuth":
      return { ...state, auth: action.auth };

    case "resetSession":
      return { ...state, epoch: state.epoch + 1, analyses: action.analyses, profile: action.profile };
  }
}

// --- Derived views ------------------------------------------------------------

export type AnalysisStatus = "draft" | "needsReview" | "compared";

export function analysisStatus(record: AnalysisRecord): AnalysisStatus {
  if (record.result.status === "calculated" && record.result.revision === record.draft.revision) return "compared";
  return Object.keys(record.draft.facts).length > 0 ? "needsReview" : "draft";
}

/** The current, non-stale calculated result, or null. */
export function currentResult(record: AnalysisRecord): Extract<ResultState, { status: "calculated" }> | null {
  return record.result.status === "calculated" && record.result.revision === record.draft.revision ? record.result : null;
}

export function labelForField(path: string): string {
  return getFieldDefinition(path).label;
}
