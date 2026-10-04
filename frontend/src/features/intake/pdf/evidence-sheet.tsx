"use client";

import { FileTextIcon } from "lucide-react";
import { useMemo, useSyncExternalStore } from "react";

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useAnalysis } from "@/features/analysis/analysis-provider";
import type { FieldValue, IntakeEvidence } from "@/lib/domain/types";
import { describeField, formatProposedValue, procedureLabelsOf, type ProcedureLabels } from "./fact-display";

// Evidence drawer (FRONTEND_DESIGN.md §7): file, page, quoted text and the
// proposed value(s) that cite it. Right side on desktop, bottom on phones.

const PHONE_QUERY = "(max-width: 767px)";

function subscribePhone(onChange: () => void): () => void {
  const query = window.matchMedia(PHONE_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function useIsPhone(): boolean {
  return useSyncExternalStore(
    subscribePhone,
    () => window.matchMedia(PHONE_QUERY).matches,
    () => false,
  );
}

interface ProposedValue {
  fieldPath: string;
  value: FieldValue;
  /** A person changed the value after it was proposed. */
  edited: boolean;
}

interface EvidenceSheetProps {
  analysisId: string;
  evidenceIds: readonly string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
}

function sourceLine(evidence: IntakeEvidence): string {
  if (evidence.kind === "pdf" && evidence.pageNumber) return `${evidence.sourceLabel}, page ${evidence.pageNumber}`;
  if (evidence.kind === "voice") return `${evidence.sourceLabel}, voice conversation`;
  return evidence.sourceLabel;
}

export function EvidenceSheet({ analysisId, evidenceIds, open, onOpenChange, title }: EvidenceSheetProps) {
  const analysis = useAnalysis(analysisId);
  const isPhone = useIsPhone();
  // An extraction waiting on "Is this your report?" isn't in the draft yet but can still be inspected.
  const pending = analysis?.identityCheck?.extraction;

  const entries = useMemo(() => {
    if (!analysis) return { items: [], labels: {} as ProcedureLabels };
    const facts = Object.values(analysis.draft.facts);
    const labels = procedureLabelsOf([
      ...facts.map((fact) => ({ fieldPath: fact.fieldPath, value: fact.value })),
      ...(pending?.proposals ?? []),
    ]);
    const items = evidenceIds.flatMap((id) => {
      const evidence = analysis.draft.evidence[id] ?? pending?.evidence.find((item) => item.id === id);
      if (!evidence) return [];
      const values = new Map<string, ProposedValue>();
      for (const fact of facts) {
        if (!fact.evidenceIds.includes(id)) continue;
        const candidate = fact.candidates.find((c) => c.evidenceIds.includes(id));
        values.set(fact.fieldPath, {
          fieldPath: fact.fieldPath,
          value: candidate ? candidate.value : fact.value,
          edited: fact.userEdited && !candidate,
        });
      }
      for (const proposal of pending?.proposals ?? []) {
        if (proposal.evidenceId === id && !values.has(proposal.fieldPath)) {
          values.set(proposal.fieldPath, { fieldPath: proposal.fieldPath, value: proposal.value, edited: false });
        }
      }
      return [{ evidence, values: [...values.values()] }];
    });
    return { items, labels };
  }, [analysis, evidenceIds, pending]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side={isPhone ? "bottom" : "right"} className="data-[side=bottom]:max-h-[85dvh] sm:data-[side=right]:max-w-md">
        <SheetHeader className="px-5 pt-5 pr-14">
          <SheetTitle className="text-lg">{title}</SheetTitle>
          <SheetDescription>What the report says, and the value we proposed from it. Nothing is confirmed until you review it.</SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-6">
          {entries.items.length === 0 ? (
            <p className="py-4 text-muted-foreground">No evidence is available for this item.</p>
          ) : (
            <ul className="divide-y">
              {entries.items.map(({ evidence, values }) => (
                <li key={evidence.id} className="space-y-3 py-4 first:pt-0">
                  <p className="flex items-center gap-2 text-sm text-muted-foreground">
                    <FileTextIcon aria-hidden className="size-4 shrink-0" />
                    <span className="min-w-0 break-words">{sourceLine(evidence)}</span>
                  </p>
                  {evidence.literalQuote && (
                    <blockquote className="border-l-2 pl-3 break-words">
                      <q>{evidence.literalQuote}</q>
                    </blockquote>
                  )}
                  {values.length > 0 && (
                    <dl className="space-y-1 text-sm">
                      {values.map((value) => (
                        <div key={value.fieldPath} className="flex flex-wrap items-baseline justify-between gap-x-4">
                          <dt className="text-muted-foreground">{describeField(value.fieldPath, entries.labels)}</dt>
                          <dd className="tabular font-medium">
                            {formatProposedValue(value.fieldPath, value.value, entries.labels)}
                            {value.edited && <span className="ml-2 font-normal text-muted-foreground">(you changed this)</span>}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
