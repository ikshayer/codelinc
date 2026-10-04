import { SAMPLE_TREATMENT_VALUES } from "@/fixtures/sample-treatment";
import { applyProposals, editFact, emptyDraft, type IntakeDraft } from "@/lib/domain/draft";
import { buildConfirmedScenario } from "@/lib/domain/scenario";
import type { ConfirmedScenario, EvidenceKind, FieldValue, IntakeEvidence, IntakeProposal } from "@/lib/domain/types";

export function evidence(id: string, sourceId: string, kind: EvidenceKind = "pdf"): IntakeEvidence {
  return { id, kind, sourceId, sourceLabel: sourceId, receivedAt: "2026-10-03T00:00:00Z" };
}

export function proposal(fieldPath: string, value: FieldValue, evidenceId: string): IntakeProposal {
  return { fieldPath, value, evidenceId };
}

/** Sample values entered as if a person typed each one (origin "manual"). */
export function typedSampleDraft(overrides: Record<string, FieldValue> = {}): IntakeDraft {
  let draft = emptyDraft();
  for (const [path, value] of Object.entries({ ...SAMPLE_TREATMENT_VALUES, ...overrides })) draft = editFact(draft, path, value);
  return draft;
}

/** Sample values proposed by a single evidence of the given kind. */
export function proposedSampleDraft(kind: EvidenceKind): IntakeDraft {
  const ev = evidence(`${kind}-ev`, `${kind}-src`, kind);
  const proposals = Object.entries(SAMPLE_TREATMENT_VALUES).map(([path, value]) => proposal(path, value, ev.id));
  return applyProposals(emptyDraft(), proposals, [ev]);
}

export function buildOk(draft: IntakeDraft): ConfirmedScenario {
  const built = buildConfirmedScenario(draft);
  if (!built.ok) throw new Error(`Expected a valid scenario, got: ${built.issues.map((i) => `${i.fieldPath}:${i.code}`).join(", ")}`);
  return built.scenario;
}
