"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";

import { createSeedSession } from "@/fixtures/seed-session";
import { sampleTreatmentProposals } from "@/fixtures/sample-treatment";
import { getAdapters } from "@/lib/adapters";
import { memberExtraction, memberProfile, type MemberData } from "@/lib/adapters/live/member-data";
import { newId } from "@/lib/adapters/shared";
import type { AdapterResult, Adapters, EngineCalculationOptions, IntakeExtraction } from "@/lib/adapters/types";
import { evidenceKindsOf } from "@/lib/domain/draft";
import { buildConfirmedScenario, draftValuesFromScenario } from "@/lib/domain/scenario";
import type { AnalysisSnapshot, FactCandidate, FieldValue, PatientDetails, PatientProfile, ProcedureId, ValidationIssue } from "@/lib/domain/types";
import {
  currentResult,
  reducer,
  type Action,
  type AnalysisRecord,
  type AuthUiState,
  type IntakeMethod,
  type ReportFileMeta,
  type RequestKey,
  type StoreState,
  type TranscriptTurn,
} from "./state";

export interface RequestTicket {
  analysisId: string;
  key: RequestKey;
  requestId: string;
  revision: number;
  epoch: number;
  signal: AbortSignal;
}

export type CompareAttempt =
  | { status: "blocked"; issues: ValidationIssue[] }
  | { status: "needsConfirmation"; missing: ("financial" | "timing")[] }
  | { status: "started" };

export interface AnalysisController {
  state: StoreState;
  adapters: Adapters;
  createAnalysis(patient: PatientDetails | null, title?: string, memberData?: MemberData): string;
  createFromMember(data: MemberData): string;
  setPatient(analysisId: string, patient: PatientDetails): void;
  setMethod(analysisId: string, method: IntakeMethod): void;
  renameAnalysis(analysisId: string, title: string): void;
  deleteAnalysis(analysisId: string): void;
  editFact(analysisId: string, fieldPath: string, value: FieldValue): void;
  resolveConflict(analysisId: string, fieldPath: string, candidate: FactCandidate): void;
  addProcedure(analysisId: string): void;
  removeProcedure(analysisId: string, procedureId: ProcedureId): void;
  /** Starts an async source request. Aborts the previous request for the same key. */
  startRequest(analysisId: string, key: RequestKey): RequestTicket;
  /** Aborts a request and forgets it, so any late reply is ignored. */
  cancelRequest(ticket: RequestTicket): void;
  /** Ends a request that finished without proposals (e.g. failure). */
  finishRequest(ticket: RequestTicket): void;
  applyExtraction(ticket: RequestTicket, extraction: IntakeExtraction, options?: { keepRequest?: boolean }): void;
  appendVoiceTurn(ticket: RequestTicket, sessionId: string, turn: TranscriptTurn): void;
  loadSample(analysisId: string): void;
  /** Creates an analysis for the given (or demo) patient pre-filled with the sample treatment. Returns its ID. */
  startSampleAnalysis(patient: PatientDetails | null): string;
  /** "Duplicate as new analysis": a new draft from a saved snapshot's facts. It needs review again. */
  createFromSnapshot(snapshot: AnalysisSnapshot): string;
  resolveIdentityCheck(analysisId: string, accept: boolean): void;
  removeSource(analysisId: string, sourceId: string): void;
  setReportFile(analysisId: string, file: ReportFileMeta | null): void;
  setFinancialConfirmed(analysisId: string, value: boolean): void;
  setTimingAffirmed(analysisId: string, value: boolean): void;
  compare(analysisId: string, engineOptions?: EngineCalculationOptions): CompareAttempt;
  saveToHistory(analysisId: string): Promise<AdapterResult<AnalysisSnapshot>>;
  /** A saved snapshot was deleted: analyses that pointed at it are no longer saved. */
  clearSavedSnapshot(snapshotId: string): void;
  clearDraft(analysisId: string): void;
  setProfile(profile: PatientProfile | null): void;
  /** Records the auth session after sign-in/out. Account changes should also call resetSession. */
  setAuth(auth: AuthUiState): void;
  /** Sign-out, account switch or demo reset: stops media, aborts requests, clears client data. */
  resetSession(options: { reseed: boolean }): void;
  /** Registers media/session cleanup (mic tracks, playback, voice sessions). Returns an unregister function. */
  registerTeardown(analysisId: string, teardown: () => void): () => void;
  /** Bumps when history should be refetched (save, rename, delete, reset). */
  historyVersion: number;
  bumpHistory(): void;
}

