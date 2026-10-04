"use client";

import { ChevronDownIcon, CircleCheckIcon, HistoryIcon, ShieldAlertIcon, TriangleAlertIcon } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useId, useState, type ReactNode } from "react";

import { EASE_OUT, Reveal } from "@/components/motion/reveal";
import { SectionHeading } from "@/components/shared/page";
import { Notice } from "@/components/shared/feedback";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatIsoDate, formatTimestamp } from "@/lib/domain/dates";
import { YEAR_LABELS } from "@/lib/domain/fields";
import { formatCents } from "@/lib/domain/money";
import type { CalculationRecord, ProcedureCalculation } from "@/lib/domain/types";
import { BenefitWindow, type ScheduleRow } from "./benefit-window";
import {
  assumesNextYearUnused,
  EQUAL_COST_TEXT,
  explainComparison,
  hasDeadlineRejection,
  hasDistinctBest,
  hasNextYearAssumptions,
  NO_CHEAPER_TEXT,
  TIMING_PRIORITY_TEXT,
} from "./explanations";
import { ExpandRegion } from "./expand-region";
import { ProcedureTraceSheet, type TraceSelection } from "./procedure-trace-sheet";
import { RecordLedger } from "./record-ledger";
import { movedAssignments } from "./schedule";
import { ScenarioColumn } from "./scenario-column";
import type { ComparisonViewProps } from "./types";
import { cn } from "@/lib/utils";

