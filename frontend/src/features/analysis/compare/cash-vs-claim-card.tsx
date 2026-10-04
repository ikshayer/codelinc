import { Notice } from "@/components/shared/feedback";
import { Badge } from "@/components/ui/badge";
import type { CashVsClaimRow } from "@/fixtures/cash-vs-claim";
import { formatIsoDate } from "@/lib/domain/dates";
import { formatCents } from "@/lib/domain/money";
import { cashVsClaimVerdict, type CashVsClaimVerdict } from "./explanations";

const VERDICT: Record<CashVsClaimVerdict, { label: string; variant: "success" | "secondary" | "warning" }> = {
  payCash: { label: "Pay cash", variant: "success" },
  fileClaim: { label: "File the claim", variant: "secondary" },
  confirmFirst: { label: "Confirm first", variant: "warning" },
};

function Total({ label, cents }: { label: string; cents: number | null }) {
  return (
    <div>
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-lg font-semibold tabular">{cents === null ? "Not known yet" : formatCents(cents)}</dd>
    </div>
  );
}

/** Cash vs claim for one visit, over the whole care plan. Every amount is a field of the row. */
export function CashVsClaimCard({ row }: { row: CashVsClaimRow }) {
  const verdict = VERDICT[cashVsClaimVerdict(row.winnerClaimRoute)];
  const headingId = `cash-vs-claim-${row.id}`;
  return (
    <section aria-labelledby={headingId} className="space-y-4 rounded-lg border p-5 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 id={headingId} className="text-base font-semibold">
            {row.procedureLabel} on {formatIsoDate(row.serviceDate)}
          </h3>
          <p className="text-sm text-muted-foreground">{row.scenarioLabel}</p>
        </div>
        <Badge variant={verdict.variant}>{verdict.label}</Badge>
      </div>
      <p className="text-base">{row.copy}</p>
      <dl className="grid gap-4 sm:grid-cols-3">
        <Total label="Projected plan total if you file a claim" cents={row.claimTotalCents} />
        <Total label="Projected plan total if you pay cash" cents={row.cashTotalCents} />
        {row.differenceCents !== null && <Total label="Projected difference" cents={row.differenceCents} />}
      </dl>
      {row.missing.length > 0 && (
        <div>
          <p className="text-sm font-medium">What we still need</p>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
            {row.missing.map((item) => (
              <li key={item.code}>{item.message}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/** Fixture preview of the backend's route comparison (contract 1.2.0); live wiring is deferred. */
export function CashVsClaimPreview({ rows }: { rows: CashVsClaimRow[] }) {
  return (
    <div className="space-y-4">
      <Notice title="Fixture preview">
        Cash vs claim examples from the backend&apos;s synthetic golden scenario. The calculation engine isn&apos;t connected, so these don&apos;t reflect your
        details.
      </Notice>
      {rows.map((row) => (
        <CashVsClaimCard key={row.id} row={row} />
      ))}
    </div>
  );
}
