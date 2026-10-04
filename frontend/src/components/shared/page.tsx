import type { ReactNode } from "react";

import { BrandBackdrop } from "@/components/brand/brand-backdrop";
import { cn } from "@/lib/utils";

/**
 * Workspace frame: a soft animated brand wash behind the top of the page,
 * then content on the warm canvas. 1120 px for app pages, 768 px for forms.
 */
export function Page({ width = "wide", backdrop = true, className, children }: { width?: "wide" | "form"; backdrop?: boolean; className?: string; children: ReactNode }) {
  return (
    <div className="relative">
      {backdrop && <BrandBackdrop variant="band" className="h-80 opacity-70 mask-[linear-gradient(to_bottom,black_30%,transparent)] md:h-96" />}
      <div className={cn("relative mx-auto w-full px-5 pt-8 pb-16 md:px-8 md:pt-14 md:pb-24", width === "wide" ? "max-w-[1120px]" : "max-w-[880px]", className)}>{children}</div>
    </div>
  );
}

/**
 * Page heading, deliberately off-center: a large serif title on the left
 * two-thirds, the explanation set narrower beneath it, and the single task
 * action anchored to the right edge.
 */
export function PageHeader({ title, description, actions, className }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <div className={cn("mb-10 grid gap-5 md:mb-14 md:grid-cols-12 md:items-end", className)}>
      <div className="md:col-span-8">
        <h1 className="font-display text-[2rem] leading-[2.375rem] font-semibold tracking-tight text-balance text-foreground md:text-[2.75rem] md:leading-[3.125rem]">{title}</h1>
        {description && <p className="mt-3 max-w-[34rem] text-base text-pretty text-muted-foreground md:text-[17px] md:leading-7">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-3 md:col-span-4 md:justify-end">{actions}</div>}
    </div>
  );
}

export function SectionHeading({ id, children, description, className }: { id?: string; children: ReactNode; description?: ReactNode; className?: string }) {
  return (
    <div className={cn("mb-4", className)}>
      <h2 id={id} className="font-display text-xl font-semibold tracking-tight md:text-section">
        {children}
      </h2>
      {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
    </div>
  );
}
