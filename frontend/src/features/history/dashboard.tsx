"use client";

import { ArrowRightIcon, FlaskConicalIcon } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useMemo, useState } from "react";

import { Stagger, StaggerItem } from "@/components/motion/reveal";
import { ErrorPanel } from "@/components/shared/feedback";
import { Page, PageHeader, SectionHeading } from "@/components/shared/page";
import { StatusChip } from "@/components/shared/status-chip";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { IntakeMethodPicker } from "@/features/intake/intake-method-picker";
import { useAnalysisController } from "@/features/analysis/analysis-provider";
import { analysisStatus, type IntakeMethod } from "@/features/analysis/state";
import { Press } from "@/features/analysis/compare/press";
import { formatTimestamp } from "@/lib/domain/dates";
import { draftItems, itemActivityAt, itemPatientName, itemTitle, latestDraft, resumePath, snapshotItems, sortNewestFirst, type HistoryItem } from "./history-items";
import { AbeGuide } from "./abe-guide";
import { patientDetailsOf } from "./patient-details";
import { LiveDataPanel } from "./live-data-panel";
import { useSnapshotList } from "./use-snapshots";

const RECENT_LIMIT = 5;

export function Dashboard() {
  const router = useRouter();
  const { state, adapters, createAnalysis, setMethod, startSampleAnalysis } = useAnalysisController();
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
      {adapters.mode === "live" && <LiveDataPanel />}
      <Stagger gap={0.08}>
        <StaggerItem>
          <PageHeader
            title={state.profile ? `Hello, ${state.profile.displayName}` : "Your workspace"}
            description={
              isEmpty
                ? "Compare what you'd pay for planned dental care when your dentist approves more than one date. Pick how to tell us about your plan."
                : "Pick up a draft, start a new analysis or review what you've saved."
            }
          />
        </StaggerItem>
      </Stagger>

      <div className="grid gap-12 lg:grid-cols-12 lg:gap-14">
        <Stagger delay={0.2} gap={0.1} className="min-w-0 space-y-12 lg:col-span-8">
          {draft && (
            <StaggerItem>
              <section aria-labelledby="continue-heading">
                <SectionHeading id="continue-heading">Pick up where you left off</SectionHeading>
                <div className="relative flex flex-col gap-5 overflow-hidden rounded-2xl border border-primary/15 bg-gradient-to-br from-accent via-card to-card px-5 py-6 shadow-[0_1px_2px_rgba(35,31,32,0.04),0_14px_32px_-16px_rgba(101,0,48,0.25)] before:absolute before:inset-y-0 before:left-0 before:w-1.5 before:bg-brand md:flex-row md:items-center md:justify-between md:px-8 md:py-7">
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <p className="font-display text-xl font-semibold break-words">{draft.title}</p>
                      <StatusChip status={analysisStatus(draft)} />
                    </div>
                    <p className="text-sm text-muted-foreground">
                      For {draft.patient?.displayName ?? "Guest"}. Last edited {formatTimestamp(draft.updatedAt)}.
                    </p>
                  </div>
                  <Press>
                    <Button asChild size="lg">
                      <Link href={resumePath(draft)}>
                        Resume draft
                        <ArrowRightIcon aria-hidden />
                      </Link>
                    </Button>
                  </Press>
                </div>
              </section>
            </StaggerItem>
          )}

          <StaggerItem>
            <section aria-labelledby={pickerLabelId}>
              <SectionHeading id={pickerLabelId} description="Choose one way to start. You can add the others later.">
                Start a new analysis
              </SectionHeading>
              <IntakeMethodPicker value={method} onChange={setChosenMethod} labelledBy={pickerLabelId} />
              <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3">
                <Press>
                  <Button onClick={startAnalysis} disabled={!method}>
                    {method === "pdf" ? "Continue with PDF" : method === "voice" ? "Continue with voice" : method === "manual" ? "Continue manually" : "Continue"}
                  </Button>
                </Press>
              </div>
              {!method && <p className="mt-3 text-sm text-muted-foreground">Choose a way to start, then continue.</p>}
            </section>
          </StaggerItem>
        </Stagger>

        <Stagger delay={0.4} gap={0.1} className="min-w-0 space-y-8 lg:col-span-4">
          {!isEmpty && (
            <StaggerItem>
              <section aria-labelledby="recent-heading" className="rounded-2xl border bg-card p-5">
                <div className="mb-2 flex items-end justify-between gap-4">
                  <h2 id="recent-heading" className="font-display text-xl font-semibold tracking-tight">
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
                  <ul className="divide-y">
                    {recent.map((item) => (
                      <RecentRow key={item.key} item={item} />
                    ))}
                  </ul>
                )}
                {loadingRecent && (
                  <div aria-hidden className="space-y-3 py-4">
                    <Skeleton className="h-5 w-56 max-w-full" />
                    <Skeleton className="h-4 w-40 max-w-full" />
                  </div>
                )}
              </section>
            </StaggerItem>
          )}

          {adapters.mode === "demo" && <StaggerItem>
            <motion.section
              aria-labelledby="sample-heading"
              whileHover={{ y: -2 }}
              className="relative overflow-hidden rounded-2xl bg-primary p-6 text-primary-foreground shadow-[0_18px_40px_-18px_rgba(101,0,48,0.6)]"
            >
              <div aria-hidden className="pointer-events-none absolute -top-10 -right-10 size-40 rounded-full bg-brand/40 blur-2xl" />
              <div className="relative flex items-start justify-between gap-4">
                <h2 id="sample-heading" className="font-display text-xl font-semibold">
                  Try the sample
                </h2>
                <AbeGuide className="h-14 rounded-md" />
              </div>
              <p className="relative mt-2 text-sm text-primary-foreground/85">A synthetic treatment plan, ready to review. It needs no upload or microphone.</p>
              <Press className="relative mt-5 flex">
                <Button onClick={startSample} className="bg-card text-primary hover:bg-accent">
                  <FlaskConicalIcon aria-hidden />
                  Use sample treatment
                </Button>
              </Press>
            </motion.section>
          </StaggerItem>}
        </Stagger>
      </div>
    </Page>
  );
}

function RecentRow({ item }: { item: HistoryItem }) {
  const href = item.kind === "draft" ? item.resumeHref : item.viewHref;
  return (
    <li>
      <Link href={href} className="flex min-h-11 flex-col gap-1.5 px-1 py-3 transition-[padding,background-color] hover:bg-muted/50 hover:pl-2">
        <span className="flex items-start justify-between gap-3">
          <span className="min-w-0 text-base font-medium break-words">{itemTitle(item)}</span>
          <StatusChip status={item.status} />
        </span>
        <span className="block text-sm text-muted-foreground">
          For {itemPatientName(item)}. {item.kind === "draft" ? "Updated" : "Saved"} {formatTimestamp(itemActivityAt(item))}.
        </span>
      </Link>
    </li>
  );
}
