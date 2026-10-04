import { AlertCircleIcon, AlertTriangleIcon } from "lucide-react";
import Link from "next/link";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { AdapterError, AdapterErrorCode } from "@/lib/adapters/types";
import type { ServiceMode } from "@/lib/domain/types";

// Needs-input and failure states (FRONTEND_DESIGN.md §7, §13): each says what
// happened and offers a way forward. Never a toast, never a dead end.

const TITLES: Partial<Record<AdapterErrorCode, string>> = {
  UNSUPPORTED_TYPE: "That isn't a PDF",
  ENCRYPTED: "This PDF is password-protected",
  UNREADABLE: "We couldn't read this report",
  TOO_LARGE: "This file is too large",
  TOO_MANY_PAGES: "This report has too many pages",
  INVALID: "We couldn't use this file",
  TIMEOUT: "Reading the report took too long",
  NETWORK: "Couldn't reach the report service",
  RATE_LIMITED: "Too many requests",
  UNAVAILABLE: "Report analysis isn't available",
  NOT_FOUND: "Report analysis isn't available",
  UNAUTHORIZED: "Your session has ended",
  FORBIDDEN: "You don't have access to report analysis",
  CONFLICT: "That result was for a different file",
};

/** Problems the person fixes by choosing a different file; the rest are about the service or connection. */
const FILE_PROBLEMS: ReadonlySet<AdapterErrorCode> = new Set(["UNSUPPORTED_TYPE", "ENCRYPTED", "UNREADABLE", "TOO_LARGE", "TOO_MANY_PAGES", "INVALID"]);

export function problemTitle(error: AdapterError): string {
  return TITLES[error.code] ?? "The report couldn't be analyzed";
}

interface ProblemPanelProps {
  error: AdapterError;
  analysisId: string;
  mode: ServiceMode;
  /** A file is still held, so Try again can resend it. */
  canRetry: boolean;
  onRetry: () => void;
  onReplace: () => void;
  onUseSampleReport: () => void;
  onUseSampleTreatment: () => void;
  loadingSample: boolean;
}

export function ProblemPanel({ error, analysisId, mode, canRetry, onRetry, onReplace, onUseSampleReport, onUseSampleTreatment, loadingSample }: ProblemPanelProps) {
  const fileProblem = FILE_PROBLEMS.has(error.code);
  const serviceDown = mode === "live" && (error.code === "UNAVAILABLE" || error.code === "NOT_FOUND");
  const Icon = fileProblem ? AlertTriangleIcon : AlertCircleIcon;

  return (
    <Alert variant={fileProblem ? "warning" : "destructive"} role="alert">
      <Icon aria-hidden />
      <AlertTitle className="font-medium">{problemTitle(error)}</AlertTitle>
      <AlertDescription className="space-y-3">
        <p>{error.message}</p>
        <div className="flex flex-wrap gap-2">
          {error.retryable && canRetry && (
            <Button variant="outline" size="sm" onClick={onRetry}>
              Try again
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={onReplace}>
            Replace file
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href={`/analysis/${analysisId}/intake?method=manual`}>Enter details manually</Link>
          </Button>
          <Button variant="outline" size="sm" onClick={onUseSampleReport} disabled={loadingSample}>
            Use sample report
          </Button>
          {serviceDown && (
            <Button variant="outline" size="sm" onClick={onUseSampleTreatment}>
              Use sample treatment
            </Button>
          )}
        </div>
      </AlertDescription>
    </Alert>
  );
}
