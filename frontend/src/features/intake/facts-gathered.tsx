"use client";

import { ChevronDownIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { SourceBadge } from "@/components/shared/source-badge";
import { StatusChip } from "@/components/shared/status-chip";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useAnalysis } from "@/features/analysis/analysis-provider";
import { displayFactValue, fieldContainerId } from "@/features/analysis/components/fact-field";
import { factDisplayStatus } from "@/lib/domain/draft";
import { carePaths, fieldDefinitions, type FieldGroup } from "@/lib/domain/fields";
import { cn } from "@/lib/utils";

const GROUP_TITLES: Record<FieldGroup, string> = { plan: "Your plan", care: "Your prescribed care", timing: "Timing your dentist approved" };

/** Completeness aid for the shared draft — a count of what's filled in, not an AI confidence score. */
export function FactsGathered({ analysisId }: { analysisId: string }) {
  const analysis = useAnalysis(analysisId);
  const [open, setOpen] = useState(false);
  if (!analysis) return null;

  const { draft } = analysis;
  const procedureLabel = (id: string) => {
    const value = draft.facts[carePaths.label(id)]?.value;
    return typeof value === "string" && value ? value : "Unnamed procedure";
  };
  const fields = fieldDefinitions(draft.procedureIds).filter((field) => field.required || draft.facts[field.path]);
  const groups = (["plan", "care", "timing"] as const).map((group) => {
    const rows = fields.filter((f) => f.group === group).map((field) => ({ field, fact: draft.facts[field.path], status: factDisplayStatus(draft.facts[field.path]) }));
    return {
      group,
      rows,
      gathered: rows.filter((r) => r.status !== "missing").length,
      missing: rows.filter((r) => r.status === "missing").length,
      conflict: rows.filter((r) => r.status === "conflict").length,
    };
  });
  const total = groups.reduce((n, g) => n + g.rows.length, 0);
  const gathered = groups.reduce((n, g) => n + g.gathered, 0);
  const conflicts = groups.reduce((n, g) => n + g.conflict, 0);

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="rounded-lg border">
      <CollapsibleTrigger className="flex min-h-14 w-full items-center justify-between gap-4 rounded-lg px-5 py-4 text-left hover:bg-muted/50 md:px-6">
        <span>
          <span className="block text-lg font-semibold">Facts gathered</span>
          <span className="block text-sm text-muted-foreground">
            {gathered} of {total} details added{conflicts > 0 ? `, ${conflicts} conflicts to review` : ""}.
          </span>
        </span>
        <ChevronDownIcon aria-hidden className={cn("size-5 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <Accordion type="multiple" className="border-t px-5 md:px-6">
          {groups.map(({ group, rows, gathered: groupGathered, missing, conflict }) => (
            <AccordionItem key={group} value={group}>
              <AccordionTrigger className="min-h-12 text-base">
                <span className="flex flex-wrap items-baseline gap-x-3">
                  <span className="font-medium">{GROUP_TITLES[group]}</span>
                  <span className="text-sm font-normal text-muted-foreground">
                    {groupGathered} filled in{missing > 0 ? `, ${missing} missing` : ""}
                    {conflict > 0 ? `, ${conflict} conflict${conflict === 1 ? "" : "s"}` : ""}
                  </span>
                </span>
              </AccordionTrigger>
              <AccordionContent>
                {rows.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nothing here yet.</p>
                ) : (
                  <ul className="divide-y">
                    {rows.map(({ field, fact, status }) => (
                      <li key={field.path} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                        <span className="min-w-0">
                          <span className="block text-sm">
                            {field.procedureId && <span className="text-muted-foreground">{procedureLabel(field.procedureId)}: </span>}
                            {field.label}
                          </span>
                          <span className="tabular block font-medium">{fact && fact.status !== "conflict" ? displayFactValue(field.path, fact.value, procedureLabel) : status === "conflict" ? "Two sources disagree" : "Not provided"}</span>
                        </span>
                        <span className="flex shrink-0 items-center gap-3">
                          {fact && <SourceBadge kind={fact.origin} evidence={draft.evidence[fact.evidenceIds[0]]} />}
                          <StatusChip status={status} />
                          <Link href={`/analysis/${analysisId}/confirm#${fieldContainerId(field.path)}`} className="text-sm text-primary underline-offset-4 hover:underline">
                            {status === "missing" ? "Add" : "Review"}
                            <span className="sr-only"> {field.label}</span>
                          </Link>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </CollapsibleContent>
    </Collapsible>
  );
}
