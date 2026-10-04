"use client";

import { FlagIcon } from "lucide-react";
import { motion, type Variants } from "motion/react";

import { EASE_OUT } from "@/components/motion/reveal";

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

const procedureVariants: Variants = {
  hidden: { opacity: 0, y: 14 },
  shown: { opacity: 1, y: 0, transition: { duration: 0.45, ease: EASE_OUT } },
};

/** A moved procedure starts in its baseline year's lane and travels across the boundary into place. */
function travelVariants(from: BenefitYearId, to: BenefitYearId): Variants {
  if (from === to) return procedureVariants;
  return {
    hidden: { opacity: 0, x: from === "y1" ? "-104%" : "104%" },
    shown: { opacity: 1, x: 0, transition: { type: "spring", stiffness: 90, damping: 18, delay: 0.7 } },
  };
}

function originalYear(assignment: ScheduleAssignment, baseline: CalculationRecord): BenefitYearId {
  return baseline.schedule.assignments.find((a) => a.procedureId === assignment.procedureId)?.benefitYearId ?? assignment.benefitYearId;
}

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
    <motion.div
      initial="hidden"
      whileInView="shown"
      viewport={{ once: true, margin: "-60px" }}
      variants={{ hidden: {}, shown: { transition: { staggerChildren: 0.09, delayChildren: 0.25 } } }}
      className="relative overflow-hidden rounded-2xl border bg-card"
    >
      {/* Year boundary: draws down the page once the window scrolls into view. */}
      <motion.div
        aria-hidden
        variants={{ hidden: { scaleY: 0 }, shown: { scaleY: 1, transition: { duration: 0.8, ease: EASE_OUT } } }}
        style={{ originY: 0, backgroundImage: "repeating-linear-gradient(to bottom, var(--color-brand) 0 6px, transparent 6px 11px)" }}
        className="pointer-events-none absolute inset-y-0 left-1/2 z-10 w-0.5 -translate-x-1/2 opacity-60 md:left-[calc(9rem+(100%-9rem)/2)]"
      />
      <div className={cn(gridColumns, "border-b bg-accent/40")}>
        <div className="hidden md:block" />
        {years.map((year, index) => (
          <div key={year.id} className="px-4 py-3">
            <p className="text-sm font-semibold">{YEAR_LABELS[year.id]}</p>
            <p className="text-xs text-muted-foreground">
              {formatIsoDate(year.startsOn)} to {formatIsoDate(year.endsOn)}
            </p>
            {index === 1 && (
              <p className="mt-1 flex items-center gap-1 text-xs font-medium text-primary">
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
              {YEAR_ORDER.map((yearId) => {
                const procedures = row.record.ledgers
                  .flatMap((ledger) => ledger.procedures)
                  .filter((calculation) => calculation.benefitYearId === yearId)
                  .sort((a, b) => compareIso(a.serviceDate, b.serviceDate));
                return (
                  <ul key={yearId} aria-label={`${row.label}, ${YEAR_LABELS[yearId].toLowerCase()}`} className="flex flex-col gap-2 px-4 py-4">
                    {procedures.length === 0 && <li className="text-sm text-muted-foreground">No care scheduled</li>}
                    {procedures.map((calculation) => {
                      const movedAssignment = moved.find((a) => a.procedureId === calculation.procedureId);
                      const variants = movedAssignment ? travelVariants(originalYear(movedAssignment, baseline), calculation.benefitYearId) : procedureVariants;
                      return (
                        <motion.li key={calculation.procedureId} variants={variants} className="relative z-20">
                          <button
                            type="button"
                            aria-haspopup="dialog"
                            onClick={() => onSelectProcedure(row.record, calculation)}
                            className={cn(
                              "flex min-h-11 w-full flex-col items-start rounded-lg border bg-card px-3 py-2 text-left transition-[background-color,box-shadow,transform] hover:-translate-y-0.5 hover:bg-muted hover:shadow-sm focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                              movedAssignment && "border-primary bg-accent text-accent-foreground shadow-[0_6px_16px_-8px_rgba(101,0,48,0.35)] hover:bg-accent",
                            )}
                          >
                            <span className="text-sm font-medium">{procedureLabels[calculation.procedureId] ?? calculation.procedureId}</span>
                            <span className="text-xs text-muted-foreground">{formatIsoDate(calculation.serviceDate)}</span>
                            {movedAssignment && <span className="mt-1 text-xs font-semibold text-primary">{movedNote(movedAssignment, baseline)}</span>}
                          </button>
                        </motion.li>
                      );
                    })}
                  </ul>
                );
              })}
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}
