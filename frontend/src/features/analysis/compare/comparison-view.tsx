"use client";

import { ChevronDownIcon, CircleCheckIcon, HistoryIcon, ShieldAlertIcon, TriangleAlertIcon } from "lucide-react";
import { useState, type ReactNode } from "react";

import { SectionHeading } from "@/components/shared/page";
import { Notice } from "@/components/shared/feedback";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
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
import { ProcedureTraceSheet, type TraceSelection } from "./procedure-trace-sheet";
import { RecordLedger } from "./record-ledger";
import { movedAssignments } from "./schedule";
import { ScenarioColumn } from "./scenario-column";
import type { ComparisonViewProps } from "./types";

function Disclosure({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Collapsible>
      <CollapsibleTrigger asChild>
        <Button variant="outline" className="[&[data-state=open]>svg]:rotate-180">
          {label}
          <ChevronDownIcon className="transition-transform duration-200" aria-hidden />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-4">{children}</CollapsibleContent>
    </Collapsible>
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
    <div className="space-y-12">
      {historical && (
        <Alert>
          <HistoryIcon aria-hidden />
          <AlertDescription className="text-foreground">
            Historical estimate — based on facts confirmed on {formatTimestamp(confirmedAt)}. Details and permissions are shown as they were then and may
            have changed since.
          </AlertDescription>
        </Alert>
      )}

      <section aria-label="Comparison summary" className="space-y-6">
        <div className="overflow-hidden rounded-lg border">
          <div className={distinctBest ? "grid divide-y md:grid-cols-2 md:divide-x md:divide-y-0" : ""}>
            <ScenarioColumn headingId="column-baseline" title="Baseline" description="Care on its planned dates" record={baseline} />
            {distinctBest && (
              <ScenarioColumn
                headingId="column-best"
                title="Best dentist-permitted alternative"
                description="The lowest estimated cost among schedules your dentist permits"
                record={best}
                emphasized={status === "cheaperPermittedAlternative"}
              />
            )}
          </div>
        </div>

        {status === "cheaperPermittedAlternative" && (
          <p className="flex items-start gap-3 text-xl font-semibold text-balance md:text-section">
            <CircleCheckIcon className="mt-1 size-6 shrink-0 text-primary" aria-hidden />
            <span>
              <span className="tabular">{formatCents(comparison.patientReductionCents)}</span> lower estimated patient cost under these confirmed assumptions.
            </span>
          </p>
        )}
        {status === "baselineBest" && (
          <div className="space-y-2">
            <p className="text-xl font-semibold text-balance md:text-section">{NO_CHEAPER_TEXT}</p>
            {hasDeadlineRejection(comparison) && <p className="text-base">{TIMING_PRIORITY_TEXT}</p>}
          </div>
        )}
        {status === "equalCost" && <p className="text-xl font-semibold text-balance md:text-section">{EQUAL_COST_TEXT}</p>}

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
        <SectionHeading id="benefit-window-heading" description="Select a procedure to see how it was calculated. Positions show the benefit year and date order, not exact spacing.">
          Where each procedure falls
        </SectionHeading>
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
          <RecordLedger key={row.key} title={row.label} record={row.record} procedureLabels={procedureLabels} onSelectProcedure={selectProcedure} />
        ))}
      </section>

      <ProcedureTraceSheet selection={selection} procedureLabels={procedureLabels} onClose={() => setSelection(null)} />
    </div>
  );
}
