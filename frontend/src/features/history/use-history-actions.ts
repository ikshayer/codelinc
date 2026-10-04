"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { toast } from "sonner";

import { useAnalysisController } from "@/features/analysis/analysis-provider";
import type { AnalysisSnapshot } from "@/lib/domain/types";
import type { DraftItem, HistoryItem } from "./history-items";

// Mutations shared by History and Snapshot detail. Each returns an error
// message when it fails (null on success) so dialogs can show it inline and
// success is only reported after the repository acknowledged the change.

export type ActionTarget = { kind: "draft"; analysisId: string; title: string } | { kind: "snapshot"; snapshotId: string; title: string };

export function targetOf(item: HistoryItem): ActionTarget {
  return item.kind === "draft"
    ? { kind: "draft", analysisId: item.analysisId, title: item.title }
    : { kind: "snapshot", snapshotId: item.summary.id, title: item.summary.title };
}

export const MAX_TITLE_LENGTH = 80;

export function validateTitle(raw: string): { title: string } | { error: string } {
  const title = raw.trim();
  if (!title) return { error: "Enter a name for this analysis." };
  if (title.length > MAX_TITLE_LENGTH) return { error: `Use ${MAX_TITLE_LENGTH} characters or fewer.` };
  return { title };
}

export function useHistoryActions() {
  const router = useRouter();
  const { state, adapters, renameAnalysis, deleteAnalysis, removeSource, setReportFile, createFromSnapshot, clearSavedSnapshot, bumpHistory } = useAnalysisController();
  const repository = adapters.history;
  // Session epoch at render time; a sign-out or reset in flight makes older work stale.
  const epochRef = useRef(state.epoch);
  const unmounted = useRef(new AbortController());
  useEffect(() => {
    epochRef.current = state.epoch;
  }, [state.epoch]);
  useEffect(() => {
    const controller = new AbortController();
    unmounted.current = controller;
    return () => controller.abort();
  }, []);

  /** Renames the title only. A saved snapshot's facts and results never change. */
  async function rename(target: ActionTarget, rawTitle: string): Promise<string | null> {
    const checked = validateTitle(rawTitle);
    if ("error" in checked) return checked.error;
    if (target.kind === "draft") {
      renameAnalysis(target.analysisId, checked.title);
    } else {
      const result = await repository.rename(target.snapshotId, checked.title);
      if (!result.ok) return result.error.message;
      bumpHistory();
    }
    toast.success("Name updated");
    return null;
  }

  async function remove(target: ActionTarget): Promise<string | null> {
    if (target.kind === "draft") {
      deleteAnalysis(target.analysisId);
    } else {
      const result = await repository.remove(target.snapshotId);
      if (!result.ok) return result.error.message;
      clearSavedSnapshot(target.snapshotId);
      bumpHistory();
    }
    toast.success(`Deleted “${target.title}”`);
    return null;
  }

  /** Detaches the report from a draft and removes the values only that report supplied. */
  function removeAttachment(item: DraftItem): void {
    if (item.report?.reportId) removeSource(item.analysisId, item.report.reportId);
    setReportFile(item.analysisId, null);
    toast.success("Report removed from this draft");
  }

  /** "Duplicate as new analysis": the copy is a new draft that needs review again. */
  function duplicate(snapshot: AnalysisSnapshot): void {
    const analysisId = createFromSnapshot(snapshot);
    router.push(`/analysis/${analysisId}/confirm`);
  }

  async function duplicateById(snapshotId: string): Promise<string | null> {
    const epoch = epochRef.current;
    const signal = unmounted.current.signal;
    const result = await repository.get(snapshotId, signal);
    // Navigated away, signed out or reset meanwhile: don't import the snapshot into the new session.
    if (signal.aborted || epochRef.current !== epoch) return null;
    if (!result.ok) return result.error.message;
    duplicate(result.value);
    return null;
  }

  return { rename, remove, removeAttachment, duplicate, duplicateById };
}
