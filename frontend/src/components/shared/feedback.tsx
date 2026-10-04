import { AlertCircleIcon, InfoIcon, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import type { AdapterError } from "@/lib/adapters/types";

/** An empty screen is an invitation to act: say what goes here and offer the next step. */
export function EmptyState({ icon: Icon, title, description, children }: { icon?: LucideIcon; title: string; description?: ReactNode; children?: ReactNode }) {
  return (
    <Empty className="rounded-lg border border-dashed px-6 py-12">
      <EmptyHeader>
        {Icon && (
          <EmptyMedia variant="icon">
            <Icon aria-hidden />
          </EmptyMedia>
        )}
        <EmptyTitle className="text-lg font-semibold">{title}</EmptyTitle>
        {description && <EmptyDescription className="text-base">{description}</EmptyDescription>}
      </EmptyHeader>
      {children && <EmptyContent className="flex-row flex-wrap justify-center gap-3">{children}</EmptyContent>}
    </Empty>
  );
}

/** Durable inline error: what happened, and how to recover. Never only a toast. */
export function ErrorPanel({
  title,
  error,
  onRetry,
  retryLabel = "Try again",
  children,
}: {
  title: string;
  error?: AdapterError | string;
  onRetry?: () => void;
  retryLabel?: string;
  children?: ReactNode;
}) {
  const message = typeof error === "string" ? error : error?.message;
  const retryable = typeof error === "string" || error === undefined || error.retryable;
  return (
    <Alert variant="destructive" role="alert">
      <AlertCircleIcon aria-hidden />
      <AlertTitle className="font-medium">{title}</AlertTitle>
      <AlertDescription className="space-y-3">
        {message && <p>{message}</p>}
        {(onRetry || children) && (
          <div className="flex flex-wrap gap-2">
            {onRetry && retryable && (
              <Button variant="outline" size="sm" onClick={onRetry}>
                {retryLabel}
              </Button>
            )}
            {children}
          </div>
        )}
      </AlertDescription>
    </Alert>
  );
}

/** Quiet notice for synthetic/simulated/session-only behavior. */
export function Notice({ title, children, tone = "info" }: { title?: string; children: ReactNode; tone?: "info" | "warning" }) {
  return (
    <Alert role={tone === "warning" ? "alert" : "note"} variant={tone === "warning" ? "warning" : "default"} className={tone === "info" ? "border-border bg-muted/60" : undefined}>
      <InfoIcon aria-hidden />
      {title && <AlertTitle className="font-medium">{title}</AlertTitle>}
      <AlertDescription className={tone === "info" ? "text-muted-foreground" : undefined}>{children}</AlertDescription>
    </Alert>
  );
}
