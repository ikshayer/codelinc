import { newAnalysisRecord, type AnalysisRecord } from "@/features/analysis/state";
import { applyProposals } from "@/lib/domain/draft";
import { carePaths } from "@/lib/domain/fields";
import type { IntakeEvidence, PatientProfile, ServiceMode } from "@/lib/domain/types";
import { SAMPLE_PROFILE, SAMPLE_TREATMENT_VALUES } from "./sample-treatment";

// Seeded session-memory data for demo mode. A refresh restores exactly this.
// Live mode starts empty: drafts are session-local and history is backend-owned.

export const SEEDED_DRAFT_ID = "an_seeded_crown_followup";

export function createSeedSession(mode: ServiceMode): { analyses: Record<string, AnalysisRecord>; profile: PatientProfile | null } {
  if (mode === "live") return { analyses: {}, profile: null };

  const createdAt = "2026-09-28T15:20:00.000Z";
  const record = newAnalysisRecord(SEEDED_DRAFT_ID, "Crown follow-up", { displayName: SAMPLE_PROFILE.displayName, fullName: SAMPLE_PROFILE.fullName }, createdAt);
  const evidence: IntakeEvidence = {
    id: "seed-sample-care",
    kind: "sample",
    sourceId: "Seeded demo draft",
    sourceLabel: "Sample treatment",
    receivedAt: createdAt,
  };
  // Care only: the plan section is intentionally left Missing so the draft needs review.
  const careProposals = (["p1", "p2", "p3", "p4"] as const).flatMap((id) =>
    [carePaths.label(id), carePaths.category(id), carePaths.fee(id)].map((fieldPath) => ({ fieldPath, value: SAMPLE_TREATMENT_VALUES[fieldPath], evidenceId: evidence.id })),
  );
  const draft = applyProposals(record.draft, careProposals, [evidence]);
  return {
    analyses: { [SEEDED_DRAFT_ID]: { ...record, method: "manual", draft, updatedAt: "2026-09-29T09:05:00.000Z" } },
    profile: SAMPLE_PROFILE,
  };
}
