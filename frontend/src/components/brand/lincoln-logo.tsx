import { cn } from "@/lib/utils";

// Official Lincoln Financial artwork from lincolnfinancial.com's 2024 brand
// (pbl-static/image/desktop/New-Brand---logo-color---image.svg), served from
// /public/brand. Don't recolor or redraw it.

/** Full Lincoln Financial logo: the Abraham Lincoln mark with the wordmark. */
export function LincolnLogo({ className }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- static SVG brand mark; no optimization needed
    <img src="/brand/lincoln-financial-logo-2024.svg" alt="Lincoln Financial" width={576} height={198} className={cn("h-8 w-auto", className)} />
  );
}

/** The Abraham Lincoln mark on its orange horizon — Lincoln's brand character, used as CareWindow's guide. */
export function LincolnAbe({ className, decorative = true }: { className?: string; decorative?: boolean }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- static SVG brand mark; no optimization needed
    <img src="/brand/lincoln-abe-mark.svg" alt={decorative ? "" : "Abraham Lincoln, the Lincoln Financial mark"} width={173} height={198} className={cn("h-12 w-auto", className)} />
  );
}
