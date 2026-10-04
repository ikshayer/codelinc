import { compareIso, isValidIsoDate } from "./dates";
import type { IntakeDraft } from "./draft";
import { CATEGORIES, PLAN_FIELDS, YEARS, carePaths, getFieldDefinition, planPaths, procedureFields, timingPaths } from "./fields";
import { centsToInput, parseDollarsToCents, parsePercentToBasisPoints } from "./money";
import type {
  BenefitYear,
  BenefitYearId,
  ConfirmedFact,
  ConfirmedScenario,
  CoverageCategory,
  CoverageRule,
  DraftFact,
  FactSource,
  FieldValue,
  IntakeEvidence,
  Procedure,
  ProcedureId,
  TreatmentDependency,
  TreatmentWindow,
  ValidationIssue,
} from "./types";

// Maps the reviewed draft onto the architecture's ConfirmedScenario. This is
// parsing and validation only: no benefit math happens here. Unknown values
// produce blocking issues linked to their field — never a zero default.

export type ScenarioBuildResult =
  | { ok: true; scenario: ConfirmedScenario; notices: ValidationIssue[] }
  | { ok: false; issues: ValidationIssue[] };

class IssueCollector {
  readonly issues: ValidationIssue[] = [];
  block(fieldPath: string, code: string, message: string) {
    if (!this.issues.some((i) => i.fieldPath === fieldPath)) this.issues.push({ code, fieldPath, message, severity: "blocking" });
  }
}

function sourceFor(fact: DraftFact, evidence: Record<string, IntakeEvidence>, isTiming: boolean): FactSource {
  const first = fact.evidenceIds.map((id) => evidence[id]).find(Boolean);
  const quote = first?.literalQuote ?? null;
  if (fact.origin === "sample") return { kind: "syntheticFixture", label: "Sample treatment", quote };
  // Timing is only ever user-affirmed dentist information, whatever its origin.
  if (isTiming) return { kind: "userReportedDentist", label: "Dentist timing you confirmed", quote };
  if (fact.origin === "manual") return { kind: "userEntry", label: "Entered by you", quote };
  const where = first?.pageNumber ? `${first.sourceLabel}, page ${first.pageNumber}` : (first?.sourceLabel ?? "AI intake");
  return { kind: "aiProposal", label: `Reviewed from ${where}`, quote };
}

