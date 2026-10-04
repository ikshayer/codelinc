"use client";

import { ArrowLeftIcon, ArrowRightIcon } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { useAnalysis } from "@/features/analysis/analysis-provider";
import { fieldDomId } from "@/features/analysis/components/fact-field";
import { CheckStep } from "./check-step";
import { BenefitYearStep, CareStep, CoverageStep, TimingStep } from "./step-panels";
import { WizardMobileBar, WizardRail } from "./wizard-rail";
import { CHECK_STEP, STEP_COUNT, WIZARD_STEPS, parseStep, summarizeWizard, type StepItem } from "./wizard-steps";

const SLIDE_DISTANCE = 36;
/** How long to wait for the next step to mount before giving up on moving focus. */
const FOCUS_ATTEMPTS = 90;

const slideVariants = {
  enter: (direction: number) => ({ opacity: 0, x: direction * SLIDE_DISTANCE }),
  center: { opacity: 1, x: 0 },
  exit: (direction: number) => ({ opacity: 0, x: direction * -SLIDE_DISTANCE }),
};

/** Multi-page manual entry. Every field is the shared FactField, so values, sources and conflicts behave as on Confirm. */
export function ManualIntakeWizard({ analysisId }: { analysisId: string }) {
  const analysis = useAnalysis(analysisId);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const step = parseStep(searchParams.get("step"));

  // Direction follows the step number, so browser back/forward slides the right way too.
  const [tracked, setTracked] = useState({ step, direction: 1 });
  if (tracked.step !== step) setTracked({ step, direction: step > tracked.step ? 1 : -1 });

  const summaries = useMemo(() => (analysis ? summarizeWizard(analysis.draft) : null), [analysis]);

  const pendingFocus = useRef<string | null>(null);
  const shownStep = useRef(step);

  const goToStep = useCallback(
    (next: number) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("method", "manual");
      params.set("step", String(Math.min(Math.max(next, 1), STEP_COUNT)));
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const jumpToItem = useCallback(
    (item: StepItem) => {
      pendingFocus.current = item.focusId ?? (item.path ? fieldDomId(item.path) : null);
      goToStep(item.step);
    },
    [goToStep],
  );

  // Move focus to the new step's heading (or the field a digest link targeted) once it has mounted.
  useEffect(() => {
    if (shownStep.current === step) return;
    shownStep.current = step;
    const targetId = pendingFocus.current ?? `wizard-heading-${step}`;
    pendingFocus.current = null;
    let frame = 0;
    let attempts = 0;
    const tryFocus = () => {
      const element = document.getElementById(targetId);
      if (element) element.focus();
      else if (attempts++ < FOCUS_ATTEMPTS) frame = requestAnimationFrame(tryFocus);
    };
    frame = requestAnimationFrame(tryFocus);
    return () => cancelAnimationFrame(frame);
  }, [step]);

  if (!analysis || !summaries) return null;
  const current = summaries[step - 1];
  const blankHere = current.missing.length;

  return (
    <section aria-label="Manual entry" className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-12 lg:gap-8">
      <WizardMobileBar summaries={summaries} step={step} onSelect={goToStep} />
      <WizardRail summaries={summaries} step={step} onSelect={goToStep} />

      <div className="min-w-0 lg:col-span-8">
        <div className="overflow-x-clip rounded-xl border bg-card shadow-[0_1px_2px_rgba(35,31,32,0.04),0_8px_24px_-12px_rgba(101,0,48,0.12)]">
          <div className="px-5 pt-6 pb-2 md:px-8 md:pt-8">
            <AnimatePresence mode="wait" initial={false} custom={tracked.direction}>
              <motion.div key={step} custom={tracked.direction} variants={slideVariants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}>
                {step === 1 && <BenefitYearStep analysisId={analysisId} year="y1" />}
                {step === 2 && <BenefitYearStep analysisId={analysisId} year="y2" />}
                {step === 3 && <CoverageStep analysisId={analysisId} />}
                {step === 4 && <CareStep analysisId={analysisId} />}
                {step === 5 && <TimingStep analysisId={analysisId} />}
                {step === CHECK_STEP && <CheckStep analysisId={analysisId} summaries={summaries} onJump={jumpToItem} onGoToStep={goToStep} />}
              </motion.div>
            </AnimatePresence>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-t px-5 py-4 md:px-8">
            <div className="min-h-11">
              {step > 1 && (
                <Button variant="outline" onClick={() => goToStep(step - 1)}>
                  <ArrowLeftIcon aria-hidden />
                  Back
                  <span className="sr-only">: {WIZARD_STEPS[step - 2].title}</span>
                </Button>
              )}
            </div>
            {step < CHECK_STEP && (
              <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2">
                <p className="text-sm text-muted-foreground" aria-live="polite">
                  {blankHere === 0 ? "This step is filled in." : blankHere === 1 ? "1 detail still blank. You can come back to it." : `${blankHere} details still blank. You can come back to them.`}
                </p>
                <Button onClick={() => goToStep(step + 1)}>
                  Next
                  <ArrowRightIcon aria-hidden />
                  <span className="sr-only">: {WIZARD_STEPS[step].title}</span>
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
