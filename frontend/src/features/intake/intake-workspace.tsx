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
const MOBILE_LABELS: Record<IntakeMethod, string> = { pdf: "PDF report", voice: "Voice chat", manual: "Manual" };

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
        description="Add your details below. You can switch methods and keep everything in one draft."
      />

      <nav aria-label="Intake method" className="mb-6">
        <ul className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1 sm:w-fit">
          {INTAKE_METHODS.map(({ value, Icon }) => (
            <li key={value}>
              <Link
                href={`/analysis/${analysisId}/intake?method=${value}`}
                replace
                scroll={false}
                aria-current={method === value ? "page" : undefined}
                aria-label={SHORT_LABELS[value]}
                className={cn(
                  "flex min-h-12 flex-col items-center justify-center gap-1 rounded-md px-2 py-2 text-xs text-muted-foreground transition-colors hover:text-foreground sm:min-h-11 sm:flex-row sm:gap-2 sm:px-4 sm:text-[15px]",
                  method === value && "bg-background font-medium text-primary shadow-xs",
                )}
              >
                <Icon aria-hidden className="size-4" />
                <span className="sm:hidden">{MOBILE_LABELS[value]}</span>
                <span className="hidden sm:inline">{SHORT_LABELS[value]}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {demo && (
        <div className="mb-6">
          <Notice>Synthetic demo. Report analysis and conversations are simulated.</Notice>
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
