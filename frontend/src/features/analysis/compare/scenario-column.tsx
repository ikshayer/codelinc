import { formatCents } from "@/lib/domain/money";
import { YEAR_LABELS } from "@/lib/domain/fields";
import type { CalculationRecord } from "@/lib/domain/types";
import { cn } from "@/lib/utils";

interface ScenarioColumnProps {
  headingId: string;
  title: string;
  description: string;
  record: CalculationRecord;
  emphasized?: boolean;
}

/** One side of the hero comparison. Every amount is a field of the record. */
export function ScenarioColumn({ headingId, title, description, record, emphasized = false }: ScenarioColumnProps) {
  const [current, next] = record.ledgers;
  return (
    <section aria-labelledby={headingId} className={cn("px-5 py-6 md:px-8 md:py-8", emphasized && "bg-accent/50")}>
      <h2 id={headingId} className="text-lg font-semibold tracking-tight">
        {title}
      </h2>
      <p className="text-sm text-muted-foreground">{description}</p>
      <dl className="mt-6 space-y-5">
        <div>
          <dt className="text-sm text-muted-foreground">You pay (estimated total)</dt>
          <dd className={cn("text-[2.5rem] leading-[3rem] font-semibold tabular", emphasized && "text-primary")}>{formatCents(record.totalPatientCents)}</dd>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">Plan pays (estimated total)</dt>
          <dd className="text-2xl font-semibold tabular">{formatCents(record.totalInsurerCents)}</dd>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">Benefit left</dt>
          <dd>
            <ul className="mt-1 divide-y border-y">
              <li className="flex items-baseline justify-between gap-4 py-2">
                <span className="text-sm">{YEAR_LABELS.y1}</span>
                <span className="text-lg font-semibold tabular">{formatCents(current.maximum.remainingCents)}</span>
              </li>
              <li className="flex items-baseline justify-between gap-4 py-2">
                <span className="text-sm">{YEAR_LABELS.y2}</span>
                <span className="text-lg font-semibold tabular">{formatCents(next.maximum.remainingCents)}</span>
              </li>
            </ul>
          </dd>
        </div>
      </dl>
    </section>
  );
}
