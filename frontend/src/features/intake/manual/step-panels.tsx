"use client";

import { PlusIcon } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";

import { Notice } from "@/components/shared/feedback";
import { Button } from "@/components/ui/button";
import { Stagger, StaggerItem } from "@/components/motion/reveal";
import { FactField } from "@/features/analysis/components/fact-field";
import { RemoveProcedureButton } from "@/features/analysis/components/fact-groups";
import { useAnalysis, useAnalysisController } from "@/features/analysis/analysis-provider";
import { formatIsoDate, isValidIsoDate } from "@/lib/domain/dates";
import { CATEGORIES, CATEGORY_LABELS, MAX_PROCEDURES, carePaths, planPaths, timingPaths } from "@/lib/domain/fields";
import { ADD_PROCEDURE_ID, WIZARD_STEPS, carePathsFor, procedureName } from "./wizard-steps";

interface PanelProps {
  analysisId: string;
}

/** Heading, why-we-ask line and staggered body shared by every step. */
export function StepFrame({ step, children }: { step: number; children: ReactNode }) {
  const { title, why } = WIZARD_STEPS[step - 1];
  return (
    <section aria-labelledby={`wizard-heading-${step}`}>
      <h2 id={`wizard-heading-${step}`} tabIndex={-1} className="scroll-mt-28 font-display text-[1.75rem] leading-9 font-semibold tracking-tight outline-none md:text-[2rem] md:leading-10">
        {title}
      </h2>
      <p className="mt-2 max-w-[34rem] text-pretty text-muted-foreground">{why}</p>
      <Stagger className="mt-6" delay={0.05} gap={0.05}>
        {children}
      </Stagger>
    </section>
  );
}

const FIELD_GRID = "grid gap-x-8 sm:grid-cols-2";

function FieldItems({ analysisId, paths }: PanelProps & { paths: string[] }) {
  return (
    <>
      {paths.map((path) => (
        <StaggerItem key={path}>
          <FactField analysisId={analysisId} path={path} />
        </StaggerItem>
      ))}
    </>
  );
}

export function BenefitYearStep({ analysisId, year }: PanelProps & { year: "y1" | "y2" }) {
  const paths = [planPaths.startsOn(year), planPaths.endsOn(year), planPaths.annualMaximum(year), planPaths.alreadyUsed(year), planPaths.deductible(year), planPaths.deductibleSatisfied(year)];
  return (
    <StepFrame step={year === "y1" ? 1 : 2}>
      <div className={FIELD_GRID}>
        <FieldItems analysisId={analysisId} paths={paths} />
      </div>
      {year === "y2" && (
        <StaggerItem className="mt-2 rounded-lg bg-accent/60 px-4">
          <FactField analysisId={analysisId} path={planPaths.rulesUnchanged} />
        </StaggerItem>
      )}
    </StepFrame>
  );
}

const COVERAGE_FIELDS = [
  { path: planPaths.insurerPercent, label: "Plan pays" },
  { path: planPaths.deductibleApplies, label: "Deductible applies" },
  { path: planPaths.maximumApplies, label: "Counts toward yearly limit" },
];

export function CoverageStep({ analysisId }: PanelProps) {
  return (
    <StepFrame step={3}>
      <div className="grid gap-4 md:grid-cols-3">
        {CATEGORIES.map((category) => (
          <StaggerItem key={category} className="rounded-xl border bg-background/60 px-4 pt-4 pb-2">
            <h3 className="font-display text-lg font-semibold">{CATEGORY_LABELS[category]}</h3>
            <div className="divide-y">
              {COVERAGE_FIELDS.map(({ path, label }) => (
                <FactField key={path(category)} analysisId={analysisId} path={path(category)} label={label} className="py-3" />
              ))}
            </div>
          </StaggerItem>
        ))}
      </div>
    </StepFrame>
  );
}


