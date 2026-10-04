"use client";

import { FlaskConicalIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useMemo, useState } from "react";

import { ErrorPanel } from "@/components/shared/feedback";
import { Page, PageHeader, SectionHeading } from "@/components/shared/page";
import { StatusChip } from "@/components/shared/status-chip";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAnalysisController } from "@/features/analysis/analysis-provider";
import { analysisStatus, type IntakeMethod } from "@/features/analysis/state";
import { IntakeMethodPicker } from "@/features/intake/intake-method-picker";
import { formatTimestamp } from "@/lib/domain/dates";
import { draftItems, itemActivityAt, itemPatientName, itemTitle, latestDraft, resumePath, snapshotItems, sortNewestFirst, type HistoryItem } from "./history-items";
import { patientDetailsOf } from "./patient-details";
import { useSnapshotList } from "./use-snapshots";

const RECENT_LIMIT = 5;

export function Dashboard() {
  const router = useRouter();
  const { state, createAnalysis, setMethod, startSampleAnalysis } = useAnalysisController();
  const pickerLabelId = useId();
  const [method, setChosenMethod] = useState<IntakeMethod | null>(null);
  const snapshots = useSnapshotList("", RECENT_LIMIT);

  const draft = latestDraft(state.analyses);
  const recent = useMemo<HistoryItem[]>(() => {
    const saved = snapshots.state.status === "ready" ? snapshotItems(snapshots.state.items) : [];
    return sortNewestFirst([...draftItems(state.analyses), ...saved]).slice(0, RECENT_LIMIT);
  }, [state.analyses, snapshots.state]);

  const loadingRecent = snapshots.state.status === "loading";
  const hasHistory = recent.length > 0;
  const isEmpty = !loadingRecent && !hasHistory && snapshots.state.status === "ready";

  function startAnalysis() {
    if (!method) return;
    if (!state.profile) {
      router.push(`/analysis/new?method=${method}`);
      return;
    }
    const analysisId = createAnalysis(patientDetailsOf(state.profile));
    setMethod(analysisId, method);
    router.push(`/analysis/${analysisId}/intake?method=${method}`);
  }

  function startSample() {
    const analysisId = startSampleAnalysis(state.profile ? patientDetailsOf(state.profile) : null);
    router.push(`/analysis/${analysisId}/confirm`);
  }

  return (
    <Page>
      <PageHeader
        title={state.profile ? `Hello, ${state.profile.displayName}` : "Your workspace"}
        description={
          isEmpty
            ? "Compare what you'd pay for planned dental care when your dentist approves more than one date. Pick how to tell us about your plan."
            : "Pick up a draft, start a new analysis or review what you've saved."
        }
      />

      <div className="space-y-14">
        {draft && (
          <section aria-labelledby="continue-heading">
            <SectionHeading id="continue-heading">Continue your draft</SectionHeading>
            <div className="flex flex-col gap-4 border-y py-5 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <p className="text-base font-semibold break-words">{draft.title}</p>
                  <StatusChip status={analysisStatus(draft)} />
                </div>
                <p className="text-sm text-muted-foreground">
                  For {draft.patient?.displayName ?? "Guest"}. Last edited {formatTimestamp(draft.updatedAt)}.
                </p>
              </div>
              <Button asChild>
                <Link href={resumePath(draft)}>
                  Resume draft
                </Link>
              </Button>
            </div>
          </section>
        )}

        <section aria-labelledby={pickerLabelId}>
          <SectionHeading id={pickerLabelId} description="You can add the other ways later. They all build the same draft.">
            New analysis
          </SectionHeading>
          <IntakeMethodPicker value={method} onChange={setChosenMethod} labelledBy={pickerLabelId} />
          <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3">
            <Button onClick={startAnalysis} disabled={!method}>
              Continue
            </Button>
            <Button variant="link" onClick={startSample} className="px-0">
              <FlaskConicalIcon aria-hidden />
              Use sample treatment
            </Button>
          </div>
          {!method && <p className="mt-3 text-sm text-muted-foreground">Choose a way to start, then continue. The sample treatment needs no upload or microphone.</p>}
        </section>

        {!isEmpty && (
          <section aria-labelledby="recent-heading">
            <div className="mb-4 flex items-end justify-between gap-4">
              <h2 id="recent-heading" className="text-xl font-semibold tracking-tight md:text-section">
                Recent analyses
              </h2>
              <Button asChild variant="link" className="px-0">
                <Link href="/history">View all</Link>
              </Button>
            </div>

            {snapshots.state.status === "error" && (
              <div className="mb-4">
                <ErrorPanel title="Couldn't load saved analyses" error={snapshots.state.error} onRetry={snapshots.retry} retryLabel="Retry" />
              </div>
            )}

            {recent.length > 0 && (
              <ul className="divide-y border-y">
                {recent.map((item) => (
                  <RecentRow key={item.key} item={item} />
                ))}
              </ul>
            )}
            {loadingRecent && (
              <div aria-hidden className="space-y-3 border-b py-4">
                <Skeleton className="h-5 w-56 max-w-full" />
                <Skeleton className="h-4 w-40 max-w-full" />
              </div>
            )}
          </section>
        )}
      </div>
    </Page>
  );
}

function RecentRow({ item }: { item: HistoryItem }) {
  const href = item.kind === "draft" ? item.resumeHref : item.viewHref;
  return (
    <li>
      <Link href={href} className="flex min-h-11 flex-col gap-2 px-1 py-4 transition-colors hover:bg-muted/50 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
        <span className="min-w-0">
          <span className="block text-base font-medium break-words">{itemTitle(item)}</span>
          <span className="block text-sm text-muted-foreground">
            For {itemPatientName(item)}. {item.kind === "draft" ? "Updated" : "Saved"} {formatTimestamp(itemActivityAt(item))}.
          </span>
        </span>
        <StatusChip status={item.status} />
      </Link>
    </li>
  );
}
