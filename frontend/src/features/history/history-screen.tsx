"use client";

import { FlaskConicalIcon, HistoryIcon, PlusIcon, SearchIcon, SearchXIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { EmptyState, ErrorPanel, Notice } from "@/components/shared/feedback";
import { Page, PageHeader } from "@/components/shared/page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useAnalysisController } from "@/features/analysis/analysis-provider";
import type { HistoryStatusFilter } from "@/lib/adapters/types";
import { patientDetailsOf } from "./patient-details";
import { RemoveAttachmentDialog, DeleteDialog, RenameDialog } from "./history-dialogs";
import { draftItems, draftMatchesSearch, matchesFilter, snapshotItems, sortNewestFirst, type DraftItem, type HistoryItem } from "./history-items";
import { HistoryRow } from "./history-row";
import { targetOf, useHistoryActions, type ActionTarget } from "./use-history-actions";
import { useSnapshotList } from "./use-snapshots";

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 250;

const FILTERS: { value: HistoryStatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "draft", label: "Draft" },
  { value: "needsReview", label: "Needs review" },
  { value: "compared", label: "Compared" },
];

function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

export function HistoryScreen() {
  const router = useRouter();
  const { state, adapters, startSampleAnalysis } = useAnalysisController();
  const actions = useHistoryActions();

  const [searchText, setSearchText] = useState("");
  const [filter, setFilter] = useState<HistoryStatusFilter>("all");
  const search = useDebounced(searchText, SEARCH_DEBOUNCE_MS);
  const filtersActive = searchText.trim() !== "" || filter !== "all";

  const snapshots = useSnapshotList(search, PAGE_SIZE);
  const showsSnapshots = filter === "all" || filter === "compared";

  const [renameTarget, setRenameTarget] = useState<ActionTarget | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ActionTarget | null>(null);
  const [attachmentItem, setAttachmentItem] = useState<DraftItem | null>(null);
  const [duplicatingKey, setDuplicatingKey] = useState<string | null>(null);
  const [duplicateError, setDuplicateError] = useState<string | null>(null);

  const items = useMemo<HistoryItem[]>(() => {
    const drafts = draftItems(state.analyses).filter((item) => draftMatchesSearch(item, search));
    const saved = showsSnapshots && snapshots.state.status === "ready" ? snapshotItems(snapshots.state.items) : [];
    return sortNewestFirst([...drafts, ...saved]).filter((item) => matchesFilter(item, filter));
  }, [state.analyses, search, showsSnapshots, snapshots.state, filter]);

  function clearFilters() {
    setSearchText("");
    setFilter("all");
  }

  async function duplicate(item: HistoryItem) {
    if (item.kind !== "snapshot") return;
    setDuplicatingKey(item.key);
    setDuplicateError(null);
    const failure = await actions.duplicateById(item.summary.id);
    setDuplicatingKey(null);
    if (failure) setDuplicateError(failure);
  }

  function startSample() {
    const analysisId = startSampleAnalysis(state.profile ? patientDetailsOf(state.profile) : null);
    router.push(`/analysis/${analysisId}/confirm`);
  }

  const loading = showsSnapshots && snapshots.state.status === "loading";
  const loadFailed = showsSnapshots && snapshots.state.status === "error" ? snapshots.state.error : null;
  const nothingAtAll = !loading && items.length === 0 && !loadFailed;

  return (
    <Page>
      <PageHeader
        title="History"
        description="Your drafts and saved comparisons, newest first."
        actions={
          <Button asChild variant="outline">
            <Link href="/analysis/new">
              <PlusIcon aria-hidden />
              New analysis
            </Link>
          </Button>
        }
      />

      {adapters.history.persistence === "session" && (
        <div className="mb-8">
          <Notice>Demo history lasts for this session. Refreshing resets it.</Notice>
        </div>
      )}

      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="relative w-full md:max-w-sm">
          <Label htmlFor="history-search" className="sr-only">
            Search analyses
          </Label>
          <SearchIcon aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input id="history-search" type="search" value={searchText} onChange={(event) => setSearchText(event.target.value)} placeholder="Search by name or procedure" className="pl-9" />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <ToggleGroup
            type="single"
            variant="outline"
            value={filter}
            onValueChange={(value) => value && setFilter(value as HistoryStatusFilter)}
            aria-label="Filter by status"
            className="flex-wrap"
          >
            {FILTERS.map(({ value, label }) => (
              <ToggleGroupItem key={value} value={value} className="h-11 px-4">
                {label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          {filtersActive && (
            <Button variant="link" onClick={clearFilters}>
              Clear filters
            </Button>
          )}
        </div>
      </div>

      {duplicateError && (
        <div className="mb-6">
          <ErrorPanel title="Couldn't duplicate that analysis" error={duplicateError} />
        </div>
      )}

      {loadFailed && (
        <div className="mb-6">
          <ErrorPanel title="Couldn't load saved analyses" error={loadFailed} onRetry={snapshots.retry} retryLabel="Retry" />
        </div>
      )}

      <p aria-live="polite" className="mb-2 text-sm text-muted-foreground">
        {loading ? "Loading analyses" : `${items.length} ${items.length === 1 ? "analysis" : "analyses"}`}
      </p>

      {items.length > 0 && (
        <ul className="space-y-3 md:space-y-0 md:divide-y md:border-y">
          {items.map((item) => (
            <HistoryRow
              key={item.key}
              item={item}
              duplicating={duplicatingKey === item.key}
              onRename={() => setRenameTarget(targetOf(item))}
              onDelete={() => setDeleteTarget(targetOf(item))}
              onDuplicate={() => void duplicate(item)}
              onRemoveAttachment={() => item.kind === "draft" && setAttachmentItem(item)}
            />
          ))}
        </ul>
      )}

      {loading && <SkeletonRows />}

      {showsSnapshots && snapshots.state.status === "ready" && snapshots.state.nextCursor && (
        <div className="mt-6 flex flex-col items-start gap-2">
          <Button variant="outline" onClick={snapshots.loadMore} disabled={snapshots.loadingMore}>
            {snapshots.loadingMore && <Spinner />}
            Load more
          </Button>
          {snapshots.loadMoreError && <p role="alert" className="text-sm text-destructive">Couldn&apos;t load more. {snapshots.loadMoreError.message}</p>}
        </div>
      )}

      {nothingAtAll && (filtersActive ? <NoMatches onClear={clearFilters} /> : <FirstRun onSample={startSample} />)}

      <RenameDialog target={renameTarget} onClose={() => setRenameTarget(null)} onRename={actions.rename} />
      <DeleteDialog target={deleteTarget} onClose={() => setDeleteTarget(null)} onDelete={actions.remove} />
      <RemoveAttachmentDialog
        open={attachmentItem !== null}
        fileName={attachmentItem?.report?.name ?? "report"}
        analysisTitle={attachmentItem?.title ?? ""}
        onClose={() => setAttachmentItem(null)}
        onConfirm={() => {
          if (attachmentItem) actions.removeAttachment(attachmentItem);
          setAttachmentItem(null);
        }}
      />
    </Page>
  );
}

function SkeletonRows() {
  return (
    <div aria-hidden className="space-y-3 md:space-y-0 md:divide-y md:border-y">
      {[0, 1, 2].map((row) => (
        <div key={row} className="space-y-3 rounded-lg border p-4 md:rounded-none md:border-0 md:px-1 md:py-6">
          <Skeleton className="h-5 w-56 max-w-full" />
          <Skeleton className="h-4 w-40 max-w-full" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
      ))}
    </div>
  );
}

function NoMatches({ onClear }: { onClear: () => void }) {
  return (
    <EmptyState icon={SearchXIcon} title="No analyses match" description="Try a different search or status.">
      <Button onClick={onClear}>Clear filters</Button>
    </EmptyState>
  );
}

function FirstRun({ onSample }: { onSample: () => void }) {
  return (
    <EmptyState icon={HistoryIcon} title="Your analyses will appear here." description="Start with your own plan details, or try the synthetic sample treatment.">
      <Button asChild>
        <Link href="/analysis/new">
          <PlusIcon aria-hidden />
          New analysis
        </Link>
      </Button>
      <Button variant="outline" onClick={onSample}>
        <FlaskConicalIcon aria-hidden />
        Use sample treatment
      </Button>
    </EmptyState>
  );
}
