import { analysisStatus, type AnalysisRecord, type AnalysisStatus, type ReportFileMeta } from "@/features/analysis/state";
import type { HistoryStatusFilter, SnapshotSummary } from "@/lib/adapters/types";
import { evidenceKindsOf, factValue } from "@/lib/domain/draft";
import { carePaths } from "@/lib/domain/fields";
import type { EvidenceKind } from "@/lib/domain/types";

// One list model for Dashboard and History: drafts live in the analysis store,
// saved snapshots live in the history repository.

export interface DraftItem {
  kind: "draft";
  key: string;
  analysisId: string;
  title: string;
  patientName: string;
  createdAt: string;
  updatedAt: string;
  status: AnalysisStatus;
  inputKinds: EvidenceKind[];
  procedureLabels: string[];
  report: ReportFileMeta | null;
  resumeHref: string;
}

export interface SnapshotItem {
  kind: "snapshot";
  key: string;
  summary: SnapshotSummary;
  status: "compared";
  viewHref: string;
}

export type HistoryItem = DraftItem | SnapshotItem;

export const itemTitle = (item: HistoryItem) => (item.kind === "draft" ? item.title : item.summary.title);
export const itemPatientName = (item: HistoryItem) => (item.kind === "draft" ? item.patientName : item.summary.patientDisplayName);
export const itemCreatedAt = (item: HistoryItem) => (item.kind === "draft" ? item.createdAt : item.summary.createdAt);
/** Last activity: when a draft was last edited, or when a snapshot was saved. */
export const itemActivityAt = (item: HistoryItem) => (item.kind === "draft" ? item.updatedAt : item.summary.savedAt);
export const itemInputKinds = (item: HistoryItem) => (item.kind === "draft" ? item.inputKinds : item.summary.inputKinds);

/** Where Resume goes: Confirm once there are facts to review, otherwise back to intake. */
export function resumePath(record: AnalysisRecord): string {
  if (analysisStatus(record) === "compared") return `/analysis/${record.id}/compare`;
  if (Object.keys(record.draft.facts).length > 0) return `/analysis/${record.id}/confirm`;
  return record.method ? `/analysis/${record.id}/intake?method=${record.method}` : `/analysis/${record.id}/intake`;
}

export function hasWork(record: AnalysisRecord): boolean {
  return Object.keys(record.draft.facts).length > 0 || record.reportFile !== null || Object.keys(record.draft.evidence).length > 0;
}

function procedureLabelsOf(record: AnalysisRecord): string[] {
  return record.draft.procedureIds
    .map((id) => factValue(record.draft, carePaths.label(id)))
    .filter((label): label is string => typeof label === "string" && label.trim() !== "");
}

/**
 * A store analysis whose current revision was already saved is listed once, as
 * its snapshot. Editing it afterwards brings the draft back as its own row.
 */
function isCoveredBySnapshot(record: AnalysisRecord): boolean {
  return record.saved !== null && record.saved.revision === record.draft.revision && analysisStatus(record) === "compared";
}

export function draftItems(analyses: Record<string, AnalysisRecord>): DraftItem[] {
  return Object.values(analyses)
    .filter((record) => !isCoveredBySnapshot(record))
    .map((record) => ({
      kind: "draft" as const,
      key: `draft:${record.id}`,
      analysisId: record.id,
      title: record.title,
      patientName: record.patient?.displayName ?? "Guest",
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      status: analysisStatus(record),
      inputKinds: evidenceKindsOf(record.draft),
      procedureLabels: procedureLabelsOf(record),
      report: record.reportFile,
      resumeHref: resumePath(record),
    }));
}

export function snapshotItems(summaries: readonly SnapshotSummary[]): SnapshotItem[] {
  return summaries.map((summary) => ({ kind: "snapshot" as const, key: `snapshot:${summary.id}`, summary, status: "compared" as const, viewHref: `/history/${summary.id}` }));
}

/** Snapshots are already searched by the adapter; drafts match on title and procedure labels. */
export function draftMatchesSearch(item: DraftItem, search: string): boolean {
  const needle = search.trim().toLowerCase();
  if (!needle) return true;
  return [item.title, ...item.procedureLabels].some((text) => text.toLowerCase().includes(needle));
}

export function matchesFilter(item: HistoryItem, filter: HistoryStatusFilter): boolean {
  return filter === "all" || item.status === filter;
}

export function sortNewestFirst(items: readonly HistoryItem[]): HistoryItem[] {
  return [...items].sort((a, b) => {
    const left = itemActivityAt(a);
    const right = itemActivityAt(b);
    if (left === right) return a.key < b.key ? 1 : -1;
    return left < right ? 1 : -1;
  });
}

/** The most recently edited analysis that hasn't been compared yet. */
export function latestDraft(analyses: Record<string, AnalysisRecord>): AnalysisRecord | null {
  let latest: AnalysisRecord | null = null;
  for (const record of Object.values(analyses)) {
    if (analysisStatus(record) === "compared") continue;
    if (!latest || record.updatedAt > latest.updatedAt) latest = record;
  }
  return latest;
}
