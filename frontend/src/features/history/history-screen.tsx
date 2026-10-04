"use client";

import { FlaskConicalIcon, PlusIcon, SearchIcon, SearchXIcon } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { EASE_OUT, Stagger, StaggerItem } from "@/components/motion/reveal";
import { EmptyState, ErrorPanel, Notice } from "@/components/shared/feedback";
import { Page, PageHeader } from "@/components/shared/page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useAnalysisController } from "@/features/analysis/analysis-provider";
import { cn } from "@/lib/utils";
import type { HistoryStatusFilter } from "@/lib/adapters/types";
import { AbeGuide } from "./abe-guide";
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

      <Stagger gap={0.08}>
        {adapters.history.persistence === "session" && (
          <StaggerItem className="mb-8">
            <Notice>Demo history lasts for this session. Refreshing resets it.</Notice>
          </StaggerItem>
        )}

        <StaggerItem className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="relative w-full md:max-w-sm">
            <Label htmlFor="history-search" className="sr-only">
              Search analyses
            </Label>
            <SearchIcon aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input id="history-search" type="search" value={searchText} onChange={(event) => setSearchText(event.target.value)} placeholder="Search by name or procedure" className="bg-card pl-9" />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <ToggleGroup
              type="single"
              value={filter}
              onValueChange={(value) => value && setFilter(value as HistoryStatusFilter)}
              aria-label="Filter by status"
              spacing={0}
              className="max-w-full flex-wrap rounded-full border bg-card p-1"
            >
              {FILTERS.map(({ value, label }) => (
                <ToggleGroupItem
                  key={value}
                  value={value}
                  className={cn("relative h-11 min-w-16 rounded-full bg-transparent px-4 data-[state=on]:bg-transparent", filter === value ? "text-primary-foreground hover:text-primary-foreground" : "text-foreground")}
                >
                  {filter === value && (
                    <motion.span layoutId="history-filter-pill" transition={{ type: "spring", stiffness: 420, damping: 34 }} className="absolute inset-0 rounded-full bg-primary" />
                  )}
                  <span className="relative">{label}</span>
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            {filtersActive && (
              <Button variant="link" onClick={clearFilters}>
                Clear filters
              </Button>
            )}
          </div>
        </StaggerItem>
      </Stagger>

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

      <motion.ul layout className="relative space-y-3">
        <AnimatePresence mode="popLayout" initial>
          {items.map((item, index) => (
            <motion.li
              key={item.key}
              layout
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE_OUT, delay: Math.min(index, 6) * 0.05 + 0.15 } }}
              exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.2 } }}
              whileHover={{ y: -2 }}
              transition={{ layout: { type: "spring", stiffness: 380, damping: 36 } }}
              className="rounded-2xl border bg-card shadow-[0_1px_2px_rgba(35,31,32,0.04)] transition-shadow hover:shadow-[0_10px_28px_-14px_rgba(101,0,48,0.3)]"
            >
              <HistoryRow
                item={item}
                duplicating={duplicatingKey === item.key}
                onRename={() => setRenameTarget(targetOf(item))}
                onDelete={() => setDeleteTarget(targetOf(item))}
                onDuplicate={() => void duplicate(item)}
                onRemoveAttachment={() => item.kind === "draft" && setAttachmentItem(item)}
              />
            </motion.li>
          ))}
        </AnimatePresence>
      </motion.ul>

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
    <div aria-hidden className="space-y-3">
      {[0, 1, 2].map((row) => (
        <div key={row} className="space-y-3 rounded-2xl border bg-card p-4 md:p-6">
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
    <motion.section
      aria-labelledby="first-run-heading"
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: EASE_OUT }}
      className="flex flex-col gap-6 rounded-2xl border border-dashed bg-card/60 p-6 md:flex-row md:items-center md:gap-8 md:p-10"
    >
      <AbeGuide className="h-20 rounded-lg md:h-24" />
      <div className="min-w-0 space-y-4">
        <div>
          <h2 id="first-run-heading" className="font-display text-xl font-semibold">
            Your analyses will appear here.
          </h2>
          <p className="mt-1 max-w-md text-base text-muted-foreground">Start with your own plan details, or try the synthetic sample treatment.</p>
        </div>
        <div className="flex flex-wrap gap-3">
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
        </div>
      </div>
    </motion.section>
  );
}
