"use client";

import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";

import { EASE_OUT } from "@/components/motion/reveal";
import { Page, PageHeader } from "@/components/shared/page";
import { Button } from "@/components/ui/button";
import { useAnalysis, useAnalysisController } from "@/features/analysis/analysis-provider";
import type { IntakeMethod } from "@/features/analysis/state";
import { cn } from "@/lib/utils";
import { FactsGathered } from "./facts-gathered";
import { INTAKE_METHODS } from "./intake-method-picker";
import { ManualIntakeWizard } from "./manual/manual-intake-wizard";
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

      <div className="mb-8 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <nav aria-label="Intake method">
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
                  "relative flex min-h-12 flex-col items-center justify-center gap-1 rounded-md px-2 py-2 text-xs text-muted-foreground transition-colors hover:text-foreground sm:min-h-11 sm:flex-row sm:gap-2 sm:px-4 sm:text-[15px]",
                  method === value && "font-medium text-primary",
                )}
              >
                {method === value && (
                  <motion.span
                    layoutId="intake-method-pill"
                    aria-hidden
                    className="absolute inset-0 rounded-md bg-card shadow-sm ring-1 ring-primary/10"
                    transition={{ type: "spring", stiffness: 420, damping: 34 }}
                  />
                )}
                <Icon aria-hidden className="relative size-4" />
                <span className="relative sm:hidden">{MOBILE_LABELS[value]}</span>
                <span className="relative hidden sm:inline">{SHORT_LABELS[value]}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      {demo && (
        <p role="note" className="flex items-center gap-2 text-sm text-muted-foreground">
          <span aria-hidden className="size-1.5 rounded-full bg-brand" />
          Synthetic demo. Report analysis and conversations are simulated.
        </p>
      )}
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={method}
          initial={{ opacity: 0, y: 14, filter: "blur(4px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          exit={{ opacity: 0, y: -8, filter: "blur(4px)" }}
          transition={{ duration: 0.3, ease: EASE_OUT }}
        >
          {method === "pdf" && <PdfIntake analysisId={analysisId} />}
          {method === "voice" && <VoiceIntake analysisId={analysisId} />}
          {method === "manual" && <ManualIntakeWizard analysisId={analysisId} />}
        </motion.div>
      </AnimatePresence>

      {/* The manual wizard has its own completeness rail and final review step. */}
      {method !== "manual" && (
      <div className="mt-12 grid gap-6 lg:grid-cols-12 lg:items-start">
        <div className="lg:col-span-8">
          <FactsGathered analysisId={analysisId} />
        </div>
        <aside aria-label="Next step" className="rounded-xl border bg-card p-5 lg:sticky lg:top-24 lg:col-span-4">
          <p className="font-display text-lg font-semibold">Ready when you are</p>
          <p className="mt-1 text-sm text-muted-foreground">Nothing is compared until you review and confirm every fact.</p>
          <motion.div whileTap={{ scale: 0.98 }} className="mt-5">
            <Button asChild size="lg" className="w-full">
              <Link href={`/analysis/${analysisId}/confirm`}>Continue to review</Link>
            </Button>
          </motion.div>
          <Button
            variant="link"
            className="mt-2 w-full"
            onClick={() => {
              controller.loadSample(analysisId);
              router.push(`/analysis/${analysisId}/confirm`);
            }}
          >
            Use sample treatment
          </Button>
        </aside>
      </div>
      )}
    </Page>
  );
}

