"use client";

import { CheckIcon, SearchXIcon } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { EmptyState } from "@/components/shared/feedback";
import { Page } from "@/components/shared/page";
import { Button } from "@/components/ui/button";
import { IdentityCheckDialog } from "@/features/intake/identity-check-dialog";
import { cn } from "@/lib/utils";
import { useAnalysis, useAnalysisController } from "../analysis-provider";
import { analysisStatus, currentResult } from "../state";
import { MemberBenefitSummary } from "@/features/intake/member-benefit-summary";
import { MemberBenefitContextPanel } from "@/features/intake/member-benefit-context";

const STAGES = [
  { segment: "intake", label: "Describe" },
  { segment: "confirm", label: "Confirm" },
  { segment: "compare", label: "Compare" },
] as const;

/** Shared analysis chrome: patient strip, stage progress and missing-ID recovery. */
export function AnalysisFrame({ analysisId, children }: { analysisId: string; children: ReactNode }) {
  const analysis = useAnalysis(analysisId);
  const { adapters } = useAnalysisController();
  const pathname = usePathname();

  if (!analysis) {
    return (
      <Page width="form">
        <EmptyState
          icon={SearchXIcon}
          title="This analysis isn't available"
          description={
            adapters.mode === "demo"
              ? "Demo analyses last only for this browser session, so refreshing or resetting demo data removes them. Saved comparisons are still in History."
              : "It may have been deleted, or it belongs to a different account."
          }
        >
          <Button asChild>
            <Link href="/analysis/new">New analysis</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/history">Open history</Link>
          </Button>
        </EmptyState>
      </Page>
    );
  }

  const activeIndex = STAGES.findIndex((stage) => pathname.endsWith(`/${stage.segment}`));
  const status = analysisStatus(analysis);
  const comparedNow = currentResult(analysis) !== null;
  const serverBenefits = analysis.result.status === "calculated" ? analysis.result.memberBenefitContext : analysis.result.status === "failed" ? analysis.result.error.memberBenefitContext : undefined;

  return (
    <div>
      <div className="relative z-10 border-b bg-card/70 backdrop-blur">
        <div className="mx-auto flex max-w-[1120px] flex-col gap-3 px-5 py-3 md:flex-row md:items-center md:justify-between md:px-8">
          <p className="min-w-0 text-sm text-muted-foreground">
            <span className="text-foreground">Analysis for </span>
            <span className="font-medium text-foreground">{analysis.patient?.displayName ?? "Guest"}</span>
            <span className="mx-2" aria-hidden>
              /
            </span>
            <span className="truncate">{analysis.title}</span>
            {status === "needsReview" && <span className="sr-only">, needs review</span>}
          </p>
          <nav aria-label="Analysis progress">
            <ol className="flex flex-wrap items-center gap-1 text-sm">
              {STAGES.map((stage, index) => {
                const current = index === activeIndex;
                const done = index < activeIndex || (stage.segment !== "compare" && comparedNow);
                const reachable = stage.segment !== "compare" || analysis.result.status !== "none";
                return (
                  <li key={stage.segment} className="flex items-center gap-1">
                    {index > 0 && <span aria-hidden className="h-px w-2 bg-border sm:w-4" />}
                    {reachable && !current ? (
                      <Link
                        href={`/analysis/${analysisId}/${stage.segment}`}
                        className="inline-flex h-9 items-center gap-1.5 rounded-md px-1.5 sm:px-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        {done && (
                          <motion.span initial={{ scale: 0, rotate: -30 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 500, damping: 24 }}>
                            <CheckIcon aria-hidden className="size-3.5 text-brand" />
                          </motion.span>
                        )}
                        {stage.label}
                        {done && <span className="sr-only"> (done)</span>}
                      </Link>
                    ) : (
                      <span
                        aria-current={current ? "step" : undefined}
                        className={cn("relative inline-flex h-9 items-center gap-1.5 rounded-md px-1.5 sm:px-2.5", current ? "font-medium text-primary" : "text-muted-foreground/70")}
                      >
                        {current && (
                          <motion.span layoutId="analysis-stage-pill" aria-hidden className="absolute inset-0 rounded-md bg-card shadow-sm ring-1 ring-primary/15" transition={{ type: "spring", stiffness: 380, damping: 32 }} />
                        )}
                        <span aria-hidden className={cn("relative size-1.5 rounded-full", current ? "bg-brand" : "bg-border")} />
                        <span className="relative">{stage.label}</span>
                        {!reachable && <span className="sr-only"> (available after you confirm)</span>}
                      </span>
                    )}
                  </li>
                );
              })}
            </ol>
          </nav>
        </div>
      </div>
      {analysis.memberData && <div className="mx-auto max-w-[1120px] px-5 pt-5 md:px-8">{serverBenefits ? <MemberBenefitContextPanel context={serverBenefits} /> : <MemberBenefitSummary data={analysis.memberData} />}</div>}
      {children}
      <IdentityCheckDialog analysisId={analysisId} />
    </div>
  );
}
