import { carePaths, planPaths } from "@/lib/domain/fields";
import type { FieldValue } from "@/lib/domain/types";

// Synthetic data only. A scripted conversation for demo mode. Nothing here is
// recognized from speech: the demo adapter plays these turns on a timer and
// labels them "Simulated conversation".
//
// Only plan rules and prescribed-care facts are proposed. Dentist timing
// permission and eligibility are never proposed — the person affirms those
// separately on the Confirm screen.

export const SIMULATED_SOURCE_LABEL = "Simulated conversation";

export interface ScriptedProposal {
  fieldPath: string;
  value: FieldValue;
}

export type ScriptedTurn =
  | { speaker: "assistant"; turnId: string; text: string }
  | { speaker: "person"; turnId: string; text: string; proposals?: readonly ScriptedProposal[] };

/** Reply to a typed message when no interpretation service is connected. */
export const DEMO_TYPED_REPLY =
  "Demo mode doesn't interpret typed messages, so I haven't added anything from that. You can enter the value in Facts gathered or on the Confirm screen.";

const careProposals: readonly ScriptedProposal[] = [
  { fieldPath: carePaths.label("p1"), value: "Cleaning" },
  { fieldPath: carePaths.category("p1"), value: "preventive" },
  { fieldPath: carePaths.label("p2"), value: "Filling A" },
  { fieldPath: carePaths.category("p2"), value: "basic" },
  { fieldPath: carePaths.label("p3"), value: "Filling B" },
  { fieldPath: carePaths.category("p3"), value: "basic" },
  { fieldPath: carePaths.label("p4"), value: "Crown" },
  { fieldPath: carePaths.category("p4"), value: "major" },
];

const yearlyProposals: readonly ScriptedProposal[] = [
  { fieldPath: planPaths.annualMaximum("y1"), value: "1,500" },
  { fieldPath: planPaths.alreadyUsed("y1"), value: "1,100" },
  { fieldPath: planPaths.annualMaximum("y2"), value: "1,500" },
  { fieldPath: planPaths.alreadyUsed("y2"), value: "0" },
];

const deductibleProposals: readonly ScriptedProposal[] = [
  { fieldPath: planPaths.deductible("y1"), value: "50" },
  { fieldPath: planPaths.deductibleSatisfied("y1"), value: "50" },
  { fieldPath: planPaths.deductible("y2"), value: "50" },
  { fieldPath: planPaths.deductibleSatisfied("y2"), value: "0" },
];

const yearDateProposals: readonly ScriptedProposal[] = [
  { fieldPath: planPaths.startsOn("y1"), value: "2026-01-01" },
  { fieldPath: planPaths.endsOn("y1"), value: "2026-12-31" },
  { fieldPath: planPaths.startsOn("y2"), value: "2027-01-01" },
  { fieldPath: planPaths.endsOn("y2"), value: "2027-12-31" },
  { fieldPath: planPaths.rulesUnchanged, value: true },
];

const coverageProposals: readonly ScriptedProposal[] = [
  { fieldPath: planPaths.insurerPercent("preventive"), value: "100" },
  { fieldPath: planPaths.deductibleApplies("preventive"), value: false },
  { fieldPath: planPaths.maximumApplies("preventive"), value: false },
  { fieldPath: planPaths.insurerPercent("basic"), value: "80" },
  { fieldPath: planPaths.deductibleApplies("basic"), value: true },
  { fieldPath: planPaths.maximumApplies("basic"), value: true },
  { fieldPath: planPaths.insurerPercent("major"), value: "50" },
  { fieldPath: planPaths.deductibleApplies("major"), value: true },
  { fieldPath: planPaths.maximumApplies("major"), value: true },
];

export const SAMPLE_CONVERSATION: readonly ScriptedTurn[] = [
  {
    speaker: "assistant",
    turnId: "t01",
    text: "I'm CareWindow's AI assistant. I can help gather the details from your dentist's plan and benefits.",
  },
  { speaker: "assistant", turnId: "t02", text: "What did your dentist recommend?" },
  { speaker: "person", turnId: "t03", text: "A cleaning, two fillings and a crown.", proposals: careProposals },
  {
    speaker: "assistant",
    turnId: "t04",
    text: "So that's a cleaning, two fillings and a crown. Tell me if I got any of that wrong. What fee did your dentist quote for the crown?",
  },
  // The crown fee intentionally differs from the sample report ($1,500) so the demo shows a source conflict.
  {
    speaker: "person",
    turnId: "t05",
    text: "About $1,450.",
    proposals: [{ fieldPath: carePaths.fee("p4"), value: "1,450" }],
  },
  { speaker: "assistant", turnId: "t06", text: "Thanks, I noted the crown fee as about $1,450. Do you know your plan's yearly maximum?" },
  { speaker: "person", turnId: "t07", text: "Is it safe to wait on the crown?" },
  {
    speaker: "assistant",
    turnId: "t08",
    text: "I can't tell you whether it's safe to wait. Only your dentist can say that, and I don't decide what your plan covers. I can keep gathering the details from your plan. Do you know your plan's yearly maximum?",
  },
  {
    speaker: "person",
    turnId: "t09",
    text: "Fifteen hundred dollars a year. I've used eleven hundred so far this year, and next year starts at zero.",
    proposals: yearlyProposals,
  },
  { speaker: "assistant", turnId: "t10", text: "Got it. What's the deductible, and how much of it have you met?" },
  {
    speaker: "person",
    turnId: "t11",
    text: "It's fifty dollars. I've met it this year, and none of it next year.",
    proposals: deductibleProposals,
  },
  { speaker: "assistant", turnId: "t12", text: "Thanks. What dates does your benefit year run, and does next year use the same rules?" },
  {
    speaker: "person",
    turnId: "t13",
    text: "January 1 to December 31, and next year is the same dates and the same rules.",
    proposals: yearDateProposals,
  },
  { speaker: "assistant", turnId: "t14", text: "Last one. What does the plan pay for each type of care?" },
  {
    speaker: "person",
    turnId: "t15",
    text: "Preventive is 100 percent with no deductible. Basic is 80 percent and major is 50 percent, and both use the deductible and count toward the yearly maximum.",
    proposals: coverageProposals,
  },
  {
    speaker: "assistant",
    turnId: "t16",
    text: "Thanks. I've added what I heard as proposed details. Select End conversation when you're ready to review them.",
  },
];

/** Turn ID after which the demo's provider-failure scenario stops the session. */
export const FAILURE_AFTER_TURN_ID = "t03";

/** Turn ID after which the demo's reconnect scenario drops and restores the connection. */
export const RECONNECT_AFTER_TURN_ID = "t05";
