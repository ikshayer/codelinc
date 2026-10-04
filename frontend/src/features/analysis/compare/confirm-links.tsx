"use client";

import { createContext, useContext, type ReactNode } from "react";

import { fieldContainerId } from "@/features/analysis/components/fact-field";

// The Compare body is shared with read-only History snapshots, whose facts
// can't be edited. Only the live Compare screen provides an analysis ID, so
// only it links calculation sources back to the Confirm field.
const ConfirmLinkContext = createContext<string | null>(null);

export function ConfirmLinkProvider({ analysisId, children }: { analysisId: string; children: ReactNode }) {
  return <ConfirmLinkContext.Provider value={analysisId}>{children}</ConfirmLinkContext.Provider>;
}

/** Link to the Confirm field for a rule or fact path, or null when the view is historical. */
export function useConfirmFieldHref(fieldPath: string): string | null {
  const analysisId = useContext(ConfirmLinkContext);
  return analysisId ? `/analysis/${analysisId}/confirm#${fieldContainerId(fieldPath)}` : null;
}
