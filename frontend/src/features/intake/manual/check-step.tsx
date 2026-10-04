"use client";

import Link from "next/link";
import { AlertTriangleIcon, CheckIcon, CircleDashedIcon } from "lucide-react";
import { useState } from "react";

import { LincolnAbe } from "@/components/brand/lincoln-logo";
import { StaggerItem } from "@/components/motion/reveal";
import { Button } from "@/components/ui/button";
import { StepFrame } from "./step-panels";
import { CHECK_STEP, WIZARD_STEPS, type StepItem, type StepSummary } from "./wizard-steps";

interface CheckStepProps {
  analysisId: string;
  summaries: readonly StepSummary[];
  onJump: (item: StepItem) => void;
  onGoToStep: (step: number) => void;
}

export function CheckStep({ analysisId, summaries, onJump, onGoToStep }: CheckStepProps) {
  const overall = summaries[CHECK_STEP - 1];
  const blank = overall.missing.length;

  return (
    <StepFrame step={CHECK_STEP}>
      <StaggerItem className="flex items-center gap-3">
        <LincolnAbe className="h-10 shrink-0" />
        <p className="text-base font-medium" aria-live="polite">
          {overall.complete
            ? "Everything is filled in."
            : `${overall.filled} of ${overall.total} details filled in${blank > 0 ? `, ${blank} blank` : ""}${overall.conflicts.length > 0 ? `, ${overall.conflicts.length} to resolve` : ""}.`}
        </p>
      </StaggerItem>

      <StaggerItem className="mt-4">
        <ul className="divide-y rounded-xl border bg-background/60">
        {summaries.slice(0, CHECK_STEP - 1).map((summary) => (
          <DigestRow key={summary.step} summary={summary} onJump={onJump} onGoToStep={onGoToStep} />
        ))}
      </ul>
      </StaggerItem>

      <StaggerItem className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3">
        <Button asChild size="lg">
          <Link href={`/analysis/${analysisId}/confirm`}>Continue to review</Link>
        </Button>
        <p className="max-w-[24rem] text-sm text-muted-foreground">You can continue with blanks. Review shows what each value is, where it came from, and what’s still needed to compare.</p>
      </StaggerItem>
    </StepFrame>
  );
}

const COLLAPSED_ITEMS = 3;

function DigestRow({ summary, onJump, onGoToStep }: { summary: StepSummary; onJump: (item: StepItem) => void; onGoToStep: (step: number) => void }) {
  const [expanded, setExpanded] = useState(false);
  const step = WIZARD_STEPS[summary.step - 1];
  const items = [...summary.conflicts, ...summary.missing];
  const shown = expanded ? items : items.slice(0, COLLAPSED_ITEMS);
  const hidden = items.length - shown.length;
  const StatusIcon = summary.complete ? CheckIcon : summary.conflicts.length > 0 ? AlertTriangleIcon : CircleDashedIcon;

  return (
    <li className="px-4 py-3 md:px-5">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <h3 className="flex items-center gap-2 text-base font-semibold">
          <StatusIcon aria-hidden className={summary.complete ? "size-4 text-success" : summary.conflicts.length > 0 ? "size-4 text-destructive" : "size-4 text-muted-foreground"} />
          {step.title}
        </h3>
        <p className="tabular text-sm text-muted-foreground">
          {summary.filled} of {summary.total} filled in
        </p>
      </div>
      {items.length > 0 ? (
        <ul className="mt-1 flex flex-wrap gap-x-1">
          {shown.map((item) => (
            <li key={item.key}>
              <button
                type="button"
                onClick={() => onJump(item)}
                className="inline-flex min-h-11 items-center rounded-md px-2 text-left text-sm text-info underline underline-offset-4 outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                {summary.conflicts.includes(item) ? `Resolve: ${item.label}` : item.label}
              </button>
            </li>
          ))}
          {items.length > COLLAPSED_ITEMS && (
            <li>
              <button
                type="button"
                aria-expanded={expanded}
                onClick={() => setExpanded((value) => !value)}
                className="inline-flex min-h-11 items-center rounded-md px-2 text-sm text-muted-foreground underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                {expanded ? "Show fewer" : `Show ${hidden} more`}
              </button>
            </li>
          )}
        </ul>
      ) : (
        <Button variant="link" className="-ml-2 h-11 px-2 text-muted-foreground" onClick={() => onGoToStep(summary.step)}>
          Edit {step.title.toLowerCase()}
        </Button>
      )}
    </li>
  );
}
