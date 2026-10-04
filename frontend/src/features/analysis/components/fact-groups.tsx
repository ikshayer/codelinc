"use client";

import { ChevronDownIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useState, type ReactNode } from "react";

import { Notice } from "@/components/shared/feedback";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { MAX_PROCEDURES, CATEGORIES, CATEGORY_LABELS, carePaths, planPaths, timingPaths } from "@/lib/domain/fields";
import { formatIsoDate, isValidIsoDate } from "@/lib/domain/dates";
import type { ProcedureId } from "@/lib/domain/types";
import { useAnalysis, useAnalysisController } from "../analysis-provider";
import { FactField } from "./fact-field";

export type FieldErrors = Record<string, string>;

/** Bordered panel for one confirmation group — a meaningful task boundary. */
export function GroupPanel({ id, title, description, children, footer, collapsible = false, initiallyOpen = false }: { id: string; title: string; description?: ReactNode; children: ReactNode; footer?: ReactNode; collapsible?: boolean; initiallyOpen?: boolean }) {
  const [open, setOpen] = useState(initiallyOpen);
  if (collapsible) {
    return (
      <details open={open} onToggle={(event) => setOpen(event.currentTarget.open)} className="group rounded-xl border bg-card">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-5 [&::-webkit-details-marker]:hidden md:px-6">
          <h2 id={`${id}-title`} tabIndex={-1} className="scroll-mt-36 text-xl font-semibold tracking-tight outline-none">{title}</h2>
          <ChevronDownIcon aria-hidden className="size-5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
        </summary>
        {description && <div className="border-t px-5 pt-5 text-sm text-muted-foreground md:px-6">{description}</div>}
        <div className="px-5 md:px-6">{children}</div>
        {footer && <div className="border-t px-5 py-4 md:px-6">{footer}</div>}
      </details>
    );
  }
  return (
    <section aria-labelledby={`${id}-title`} className="rounded-lg border">
      <header className="border-b px-5 py-5 md:px-6">
        <h2 id={`${id}-title`} className="text-xl font-semibold tracking-tight">
          {title}
        </h2>
        {description && <div className="mt-1 text-sm text-muted-foreground">{description}</div>}
      </header>
      <div className="px-5 md:px-6">{children}</div>
      {footer && <div className="border-t px-5 py-4 md:px-6">{footer}</div>}
    </section>
  );
}

function Subsection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="border-b py-5 last:border-b-0">
      <h3 className="text-base font-semibold">{title}</h3>
      <div className="grid gap-x-10 md:grid-cols-2">{children}</div>
    </div>
  );
}

export function PlanGroup({ analysisId, errors, collapsible = false }: { analysisId: string; errors: FieldErrors; collapsible?: boolean }) {
  return (
    <GroupPanel
      id="group-plan"
      title="Your plan"
      collapsible={collapsible}
      initiallyOpen
      description="The plan's yearly limit and amount already used affect what it may pay. Leave anything you don't know blank — we won't assume zero."
    >
      {(["y1", "y2"] as const).map((year) => (
        <Subsection key={year} title={year === "y1" ? "This benefit year" : "Next benefit year"}>
          {[planPaths.startsOn(year), planPaths.endsOn(year), planPaths.annualMaximum(year), planPaths.alreadyUsed(year), planPaths.deductible(year), planPaths.deductibleSatisfied(year)].map((path) => (
            <FactField key={path} analysisId={analysisId} path={path} error={errors[path]} />
          ))}
        </Subsection>
      ))}
      <Subsection title="Coverage by category">
        <FactField analysisId={analysisId} path={planPaths.rulesUnchanged} error={errors[planPaths.rulesUnchanged]} className="md:col-span-2" />
        {CATEGORIES.flatMap((category) => [
          <FactField key={`${category}-pct`} analysisId={analysisId} path={planPaths.insurerPercent(category)} error={errors[planPaths.insurerPercent(category)]} />,
          <FactField key={`${category}-ded`} analysisId={analysisId} path={planPaths.deductibleApplies(category)} error={errors[planPaths.deductibleApplies(category)]} />,
          <FactField key={`${category}-max`} analysisId={analysisId} path={planPaths.maximumApplies(category)} error={errors[planPaths.maximumApplies(category)]} className="md:col-span-2" />,
        ])}
      </Subsection>
      <p className="sr-only">Categories: {CATEGORIES.map((c) => CATEGORY_LABELS[c]).join(", ")}</p>
    </GroupPanel>
  );
}

function useProcedureLabel(analysisId: string) {
  const analysis = useAnalysis(analysisId);
  return (id: ProcedureId, index: number) => {
    const value = analysis?.draft.facts[carePaths.label(id)]?.value;
    return typeof value === "string" && value ? value : `Procedure ${index + 1}`;
  };
}

