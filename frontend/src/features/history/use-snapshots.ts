"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useAnalysisController } from "@/features/analysis/analysis-provider";
import type { AdapterError, SnapshotSummary } from "@/lib/adapters/types";
import type { AnalysisSnapshot } from "@/lib/domain/types";

// Repository reads for History, Dashboard and Snapshot detail. Results are
// keyed by the request that produced them, so a late reply for an older
// search, retry or history version is never shown.

export type SnapshotListState =
  | { status: "loading" }
  | { status: "error"; error: AdapterError }
  | { status: "ready"; items: SnapshotSummary[]; nextCursor: string | null };

type SettledList = Exclude<SnapshotListState, { status: "loading" }>;

export interface SnapshotList {
  state: SnapshotListState;
  retry: () => void;
  loadMore: () => void;
  loadingMore: boolean;
  loadMoreError: AdapterError | null;
}

/** Saved snapshots matching a search, refetched whenever history changes. */
export function useSnapshotList(search: string, pageSize: number): SnapshotList {
  const { adapters, historyVersion } = useAnalysisController();
  const repository = adapters.history;
  const [attempt, setAttempt] = useState(0);
  const key = `${historyVersion}|${attempt}|${pageSize}|${search}`;
  const [settled, setSettled] = useState<{ key: string; state: SettledList } | null>(null);
  const [more, setMore] = useState<{ key: string; error: AdapterError | null } | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    controllerRef.current = controller;
    void repository.list({ search, cursor: null, limit: pageSize }, controller.signal).then((result) => {
      if (controller.signal.aborted) return;
      setSettled({
        key,
        state: result.ok ? { status: "ready", items: result.value.items, nextCursor: result.value.nextCursor } : { status: "error", error: result.error },
      });
    });
    return () => controller.abort();
  }, [key, repository, search, pageSize]);

  const current = settled?.key === key ? settled.state : null;
  const loadMore = useCallback(() => {
    const signal = controllerRef.current?.signal;
    if (!signal || !current || current.status !== "ready" || !current.nextCursor) return;
    const { items: previous, nextCursor } = current;
    setMore({ key, error: null });
    void repository.list({ search, cursor: nextCursor, limit: pageSize }, signal).then((result) => {
      if (signal.aborted) return;
      if (result.ok) {
        setSettled({ key, state: { status: "ready", items: [...previous, ...result.value.items], nextCursor: result.value.nextCursor } });
        setMore(null);
      } else {
        setMore({ key, error: result.error });
      }
    });
  }, [current, key, pageSize, repository, search]);

  const moreForKey = more?.key === key ? more : null;
  return {
    state: current ?? { status: "loading" },
    retry: () => setAttempt((n) => n + 1),
    loadMore,
    loadingMore: moreForKey !== null && moreForKey.error === null,
    loadMoreError: moreForKey?.error ?? null,
  };
}

export type SnapshotState =
  | { status: "loading" }
  | { status: "notFound" }
  | { status: "error"; error: AdapterError }
  | { status: "ready"; snapshot: AnalysisSnapshot };

/** One saved snapshot, loaded through the repository. */
export function useSnapshot(snapshotId: string): { state: SnapshotState; retry: () => void } {
  const { adapters } = useAnalysisController();
  const repository = adapters.history;
  const [attempt, setAttempt] = useState(0);
  const key = `${snapshotId}|${attempt}`;
  const [settled, setSettled] = useState<{ key: string; state: Exclude<SnapshotState, { status: "loading" }> } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void repository.get(snapshotId, controller.signal).then((result) => {
      if (controller.signal.aborted) return;
      if (result.ok) setSettled({ key, state: { status: "ready", snapshot: result.value } });
      else if (result.error.code === "NOT_FOUND") setSettled({ key, state: { status: "notFound" } });
      else setSettled({ key, state: { status: "error", error: result.error } });
    });
    return () => controller.abort();
  }, [key, repository, snapshotId]);

  return { state: settled?.key === key ? settled.state : { status: "loading" }, retry: () => setAttempt((n) => n + 1) };
}
