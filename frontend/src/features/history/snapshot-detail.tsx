"use client";

import { ArrowLeftIcon, CopyPlusIcon, ExternalLinkIcon, FileSearchIcon, PencilIcon, Trash2Icon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { EmptyState, ErrorPanel, Notice } from "@/components/shared/feedback";
import { Page, PageHeader, SectionHeading } from "@/components/shared/page";
import { SourceBadge } from "@/components/shared/source-badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ComparisonView } from "@/features/analysis/compare/comparison-view";
import { useAnalysisController } from "@/features/analysis/analysis-provider";
import { formatIsoDate, formatTimestamp } from "@/lib/domain/dates";
import type { AnalysisSnapshot, EvidenceKind } from "@/lib/domain/types";
import { SAMPLE_REPORT_FILE_NAME } from "@/fixtures/sample-report";
import { DeleteDialog, RenameDialog } from "./history-dialogs";
import { useHistoryActions, type ActionTarget } from "./use-history-actions";
import { useSnapshot } from "./use-snapshots";

const SAMPLE_REPORT_URL = `/samples/${SAMPLE_REPORT_FILE_NAME}`;

export function SnapshotDetail({ snapshotId }: { snapshotId: string }) {
  const { state, retry } = useSnapshot(snapshotId);

  if (state.status === "loading") return <SnapshotSkeleton />;

  if (state.status === "notFound") {
    return (
      <Page width="form">
        <EmptyState icon={FileSearchIcon} title="This saved analysis isn't available" description="It may have been deleted, or demo history was reset. Your other saved analyses are still in History.">
          <Button asChild>
            <Link href="/history">Open history</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/analysis/new">New analysis</Link>
          </Button>
        </EmptyState>
      </Page>
    );
  }

  if (state.status === "error") {
    return (
      <Page width="form">
        <ErrorPanel title="Couldn't load this saved analysis" error={state.error} onRetry={retry} retryLabel="Retry">
          <Button asChild variant="outline" size="sm">
            <Link href="/history">Back to history</Link>
          </Button>
        </ErrorPanel>
      </Page>
    );
  }

  return <LoadedSnapshot snapshot={state.snapshot} />;
}

function LoadedSnapshot({ snapshot }: { snapshot: AnalysisSnapshot }) {
  const router = useRouter();
  const { adapters } = useAnalysisController();
  const actions = useHistoryActions();
  // Renaming changes metadata only; the snapshot itself is immutable.
  const [title, setTitle] = useState(snapshot.title);
  const [dialog, setDialog] = useState<"rename" | "delete" | null>(null);

  const target = useMemo<ActionTarget>(() => ({ kind: "snapshot", snapshotId: snapshot.id, title }), [snapshot.id, title]);
  const sources = useMemo(() => sourcesOf(snapshot), [snapshot]);

  async function rename(renameTarget: ActionTarget, nextTitle: string) {
    const failure = await actions.rename(renameTarget, nextTitle);
    if (!failure) setTitle(nextTitle.trim());
    return failure;
  }

  async function remove(removeTarget: ActionTarget) {
    const failure = await actions.remove(removeTarget);
    if (!failure) router.replace("/history");
    return failure;
  }

  return (
    <Page>
      <Button asChild variant="ghost" className="-ml-3 mb-4">
        <Link href="/history">
          <ArrowLeftIcon aria-hidden />
          All analyses
        </Link>
      </Button>

      <PageHeader
        title={title}
        description={`For ${snapshot.patientDisplayName}`}
        actions={
          <>
            <Button onClick={() => actions.duplicate(snapshot)}>
              <CopyPlusIcon aria-hidden />
              Duplicate as new analysis
            </Button>
            <Button variant="outline" onClick={() => setDialog("rename")}>
              <PencilIcon aria-hidden />
              Rename
            </Button>
            <Button variant="outline" onClick={() => setDialog("delete")}>
              <Trash2Icon aria-hidden />
              Delete
            </Button>
          </>
        }
      />

      <div className="space-y-12">
        <Notice title={`Historical estimate — based on facts confirmed on ${formatIsoDate(snapshot.confirmedAt.slice(0, 10))}`}>
          This is a dated record and never changes. Plan usage and dentist timing here may be out of date. Duplicate it as a new analysis to review the facts again.
        </Notice>

        <dl className="grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-4">
          <Detail label="Patient" value={snapshot.patientDisplayName} />
          <Detail label="Version" value={`Version ${snapshot.version}`} />
          <Detail label="Saved" value={formatTimestamp(snapshot.savedAt)} />
          <Detail label="Estimate source" value={sourceModeLabel(snapshot)} />
        </dl>

        <ComparisonView
          comparison={snapshot.comparison}
          scenario={snapshot.scenario}
          procedureLabels={snapshot.procedureLabels}
          sourceMode={snapshot.sourceMode}
          fixtureName={snapshot.fixtureName}
          confirmedAt={snapshot.confirmedAt}
          historical
        />

        <section aria-labelledby="sources-heading">
          <SectionHeading id="sources-heading" description="Where the facts for this estimate came from.">
            Sources
          </SectionHeading>
          {sources.length === 0 && <p className="text-sm text-muted-foreground">No source details were saved with this estimate.</p>}
          <ul className="divide-y border-y empty:hidden">
            {sources.map((source) => (
              <li key={source.key} className="flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
                <div className="min-w-0 space-y-1">
                  <p className="text-base font-medium break-words">{source.label}</p>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                    <SourceBadge kind={source.kind} />
                    {source.detail && <span className="text-sm text-muted-foreground">{source.detail}</span>}
                  </div>
                </div>
                {source.viewUrl ? (
                  <Button asChild variant="outline" size="sm">
                    <a href={source.viewUrl} target="_blank" rel="noopener noreferrer">
                      View source
                      <ExternalLinkIcon aria-hidden />
                    </a>
                  </Button>
                ) : (
                  source.unavailableNote && <p className="text-sm text-muted-foreground">{adapters.mode === "demo" ? source.unavailableNote : "Source file isn't available for this snapshot"}</p>
                )}
              </li>
            ))}
          </ul>
        </section>
      </div>

      <RenameDialog target={dialog === "rename" ? target : null} onClose={() => setDialog(null)} onRename={rename} />
      <DeleteDialog target={dialog === "delete" ? target : null} onClose={() => setDialog(null)} onDelete={remove} />
    </Page>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-base">{value}</dd>
    </div>
  );
}

function sourceModeLabel(snapshot: AnalysisSnapshot): string {
  if (snapshot.sourceMode === "live") return "Calculation engine";
  return snapshot.fixtureName ? `Simulated analysis: ${snapshot.fixtureName}` : "Simulated analysis";
}

interface SourceRow {
  key: string;
  kind: EvidenceKind;
  label: string;
  detail: string | null;
  viewUrl: string | null;
  unavailableNote: string | null;
}

const NOT_STORED = "Source file not stored in this demo";

/** Groups evidence by source: a report with its pages, a conversation, the sample or manual entry. */
function sourcesOf(snapshot: AnalysisSnapshot): SourceRow[] {
  const rows = new Map<string, SourceRow & { pages: Set<number> }>();
  for (const evidence of snapshot.evidence) {
    if (evidence.kind === "manual") continue;
    const key = `${evidence.kind}:${evidence.sourceId}`;
    const row =
      rows.get(key) ??
      ({
        key,
        kind: evidence.kind,
        label: evidence.kind === "voice" ? "Conversation" : evidence.sourceLabel,
        detail: null,
        viewUrl: evidence.kind === "pdf" && evidence.sourceLabel === SAMPLE_REPORT_FILE_NAME ? SAMPLE_REPORT_URL : null,
        unavailableNote: evidence.kind === "sample" ? null : NOT_STORED,
        pages: new Set<number>(),
      } satisfies SourceRow & { pages: Set<number> });
    if (evidence.pageNumber) row.pages.add(evidence.pageNumber);
    rows.set(key, row);
  }

  const result: SourceRow[] = [...rows.values()].map(({ pages, ...row }) => {
    const sorted = [...pages].sort((a, b) => a - b);
    const detail = sorted.length > 0 ? `${sorted.length === 1 ? "Page" : "Pages"} ${sorted.join(", ")}` : row.kind === "sample" ? "Synthetic sample data" : null;
    return { ...row, detail };
  });

  if (snapshot.inputKinds.includes("manual")) {
    result.push({ key: "manual", kind: "manual", label: "Entered by you", detail: "Values typed or edited during review", viewUrl: null, unavailableNote: null });
  }
  return result;
}

function SnapshotSkeleton() {
  return (
    <Page>
      <div aria-busy="true" aria-label="Loading saved analysis" className="space-y-6">
        <Skeleton className="h-9 w-72 max-w-full" />
        <Skeleton className="h-5 w-48 max-w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    </Page>
  );
}
