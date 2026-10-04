import { carePaths, planPaths, timingPaths } from "@/lib/domain/fields";
import type { FieldValue, IntakeEvidence, IntakeProposal, PatientProfile } from "@/lib/domain/types";

// Synthetic data only. The canonical CareWindow fixture from
// CAREWINDOW_ARCHITECTURE.md §12, expressed as draft values a person reviews.

export const SAMPLE_FIXTURE_NAME = "Canonical sample treatment";

export const SAMPLE_PROFILE: PatientProfile = {
  id: "demo-patient",
  displayName: "Sam Rivera",
  fullName: "Samira Rivera",
  dateOfBirth: "1988-04-12",
};

export const SAMPLE_TREATMENT_VALUES: Readonly<Record<string, FieldValue>> = {
  [planPaths.startsOn("y1")]: "2026-01-01",
  [planPaths.endsOn("y1")]: "2026-12-31",
  [planPaths.annualMaximum("y1")]: "1,500",
  [planPaths.alreadyUsed("y1")]: "1,100",
  [planPaths.deductible("y1")]: "50",
  [planPaths.deductibleSatisfied("y1")]: "50",
  [planPaths.startsOn("y2")]: "2027-01-01",
  [planPaths.endsOn("y2")]: "2027-12-31",
  [planPaths.annualMaximum("y2")]: "1,500",
  [planPaths.alreadyUsed("y2")]: "0",
  [planPaths.deductible("y2")]: "50",
  [planPaths.deductibleSatisfied("y2")]: "0",
  [planPaths.rulesUnchanged]: true,
  [planPaths.insurerPercent("preventive")]: "100",
  [planPaths.deductibleApplies("preventive")]: false,
  [planPaths.maximumApplies("preventive")]: false,
  [planPaths.insurerPercent("basic")]: "80",
  [planPaths.deductibleApplies("basic")]: true,
  [planPaths.maximumApplies("basic")]: true,
  [planPaths.insurerPercent("major")]: "50",
  [planPaths.deductibleApplies("major")]: true,
  [planPaths.maximumApplies("major")]: true,

  [carePaths.label("p1")]: "Cleaning",
  [carePaths.category("p1")]: "preventive",
  [carePaths.fee("p1")]: "150",
  [carePaths.eligibilityConfirmed("p1")]: true,
  [carePaths.anchorDate("p1")]: "2026-10-15",
  [timingPaths.permission("p1")]: "dentistApproved",
  [timingPaths.windowEarliest("p1", "y1")]: "2026-10-15",
  [timingPaths.windowLatest("p1", "y1")]: "2026-10-15",
  [timingPaths.deadline("p1")]: "2026-10-15",

  [carePaths.label("p2")]: "Filling A",
  [carePaths.category("p2")]: "basic",
  [carePaths.fee("p2")]: "200",
  [carePaths.eligibilityConfirmed("p2")]: true,
  [carePaths.anchorDate("p2")]: "2026-10-16",
  [timingPaths.permission("p2")]: "dentistApproved",
  [timingPaths.windowEarliest("p2", "y1")]: "2026-10-16",
  [timingPaths.windowLatest("p2", "y1")]: "2026-10-16",
  [timingPaths.deadline("p2")]: "2026-10-16",

  [carePaths.label("p3")]: "Filling B",
  [carePaths.category("p3")]: "basic",
  [carePaths.fee("p3")]: "200",
  [carePaths.eligibilityConfirmed("p3")]: true,
  [carePaths.anchorDate("p3")]: "2026-10-17",
  [timingPaths.permission("p3")]: "dentistApproved",
  [timingPaths.windowEarliest("p3", "y1")]: "2026-10-17",
  [timingPaths.windowLatest("p3", "y1")]: "2026-10-17",
  [timingPaths.deadline("p3")]: "2026-10-17",

  [carePaths.label("p4")]: "Crown",
  [carePaths.category("p4")]: "major",
  [carePaths.fee("p4")]: "1,500",
  [carePaths.eligibilityConfirmed("p4")]: true,
  [carePaths.anchorDate("p4")]: "2026-11-15",
  [timingPaths.permission("p4")]: "dentistApproved",
  [timingPaths.windowEarliest("p4", "y1")]: "2026-11-15",
  [timingPaths.windowLatest("p4", "y1")]: "2026-12-15",
  [timingPaths.windowEarliest("p4", "y2")]: "2027-01-08",
  [timingPaths.windowLatest("p4", "y2")]: "2027-01-31",
  [timingPaths.deadline("p4")]: "2027-01-31",
  [timingPaths.after("p4")]: "p2,p3",
  [timingPaths.minGapDays("p4")]: "1",
};

/** Sample treatment as source-linked proposals; still requires review and confirmation. */
export function sampleTreatmentProposals(receivedAt: string): { evidence: IntakeEvidence; proposals: IntakeProposal[] } {
  const evidence: IntakeEvidence = {
    id: `sample-${receivedAt}`,
    kind: "sample",
    sourceId: SAMPLE_FIXTURE_NAME,
    sourceLabel: "Sample treatment",
    receivedAt,
  };
  return {
    evidence,
    proposals: Object.entries(SAMPLE_TREATMENT_VALUES).map(([fieldPath, value]) => ({ fieldPath, value, evidenceId: evidence.id })),
  };
}
