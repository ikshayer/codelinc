import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatIsoDate } from "@/lib/domain/dates";
import { YEAR_LABELS } from "@/lib/domain/fields";
import { formatCents } from "@/lib/domain/money";
import type { CalculationRecord, ProcedureCalculation, ProcedureId } from "@/lib/domain/types";

interface RecordLedgerProps {
  title: string;
  record: CalculationRecord;
  procedureLabels: Record<ProcedureId, string>;
  onSelectProcedure: (record: CalculationRecord, calculation: ProcedureCalculation) => void;
}

const money = "text-right tabular";

/** Year-by-year ledger for one record. Every cell is a field of the record. */
export function RecordLedger({ title, record, procedureLabels, onSelectProcedure }: RecordLedgerProps) {
  return (
    <div>
      <h3 className="mb-2 text-base font-semibold">{title}</h3>
      <Table aria-label={`${title}: year-by-year amounts`}>
        <TableHeader>
          <TableRow>
            <TableHead scope="col">Year and care</TableHead>
            <TableHead scope="col" className={money}>
              Fee
            </TableHead>
            <TableHead scope="col" className={money}>
              Plan pays
            </TableHead>
            <TableHead scope="col" className={money}>
              You pay
            </TableHead>
            <TableHead scope="col" className={money}>
              Benefit left
            </TableHead>
            <TableHead scope="col" className={money}>
              Deductible applied
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {record.ledgers.flatMap((ledger) => [
            <TableRow key={ledger.benefitYearId} className="bg-muted/50 font-medium">
              <TableCell>{YEAR_LABELS[ledger.benefitYearId]}</TableCell>
              <TableCell className={money}>{formatCents(ledger.totalFeeCents)}</TableCell>
              <TableCell className={money}>{formatCents(ledger.totalInsurerCents)}</TableCell>
              <TableCell className={money}>{formatCents(ledger.totalPatientCents)}</TableCell>
              <TableCell className={money}>{formatCents(ledger.maximum.remainingCents)}</TableCell>
              <TableCell className={money}>{formatCents(ledger.deductible.appliedInScheduleCents)}</TableCell>
            </TableRow>,
            ...(ledger.procedures.length === 0
              ? [
                  <TableRow key={`${ledger.benefitYearId}-empty`}>
                    <TableCell colSpan={6} className="pl-6 text-muted-foreground">
                      No care scheduled in this year.
                    </TableCell>
                  </TableRow>,
                ]
              : ledger.procedures.map((calculation) => (
                  <TableRow key={`${ledger.benefitYearId}-${calculation.procedureId}`}>
                    <TableCell className="pl-6">
                      <Button
                        type="button"
                        variant="link"
                        className="h-auto min-h-11 flex-wrap justify-start gap-x-2 px-0 text-left whitespace-normal"
                        aria-haspopup="dialog"
                        onClick={() => onSelectProcedure(record, calculation)}
                      >
                        {procedureLabels[calculation.procedureId] ?? calculation.procedureId}
                        <span className="font-normal text-muted-foreground">{formatIsoDate(calculation.serviceDate)}</span>
                      </Button>
                    </TableCell>
                    <TableCell className={money}>{formatCents(calculation.feeCents)}</TableCell>
                    <TableCell className={money}>{formatCents(calculation.insurerCents)}</TableCell>
                    <TableCell className={money}>{formatCents(calculation.patientCents)}</TableCell>
                    <TableCell className={money}>
                      <span aria-hidden>—</span>
                      <span className="sr-only">Shown for the whole year</span>
                    </TableCell>
                    <TableCell className={money}>{formatCents(calculation.deductibleAppliedCents)}</TableCell>
                  </TableRow>
                ))),
          ])}
        </TableBody>
      </Table>
    </div>
  );
}
