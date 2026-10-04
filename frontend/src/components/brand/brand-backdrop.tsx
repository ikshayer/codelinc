"use client";

import { useReducedMotion } from "motion/react";
import dynamic from "next/dynamic";
import { useSyncExternalStore } from "react";

import { cn } from "@/lib/utils";

// WebGL is client-only; the CSS gradient underneath is the server render,
// the no-WebGL fallback and what shows before the shader's first frame.
const Grainient = dynamic(() => import("@/components/Grainient"), { ssr: false });

/** Lincoln burgundy rising into the 2024 brand's orange horizon (#FF4F17). */
const PALETTES = {
  hero: { color1: "#650030", color2: "#b3124a", color3: "#ff4f17" },
  band: { color1: "#e7a7bd", color2: "#ffc0a3", color3: "#f6dfe6" },
} as const;

function subscribeNothing() {
  return () => {};
}

function supportsWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

/**
 * Animated grainy gradient (React Bits Grainient) used as a living backdrop.
 * "hero" is the vivid landing field; "band" is a soft wash behind page headers.
 */
export function BrandBackdrop({ variant, className }: { variant: keyof typeof PALETTES; className?: string }) {
  const reduceMotion = useReducedMotion();
  const webgl = useSyncExternalStore(subscribeNothing, supportsWebGL, () => false);
  const palette = PALETTES[variant];

  return (
    <div
      aria-hidden
      className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}
      style={{ background: `linear-gradient(115deg, ${palette.color1}, ${palette.color2} 55%, ${palette.color3})` }}
    >
      {webgl && (
        <Grainient
          {...palette}
          // Reduced motion freezes the field on its first frame.
          timeSpeed={reduceMotion ? 0 : variant === "hero" ? 0.22 : 0.12}
          warpStrength={variant === "hero" ? 1.1 : 0.8}
          warpAmplitude={variant === "hero" ? 55 : 40}
          grainAmount={variant === "hero" ? 0.08 : 0.05}
          contrast={variant === "hero" ? 1.35 : 1.1}
          saturation={variant === "hero" ? 1.05 : 1}
          blendAngle={-18}
          zoom={0.85}
        />
      )}
    </div>
  );
}
