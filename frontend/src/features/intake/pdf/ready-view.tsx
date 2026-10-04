"use client";

import { CheckCircle2Icon } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Notice } from "@/components/shared/feedback";
import type { IntakeExtraction } from "@/lib/adapters/types";
import type { IntakeEvidence } from "@/lib/domain/types";
import { EvidenceSheet } from "./evidence-sheet";
import { summarizeReport, type PageGroup } from "./report-summary";

// Ready: what the report proposed, grouped by page, with the evidence behind
// each group. Everything here is a proposal; confirming happens in review.

interface ReadyViewProps {
  analysisId: string;
  proposals: IntakeExtraction["proposals"];
  evidence: IntakeExtraction["evidence"];
  /** What the report didn't include and what it only quoted. Absent when reopening a saved draft. */
  details: Pick<IntakeExtraction, "missingFieldPaths" | "reviewNotes"> | null;
  /** The report didn't supply any plan values (derived when `details` is absent). */
  planLimitsMissing: boolean;
  /** Facts from this report aren't in the draft until the person answers "Is this your report?". */
  awaitingIdentityCheck: boolean;
}

function pageTitle(group: PageGroup): string {
  return group.pageNumber === null ? "Page not identified" : `Page ${group.pageNumber}`;
}

export function ReadyView({ analysisId, proposals, evidence, details, planLimitsMissing, awaitingIdentityCheck }: ReadyViewProps) {
  const [evidenceGroup, setEvidenceGroup] = useState<PageGroup | null>(null);
  const summary = useMemo(() => summarizeReport(proposals, evidence), [proposals, evidence]);
  const evidenceById = useMemo(() => new Map<string, IntakeEvidence>(evidence.map((item) => [item.id, item])), [evidence]);
  const otherMissing = details?.missingFieldPaths.some((path) => !path.startsWith("plan.")) ?? false;

  if (summary.groups.length === 0) {
    return (
      <Notice tone="warning" title="We didn't find procedures or fees in this report">
        Replace the file or enter the details yourself.
      </Notice>
    );
  }

  return (
    <div className="space-y-6">
      <p role="status" className="flex items-start gap-2 font-medium">
        <CheckCircle2Icon aria-hidden className="mt-0.5 size-5 shrink-0 text-success-foreground" />
        <span>
          Report read.
          {summary.procedureCount > 0 && ` We found ${summary.procedureCount} ${summary.procedureCount === 1 ? "procedure" : "procedures"}.`}
        </span>
      </p>

      {awaitingIdentityCheck && (
        <Notice tone="warning" title="Waiting for your answer">
          Nothing from this report is added until you confirm it&apos;s yours.
        </Notice>
      )}

      <div className="divide-y">
        {summary.groups.map((group) => (
          <section key={group.pageNumber ?? "unknown"} aria-label={pageTitle(group)} className="space-y-4 py-5 first:pt-0">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-lg font-semibold">{pageTitle(group)}</h3>
              <Button variant="outline" size="sm" onClick={() => setEvidenceGroup(group)}>
                View evidence
              </Button>
            </div>
            <ul className="space-y-4">
              {group.rows.map((row) => (
                <li key={row.key}>
                  <p className="font-medium">{row.heading}</p>
                  {row.items.length > 0 && (
                    <dl className="mt-1 space-y-1 text-sm">
                      {row.items.map((item) => (
                        <div key={item.fieldPath} className="flex flex-wrap items-baseline justify-between gap-x-4">
                          <dt className="text-muted-foreground">{item.label}</dt>
                          <dd className="tabular text-right">{item.value}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      {(planLimitsMissing || otherMissing) && (
        <Notice title="Not in this report">
          {planLimitsMissing && "Plan limits and usage weren't in this report — add them in review."}
          {planLimitsMissing && otherMissing && " "}
          {otherMissing && "Some other details weren't in it either; they show as missing in review."}
        </Notice>
      )}

      {details && details.reviewNotes.length > 0 && (
        <section className="space-y-3" aria-labelledby={`${analysisId}-review-notes`}>
          <h3 id={`${analysisId}-review-notes`} className="font-medium">
            For your review
          </h3>
          <p className="text-sm text-muted-foreground">Quoted from the report. This can&apos;t set dentist timing on its own; you&apos;ll confirm it in review.</p>
          <ul className="space-y-3">
            {details.reviewNotes.map((note) => {
              const page = evidenceById.get(note.evidenceId)?.pageNumber;
              return (
                <li key={`${note.evidenceId}:${note.message}`}>
                  <blockquote className="border-l-2 pl-3 break-words">
                    <q>{note.message}</q>
                  </blockquote>
                  {page && <p className="mt-1 pl-3 text-sm text-muted-foreground">Page {page}</p>}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <EvidenceSheet
        analysisId={analysisId}
        evidenceIds={evidenceGroup?.evidenceIds ?? []}
        open={evidenceGroup !== null}
        onOpenChange={(open) => !open && setEvidenceGroup(null)}
        title={evidenceGroup ? `Evidence from ${pageTitle(evidenceGroup).toLowerCase()}` : "Evidence"}
      />
    </div>
  );
}

export function ReviewFactsButton({ analysisId, disabled }: { analysisId: string; disabled?: boolean }) {
  if (disabled) return <Button disabled>Review extracted facts</Button>;
  return (
    <Button asChild>
      <Link href={`/analysis/${analysisId}/confirm`}>Review extracted facts</Link>
    </Button>
  );
}
