import { applyProposals, editFact, emptyDraft, evidenceKindsOf, type IntakeDraft } from "@/lib/domain/draft";
import { planPaths, timingPaths } from "@/lib/domain/fields";
import { buildConfirmedScenario } from "@/lib/domain/scenario";
import type { AnalysisSnapshot, FieldValue, IntakeEvidence } from "@/lib/domain/types";
import { FIXTURE_LABELS, fixtureComparison, type FixtureScenarioName } from "./calculation-fixtures";
import { SAMPLE_PROFILE, SAMPLE_TREATMENT_VALUES } from "./sample-treatment";

// Synthetic saved analyses that seed demo history. Each is built the same way a
// real one is: facts go through the draft, the confirmed scenario is built from
// them, and the comparison is a named fixture preview (never an engine result).

interface SeedSpec {
  id: string;
  analysisId: string;
  title: string;
  fixture: FixtureScenarioName;
  createdAt: string;
  confirmedAt: string;
  savedAt: string;
  evidence: IntakeEvidence[];
  /** Which evidence each field path came from. */
  evidenceFor: (fieldPath: string) => string;
  /** Values a person typed over the sample, e.g. a different deadline. */
  edits: Record<string, FieldValue>;
}

function seededDraft(spec: SeedSpec): IntakeDraft {
  const proposals = Object.entries(SAMPLE_TREATMENT_VALUES).map(([fieldPath, value]) => ({
    fieldPath,
    value,
    evidenceId: spec.evidenceFor(fieldPath),
  }));
  let draft = applyProposals(emptyDraft(), proposals, spec.evidence);
  for (const [fieldPath, value] of Object.entries(spec.edits)) draft = editFact(draft, fieldPath, value);
  return draft;
}

function seededSnapshot(spec: SeedSpec): AnalysisSnapshot {
  const draft = seededDraft(spec);
  const built = buildConfirmedScenario(draft);
  if (!built.ok) throw new Error(`Seed snapshot ${spec.id} is invalid: ${built.issues.map((i) => i.message).join(" ")}`);
  const comparison = fixtureComparison(spec.fixture, built.scenario.revision);
  return {
    id: spec.id,
    analysisId: spec.analysisId,
    version: 1,
    title: spec.title,
    patientDisplayName: SAMPLE_PROFILE.displayName,
    createdAt: spec.createdAt,
    confirmedAt: spec.confirmedAt,
    savedAt: spec.savedAt,
    engineVersion: comparison.baseline.engineVersion,
    sourceMode: "fixturePreview",
    fixtureName: FIXTURE_LABELS[spec.fixture],
    scenario: built.scenario,
    comparison,
    evidence: Object.values(draft.evidence),
    inputKinds: evidenceKindsOf(draft),
    procedureLabels: Object.fromEntries(built.scenario.procedures.map((p) => [p.id, p.label])),
  };
}

const sampleEvidence: IntakeEvidence = {
  id: "seed-ev-sample",
  kind: "sample",
  sourceId: "Canonical sample treatment",
  sourceLabel: "Sample treatment",
  receivedAt: "2026-08-12T16:02:00.000Z",
};

const reportEvidence = (page: number): IntakeEvidence => ({
  id: `seed-ev-report-p${page}`,
  kind: "pdf",
  sourceId: "rpt_seed_sample_report",
  sourceLabel: "sample-dentist-report.pdf",
  pageNumber: page,
  receivedAt: "2026-07-20T13:40:00.000Z",
});

const voiceEvidence: IntakeEvidence = {
  id: "seed-ev-voice",
  kind: "voice",
  sourceId: "vs_seed_conversation",
  sourceLabel: "Voice conversation",
  turnId: "turn-3",
  receivedAt: "2026-06-03T18:10:00.000Z",
};

export function createSeedSnapshots(): AnalysisSnapshot[] {
  return [
    seededSnapshot({
      id: "snap_seed_canonical",
      analysisId: "an_seed_canonical",
      title: "Crown timing comparison",
      fixture: "canonical",
      createdAt: "2026-08-12T16:00:00.000Z",
      confirmedAt: "2026-08-12T16:20:00.000Z",
      savedAt: "2026-08-12T16:21:00.000Z",
      evidence: [sampleEvidence],
      evidenceFor: () => sampleEvidence.id,
      edits: {},
    }),
    seededSnapshot({
      id: "snap_seed_deadline",
      analysisId: "an_seed_deadline",
      title: "Crown with a year-end deadline",
      fixture: "deadline",
      createdAt: "2026-07-20T13:30:00.000Z",
      confirmedAt: "2026-07-20T14:05:00.000Z",
      savedAt: "2026-07-20T14:06:00.000Z",
      evidence: [reportEvidence(1), reportEvidence(2)],
      evidenceFor: (path) => (path.startsWith("plan.") ? "seed-ev-report-p2" : "seed-ev-report-p1"),
      edits: { [timingPaths.deadline("p4")]: "2026-12-31" },
    }),
    seededSnapshot({
      id: "snap_seed_full_allowance",
      analysisId: "an_seed_full_allowance",
      title: "Fresh yearly maximum",
      fixture: "fullCurrentAllowance",
      createdAt: "2026-06-03T18:00:00.000Z",
      confirmedAt: "2026-06-03T18:30:00.000Z",
      savedAt: "2026-06-03T18:31:00.000Z",
      evidence: [voiceEvidence],
      evidenceFor: () => voiceEvidence.id,
      edits: { [planPaths.alreadyUsed("y1")]: "0" },
    }),
  ];
}
