"use client";

import { motion } from "motion/react";
import { CircleDotIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { EASE_OUT } from "@/components/motion/reveal";
import { cn } from "@/lib/utils";

import type { DescribedValue } from "./voice-extraction";

/** One batch of values the conversation proposed, as compact chips. Nothing here is confirmed. */
export function ProposalBatchCard({ sourceLabel, quote, values }: { sourceLabel: string; quote: string | null; values: DescribedValue[] }) {
  return (
    <motion.article
      layout="position"
      initial={{ opacity: 0, y: 16, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.4, ease: EASE_OUT }}
      className="rounded-xl border bg-background/60 px-3 py-2.5"
      aria-label={`Proposed details from ${sourceLabel}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">{sourceLabel}</p>
        <Badge variant="outline" className="h-6 rounded-md px-2">
          <CircleDotIcon aria-hidden />
          Proposed — review before comparing
        </Badge>
      </div>
      {quote && <p className="mt-1 text-sm text-muted-foreground">You said: “{quote}”</p>}
      <motion.dl
        initial="hidden"
        animate="shown"
        variants={{ hidden: {}, shown: { transition: { staggerChildren: 0.06, delayChildren: 0.15 } } }}
        className="mt-2 flex flex-wrap gap-1.5 text-sm"
      >
        {values.map((item) => (
          <motion.div
            key={item.fieldPath}
            variants={{ hidden: { opacity: 0, x: 12 }, shown: { opacity: 1, x: 0, transition: { duration: 0.35, ease: EASE_OUT } } }}
            className="flex max-w-full items-baseline gap-1.5 rounded-full bg-accent px-3 py-1 text-accent-foreground"
          >
            <dt className="text-accent-foreground/70">{item.label}</dt>
            <dd className={cn("min-w-0 font-medium break-words", item.isMoney && "tabular")}>{item.value}</dd>
          </motion.div>
        ))}
      </motion.dl>
    </motion.article>
  );
}
