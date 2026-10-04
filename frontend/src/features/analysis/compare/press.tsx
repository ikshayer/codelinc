"use client";

import { motion, type HTMLMotionProps } from "motion/react";

/** Wraps a button or link so it answers a press with a small, springy squeeze. */
export function Press({ className, ...props }: HTMLMotionProps<"div">) {
  return <motion.div whileTap={{ scale: 0.98 }} transition={{ type: "spring", stiffness: 500, damping: 30 }} className={className ?? "inline-flex"} {...props} />;
}
