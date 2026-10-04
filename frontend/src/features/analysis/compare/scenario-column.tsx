"use client";

import { motion } from "motion/react";
import type { ReactNode } from "react";

import { EASE_OUT } from "@/components/motion/reveal";
import { formatCents } from "@/lib/domain/money";
import { YEAR_LABELS } from "@/lib/domain/fields";
import type { CalculationRecord } from "@/lib/domain/types";
import { cn } from "@/lib/utils";

interface ScenarioColumnProps {
  headingId: string;
  title: string;
  description: string;
  record: CalculationRecord;
  /** "primary" is the dominant, raised panel; "quiet" is the reference column. */
  tone: "primary" | "quiet";
  /** Seconds before this column's amounts rise into view. */
  delay?: number;
  className?: string;
}

/** A money value that blur-rises into place when the result arrives. The final value is shown, never counted up. */
function Money({ children, delay, className }: { children: ReactNode; delay: number; className: string }) {
  return (
    <motion.dd
      initial={{ opacity: 0, y: 12, filter: "blur(8px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{ duration: 0.6, ease: EASE_OUT, delay }}
      className={className}
    >
      {children}
    </motion.dd>
  );
}

/** One side of the hero comparison. Every amount is a field of the record. */
export function ScenarioColumn({ headingId, title, description, record, tone, delay = 0, className }: ScenarioColumnProps) {
  const [current, next] = record.ledgers;
  const primary = tone === "primary";
  return (
    <motion.section
      layout
      aria-labelledby={headingId}
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: 48, scale: 0.96 }}
      transition={{ duration: 0.55, ease: EASE_OUT, delay: delay - 0.1 }}
      className={cn(
        className,
        "relative min-w-0 rounded-2xl border px-5 py-6 md:px-7 md:py-8",
        primary
          ? "border-primary/20 bg-card shadow-[0_1px_2px_rgba(35,31,32,0.04),0_18px_40px_-16px_rgba(101,0,48,0.28)] before:absolute before:inset-y-5 before:left-0 before:w-1 before:rounded-r-full before:bg-brand md:-mt-3 md:pb-10"
          : "bg-card/60",
      )}
    >
      <h2 id={headingId} className={cn("font-display font-semibold tracking-tight text-balance", primary ? "text-xl md:text-2xl" : "text-lg text-muted-foreground")}>
        {title}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      <dl className={cn("mt-6", primary ? "space-y-6" : "space-y-4")}>
        <div>
          <dt className="text-sm text-muted-foreground">You pay (estimated total)</dt>
          <Money delay={delay} className={cn("font-semibold tabular", primary ? "text-[2.75rem] leading-[3.25rem] text-primary md:text-[3.5rem] md:leading-[4rem]" : "text-3xl leading-10")}>
            {formatCents(record.totalPatientCents)}
          </Money>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">Plan pays (estimated total)</dt>
          <Money delay={delay + 0.08} className={cn("font-semibold tabular", primary ? "text-2xl" : "text-xl")}>
            {formatCents(record.totalInsurerCents)}
          </Money>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">Benefit left</dt>
          <dd>
            <ul className="mt-1 divide-y border-y">
              {[
                { label: YEAR_LABELS.y1, cents: current.maximum.remainingCents },
                { label: YEAR_LABELS.y2, cents: next.maximum.remainingCents },
              ].map((row, index) => (
                <li key={row.label} className="flex items-baseline justify-between gap-4 py-2">
                  <span className="text-sm">{row.label}</span>
                  <motion.span
                    initial={{ opacity: 0, y: 8, filter: "blur(6px)" }}
                    animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                    transition={{ duration: 0.5, ease: EASE_OUT, delay: delay + 0.16 + index * 0.06 }}
                    className={cn("font-semibold tabular", primary ? "text-lg" : "text-base")}
                  >
                    {formatCents(row.cents)}
                  </motion.span>
                </li>
              ))}
            </ul>
          </dd>
        </div>
      </dl>
    </motion.section>
  );
}