const AnalysisContext = createContext<AnalysisController | null>(null);

function nowIso(): string {
  return new Date().toISOString();
}

export function AnalysisProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const engineDemo = pathname.startsWith("/care-window");
  const adapters = useMemo(() => getAdapters(), []);
  const [initialState] = useState<StoreState>(() => {
    const seed = createSeedSession(adapters.mode);
    return { epoch: 0, analyses: seed.analyses, profile: seed.profile, auth: { status: "loading" } };
  });
  const [state, rawDispatch] = useReducer(reducer, initialState);
  const [historyVersion, bumpHistoryVersion] = useReducer((n: number) => n + 1, 0);

  // Thunks read the latest state synchronously. Every action goes through
  // dispatch below, which applies the same pure reducer eagerly.
  const stateRef = useRef(initialState);
  const dispatch = useCallback((action: Action) => {
    stateRef.current = reducer(stateRef.current, action);
    rawDispatch(action);
  }, []);


  const controllers = useRef(new Map<string, AbortController>());
  const teardowns = useRef(new Map<string, Set<() => void>>());
  const saveKeys = useRef(new Map<string, string>());

  const abortWhere = useCallback((predicate: (key: string) => boolean) => {
    for (const [key, controller] of controllers.current) {
      if (predicate(key)) {
        controller.abort();
        controllers.current.delete(key);
      }
    }
  }, []);

  const runTeardowns = useCallback((predicate: (analysisId: string) => boolean) => {
    for (const [analysisId, set] of teardowns.current) {
      if (!predicate(analysisId)) continue;
      for (const teardown of set) teardown();
      teardowns.current.delete(analysisId);
    }
  }, []);

  const forgetSaveKeys = useCallback((analysisId: string) => {
    for (const key of saveKeys.current.keys()) if (key.startsWith(`${analysisId}:`)) saveKeys.current.delete(key);
  }, []);

  const startRequest = useCallback(
    (analysisId: string, key: RequestKey): RequestTicket => {
      const record = stateRef.current.analyses[analysisId];
      if (!record) throw new Error(`startRequest: unknown analysis ${analysisId}`);
      const registryKey = `${analysisId}:${key}`;
      controllers.current.get(registryKey)?.abort();
      const controller = new AbortController();
      controllers.current.set(registryKey, controller);
      const requestId = newId(key);
      const epoch = stateRef.current.epoch;
      dispatch({ type: "beginRequest", analysisId, key, requestId, epoch });
      return { analysisId, key, requestId, revision: record.draft.revision, epoch, signal: controller.signal };
    },
    [dispatch],
  );

  const releaseController = useCallback((ticket: RequestTicket) => {
    const registryKey = `${ticket.analysisId}:${ticket.key}`;
    const controller = controllers.current.get(registryKey);
    if (controller?.signal === ticket.signal) controllers.current.delete(registryKey);
    return controller?.signal === ticket.signal ? controller : null;
  }, []);

  const cancelRequest = useCallback(
    (ticket: RequestTicket) => {
      releaseController(ticket)?.abort();
      dispatch({ type: "endRequest", analysisId: ticket.analysisId, key: ticket.key, requestId: ticket.requestId });
    },
    [dispatch, releaseController],
  );

  const finishRequest = useCallback(
    (ticket: RequestTicket) => {
      releaseController(ticket);
      dispatch({ type: "endRequest", analysisId: ticket.analysisId, key: ticket.key, requestId: ticket.requestId });
    },
    [dispatch, releaseController],
  );

  const compare = useCallback(
    (analysisId: string, engineOptions?: EngineCalculationOptions): CompareAttempt => {
      const record = stateRef.current.analyses[analysisId];
      if (!record) throw new Error(`compare: unknown analysis ${analysisId}`);
      const identity = record.patient?.memberId && record.patient.dateOfBirth ? { memberId: record.patient.memberId, dateOfBirth: record.patient.dateOfBirth } : null;
      if (record.patient?.memberId && (!identity || record.memberData?.member.member_id !== identity.memberId || record.memberData.member.date_of_birth !== identity.dateOfBirth)) return { status: "blocked", issues: [{ code: "MEMBER_IDENTITY_MISMATCH", fieldPath: "plan.y1.alreadyUsed", message: "Verify the member ID and date of birth again before calculating member benefits.", severity: "blocking" }] };
      const built = buildConfirmedScenario(record.draft);
      if (!built.ok) return { status: "blocked", issues: built.issues };
      const missing: ("financial" | "timing")[] = [];
      if (!record.confirmation.financialConfirmed) missing.push("financial");
      if (!record.confirmation.timingAffirmed) missing.push("timing");
      if (missing.length > 0) return { status: "needsConfirmation", missing };

      const ticket = startRequest(analysisId, "calculation");
      dispatch({ type: "startCalculation", analysisId, requestId: ticket.requestId, revision: ticket.revision, epoch: ticket.epoch });
      const scenario = { ...built.scenario, revision: ticket.revision };
      void adapters.calculation
        .compare(scenario, { analysisId, requestId: ticket.requestId, revision: ticket.revision, signal: ticket.signal, ...(engineOptions ? { engineOptions } : {}), ...(identity && record.memberData ? { memberIdentity: identity } : {}) })
        .catch((error: unknown) => {
          console.error("Calculation adapter failed", error);
          return { ok: false as const, error: { code: "UNKNOWN" as const, message: "The calculation failed unexpectedly. Your confirmed details are kept — try again.", retryable: true } };
        })
        .then((outcome) => {
          releaseController(ticket);
          if (!outcome.ok && outcome.error.code === "CANCELLED") return;
          dispatch({ type: "calculationSettled", analysisId, requestId: ticket.requestId, revision: ticket.revision, epoch: ticket.epoch, outcome, now: nowIso() });
        });
      return { status: "started" };
    },
    [adapters, dispatch, releaseController, startRequest],
  );

  const saveToHistory = useCallback(
    async (analysisId: string): Promise<AdapterResult<AnalysisSnapshot>> => {
      const record = stateRef.current.analyses[analysisId];
      const result = record ? currentResult(record) : null;
      if (!record || !result) {
        return { ok: false, error: { code: "CONFLICT", message: "Only a current, confirmed estimate can be saved. Compare again first.", retryable: false } };
      }
      const built = buildConfirmedScenario(record.draft);
      if (!built.ok) return { ok: false, error: { code: "CONFLICT", message: "Your details changed. Compare again before saving.", retryable: false } };
      // One idempotency key per (analysis, revision): retries never duplicate.
      const keyId = `${analysisId}:${result.revision}`;
      const idempotencyKey = saveKeys.current.get(keyId) ?? newId("save");
      saveKeys.current.set(keyId, idempotencyKey);
      const epoch = stateRef.current.epoch;
      const procedureLabels = Object.fromEntries(built.scenario.procedures.map((p) => [p.id, p.label]));
      const outcome = await adapters.history.save({
        idempotencyKey,
        snapshot: {
          analysisId,
          title: record.title,
          patientDisplayName: record.patient?.displayName ?? "Guest",
          createdAt: record.createdAt,
          confirmedAt: result.confirmedAt,
          engineVersion: result.comparison.baseline.engineVersion,
          sourceMode: result.sourceMode,
          fixtureName: result.fixtureName,
          scenario: { ...built.scenario, revision: result.revision },
          comparison: result.comparison,
          evidence: Object.values(record.draft.evidence),
          inputKinds: evidenceKindsOf(record.draft),
          procedureLabels,
        },
      });
      if (outcome.ok && stateRef.current.epoch === epoch) {
        dispatch({
          type: "markSaved",
          analysisId,
          saved: { snapshotId: outcome.value.id, version: outcome.value.version, revision: result.revision, idempotencyKey },
          now: nowIso(),
        });
        bumpHistoryVersion();
      }
      return outcome;
    },
    [adapters, dispatch],
  );

  const resetSession = useCallback(
    ({ reseed }: { reseed: boolean }) => {
      abortWhere(() => true);
      runTeardowns(() => true);
      saveKeys.current.clear();
      const seed = reseed ? createSeedSession(adapters.mode) : { analyses: {}, profile: null };
      dispatch({ type: "resetSession", analyses: seed.analyses, profile: seed.profile });
      bumpHistoryVersion();
    },
    [abortWhere, adapters.mode, dispatch, runTeardowns],
  );

  // Session state for the auth slice. Account changes reset client caches.
  useEffect(() => {
    if (engineDemo) return;
    const controller = new AbortController();
    void adapters.auth.getSession(controller.signal).then((result) => {
      if (controller.signal.aborted) return;
      dispatch({ type: "setAuth", auth: result.ok ? result.value : { status: "guest" } });
    });
    return () => controller.abort();
  }, [adapters, dispatch, engineDemo]);

  // Stop media and abort everything when the app unmounts.
  useEffect(() => {
    const controllerMap = controllers.current;
    const teardownMap = teardowns.current;
    return () => {
      for (const controller of controllerMap.values()) controller.abort();
      for (const set of teardownMap.values()) for (const teardown of set) teardown();
    };
  }, []);

  const value = useMemo<AnalysisController>(
    () => ({
      state,
      adapters,
      historyVersion,
      bumpHistory: bumpHistoryVersion,
      createFromMember(data) {
        const extraction = memberExtraction(data);
        const id = newId("an");
        const now = nowIso();
        const profile = memberProfile(data);
        dispatch({ type: "setProfile", profile });
        dispatch({ type: "createAnalysis", id, patient: profile, title: `${profile.displayName}'s treatment plan`, now, memberData: data });
        dispatch({ type: "setMethod", analysisId: id, method: "manual" });
        dispatch({ type: "applyDirectProposals", analysisId: id, extraction, now });
        return id;
      },
      createAnalysis(patient, title, memberData) {
        const id = newId("an");
        dispatch({ type: "createAnalysis", id, patient, title: title ?? (patient ? `${patient.displayName}'s treatment plan` : "Treatment plan"), now: nowIso(), ...(memberData ? { memberData } : {}) });
        return id;
      },
      setPatient: (analysisId, patient) => dispatch({ type: "setPatient", analysisId, patient, now: nowIso() }),
      setMethod: (analysisId, method) => dispatch({ type: "setMethod", analysisId, method }),
      renameAnalysis: (analysisId, title) => dispatch({ type: "renameAnalysis", analysisId, title, now: nowIso() }),
      deleteAnalysis(analysisId) {
        forgetSaveKeys(analysisId);
        abortWhere((key) => key.startsWith(`${analysisId}:`));
        runTeardowns((id) => id === analysisId);
        dispatch({ type: "deleteAnalysis", analysisId });
      },
      editFact: (analysisId, fieldPath, value) => dispatch({ type: "editFact", analysisId, fieldPath, value, now: nowIso() }),
      resolveConflict: (analysisId, fieldPath, candidate) => dispatch({ type: "resolveConflict", analysisId, fieldPath, candidate, now: nowIso() }),
      addProcedure: (analysisId) => dispatch({ type: "addProcedure", analysisId, now: nowIso() }),
      removeProcedure: (analysisId, procedureId) => dispatch({ type: "removeProcedure", analysisId, procedureId, now: nowIso() }),
      startRequest,
      cancelRequest,
      finishRequest,
      applyExtraction(ticket, extraction, options) {
        if (!options?.keepRequest) releaseController(ticket);
        dispatch({
          type: "applyExtraction",
          analysisId: ticket.analysisId,
          key: ticket.key,
          requestId: ticket.requestId,
          epoch: ticket.epoch,
          extraction,
          keepRequest: Boolean(options?.keepRequest),
          now: nowIso(),
        });
      },
      appendVoiceTurn: (ticket, sessionId, turn) =>
        dispatch({ type: "appendVoiceTurn", analysisId: ticket.analysisId, sessionId, requestId: ticket.requestId, epoch: ticket.epoch, turn }),
      loadSample(analysisId) {
        const { evidence, proposals } = sampleTreatmentProposals(nowIso());
        dispatch({
          type: "applyDirectProposals",
          analysisId,
          extraction: { proposals, evidence: [evidence], overflow: [], missingFieldPaths: [], reviewNotes: [] },
          now: nowIso(),
        });
      },
      startSampleAnalysis(patient) {
        const id = newId("an");
        const now = nowIso();
        dispatch({ type: "createAnalysis", id, patient, title: "Sample treatment", now });
        dispatch({ type: "setMethod", analysisId: id, method: "manual" });
        const { evidence, proposals } = sampleTreatmentProposals(now);
        dispatch({
          type: "applyDirectProposals",
          analysisId: id,
          extraction: { proposals, evidence: [evidence], overflow: [], missingFieldPaths: [], reviewNotes: [] },
          now,
        });
        return id;
      },
      createFromSnapshot(snapshot) {
        const id = newId("an");
        const now = nowIso();
        dispatch({
          type: "createAnalysis",
          id,
          patient: stateRef.current.profile ?? { displayName: snapshot.patientDisplayName },
          title: `Copy of ${snapshot.title}`,
          now,
        });
        dispatch({ type: "setMethod", analysisId: id, method: "manual" });
        const evidence = {
          id: newId("ev"),
          kind: "manual" as const,
          sourceId: `snapshot:${snapshot.id}:v${snapshot.version}`,
          sourceLabel: `Copied from “${snapshot.title}” (confirmed ${snapshot.confirmedAt.slice(0, 10)})`,
          receivedAt: now,
        };
        const proposals = Object.entries(draftValuesFromScenario(snapshot.scenario)).map(([fieldPath, value]) => ({ fieldPath, value, evidenceId: evidence.id }));
        dispatch({
          type: "applyDirectProposals",
          analysisId: id,
          extraction: { proposals, evidence: [evidence], overflow: [], missingFieldPaths: [], reviewNotes: [] },
          now,
        });
        return id;
      },
      resolveIdentityCheck: (analysisId, accept) => dispatch({ type: "resolveIdentityCheck", analysisId, accept, now: nowIso() }),
      removeSource: (analysisId, sourceId) => dispatch({ type: "removeSource", analysisId, sourceId, now: nowIso() }),
      setReportFile: (analysisId, file) => dispatch({ type: "setReportFile", analysisId, file }),
      setFinancialConfirmed: (analysisId, value) => dispatch({ type: "setFinancialConfirmed", analysisId, value }),
      setTimingAffirmed: (analysisId, value) => dispatch({ type: "setTimingAffirmed", analysisId, value }),
      compare,
      saveToHistory,
      clearDraft(analysisId) {
        // Revisions restart after Clear, so earlier idempotency keys must not be reused.
        forgetSaveKeys(analysisId);
        abortWhere((key) => key.startsWith(`${analysisId}:`));
        runTeardowns((id) => id === analysisId);
        dispatch({ type: "clearDraft", analysisId, now: nowIso() });
      },
      clearSavedSnapshot: (snapshotId) => dispatch({ type: "clearSavedSnapshot", snapshotId }),
      setProfile: (profile) => dispatch({ type: "setProfile", profile }),
      setAuth: (auth) => dispatch({ type: "setAuth", auth }),
      resetSession,
      registerTeardown(analysisId, teardown) {
        const set = teardowns.current.get(analysisId) ?? new Set();
        set.add(teardown);
        teardowns.current.set(analysisId, set);
        return () => set.delete(teardown);
      },
    }),
    [abortWhere, adapters, cancelRequest, compare, dispatch, finishRequest, forgetSaveKeys, historyVersion, releaseController, resetSession, runTeardowns, saveToHistory, startRequest, state],
  );

  return <AnalysisContext.Provider value={value}>{children}</AnalysisContext.Provider>;
}

export function useAnalysisController(): AnalysisController {
  const context = useContext(AnalysisContext);
  if (!context) throw new Error("useAnalysisController must be used inside <AnalysisProvider>");
  return context;
}

/** The analysis for a route, or null when the ID is missing or expired. */
export function useAnalysis(analysisId: string): AnalysisRecord | null {
  return useAnalysisController().state.analyses[analysisId] ?? null;
}