function Disclosure({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const regionId = useId();
  return (
    <div>
      <Button variant="outline" aria-expanded={open} aria-controls={regionId} onClick={() => setOpen((value) => !value)}>
        {label}
        <ChevronDownIcon className={cn("transition-transform duration-300", open && "rotate-180")} aria-hidden />
      </Button>
      <ExpandRegion id={regionId} open={open}>
        <div className="pt-4">{children}</div>
      </ExpandRegion>
    </div>
  );
}

/** The confident one-line verdict: slides in from the left after the two columns have landed. */
function DifferenceBanner({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  return (
    <motion.p
      initial={{ opacity: 0, x: -40 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.7, ease: EASE_OUT, delay: 0.9 }}
      className="flex items-start gap-3 rounded-2xl border border-primary/15 border-l-4 border-l-brand bg-accent px-5 py-4 font-display text-xl font-semibold text-balance text-accent-foreground md:px-6 md:text-[1.625rem] md:leading-8"
    >
      {icon}
      <span>{children}</span>
    </motion.p>
  );
}

function SourceNote({ sourceMode, fixtureName, engineVersion }: Pick<ComparisonViewProps, "sourceMode" | "fixtureName"> & { engineVersion: string }) {
  if (sourceMode === "fixturePreview") {
    return (
      <Notice title="Fixture preview">
        Precomputed for the named synthetic scenario “{fixtureName ?? "unnamed scenario"}”. The calculation engine isn&apos;t connected.
      </Notice>
    );
  }
  return <p className="text-sm text-muted-foreground">Calculated by engine {engineVersion}</p>;
}

/**
 * Record-driven comparison body shared by the live Compare screen and History
 * snapshots. All money is read from the records and formatted, never computed.
 */
export function ComparisonView({ comparison, scenario, procedureLabels, sourceMode, fixtureName, confirmedAt, historical }: ComparisonViewProps) {
  const [selection, setSelection] = useState<TraceSelection | null>(null);
  const { baseline, best, status } = comparison;
  const distinctBest = hasDistinctBest(comparison);
  const shownRecords = distinctBest ? [baseline, best] : [baseline];
  const otherRecords = status === "baselineBest" ? comparison.feasibleRecords.filter((record) => record.id !== baseline.id) : [];

  const rows: ScheduleRow[] = [{ key: "baseline", label: "Baseline", record: baseline }];
  if (distinctBest) rows.push({ key: "best", label: "Best dentist-permitted alternative", record: best });
  const scheduleLabelFor = (record: CalculationRecord) => rows.find((row) => row.record === record)?.label ?? "Later schedule";

  const selectProcedure = (record: CalculationRecord, calculation: ProcedureCalculation) =>
    setSelection({ record, calculation, scheduleLabel: scheduleLabelFor(record) });

  const explanations = explainComparison(comparison, procedureLabels);
  const showAssumption = hasNextYearAssumptions(shownRecords);

  return (
    <div className="space-y-14">
      {historical && (
        <Reveal>
          <Alert className="border-primary/20 bg-accent/60">
            <HistoryIcon aria-hidden />
            <AlertDescription className="text-foreground">
              Historical estimate — based on facts confirmed on {formatTimestamp(confirmedAt)}. Details and permissions are shown as they were then and may
              have changed since.
            </AlertDescription>
          </Alert>
        </Reveal>
      )}

      <section aria-label="Comparison summary" className="space-y-6">
        <motion.div layout className="grid items-start gap-5 md:grid-cols-12 md:gap-6">
          <AnimatePresence>
            <ScenarioColumn
              key="baseline"
              className={distinctBest ? "md:col-span-5" : "md:col-span-7"}
              headingId="column-baseline"
              title="Baseline"
              description="Care on its planned dates"
              record={baseline}
              tone={distinctBest ? "quiet" : "primary"}
              delay={0.1}
            />
            {distinctBest && (
              <ScenarioColumn
                key="best"
                className="md:col-span-7"
                headingId="column-best"
                title="Best dentist-permitted alternative"
                description="The lowest estimated cost among schedules your dentist permits"
                record={best}
                tone="primary"
                delay={0.3}
              />
            )}
          </AnimatePresence>
        </motion.div>

        {status === "cheaperPermittedAlternative" && (
          <DifferenceBanner icon={<CircleCheckIcon className="mt-0.5 size-6 shrink-0 text-primary" aria-hidden />}>
            <span className="tabular">{formatCents(comparison.patientReductionCents)}</span> lower estimated patient cost under these confirmed assumptions.
          </DifferenceBanner>
        )}
        {status === "baselineBest" && (
          <DifferenceBanner>
            {NO_CHEAPER_TEXT}
            {hasDeadlineRejection(comparison) && <span className="mt-2 block font-sans text-base font-normal">{TIMING_PRIORITY_TEXT}</span>}
          </DifferenceBanner>
        )}
        {status === "equalCost" && <DifferenceBanner>{EQUAL_COST_TEXT}</DifferenceBanner>}

        <div className="flex flex-wrap gap-2">
          <Badge variant="warning" className="h-7 px-3 text-sm">
            <ShieldAlertIcon aria-hidden />
            Payment is not guaranteed
          </Badge>
          {showAssumption && (
            <Badge variant="outline" className="h-auto min-h-7 px-3 py-1 text-sm whitespace-normal">
              <TriangleAlertIcon aria-hidden />
              {assumesNextYearUnused(shownRecords)
                ? historical
                  ? "Assumed next year's rules and $0 used — as confirmed at that time"
                  : "Assumes next year's rules and $0 used — as you confirmed"
                : historical
                  ? "Assumed next year's rules — as confirmed at that time"
                  : "Assumes next year's rules — as you confirmed"}
            </Badge>
          )}
        </div>
        <SourceNote sourceMode={sourceMode} fixtureName={fixtureName} engineVersion={baseline.engineVersion} />
      </section>

      <section aria-labelledby="benefit-window-heading">
        <Reveal>
          <SectionHeading id="benefit-window-heading" description="Select a procedure to see how it was calculated. Positions show the benefit year and date order, not exact spacing.">
            Where each procedure falls
          </SectionHeading>
        </Reveal>
        <BenefitWindow scenario={scenario} rows={rows} procedureLabels={procedureLabels} onSelectProcedure={selectProcedure} />
      </section>

      <section aria-labelledby="why-heading">
        <h2 id="why-heading" className="sr-only">
          Explanation
        </h2>
        <Disclosure label="Why did this change?">
          <ul className="list-disc space-y-2 pl-5 text-base">
            {explanations.map((explanation) => (
              <li key={explanation.id}>{explanation.text}</li>
            ))}
          </ul>
        </Disclosure>
      </section>

      {otherRecords.length > 0 && (
        <section aria-labelledby="other-heading">
          <h2 id="other-heading" className="sr-only">
            Other permitted schedules
          </h2>
          <Disclosure label="Other permitted schedules we modeled">
            <div className="space-y-8">
              <p className="text-sm text-muted-foreground">These schedules are permitted by your dentist but do not lower your estimated patient cost, so none is recommended.</p>
              {otherRecords.map((record, index) => (
                <div key={record.id} className="space-y-3">
                  <ul className="list-disc space-y-1 pl-5 text-sm">
                    {movedAssignments(baseline, record).map((assignment) => (
                      <li key={assignment.procedureId}>
                        {procedureLabels[assignment.procedureId] ?? assignment.procedureId} on {formatIsoDate(assignment.serviceDate)} (
                        {YEAR_LABELS[assignment.benefitYearId].toLowerCase()})
                      </li>
                    ))}
                  </ul>
                  <RecordLedger
                    title={`Later schedule ${index + 1}`}
                    record={record}
                    procedureLabels={procedureLabels}
                    onSelectProcedure={(selected, calculation) => setSelection({ record: selected, calculation, scheduleLabel: `Later schedule ${index + 1}` })}
                  />
                </div>
              ))}
            </div>
          </Disclosure>
        </section>
      )}

      <section aria-labelledby="ledger-heading" className="space-y-8">
        <SectionHeading id="ledger-heading" description="Amounts come from the calculation. Select a procedure name for its steps.">
          Year by year
        </SectionHeading>
        {rows.map((row) => (
          <Reveal key={row.key}>
            <RecordLedger title={row.label} record={row.record} procedureLabels={procedureLabels} onSelectProcedure={selectProcedure} />
          </Reveal>
        ))}
      </section>

      <ProcedureTraceSheet selection={selection} procedureLabels={procedureLabels} onClose={() => setSelection(null)} />
    </div>
  );
}