export function buildConfirmedScenario(draft: IntakeDraft): ScenarioBuildResult {
  const issues = new IssueCollector();
  const confirmed: ConfirmedFact<unknown>[] = [];

  const fact = (path: string) => draft.facts[path];
  const record = (path: string, value: unknown) => {
    const f = fact(path);
    if (f) confirmed.push({ fieldPath: path, value, source: sourceFor(f, draft.evidence, path.startsWith("timing.")), confirmedAtRevision: draft.revision });
  };

  const present = (path: string): DraftFact | null => {
    const f = fact(path);
    if (f?.status === "conflict") {
      issues.block(path, "CONFLICT", `Choose which value is right for “${getFieldDefinition(path).label}”.`);
      return null;
    }
    if (!f || f.value === null || f.value === "") return null;
    return f;
  };

  const requireMoney = (path: string): number | null => {
    const f = present(path);
    if (!f) {
      if (fact(path)?.status !== "conflict") issues.block(path, "MISSING", `Add ${getFieldDefinition(path).label.toLowerCase()}.`);
      return null;
    }
    const parsed = parseDollarsToCents(String(f.value));
    if (!parsed.ok) return issues.block(path, "INVALID", parsed.message), null;
    record(path, parsed.value);
    return parsed.value;
  };

  const requireDate = (path: string): string | null => {
    const f = present(path);
    if (!f) {
      if (fact(path)?.status !== "conflict") issues.block(path, "MISSING", `Add ${getFieldDefinition(path).label.toLowerCase()}.`);
      return null;
    }
    const value = String(f.value);
    if (!isValidIsoDate(value)) return issues.block(path, "INVALID", "Enter a real date."), null;
    record(path, value);
    return value;
  };

  const optionalDate = (path: string): string | null => {
    const f = present(path);
    if (!f) return null;
    const value = String(f.value);
    if (!isValidIsoDate(value)) return issues.block(path, "INVALID", "Enter a real date."), null;
    record(path, value);
    return value;
  };

  const requireBoolean = (path: string): boolean | null => {
    const f = present(path);
    if (!f || typeof f.value !== "boolean") {
      if (fact(path)?.status !== "conflict") issues.block(path, "MISSING", `Answer “${getFieldDefinition(path).label}”.`);
      return null;
    }
    record(path, f.value);
    return f.value;
  };

  // --- Plan -----------------------------------------------------------------
  const rules = {} as Record<CoverageCategory, CoverageRule>;
  for (const category of CATEGORIES) {
    const percentFact = present(planPaths.insurerPercent(category));
    let bps: number | null = null;
    if (!percentFact) {
      if (fact(planPaths.insurerPercent(category))?.status !== "conflict") issues.block(planPaths.insurerPercent(category), "MISSING", `Add what the plan pays for ${category} care.`);
    } else {
      const parsed = parsePercentToBasisPoints(String(percentFact.value));
      if (!parsed.ok) issues.block(planPaths.insurerPercent(category), "INVALID", parsed.message);
      else {
        bps = parsed.value;
        record(planPaths.insurerPercent(category), bps);
      }
    }
    const deductibleApplies = requireBoolean(planPaths.deductibleApplies(category));
    const annualMaximumApplies = requireBoolean(planPaths.maximumApplies(category));
    if (bps !== null && deductibleApplies !== null && annualMaximumApplies !== null) {
      rules[category] = { category, insurerBasisPoints: bps, deductibleApplies, annualMaximumApplies };
    }
  }

  const rulesUnchanged = requireBoolean(planPaths.rulesUnchanged);
  if (rulesUnchanged === false) {
    issues.block(
      planPaths.rulesUnchanged,
      "UNSUPPORTED_NEXT_YEAR_RULES",
      "This version compares next-year dates only when next year's percentages match this year's. Check with your plan before comparing.",
    );
  }

  const years: BenefitYear[] = [];
  for (const y of YEARS) {
    const startsOn = requireDate(planPaths.startsOn(y));
    const endsOn = requireDate(planPaths.endsOn(y));
    const annualMaximumCents = requireMoney(planPaths.annualMaximum(y));
    const usedCents = requireMoney(planPaths.alreadyUsed(y));
    const deductibleCents = requireMoney(planPaths.deductible(y));
    const satisfiedCents = requireMoney(planPaths.deductibleSatisfied(y));
    if (startsOn && endsOn && compareIso(startsOn, endsOn) >= 0) issues.block(planPaths.endsOn(y), "INVALID_PERIOD", "The end date must be after the start date.");
    if (annualMaximumCents !== null && usedCents !== null && usedCents > annualMaximumCents) {
      issues.block(planPaths.alreadyUsed(y), "USAGE_EXCEEDS_MAXIMUM", "Payments already counted can't be more than the yearly limit. Check both amounts.");
    }
    if (deductibleCents !== null && satisfiedCents !== null && satisfiedCents > deductibleCents) {
      issues.block(planPaths.deductibleSatisfied(y), "DEDUCTIBLE_EXCEEDED", "The amount already met can't be more than the deductible.");
    }
    if (startsOn && endsOn && annualMaximumCents !== null && usedCents !== null && deductibleCents !== null && satisfiedCents !== null && Object.keys(rules).length === 3) {
      years.push({
        id: y,
        label: `${startsOn.slice(0, 4)} benefit year`,
        startsOn,
        endsOn,
        annualMaximumCents,
        deductibleCents,
        utilization: { priorInsurerPaymentsCents: usedCents, priorDeductibleSatisfiedCents: satisfiedCents, pendingClaims: "none" },
        rules,
        ruleStatus: y === "y1" ? "suppliedConfirmed" : "assumedUnchangedConfirmed",
      });
    }
  }
  if (years.length === 2 && compareIso(years[0].endsOn, years[1].startsOn) >= 0) {
    issues.block(planPaths.startsOn("y2"), "OVERLAPPING_PERIODS", "Next year must start after the current year ends.");
  }
  const periodOf = (date: string): BenefitYearId | null => years.find((y) => compareIso(date, y.startsOn) >= 0 && compareIso(date, y.endsOn) <= 0)?.id ?? null;

  // --- Care and timing ------------------------------------------------------
  if (draft.procedureIds.length === 0) issues.block("care", "NO_PROCEDURES", "Add at least one prescribed procedure.");
  for (const item of draft.overflow) {
    issues.block("care.overflow", "EXTRA_EVENTS", `This version compares up to four procedures. “${item.label}” wasn't added — compare it separately or remove another procedure.`);
  }

  const procedures: Procedure[] = [];
  const dependencies: TreatmentDependency[] = [];
  for (const id of draft.procedureIds) {
    const labelFact = present(carePaths.label(id));
    if (!labelFact) issues.block(carePaths.label(id), "MISSING", "Name this procedure.");
    else record(carePaths.label(id), String(labelFact.value));
    const label = labelFact ? String(labelFact.value) : id;

    const categoryFact = present(carePaths.category(id));
    const category = categoryFact && CATEGORIES.includes(categoryFact.value as CoverageCategory) ? (categoryFact.value as CoverageCategory) : null;
    if (!category) issues.block(carePaths.category(id), "MISSING", `Choose a coverage category for ${label}.`);
    else record(carePaths.category(id), category);

    const feeCents = requireMoney(carePaths.fee(id));
    const eligible = requireBoolean(carePaths.eligibilityConfirmed(id));
    if (eligible === false) {
      issues.block(carePaths.eligibilityConfirmed(id), "NOT_ELIGIBLE", `CareWindow only compares covered care. Confirm ${label} is covered, or remove it.`);
    }
    const anchorDate = requireDate(carePaths.anchorDate(id));
    if (anchorDate && years.length === 2 && !periodOf(anchorDate)) {
      issues.block(carePaths.anchorDate(id), "ANCHOR_OUTSIDE_PLAN", `${label}'s planned date isn't in the current or next benefit year.`);
    }

    const permissionFact = present(timingPaths.permission(id));
    const permission = permissionFact?.value === "dentistApproved" || permissionFact?.value === "unknown" ? permissionFact.value : null;
    if (!permission) issues.block(timingPaths.permission(id), "MISSING", `Tell us whether your dentist approved other dates for ${label}.`);
    else record(timingPaths.permission(id), permission);

    const deadline = optionalDate(timingPaths.deadline(id));
    if (deadline && anchorDate && compareIso(anchorDate, deadline) > 0) {
      issues.block(timingPaths.deadline(id), "ANCHOR_AFTER_DEADLINE", `${label}'s planned date is after the dentist's deadline. Check both dates.`);
    }

    const windows: TreatmentWindow[] = [];
    if (permission === "dentistApproved") {
      for (const y of YEARS) {
        const earliest = optionalDate(timingPaths.windowEarliest(id, y));
        const latest = optionalDate(timingPaths.windowLatest(id, y));
        if (!earliest && !latest) continue;
        if (!earliest || !latest) {
          issues.block(earliest ? timingPaths.windowLatest(id, y) : timingPaths.windowEarliest(id, y), "INCOMPLETE_WINDOW", "Add both the earliest and latest approved dates.");
          continue;
        }
        if (compareIso(earliest, latest) > 0) issues.block(timingPaths.windowLatest(id, y), "INVALID_WINDOW", "The latest date must be on or after the earliest date.");
        else if (years.length === 2 && (periodOf(earliest) !== y || periodOf(latest) !== y)) {
          issues.block(timingPaths.windowEarliest(id, y), "WINDOW_OUTSIDE_YEAR", `These dates must fall inside the ${y === "y1" ? "current" : "next"} benefit year.`);
        } else {
          const windowFact = fact(timingPaths.windowEarliest(id, y));
          windows.push({ benefitYearId: y, earliestDate: earliest, latestDate: latest, source: sourceFor(windowFact!, draft.evidence, true) });
        }
      }
      if (windows.length === 0 && !issues.issues.some((i) => i.fieldPath.startsWith(`timing.${id}.`))) {
        issues.block(timingPaths.windowEarliest(id, "y1"), "NO_WINDOWS", `Add the dates your dentist approved for ${label}, or choose “I don't know”.`);
      }
    }

    const afterFact = present(timingPaths.after(id));
    const afterIds = afterFact ? String(afterFact.value).split(",").map((s) => s.trim()).filter(Boolean) : [];
    if (afterIds.length > 0) {
      const bad = afterIds.filter((other) => other === id || !draft.procedureIds.includes(other));
      if (bad.length > 0) issues.block(timingPaths.after(id), "INVALID_DEPENDENCY", "Choose other procedures from this plan.");
      const gapFact = present(timingPaths.minGapDays(id));
      const gap = gapFact ? Number(gapFact.value) : NaN;
      if (!Number.isInteger(gap) || gap < 1 || gap > 366) {
        issues.block(timingPaths.minGapDays(id), "MISSING", "Add the days your dentist requires between visits (1–366).");
      } else if (bad.length === 0) {
        record(timingPaths.after(id), afterIds);
        record(timingPaths.minGapDays(id), gap);
        for (const before of afterIds) {
          dependencies.push({ beforeProcedureId: before, afterProcedureId: id, minGapDays: gap, source: sourceFor(afterFact!, draft.evidence, true) });
        }
      }
    }

    if (labelFact && category && feeCents !== null && eligible === true && anchorDate && permission) {
      procedures.push({
        id,
        label,
        category,
        contractedFeeCents: feeCents,
        eligibilityConfirmed: true,
        anchorDate,
        timingPermission: permission,
        // Unknown permission fixes the procedure to its confirmed anchor.
        windows: permission === "unknown" ? [] : windows,
        deadline,
      });
    }
  }

  if (issues.issues.length > 0 || years.length !== 2) {
    if (issues.issues.length === 0) issues.block("plan", "INCOMPLETE_PLAN", "Finish your plan details.");
    return { ok: false, issues: issues.issues };
  }

  return {
    ok: true,
    scenario: {
      revision: draft.revision,
      plan: {
        id: "demo-ppo",
        type: "simplePPO",
        currency: "USD",
        network: "inNetwork",
        secondaryCoverage: false,
        rollover: false,
        years: [years[0], years[1]],
      },
      procedures,
      dependencies,
      facts: confirmed,
    },
    notices: [],
  };
}

