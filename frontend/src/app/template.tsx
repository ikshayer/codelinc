"use client";

import { motion } from "motion/react";

import { EASE_OUT } from "@/components/motion/reveal";

/** Route transition: each page settles in from slightly below. Re-mounts on every navigation. */
export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: EASE_OUT }}>
      {children}
    </motion.div>
  );
}
