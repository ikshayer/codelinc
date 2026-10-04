import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/** Centered workspace: 1120 px for app pages, 720 px for single-column forms. */
export function Page({ width = "wide", className, children }: { width?: "wide" | "form"; className?: string; children: ReactNode }) {
  return (
    <div className={cn("mx-auto w-full px-5 pt-8 pb-16 md:px-8 md:pt-12 md:pb-24", width === "wide" ? "max-w-[1120px]" : "max-w-[768px]", className)}>
      {children}
    </div>
  );
}

/** Page heading with a short explanation and at most one primary task action. */
export function PageHeader({ title, description, actions, className }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <div className={cn("mb-10 flex flex-col gap-5 md:mb-12 md:flex-row md:items-end md:justify-between", className)}>
      <div className="max-w-[40rem]">
        <h1 className="text-[1.75rem] leading-9 font-semibold tracking-tight text-balance md:text-title">{title}</h1>
        {description && <p className="mt-2 text-base text-pretty text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
    </div>
  );
}

export function SectionHeading({ id, children, description, className }: { id?: string; children: ReactNode; description?: ReactNode; className?: string }) {
  return (
    <div className={cn("mb-4", className)}>
      <h2 id={id} className="text-xl font-semibold tracking-tight md:text-section">
        {children}
      </h2>
      {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
    </div>
  );
}
