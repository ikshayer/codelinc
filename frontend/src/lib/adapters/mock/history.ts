import { createSeedSnapshots } from "@/fixtures/seed-history";
import type { AnalysisSnapshot } from "@/lib/domain/types";
import { adapterError, isAbortError, newId, wait } from "../shared";
import { fail, ok, type AdapterResult, type HistoryPage, type HistoryQuery, type HistoryRepository, type SaveSnapshotInput, type SnapshotSummary } from "../types";
import { getDemoScenarios, mockLatency } from "./demo-scenarios";

// Session-memory history for demo mode. Mutations behave like real async calls:
// latency, cancellation, cursor paging, idempotent save, versioning and
// switchable failures. A refresh restores the seeded synthetic set.

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function frozenCopy<T>(value: T): T {
  return deepFreeze(structuredClone(value));
}

function summarize(snapshot: AnalysisSnapshot): SnapshotSummary {
  return {
    id: snapshot.id,
    analysisId: snapshot.analysisId,
    version: snapshot.version,
    title: snapshot.title,
    patientDisplayName: snapshot.patientDisplayName,
    createdAt: snapshot.createdAt,
    savedAt: snapshot.savedAt,
    confirmedAt: snapshot.confirmedAt,
    inputKinds: snapshot.inputKinds,
    baselinePatientCents: snapshot.comparison.baseline.totalPatientCents,
    bestPatientCents: snapshot.comparison.best.totalPatientCents,
    sourceMode: snapshot.sourceMode,
    procedureLabels: Object.values(snapshot.procedureLabels),
  };
}

function matchesSearch(snapshot: AnalysisSnapshot, search: string): boolean {
  const needle = search.trim().toLowerCase();
  if (!needle) return true;
  return [snapshot.title, ...Object.values(snapshot.procedureLabels)].some((text) => text.toLowerCase().includes(needle));
}

/** Newest first; ID breaks ties so cursors stay stable. */
function compareNewestFirst(a: AnalysisSnapshot, b: AnalysisSnapshot): number {
  if (a.savedAt !== b.savedAt) return a.savedAt < b.savedAt ? 1 : -1;
  return a.id < b.id ? 1 : -1;
}

const cursorOf = (snapshot: AnalysisSnapshot) => `${snapshot.savedAt}|${snapshot.id}`;

function isAfterCursor(snapshot: AnalysisSnapshot, cursor: string): boolean {
  const [savedAt, id] = cursor.split("|");
  return snapshot.savedAt < savedAt || (snapshot.savedAt === savedAt && snapshot.id < id);
}

// Module-level so the data survives the repository being re-created while the
// page stays open, and resets with a refresh.
const snapshots = new Map<string, AnalysisSnapshot>();
const idempotencyKeys = new Map<string, string>();

function seed(): void {
  snapshots.clear();
  idempotencyKeys.clear();
  for (const snapshot of createSeedSnapshots()) snapshots.set(snapshot.id, frozenCopy(snapshot));
}
seed();

/** Simulated latency. Returns a CANCELLED result when the caller aborts, otherwise null. */
async function delay(ms: number, signal?: AbortSignal): Promise<AdapterResult<never> | null> {
  try {
    await wait(mockLatency(ms), signal);
    return null;
  } catch (error) {
    if (isAbortError(error)) return fail(adapterError("CANCELLED", "Request cancelled."));
    throw error;
  }
}

const unavailable = (action: string) => fail(adapterError("UNAVAILABLE", `Demo history couldn't ${action}. This is a simulated failure. Try again or change it in Profile.`, true));
const notFound = () => fail(adapterError("NOT_FOUND", "This saved analysis isn't in your demo history. It may have been deleted or reset.", false));

export function createMockHistoryRepository(): HistoryRepository {
  return {
    mode: "demo",
    persistence: "session",

    async list(query: HistoryQuery, signal: AbortSignal): Promise<AdapterResult<HistoryPage>> {
      const cancelled = await delay(350, signal);
      if (cancelled) return cancelled;
      if (getDemoScenarios().history === "loadFails") return unavailable("load");
      const matches = [...snapshots.values()].filter((s) => matchesSearch(s, query.search)).sort(compareNewestFirst);
      const remaining = query.cursor ? matches.filter((s) => isAfterCursor(s, query.cursor!)) : matches;
      const page = remaining.slice(0, query.limit);
      const hasMore = remaining.length > page.length;
      return ok({ items: page.map(summarize), nextCursor: hasMore ? cursorOf(page[page.length - 1]) : null });
    },

    async get(id: string, signal: AbortSignal): Promise<AdapterResult<AnalysisSnapshot>> {
      const cancelled = await delay(300, signal);
      if (cancelled) return cancelled;
      if (getDemoScenarios().history === "loadFails") return unavailable("load");
      const snapshot = snapshots.get(id);
      return snapshot ? ok(snapshot) : notFound();
    },

    async save(input: SaveSnapshotInput): Promise<AdapterResult<AnalysisSnapshot>> {
      await wait(mockLatency(450));
      if (getDemoScenarios().history === "saveFails") return unavailable("save");
      const existingId = idempotencyKeys.get(input.idempotencyKey);
      const existing = existingId ? snapshots.get(existingId) : undefined;
      if (existing) return ok(existing);

      const version = Math.max(0, ...[...snapshots.values()].filter((s) => s.analysisId === input.snapshot.analysisId).map((s) => s.version)) + 1;
      const saved = frozenCopy<AnalysisSnapshot>({ ...input.snapshot, id: newId("snap"), version, savedAt: new Date().toISOString() });
      snapshots.set(saved.id, saved);
      idempotencyKeys.set(input.idempotencyKey, saved.id);
      return ok(saved);
    },

    async rename(id: string, title: string): Promise<AdapterResult<SnapshotSummary>> {
      await wait(mockLatency(250));
      const trimmed = title.trim();
      if (!trimmed) return fail(adapterError("INVALID", "Enter a name for this analysis.", false, "title"));
      const snapshot = snapshots.get(id);
      if (!snapshot) return notFound();
      // Only the title (metadata) changes; facts and results stay exactly as saved.
      const renamed = frozenCopy({ ...snapshot, title: trimmed });
      snapshots.set(id, renamed);
      return ok(summarize(renamed));
    },

    async remove(id: string): Promise<AdapterResult<void>> {
      await wait(mockLatency(300));
      if (getDemoScenarios().history === "deleteFails") return unavailable("delete");
      if (!snapshots.delete(id)) return notFound();
      return ok(undefined);
    },

    async reset(): Promise<AdapterResult<void>> {
      await wait(mockLatency(150));
      seed();
      return ok(undefined);
    },
  };
}