export function CareStep({ analysisId }: PanelProps) {
  const analysis = useAnalysis(analysisId);
  const controller = useAnalysisController();
  if (!analysis) return null;
  const { draft } = analysis;
  const atCap = draft.procedureIds.length >= MAX_PROCEDURES;

  return (
    <StepFrame step={4}>
      {draft.overflow.length > 0 && (
        <StaggerItem className="mb-4">
          <Notice tone="warning" title="Some care wasn't added">
            This version compares up to four procedures, so {draft.overflow.map((o) => `“${o.label}”`).join(", ")} {draft.overflow.length === 1 ? "wasn't" : "weren't"} added. Nothing was dropped silently: compare it separately or remove another procedure.
          </Notice>
        </StaggerItem>
      )}
      <div className="space-y-4">
        <AnimatePresence initial={false} mode="popLayout">
          {draft.procedureIds.map((id, index) => {
            const name = procedureName(draft, id, index);
            return (
              <motion.article
                key={id}
                layout
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.97 }}
                transition={{ duration: 0.25 }}
                aria-label={name}
                className="rounded-xl border bg-background/60 px-4 pt-3 pb-2 md:px-5"
              >
                <div className="flex items-center justify-between gap-3">
                  <h3 className="min-w-0 truncate font-display text-lg font-semibold">{name}</h3>
                  <RemoveProcedureButton label={name} onConfirm={() => controller.removeProcedure(analysisId, id)} />
                </div>
                <div className={FIELD_GRID}>
                  {carePathsFor(id).map((path) => (
                    <FactField key={path} analysisId={analysisId} path={path} />
                  ))}
                </div>
              </motion.article>
            );
          })}
        </AnimatePresence>
      </div>
      {draft.procedureIds.length === 0 && (
        <StaggerItem>
          <p className="rounded-xl border border-dashed px-4 py-6 text-muted-foreground">No procedures yet. Add the care your dentist prescribed, one procedure at a time.</p>
        </StaggerItem>
      )}
      <StaggerItem className="mt-5 flex flex-wrap items-center gap-3">
        <Button id={ADD_PROCEDURE_ID} variant="outline" onClick={() => controller.addProcedure(analysisId)} disabled={atCap}>
          <PlusIcon aria-hidden />
          Add procedure
        </Button>
        <p className="text-sm text-muted-foreground">{atCap ? `This version compares up to ${MAX_PROCEDURES} procedures, so that’s the limit. Remove one to add another.` : `Up to ${MAX_PROCEDURES} procedures. This version compares at most ${MAX_PROCEDURES}.`}</p>
      </StaggerItem>
    </StepFrame>
  );
}

export function TimingStep({ analysisId }: PanelProps) {
  const analysis = useAnalysis(analysisId);
  if (!analysis) return null;
  const { draft } = analysis;

  return (
    <StepFrame step={5}>
      {draft.procedureIds.length === 0 && (
        <StaggerItem>
          <p className="rounded-xl border border-dashed px-4 py-6 text-muted-foreground">Add prescribed care first, then say whether your dentist approved other dates.</p>
        </StaggerItem>
      )}
      <div className="space-y-4">
        {draft.procedureIds.map((id, index) => {
          const name = procedureName(draft, id, index);
          const permission = draft.facts[timingPaths.permission(id)]?.value;
          const anchor = draft.facts[carePaths.anchorDate(id)]?.value;
          return (
            <StaggerItem key={id}>
              <article aria-label={name} className="rounded-xl border bg-background/60 px-4 pt-3 pb-2 md:px-5">
                <h3 className="font-display text-lg font-semibold">{name}</h3>
                <FactField analysisId={analysisId} path={timingPaths.permission(id)} />
                <AnimatePresence initial={false} mode="wait">
                  {permission === "unknown" && (
                    <motion.p key="unknown" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="pb-3 text-sm text-muted-foreground">
                      Stays on its planned date{typeof anchor === "string" && isValidIsoDate(anchor) ? ` (${formatIsoDate(anchor)})` : ""}. We won’t compare other dates.
                    </motion.p>
                  )}
                  {permission === "dentistApproved" && (
                    <motion.div key="approved" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className={`${FIELD_GRID} border-t`}>
                      {[
                        timingPaths.windowEarliest(id, "y1"),
                        timingPaths.windowLatest(id, "y1"),
                        timingPaths.windowEarliest(id, "y2"),
                        timingPaths.windowLatest(id, "y2"),
                        timingPaths.deadline(id),
                        timingPaths.minGapDays(id),
                      ].map((path) => (
                        <FactField key={path} analysisId={analysisId} path={path} />
                      ))}
                      <FactField analysisId={analysisId} path={timingPaths.after(id)} className="sm:col-span-2" />
                    </motion.div>
                  )}
                </AnimatePresence>
              </article>
            </StaggerItem>
          );
        })}
      </div>
    </StepFrame>
  );
}