/**
 * Turns a confirmed scenario's facts back into editable draft values, for
 * "Duplicate as new analysis". The copy is a new draft that needs review.
 */
export function draftValuesFromScenario(scenario: ConfirmedScenario): Record<string, FieldValue> {
  const values: Record<string, FieldValue> = {};
  for (const fact of scenario.facts) {
    const definition = getFieldDefinition(fact.fieldPath);
    const value = fact.value;
    if (definition.kind === "money" && typeof value === "number") values[fact.fieldPath] = centsToInput(value);
    else if (definition.kind === "percent" && typeof value === "number") values[fact.fieldPath] = String(value / 100);
    else if (definition.kind === "procedureList" && Array.isArray(value)) values[fact.fieldPath] = value.join(",");
    else if (typeof value === "boolean" || typeof value === "string") values[fact.fieldPath] = value;
    else if (typeof value === "number") values[fact.fieldPath] = String(value);
    else throw new Error(`Cannot copy confirmed value for ${fact.fieldPath}`);
  }
  return values;
}

/** Field paths a group confirmation covers, for the given procedures. */
export function groupFieldPaths(draft: IntakeDraft, group: "plan" | "care" | "timing"): string[] {
  const fields = [...PLAN_FIELDS, ...draft.procedureIds.flatMap((id: ProcedureId) => procedureFields(id))];
  return fields.filter((f) => f.group === group && draft.facts[f.path]).map((f) => f.path);
}
