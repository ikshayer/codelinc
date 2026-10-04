import { factDisplayStatus } from "@/lib/domain/draft";
import type { IntakeDraft } from "@/lib/domain/draft";
import { CATEGORIES, carePaths, getFieldDefinition, planPaths, timingPaths } from "@/lib/domain/fields";
import type { ProcedureId } from "@/lib/domain/types";

// Pure step model for the manual wizard: which fields each step owns and how
// complete it is. No money arithmetic — only counts of filled/missing leaves.

export const STEP_COUNT = 6;
export const CHECK_STEP = 6;
/** Focus target for the "no procedures yet" item, so a digest link can land on it. */
export const ADD_PROCEDURE_ID = "wizard-add-procedure";

export interface WizardStep {
  id: number;
  title: string;
  /** Short label used in the rail and the mobile step list. */
  railLabel: string;
  why: string;
}

export const WIZARD_STEPS: readonly WizardStep[] = [
  { id: 1, title: "Your benefit years", railLabel: "Your benefit years", why: "The plan’s yearly limit and what it has already paid decide how much it can still pay this year." },
  { id: 2, title: "Next year", railLabel: "Next year", why: "If timing could move care into next year, we need next year’s limit and deductible too." },
  { id: 3, title: "Coverage", railLabel: "Coverage", why: "Each category has its own share the plan pays, and its own deductible and yearly-limit rules." },
  { id: 4, title: "Prescribed care", railLabel: "Prescribed care", why: "The procedures your dentist prescribed and the fees they quoted for this plan." },
  { id: 5, title: "Dentist timing", railLabel: "Dentist timing", why: "We only compare dates your dentist has already approved. If you don’t know, a procedure stays on its planned date." },
  { id: 6, title: "Check and continue", railLabel: "Check and continue", why: "Here is what’s filled in and what’s still blank. Blank is fine — unknown values are never treated as zero." },
];

export function parseStep(value: string | null): number {
  if (value === null || !/^\d+$/.test(value)) return 1;
  const step = Number(value);
  return step >= 1 && step <= STEP_COUNT ? step : 1;
}

export interface StepItem {
  key: string;
  label: string;
  /** Step that owns the item (where the link jumps to). */
  step: number;
  /** Field to focus; `focusId` overrides the field's own input id. */
  path?: string;
  focusId?: string;
}

export interface StepSummary {
  step: number;
  total: number;
  filled: number;
  missing: StepItem[];
  conflicts: StepItem[];
  complete: boolean;
}

export function procedureName(draft: IntakeDraft, id: ProcedureId, index: number): string {
  const value = draft.facts[carePaths.label(id)]?.value;
  return typeof value === "string" && value ? value : `Procedure ${index + 1}`;
}

function yearPaths(year: "y1" | "y2"): string[] {
  return [planPaths.startsOn(year), planPaths.endsOn(year), planPaths.annualMaximum(year), planPaths.alreadyUsed(year), planPaths.deductible(year), planPaths.deductibleSatisfied(year)];
}

export function categoryPaths(): string[] {
  return CATEGORIES.flatMap((c) => [planPaths.insurerPercent(c), planPaths.deductibleApplies(c), planPaths.maximumApplies(c)]);
}

export function carePathsFor(id: ProcedureId): string[] {
  return [carePaths.label(id), carePaths.category(id), carePaths.fee(id), carePaths.anchorDate(id), carePaths.eligibilityConfirmed(id)];
}

/** The required leaves a step asks for. Optional timing details never count as missing. */
function requiredPaths(step: number, draft: IntakeDraft): { path: string; owner?: string }[] {
  switch (step) {
    case 1:
      return yearPaths("y1").map((path) => ({ path }));
    case 2:
      return [...yearPaths("y2"), planPaths.rulesUnchanged].map((path) => ({ path }));
    case 3:
      return categoryPaths().map((path) => ({ path }));
    case 4:
      return draft.procedureIds.flatMap((id, index) => carePathsFor(id).map((path) => ({ path, owner: procedureName(draft, id, index) })));
    case 5:
      return draft.procedureIds.map((id, index) => ({ path: timingPaths.permission(id), owner: procedureName(draft, id, index) }));
    default:
      return [];
  }
}

function summarizeStep(step: number, draft: IntakeDraft): StepSummary {
  const items = requiredPaths(step, draft);
  const missing: StepItem[] = [];
  const conflicts: StepItem[] = [];
  let filled = 0;

  for (const { path, owner } of items) {
    const label = owner ? `${owner}: ${getFieldDefinition(path).label}` : getFieldDefinition(path).label;
    const status = factDisplayStatus(draft.facts[path]);
    if (status === "missing") missing.push({ key: path, label, step, path });
    else if (status === "conflict") conflicts.push({ key: path, label, step, path });
    else filled += 1;
  }

  let total = items.length;
  if (items.length === 0) {
    // Steps 4 and 5 need at least one procedure before they have fields.
    total = 1;
    missing.push(
      step === 4
        ? { key: "no-procedures", label: "Add at least one procedure", step: 4, focusId: ADD_PROCEDURE_ID }
        : { key: "no-procedures-timing", label: "Add prescribed care first", step: 4, focusId: ADD_PROCEDURE_ID },
    );
  }
  return { step, total, filled, missing, conflicts, complete: missing.length === 0 && conflicts.length === 0 };
}

/** Summaries for steps 1–6; step 6 aggregates the others. */
export function summarizeWizard(draft: IntakeDraft): StepSummary[] {
  const parts = [1, 2, 3, 4, 5].map((step) => summarizeStep(step, draft));
  const overall: StepSummary = {
    step: CHECK_STEP,
    total: parts.reduce((sum, part) => sum + part.total, 0),
    filled: parts.reduce((sum, part) => sum + part.filled, 0),
    missing: parts.flatMap((part) => part.missing),
    conflicts: parts.flatMap((part) => part.conflicts),
    complete: parts.every((part) => part.complete),
  };
  return [...parts, overall];
}

export type StepDisplay = "done" | "inProgress" | "missing" | "conflict";

export function stepDisplay(summary: StepSummary, current: boolean): StepDisplay {
  if (summary.conflicts.length > 0) return "conflict";
  if (summary.complete) return "done";
  return current ? "inProgress" : "missing";
}

export function stepStatusText(summary: StepSummary, display: StepDisplay): string {
  switch (display) {
    case "done":
      return "Done";
    case "conflict":
      return summary.conflicts.length === 1 ? "1 conflict to resolve" : `${summary.conflicts.length} conflicts to resolve`;
    case "inProgress":
      return summary.missing.length > 0 ? `In progress, ${summary.missing.length} blank` : "In progress";
    case "missing":
      return summary.missing.length === 1 ? "1 blank" : `${summary.missing.length} blank`;
  }
}
