"use client";

import { AlertTriangleIcon, CheckIcon, CircleDashedIcon, CircleDotIcon, ListChecksIcon } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { STEP_COUNT, WIZARD_STEPS, stepDisplay, stepStatusText, type StepDisplay, type StepSummary } from "./wizard-steps";

const DISPLAY_ICON: Record<StepDisplay, typeof CheckIcon> = {
  done: CheckIcon,
  inProgress: CircleDotIcon,
  missing: CircleDashedIcon,
  conflict: AlertTriangleIcon,
};

const ICON_TONE: Record<StepDisplay, string> = {
  done: "bg-success text-success-foreground",
  inProgress: "bg-primary text-primary-foreground",
  missing: "bg-muted text-muted-foreground",
  conflict: "bg-destructive/10 text-destructive",
};

/** Thin bar that grows with the share of required details filled in. */
export function CompletenessBar({ filled, total, className }: { filled: number; total: number; className?: string }) {
  const fraction = total === 0 ? 0 : filled / total;
  return (
    <div
      role="progressbar"
      aria-label="Details filled in"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={filled}
      aria-valuetext={`${filled} of ${total} details filled in`}
      className={cn("h-1.5 w-full overflow-hidden rounded-full bg-muted", className)}
    >
      <motion.div className="h-full origin-left rounded-full bg-primary" initial={false} animate={{ scaleX: fraction }} transition={{ type: "spring", stiffness: 140, damping: 22 }} />
    </div>
  );
}

interface StepListProps {
  summaries: readonly StepSummary[];
  step: number;
  onSelect: (step: number) => void;
  /** Share the moving active indicator (only one list may be mounted with it). */
  animated?: boolean;
}

export function StepList({ summaries, step, onSelect, animated = false }: StepListProps) {
  return (
    <ol className="space-y-1">
      {WIZARD_STEPS.map((item) => {
        const summary = summaries[item.id - 1];
        const current = item.id === step;
        const display = stepDisplay(summary, current);
        const Icon = DISPLAY_ICON[display];
        return (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => onSelect(item.id)}
              aria-current={current ? "step" : undefined}
              className="relative flex min-h-12 w-full items-center gap-3 rounded-lg px-3 py-2 text-left outline-none transition-colors hover:bg-muted/70 focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {current && (animated ? <motion.span layoutId="wizard-active-step" className="absolute inset-0 rounded-lg bg-accent" transition={{ type: "spring", stiffness: 420, damping: 36 }} /> : <span className="absolute inset-0 rounded-lg bg-accent" />)}
              <span className={cn("relative flex size-7 shrink-0 items-center justify-center rounded-full", ICON_TONE[display])}>
                <Icon aria-hidden className="size-4" />
              </span>
              <span className="relative min-w-0">
                <span className={cn("block text-[15px] leading-5", current ? "font-semibold text-accent-foreground" : "font-medium")}>
                  <span className="sr-only">Step {item.id}: </span>
                  {item.railLabel}
                </span>
                <span className="block text-sm leading-5 text-muted-foreground">{stepStatusText(summary, display)}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

/** Sticky left rail on large screens. */
export function WizardRail({ summaries, step, onSelect }: Omit<StepListProps, "animated">) {
  const overall = summaries[STEP_COUNT - 1];
  return (
    <nav aria-label="Manual entry steps" className="hidden lg:sticky lg:top-24 lg:col-span-4 lg:block lg:self-start">
      <div className="rounded-xl border bg-card p-4 shadow-[0_1px_2px_rgba(35,31,32,0.04),0_8px_24px_-12px_rgba(101,0,48,0.12)]">
        <div className="px-3 pt-1 pb-4">
          <p className="font-display text-lg font-semibold">Your details</p>
          <p className="mt-1 text-sm text-muted-foreground" aria-live="polite">
            {overall.filled} of {overall.total} filled in
          </p>
          <CompletenessBar filled={overall.filled} total={overall.total} className="mt-3" />
        </div>
        <StepList summaries={summaries} step={step} onSelect={onSelect} animated />
      </div>
    </nav>
  );
}

/** Compact progress header for phones, with the full step list in a sheet. */
export function WizardMobileBar({ summaries, step, onSelect }: Omit<StepListProps, "animated">) {
  const [open, setOpen] = useState(false);
  const overall = summaries[STEP_COUNT - 1];
  const current = WIZARD_STEPS[step - 1];
  return (
    <div className="mb-5 rounded-xl border bg-card p-4 lg:hidden">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground" aria-live="polite">
            Step {step} of {STEP_COUNT}
          </p>
          <p className="truncate font-display text-lg font-semibold">{current.title}</p>
        </div>
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" size="sm" className="h-11 shrink-0 px-3">
              <ListChecksIcon aria-hidden />
              All steps
            </Button>
          </SheetTrigger>
          <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto rounded-t-2xl px-4 pb-6">
            <SheetHeader className="px-1">
              <SheetTitle className="font-display text-xl">Manual entry steps</SheetTitle>
              <SheetDescription>
                {overall.filled} of {overall.total} details filled in. Jump to any step.
              </SheetDescription>
            </SheetHeader>
            <StepList
              summaries={summaries}
              step={step}
              onSelect={(next) => {
                setOpen(false);
                onSelect(next);
              }}
            />
          </SheetContent>
        </Sheet>
      </div>
      <CompletenessBar filled={overall.filled} total={overall.total} className="mt-3" />
    </div>
  );
}
