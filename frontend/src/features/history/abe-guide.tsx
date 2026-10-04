"use client";

import { motion } from "motion/react";

import { LincolnAbe } from "@/components/brand/lincoln-logo";
import { cn } from "@/lib/utils";

/** Lincoln's Abraham Lincoln mark as a friendly guide: it pops in with a small spring tilt. Never recolored. */
export function AbeGuide({ className, delay = 0.4 }: { className?: string; delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.4, rotate: -14 }}
      animate={{ opacity: 1, scale: 1, rotate: 0 }}
      transition={{ type: "spring", stiffness: 220, damping: 14, delay }}
      whileHover={{ rotate: 4, scale: 1.05 }}
      className="inline-flex shrink-0"
    >
      <LincolnAbe className={cn("h-16", className)} />
    </motion.div>
  );
}
