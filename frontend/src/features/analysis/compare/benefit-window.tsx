import { FlagIcon } from "lucide-react";

import { formatIsoDate, compareIso } from "@/lib/domain/dates";
import { YEAR_LABELS } from "@/lib/domain/fields";
import type { BenefitYearId, CalculationRecord, ConfirmedScenario, ProcedureCalculation, ProcedureId, ScheduleAssignment } from "@/lib/domain/types";
import { cn } from "@/lib/utils";
import { movedAssignments } from "./schedule";

export interface ScheduleRow {
  key: string;
  label: string;
  record: CalculationRecord;
}

interface BenefitWindowProps {
  scenario: ConfirmedScenario;
  /** The first row is the baseline; later rows are compared against it. */
  rows: ScheduleRow[];
  procedureLabels: Record<ProcedureId, string>;
  onSelectProcedure: (record: CalculationRecord, calculation: ProcedureCalculation) => void;
}

const YEAR_ORDER: BenefitYearId[] = ["y1", "y2"];

function movedNote(assignment: ScheduleAssignment, baseline: CalculationRecord): string {
  const original = baseline.schedule.assignments.find((a) => a.procedureId === assignment.procedureId);
  return original && original.benefitYearId === assignment.benefitYearId
    ? "Moved to a different date"
    : `Moved to ${YEAR_LABELS[assignment.benefitYearId].toLowerCase()}`;
}

/**
 * The two benefit years side by side, with the year boundary marked, showing
 * where each procedure lands in each schedule. Layout is by year and date
 * order, not to scale, so same-week appointments stay readable. The lists are
 * the accessible equivalent: each lane is labeled by schedule and year.
 */
export function BenefitWindow({ scenario, rows, procedureLabels, onSelectProcedure }: BenefitWindowProps) {
  const years = scenario.plan.years;
  const baseline = rows[0].record;
  const gridColumns = "grid grid-cols-2 md:grid-cols-[9rem_1fr_1fr]";

  return (
    <div className="rounded-lg border">
      <div className={cn(gridColumns, "border-b bg-muted/40")}>
        <div className="hidden md:block" />
        {years.map((year, index) => (
          <div key={year.id} className={cn("px-4 py-3", index === 1 && "border-l-2 border-dashed border-foreground/30")}>
            <p className="text-sm font-semibold">{YEAR_LABELS[year.id]}</p>
            <p className="text-xs text-muted-foreground">
              {formatIsoDate(year.startsOn)} to {formatIsoDate(year.endsOn)}
            </p>
            {index === 1 && (
              <p className="mt-1 flex items-center gap-1 text-xs font-medium">
                <FlagIcon className="size-3" aria-hidden />
                New benefit year
              </p>
            )}
          </div>
        ))}
      </div>
      <div className="divide-y">
        {rows.map((row, rowIndex) => {
          const moved = rowIndex === 0 ? [] : movedAssignments(baseline, row.record);
          return (
            <div key={row.key} className={gridColumns}>
              <h3 className="col-span-2 px-4 pt-4 text-sm font-semibold md:col-span-1 md:py-4">{row.label}</h3>
              {YEAR_ORDER.map((yearId, yearIndex) => {
                const procedures = row.record.ledgers
                  .flatMap((ledger) => ledger.procedures)
                  .filter((calculation) => calculation.benefitYearId === yearId)
                  .sort((a, b) => compareIso(a.serviceDate, b.serviceDate));
                return (
                  <ul
                    key={yearId}
                    aria-label={`${row.label}, ${YEAR_LABELS[yearId].toLowerCase()}`}
                    className={cn("flex flex-col gap-2 px-4 py-4", yearIndex === 1 && "border-l-2 border-dashed border-foreground/30")}
                  >
                    {procedures.length === 0 && <li className="text-sm text-muted-foreground">No care scheduled</li>}
                    {procedures.map((calculation) => {
                      const movedAssignment = moved.find((a) => a.procedureId === calculation.procedureId);
                      return (
                        <li key={calculation.procedureId}>
                          <button
                            type="button"
                            aria-haspopup="dialog"
                            onClick={() => onSelectProcedure(row.record, calculation)}
                            className={cn(
                              "flex min-h-11 w-full flex-col items-start rounded-md border px-3 py-2 text-left transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                              movedAssignment && "border-primary bg-accent text-accent-foreground hover:bg-accent",
                            )}
                          >
                            <span className="text-sm font-medium">{procedureLabels[calculation.procedureId] ?? calculation.procedureId}</span>
                            <span className="text-xs text-muted-foreground">{formatIsoDate(calculation.serviceDate)}</span>
                            {movedAssignment && <span className="mt-1 text-xs font-semibold text-primary">{movedNote(movedAssignment, baseline)}</span>}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
