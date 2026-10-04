import { CircleDotIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import type { DescribedValue } from "./voice-extraction";

/** One batch of values the conversation proposed. Nothing here is confirmed. */
export function ProposalBatchCard({ sourceLabel, quote, values }: { sourceLabel: string; quote: string | null; values: DescribedValue[] }) {
  return (
    <article className="rounded-md border px-4 py-3" aria-label={`Proposed details from ${sourceLabel}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">{sourceLabel}</p>
        <Badge variant="outline" className="h-6 rounded-md px-2">
          <CircleDotIcon aria-hidden />
          Proposed — review before comparing
        </Badge>
      </div>
      {quote && <p className="mt-1 text-sm text-muted-foreground">You said: “{quote}”</p>}
      <dl className="mt-3 grid gap-x-8 gap-y-1.5 text-sm sm:grid-cols-2">
        {values.map((item) => (
          <div key={item.fieldPath} className="flex items-baseline justify-between gap-3">
            <dt className="text-muted-foreground">{item.label}</dt>
            <dd className={cn("text-right font-medium", item.isMoney && "tabular")}>{item.value}</dd>
          </div>
        ))}
      </dl>
    </article>
  );
}
