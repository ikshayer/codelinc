"use client";

import Link from "next/link";
import { useMemo } from "react";

import { Button } from "@/components/ui/button";
import { SectionHeading } from "@/components/shared/page";
import { useAnalysisController } from "@/features/analysis/analysis-provider";
import type { IntakeDraft } from "@/lib/domain/draft";
import { fieldDefinitions } from "@/lib/domain/fields";
import type { DraftFact } from "@/lib/domain/types";

import { EditableFactRow } from "./editable-fact-row";
import { describeValues } from "./voice-extraction";

function voiceFacts(draft: IntakeDraft): DraftFact[] {
  return fieldDefinitions(draft.procedureIds)
    .map((definition) => draft.facts[definition.path])
    .filter((fact): fact is DraftFact => {
      if (!fact || fact.value === null || fact.value === "") return false;
      return fact.evidenceIds.some((id) => draft.evidence[id]?.kind === "voice");
    });
}

/** Values a conversation proposed, as they stand in the shared draft now. */
export function hasVoiceFacts(draft: IntakeDraft): boolean {
  return voiceFacts(draft).length > 0;
}

/** Editable summary shown after a conversation. Review details is the one primary action once it has ended. */
export function VoiceSummary({ analysisId, draft, ended }: { analysisId: string; draft: IntakeDraft; ended: boolean }) {
  const { editFact } = useAnalysisController();
  const facts = useMemo(() => voiceFacts(draft), [draft]);
  const labels = useMemo(
    () => new Map(describeValues(facts.map(({ fieldPath, value }) => ({ fieldPath, value })), draft.facts).map((item) => [item.fieldPath, item.label])),
    [facts, draft.facts],
  );
  const reviewHref = `/analysis/${analysisId}/confirm`;

  return (
    <section aria-labelledby="voice-summary-heading">
      <SectionHeading
        id="voice-summary-heading"
        description="These are proposed from the conversation. Correct anything that's wrong; you'll review every value before comparing."
      >
        {ended ? "What was gathered" : "Gathered from conversations"}
      </SectionHeading>
      {facts.length === 0 ? (
        <p className="text-muted-foreground">Nothing was gathered. Type your details, or enter them on the Confirm screen.</p>
      ) : (
        <div className="divide-y border-y">
          {facts.map((fact) => (
            <EditableFactRow
              key={fact.fieldPath}
              fact={fact}
              label={labels.get(fact.fieldPath) ?? fact.fieldPath}
              onEdit={(fieldPath, value) => editFact(analysisId, fieldPath, value)}
            />
          ))}
        </div>
      )}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Button asChild variant={ended ? "default" : "outline"}>
          <Link href={reviewHref}>Review details</Link>
        </Button>
        <p className="text-sm text-muted-foreground">Dentist timing and coverage are confirmed separately on the next screen.</p>
      </div>
    </section>
  );
}