export function CareGroup({ analysisId, errors, collapsible = false }: { analysisId: string; errors: FieldErrors; collapsible?: boolean }) {
  const analysis = useAnalysis(analysisId);
  const controller = useAnalysisController();
  const labelFor = useProcedureLabel(analysisId);
  if (!analysis) return null;
  const { procedureIds, overflow } = analysis.draft;
  const atCap = procedureIds.length >= MAX_PROCEDURES;

  return (
    <GroupPanel
      id="group-care"
      title="Your prescribed care"
      collapsible={collapsible}
      description="The procedures your dentist prescribed and the fees they quoted for this plan."
      footer={
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" onClick={() => controller.addProcedure(analysisId)} disabled={atCap}>
            <PlusIcon aria-hidden />
            Add procedure
          </Button>
          <p className="text-sm text-muted-foreground">{atCap ? "This version compares up to four procedures." : `Up to ${MAX_PROCEDURES} procedures.`}</p>
        </div>
      }
    >
      {errors.care && <p className="pt-4 text-sm text-destructive">{errors.care}</p>}
      {overflow.length > 0 && (
        <div className="pt-4">
          <Notice tone="warning" title="Some care wasn't added">
            This version compares up to four procedures, so {overflow.map((o) => `“${o.label}”`).join(", ")} {overflow.length === 1 ? "wasn't" : "weren't"} added. Nothing was dropped silently: compare it separately or remove another procedure.
          </Notice>
        </div>
      )}
      {procedureIds.length === 0 && <p className="py-6 text-muted-foreground">No procedures yet. Add the care your dentist prescribed.</p>}
      {procedureIds.map((id, index) => (
        <div key={id} className="border-b py-5 last:border-b-0">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-base font-semibold">{labelFor(id, index)}</h3>
            <RemoveProcedureButton label={labelFor(id, index)} onConfirm={() => controller.removeProcedure(analysisId, id)} />
          </div>
          <div className="grid gap-x-10 md:grid-cols-2">
            {[carePaths.label(id), carePaths.category(id), carePaths.fee(id), carePaths.anchorDate(id), carePaths.eligibilityConfirmed(id)].map((path) => (
              <FactField key={path} analysisId={analysisId} path={path} error={errors[path]} />
            ))}
          </div>
        </div>
      ))}
    </GroupPanel>
  );
}

function RemoveProcedureButton({ label, onConfirm }: { label: string; onConfirm: () => void }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-muted-foreground">
          <Trash2Icon aria-hidden />
          Remove
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove {label}?</AlertDialogTitle>
          <AlertDialogDescription>Its fee, dates and timing details are removed from this analysis. Sources you added stay available.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep it</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
            Remove {label}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function TimingGroup({ analysisId, errors, collapsible = false }: { analysisId: string; errors: FieldErrors; collapsible?: boolean }) {
  const analysis = useAnalysis(analysisId);
  const labelFor = useProcedureLabel(analysisId);
  if (!analysis) return null;
  const { procedureIds, facts } = analysis.draft;

  return (
    <GroupPanel
      id="group-timing"
      title="Timing your dentist approved"
      collapsible={collapsible}
      description="CareWindow only compares dates your dentist has already approved. If you don't know, a procedure stays on its planned date."
    >
      {procedureIds.length === 0 && <p className="py-6 text-muted-foreground">Add prescribed care first.</p>}
      {procedureIds.map((id, index) => {
        const permission = facts[timingPaths.permission(id)]?.value;
        const anchor = facts[carePaths.anchorDate(id)]?.value;
        return (
          <div key={id} className="border-b py-5 last:border-b-0">
            <h3 className="text-base font-semibold">{labelFor(id, index)}</h3>
            <FactField analysisId={analysisId} path={timingPaths.permission(id)} error={errors[timingPaths.permission(id)]} />
            {permission === "unknown" && (
              <p className="pb-2 text-sm text-muted-foreground">
                Stays on its planned date{typeof anchor === "string" && isValidIsoDate(anchor) ? ` (${formatIsoDate(anchor)})` : ""}. We won’t compare other dates.
              </p>
            )}
            {permission === "dentistApproved" && (
              <div className="grid gap-x-10 md:grid-cols-2">
                {(["y1", "y2"] as const).flatMap((year) => [timingPaths.windowEarliest(id, year), timingPaths.windowLatest(id, year)]).map((path) => (
                  <FactField key={path} analysisId={analysisId} path={path} error={errors[path]} />
                ))}
                <FactField analysisId={analysisId} path={timingPaths.deadline(id)} error={errors[timingPaths.deadline(id)]} />
                <span aria-hidden className="hidden md:block" />
                <FactField analysisId={analysisId} path={timingPaths.after(id)} error={errors[timingPaths.after(id)]} />
                <FactField analysisId={analysisId} path={timingPaths.minGapDays(id)} error={errors[timingPaths.minGapDays(id)]} />
              </div>
            )}
          </div>
        );
      })}
    </GroupPanel>
  );
}
