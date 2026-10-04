"use client";

import { motion, type HTMLMotionProps, type Variants } from "motion/react";

// Shared entrance choreography: one orchestrated rise-and-settle per page,
// staggered top to bottom. Reduced motion is honored by MotionProvider.

export const EASE_OUT = [0.22, 1, 0.36, 1] as const;

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 18, filter: "blur(6px)" },
  shown: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.55, ease: EASE_OUT } },
};

/** Container that reveals its <StaggerItem> children in sequence when it mounts. */
export function Stagger({ delay = 0, gap = 0.07, ...props }: HTMLMotionProps<"div"> & { delay?: number; gap?: number }) {
  return (
    <motion.div
      initial="hidden"
      animate="shown"
      variants={{ hidden: {}, shown: { transition: { staggerChildren: gap, delayChildren: delay } } }}
      {...props}
    />
  );
}

export function StaggerItem(props: HTMLMotionProps<"div">) {
  return <motion.div variants={itemVariants} {...props} />;
}

/** A single element that rises into place when it scrolls into view (once). */
export function Reveal({ delay = 0, y = 18, ...props }: HTMLMotionProps<"div"> & { delay?: number; y?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y, filter: "blur(6px)" }}
      whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.6, ease: EASE_OUT, delay }}
      {...props}
    />
  );
}
