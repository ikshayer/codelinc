import type { BenefitYearId, CoverageCategory, ProcedureId } from "./types";

// Field registry: every draft fact the Confirm screen can show. Paths are
// stable strings so PDF pages, voice turns and manual edits target the same
// leaf. Groups match the three confirmation sections in FRONTEND_DESIGN.md §9.

export type FieldGroup = "plan" | "care" | "timing";
export type FieldKind = "money" | "percent" | "boolean" | "date" | "text" | "category" | "permission" | "procedureList" | "days";

export interface FieldDefinition {
  path: string;
  group: FieldGroup;
  kind: FieldKind;
  label: string;
  /** Short "Why we ask" helper; secondary to the label. */
  help?: string;
  /** Required for a precise comparison. Optional fields may stay unknown. */
  required: boolean;
  procedureId?: ProcedureId;
}

export const MAX_PROCEDURES = 4;
export const PROCEDURE_IDS: readonly ProcedureId[] = ["p1", "p2", "p3", "p4"];
export const CATEGORIES: readonly CoverageCategory[] = ["preventive", "basic", "major"];
export const YEARS: readonly BenefitYearId[] = ["y1", "y2"];

export const CATEGORY_LABELS: Record<CoverageCategory, string> = {
  preventive: "Preventive",
  basic: "Basic",
  major: "Major",
};

export const YEAR_LABELS: Record<BenefitYearId, string> = { y1: "Current year", y2: "Next year" };

export const planPaths = {
  startsOn: (y: BenefitYearId) => `plan.${y}.startsOn`,
  endsOn: (y: BenefitYearId) => `plan.${y}.endsOn`,
  annualMaximum: (y: BenefitYearId) => `plan.${y}.annualMaximum`,
  alreadyUsed: (y: BenefitYearId) => `plan.${y}.alreadyUsed`,
  deductible: (y: BenefitYearId) => `plan.${y}.deductible`,
  deductibleSatisfied: (y: BenefitYearId) => `plan.${y}.deductibleSatisfied`,
  rulesUnchanged: "plan.y2.rulesUnchanged",
  insurerPercent: (c: CoverageCategory) => `plan.rules.${c}.insurerPercent`,
  deductibleApplies: (c: CoverageCategory) => `plan.rules.${c}.deductibleApplies`,
  maximumApplies: (c: CoverageCategory) => `plan.rules.${c}.maximumApplies`,
} as const;

export const carePaths = {
  label: (p: ProcedureId) => `care.${p}.label`,
  category: (p: ProcedureId) => `care.${p}.category`,
  fee: (p: ProcedureId) => `care.${p}.fee`,
  eligibilityConfirmed: (p: ProcedureId) => `care.${p}.eligibilityConfirmed`,
  anchorDate: (p: ProcedureId) => `care.${p}.anchorDate`,
} as const;

export const timingPaths = {
  permission: (p: ProcedureId) => `timing.${p}.permission`,
  windowEarliest: (p: ProcedureId, y: BenefitYearId) => `timing.${p}.${y}.earliest`,
  windowLatest: (p: ProcedureId, y: BenefitYearId) => `timing.${p}.${y}.latest`,
  deadline: (p: ProcedureId) => `timing.${p}.deadline`,
  /** Comma-separated procedure IDs that must happen before this one. */
  after: (p: ProcedureId) => `timing.${p}.after`,
  minGapDays: (p: ProcedureId) => `timing.${p}.minGapDays`,
} as const;

