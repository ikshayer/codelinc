"use client";

import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";

import { EASE_OUT } from "@/components/motion/reveal";

/**
 * Height-animated region for disclosure buttons (aria-expanded / aria-controls
 * are set by the caller). Unmounted when closed, so hidden content is never focusable.
 */
export function ExpandRegion({ id, open, children }: { id: string; open: boolean; children: ReactNode }) {
  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          id={id}
          key="region"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.35, ease: EASE_OUT }}
          className="-mx-1 -mb-1 overflow-hidden px-1 pb-1"
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
