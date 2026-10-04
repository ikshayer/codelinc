"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";

import { Notice } from "@/components/shared/feedback";
import { Page, PageHeader } from "@/components/shared/page";
import { Button } from "@/components/ui/button";
import { useAnalysis, useAnalysisController } from "@/features/analysis/analysis-provider";
import { CareGroup, PlanGroup, TimingGroup } from "@/features/analysis/components/fact-groups";
import type { IntakeMethod } from "@/features/analysis/state";
import { cn } from "@/lib/utils";
import { FactsGathered } from "./facts-gathered";
import { INTAKE_METHODS } from "./intake-method-picker";
import { PdfIntake } from "./pdf/pdf-intake";
import { VoiceIntake } from "./voice/voice-intake";

const SHORT_LABELS: Record<IntakeMethod, string> = { pdf: "Upload report", voice: "Talk it through", manual: "Enter manually" };

function parseMethod(value: string | null): IntakeMethod | null {
  return value === "pdf" || value === "voice" || value === "manual" ? value : null;
}

/** Shared intake workspace: every method feeds the same draft and the same review. */
export function IntakeWorkspace({ analysisId }: { analysisId: string }) {
  const analysis = useAnalysis(analysisId);
  const controller = useAnalysisController();
  const router = useRouter();
  const searchParams = useSearchParams();
  const method: IntakeMethod = parseMethod(searchParams.get("method")) ?? analysis?.method ?? "manual";

  const { setMethod } = controller;
  useEffect(() => {
    if (analysis && analysis.method !== method) setMethod(analysisId, method);
  }, [analysis, analysisId, method, setMethod]);

  if (!analysis) return null;
  const demo = controller.adapters.mode === "demo";

  return (
    <Page>
      <PageHeader
        title="Tell us about your treatment plan"
        description="Use any mix of methods. Everything lands in one set of facts you review before anything is compared."
      />

      <nav aria-label="Intake method" className="mb-8 -mx-5 overflow-x-auto px-5 md:mx-0 md:px-0">
        <ul className="flex w-max gap-1 rounded-lg bg-muted p-1">
          {INTAKE_METHODS.map(({ value, Icon }) => (
            <li key={value}>
              <Link
                href={`/analysis/${analysisId}/intake?method=${value}`}
                replace
                scroll={false}
                aria-current={method === value ? "page" : undefined}
                className={cn(
                  "inline-flex h-11 items-center gap-2 rounded-md px-4 text-[15px] whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground",
                  method === value && "bg-background font-medium text-foreground shadow-xs",
                )}
              >
                <Icon aria-hidden className="size-4" />
                {SHORT_LABELS[value]}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {demo && (
        <div className="mb-8">
          <Notice>Demo mode: synthetic data only. Report analysis and conversation are simulated, and nothing leaves this browser.</Notice>
        </div>
      )}

      <div className="space-y-10">
        {method === "pdf" && <PdfIntake analysisId={analysisId} />}
        {method === "voice" && <VoiceIntake analysisId={analysisId} />}
        {method === "manual" && <ManualIntake analysisId={analysisId} />}

        <FactsGathered analysisId={analysisId} />

        <div className="flex flex-col-reverse gap-3 border-t pt-8 sm:flex-row sm:items-center sm:justify-between">
          <Button
            variant="link"
            className="justify-start px-0"
            onClick={() => {
              controller.loadSample(analysisId);
              router.push(`/analysis/${analysisId}/confirm`);
            }}
          >
            Use sample treatment
          </Button>
          <Button asChild size="lg">
            <Link href={`/analysis/${analysisId}/confirm`}>Continue to review</Link>
          </Button>
        </div>
      </div>
    </Page>
  );
}

function ManualIntake({ analysisId }: { analysisId: string }) {
  return (
    <section aria-labelledby="manual-title" className="space-y-6">
      <div>
        <h2 id="manual-title" className="text-xl font-semibold tracking-tight md:text-section">
          Enter what you know
        </h2>
        <p className="mt-1 text-muted-foreground">Values save as you go. Leave anything you’re unsure of blank — unknown amounts are never treated as zero.</p>
      </div>
      <PlanGroup analysisId={analysisId} errors={{}} />
      <CareGroup analysisId={analysisId} errors={{}} />
      <TimingGroup analysisId={analysisId} errors={{}} />
    </section>
  );
}
