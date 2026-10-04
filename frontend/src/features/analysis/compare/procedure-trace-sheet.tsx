"use client";

import Link from "next/link";
import { useSyncExternalStore, type ReactNode } from "react";

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { formatIsoDate } from "@/lib/domain/dates";
import { getFieldDefinition, isKnownFieldPath, YEAR_LABELS } from "@/lib/domain/fields";
import { formatBasisPoints, formatCents } from "@/lib/domain/money";
import type { CalculationRecord, ProcedureCalculation, ProcedureId } from "@/lib/domain/types";
import { cn } from "@/lib/utils";
import { useConfirmFieldHref } from "./confirm-links";

export interface TraceSelection {
  record: CalculationRecord;
  calculation: ProcedureCalculation;
  /** Names the schedule the trace belongs to, e.g. "Baseline". */
  scheduleLabel: string;
}

const PHONE_QUERY = "(max-width: 767px)";

function subscribePhone(onChange: () => void): () => void {
  const query = window.matchMedia(PHONE_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function useIsPhone(): boolean {
  return useSyncExternalStore(
    subscribePhone,
    () => window.matchMedia(PHONE_QUERY).matches,
    () => false,
  );
}

function TraceRow({ label, value, strong, indent }: { label: string; value: ReactNode; strong?: boolean; indent?: boolean }) {
  return (
    <div className={cn("flex items-baseline justify-between gap-4 py-2", indent && "pl-4")}>
      <dt className={cn("text-sm", strong ? "font-semibold" : "text-muted-foreground")}>{label}</dt>
      <dd className={cn("text-right tabular", strong ? "text-base font-semibold" : "text-sm")}>{value}</dd>
    </div>
  );
}

function yesNo(value: boolean): string {
  return value ? "Yes" : "No";
}

function SourceItem({ fieldPath }: { fieldPath: string }) {
  const href = useConfirmFieldHref(fieldPath);
  const label = isKnownFieldPath(fieldPath) ? getFieldDefinition(fieldPath).label : fieldPath;
  return (
    <li>
      {href ? (
        <Link href={href} className="inline-flex min-h-11 items-center text-sm text-primary underline underline-offset-4">
          {label}
        </Link>
      ) : (
        <span className="inline-flex min-h-8 items-center text-sm">{label}</span>
      )}
    </li>
  );
}

interface ProcedureTraceSheetProps {
  selection: TraceSelection | null;
  procedureLabels: Record<ProcedureId, string>;
  onClose: () => void;
}

/** Step-by-step calculation for one procedure, rendered from its ProcedureCalculation. */
export function ProcedureTraceSheet({ selection, procedureLabels, onClose }: ProcedureTraceSheetProps) {
  const isPhone = useIsPhone();
  const calculation = selection?.calculation ?? null;
  const label = calculation ? (procedureLabels[calculation.procedureId] ?? calculation.procedureId) : "";

  return (
    <Sheet open={calculation !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side={isPhone ? "bottom" : "right"} className="overflow-y-auto data-[side=bottom]:max-h-[90dvh] data-[side=right]:sm:max-w-md">
        {selection && calculation && (
          <>
            <SheetHeader className="pr-14">
              <SheetTitle className="text-lg">{label}</SheetTitle>
              <SheetDescription>
                {selection.scheduleLabel}: {formatIsoDate(calculation.serviceDate)}, {YEAR_LABELS[calculation.benefitYearId].toLowerCase()}
              </SheetDescription>
            </SheetHeader>
            <div className="space-y-6 px-4 pb-8">
              <dl className="divide-y">
                <TraceRow label="Contracted fee" value={formatCents(calculation.feeCents)} />
                <TraceRow label="Deductible applies to this care" value={yesNo(calculation.deductibleApplies)} />
                <TraceRow label="Deductible applied" value={formatCents(calculation.deductibleAppliedCents)} />
                <TraceRow label="Eligible after deductible" value={formatCents(calculation.eligibleAfterDeductibleCents)} />
                <TraceRow label="Plan pays this share" value={formatBasisPoints(calculation.insurerBasisPoints)} />
                <TraceRow label="Potential plan payment" value={formatCents(calculation.potentialInsurerCents)} />
                <TraceRow label="Counts toward the yearly limit" value={yesNo(calculation.annualMaximumApplies)} />
                {calculation.annualMaximumApplies && (
                  <TraceRow label="Yearly limit left before this care" value={formatCents(calculation.maximumBeforeCents)} />
                )}
                <TraceRow label="Plan pays" value={formatCents(calculation.insurerCents)} strong />
              </dl>
              <dl className="divide-y">
                <TraceRow label="You pay" value={formatCents(calculation.patientCents)} strong />
                <TraceRow label="Your share of the plan's percentage (coinsurance)" value={formatCents(calculation.patientCoinsuranceCents)} indent />
                <TraceRow label="Deductible you pay" value={formatCents(calculation.deductibleAppliedCents)} indent />
                <TraceRow label="Above the yearly limit" value={formatCents(calculation.patientDueToMaximumCents)} indent />
              </dl>
              <p className="text-sm text-muted-foreground">
                This is care number {calculation.processingIndex + 1} in the financial processing order, not clinical priority. The yearly limit is
                used up in that order.
              </p>
              {calculation.ruleFieldPaths.length > 0 && (
                <section aria-labelledby="trace-sources">
                  <h3 id="trace-sources" className="text-sm font-semibold">
                    Details this calculation uses
                  </h3>
                  <ul className="mt-1">
                    {calculation.ruleFieldPaths.map((path) => (
                      <SourceItem key={path} fieldPath={path} />
                    ))}
                  </ul>
                </section>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