function planFields(): FieldDefinition[] {
  const fields: FieldDefinition[] = [];
  for (const y of YEARS) {
    const year = YEAR_LABELS[y].toLowerCase();
    fields.push(
      { path: planPaths.startsOn(y), group: "plan", kind: "date", label: `${YEAR_LABELS[y]} starts`, required: true },
      { path: planPaths.endsOn(y), group: "plan", kind: "date", label: `${YEAR_LABELS[y]} ends`, required: true },
      {
        path: planPaths.annualMaximum(y),
        group: "plan",
        kind: "money",
        label: `Most the plan pays in the ${year}`,
        help: "The plan's yearly limit and amount already used affect what it may pay.",
        required: true,
      },
      {
        path: planPaths.alreadyUsed(y),
        group: "plan",
        kind: "money",
        label: `Plan payments already counted in the ${year}`,
        help: "Only payments that count toward the yearly limit. Leave blank if you don't know — we won't assume zero.",
        required: true,
      },
      { path: planPaths.deductible(y), group: "plan", kind: "money", label: `Deductible for the ${year}`, required: true },
      { path: planPaths.deductibleSatisfied(y), group: "plan", kind: "money", label: `Deductible already met in the ${year}`, required: true },
    );
  }
  fields.push({
    path: planPaths.rulesUnchanged,
    group: "plan",
    kind: "boolean",
    label: "Next year uses the same coverage percentages",
    help: "An explicit assumption. Comparing next-year dates depends on it.",
    required: true,
  });
  for (const c of CATEGORIES) {
    fields.push(
      { path: planPaths.insurerPercent(c), group: "plan", kind: "percent", label: `${CATEGORY_LABELS[c]}: plan pays`, required: true },
      { path: planPaths.deductibleApplies(c), group: "plan", kind: "boolean", label: `${CATEGORY_LABELS[c]}: deductible applies`, required: true },
      { path: planPaths.maximumApplies(c), group: "plan", kind: "boolean", label: `${CATEGORY_LABELS[c]}: counts toward yearly limit`, required: true },
    );
  }
  return fields;
}

export function procedureFields(p: ProcedureId): FieldDefinition[] {
  return [
    { path: carePaths.label(p), group: "care", kind: "text", label: "Procedure", required: true, procedureId: p },
    { path: carePaths.category(p), group: "care", kind: "category", label: "Coverage category", required: true, procedureId: p },
    { path: carePaths.fee(p), group: "care", kind: "money", label: "Contracted fee", help: "The fee your dentist quoted for this plan.", required: true, procedureId: p },
    {
      path: carePaths.eligibilityConfirmed(p),
      group: "care",
      kind: "boolean",
      label: "Covered by this plan",
      help: "Confirm with your plan or dentist. CareWindow doesn't verify eligibility.",
      required: true,
      procedureId: p,
    },
    { path: carePaths.anchorDate(p), group: "care", kind: "date", label: "Planned date", required: true, procedureId: p },
    {
      path: timingPaths.permission(p),
      group: "timing",
      kind: "permission",
      label: "Did your dentist approve other dates?",
      help: "If you don't know, the procedure stays on its planned date.",
      required: true,
      procedureId: p,
    },
    { path: timingPaths.windowEarliest(p, "y1"), group: "timing", kind: "date", label: "Earliest this year", required: false, procedureId: p },
    { path: timingPaths.windowLatest(p, "y1"), group: "timing", kind: "date", label: "Latest this year", required: false, procedureId: p },
    { path: timingPaths.windowEarliest(p, "y2"), group: "timing", kind: "date", label: "Earliest next year", required: false, procedureId: p },
    { path: timingPaths.windowLatest(p, "y2"), group: "timing", kind: "date", label: "Latest next year", required: false, procedureId: p },
    { path: timingPaths.deadline(p), group: "timing", kind: "date", label: "Dentist's deadline", required: false, procedureId: p },
    { path: timingPaths.after(p), group: "timing", kind: "procedureList", label: "Must happen after", required: false, procedureId: p },
    { path: timingPaths.minGapDays(p), group: "timing", kind: "days", label: "Days between", required: false, procedureId: p },
  ];
}

export const PLAN_FIELDS: readonly FieldDefinition[] = planFields();

/** All field definitions for the given procedures, in display order. */
export function fieldDefinitions(procedureIds: readonly ProcedureId[]): FieldDefinition[] {
  return [...PLAN_FIELDS, ...procedureIds.flatMap(procedureFields)];
}

const definitionCache = new Map<string, FieldDefinition>(
  [...PLAN_FIELDS, ...PROCEDURE_IDS.flatMap(procedureFields)].map((field) => [field.path, field]),
);

export function getFieldDefinition(path: string): FieldDefinition {
  const definition = definitionCache.get(path);
  if (!definition) throw new Error(`Unknown field path: ${path}`);
  return definition;
}

export function isKnownFieldPath(path: string): boolean {
  return definitionCache.has(path);
}

export function procedureIdOf(path: string): ProcedureId | null {
  const match = /^(?:care|timing)\.(p\d)\./.exec(path);
  return match ? match[1] : null;
}
