import { carePaths, planPaths } from "@/lib/domain/fields";
import type {
  AnnualMaximumState,
  BenefitYearId,
  BenefitYearLedger,
  CalculationRecord,
  CoverageCategory,
  DeductibleState,
  ProcedureCalculation,
  ProcedureId,
  ScenarioComparison,
} from "@/lib/domain/types";

// Precomputed CalculationRecords for the named synthetic scenarios in
// CAREWINDOW_ARCHITECTURE.md §12 (gates A–D). Every value below is a literal
// copied from the architecture's worked traces — nothing is computed here.
// These are FIXTURE PREVIEWS: they let the UI render record-driven results
// without the engine, and they cannot satisfy the real-engine gate.

export type FixtureScenarioName = "canonical" | "deadline" | "fullCurrentAllowance" | "unknownPermission";

export const FIXTURE_LABELS: Record<FixtureScenarioName, string> = {
  canonical: "Canonical sample (gate A)",
  deadline: "Current-year crown deadline (gate B)",
  fullCurrentAllowance: "Full current allowance counterexample (gate C)",
  unknownPermission: "Unknown crown permission (gate D)",
};

type Trace = Omit<ProcedureCalculation, "ruleFieldPaths">;

const CATEGORY_OF: Record<ProcedureId, CoverageCategory> = { p1: "preventive", p2: "basic", p3: "basic", p4: "major" };

function trace(values: Trace): ProcedureCalculation {
  const category = CATEGORY_OF[values.procedureId];
  return {
    ...values,
    ruleFieldPaths: [
      carePaths.fee(values.procedureId),
      planPaths.insurerPercent(category),
      planPaths.deductibleApplies(category),
      planPaths.maximumApplies(category),
      planPaths.deductible(values.benefitYearId),
      planPaths.annualMaximum(values.benefitYearId),
    ],
  };
}

function ledger(
  benefitYearId: BenefitYearId,
  deductible: DeductibleState,
  maximum: AnnualMaximumState,
  procedures: ProcedureCalculation[],
  totals: { fee: number; insurer: number; patient: number },
): BenefitYearLedger {
  return { benefitYearId, deductible, maximum, procedures, totalFeeCents: totals.fee, totalInsurerCents: totals.insurer, totalPatientCents: totals.patient };
}

// --- Shared current-year traces (prior payments $1,100, deductible met) -----

const cleaningY1 = (maximumBefore: number) =>
  trace({
    procedureId: "p1", benefitYearId: "y1", serviceDate: "2026-10-15", processingIndex: 0,
    feeCents: 15000, insurerBasisPoints: 10000, deductibleApplies: false, annualMaximumApplies: false,
    deductibleBeforeCents: 0, deductibleAppliedCents: 0, deductibleAfterCents: 0, eligibleAfterDeductibleCents: 15000,
    potentialInsurerCents: 15000, maximumBeforeCents: maximumBefore, maximumConsumedCents: 0, maximumAfterCents: maximumBefore,
    insurerCents: 15000, patientCents: 0, patientCoinsuranceCents: 0, patientDueToMaximumCents: 0,
  });

const fillingY1 = (procedureId: "p2" | "p3", processingIndex: number, serviceDate: string, maximumBefore: number, maximumAfter: number) =>
  trace({
    procedureId, benefitYearId: "y1", serviceDate, processingIndex,
    feeCents: 20000, insurerBasisPoints: 8000, deductibleApplies: true, annualMaximumApplies: true,
    deductibleBeforeCents: 0, deductibleAppliedCents: 0, deductibleAfterCents: 0, eligibleAfterDeductibleCents: 20000,
    potentialInsurerCents: 16000, maximumBeforeCents: maximumBefore, maximumConsumedCents: 16000, maximumAfterCents: maximumAfter,
    insurerCents: 16000, patientCents: 4000, patientCoinsuranceCents: 4000, patientDueToMaximumCents: 0,
  });

const crownY2 = trace({
  procedureId: "p4", benefitYearId: "y2", serviceDate: "2027-01-08", processingIndex: 3,
  feeCents: 150000, insurerBasisPoints: 5000, deductibleApplies: true, annualMaximumApplies: true,
  deductibleBeforeCents: 5000, deductibleAppliedCents: 5000, deductibleAfterCents: 0, eligibleAfterDeductibleCents: 145000,
  potentialInsurerCents: 72500, maximumBeforeCents: 150000, maximumConsumedCents: 72500, maximumAfterCents: 77500,
  insurerCents: 72500, patientCents: 77500, patientCoinsuranceCents: 72500, patientDueToMaximumCents: 0,
});

const untouchedNextYear = ledger(
  "y2",
  { totalCents: 5000, satisfiedBeforeCents: 0, remainingCents: 5000, appliedInScheduleCents: 0 },
  { totalCents: 150000, usedBeforeCents: 0, remainingCents: 150000, consumedInScheduleCents: 0 },
  [],
  { fee: 0, insurer: 0, patient: 0 },
);

const crownNextYear = ledger(
  "y2",
  { totalCents: 5000, satisfiedBeforeCents: 0, remainingCents: 0, appliedInScheduleCents: 5000 },
  { totalCents: 150000, usedBeforeCents: 0, remainingCents: 77500, consumedInScheduleCents: 72500 },
  [crownY2],
  { fee: 150000, insurer: 72500, patient: 77500 },
);

const BASELINE_SCHEDULE_ID = "p1:y1:2026-10-15|p2:y1:2026-10-16|p3:y1:2026-10-17|p4:y1:2026-11-15";
const CROWN_LATER_SCHEDULE_ID = "p1:y1:2026-10-15|p2:y1:2026-10-16|p3:y1:2026-10-17|p4:y2:2027-01-08";
const NEXT_YEAR_ASSUMPTIONS = [planPaths.rulesUnchanged, planPaths.alreadyUsed("y2"), planPaths.deductibleSatisfied("y2")];

function record(
  revision: number,
  kind: "baseline" | "candidate",
  scheduleId: string,
  crownYear: BenefitYearId,
  ledgers: [BenefitYearLedger, BenefitYearLedger],
  totals: { insurer: number; patient: number },
): CalculationRecord {
  return {
    id: `cw-1:r${revision}:${scheduleId}`,
    engineVersion: "cw-1",
    inputRevision: revision,
    schedule: {
      id: scheduleId,
      kind,
      assignments: [
        { procedureId: "p1", benefitYearId: "y1", serviceDate: "2026-10-15" },
        { procedureId: "p2", benefitYearId: "y1", serviceDate: "2026-10-16" },
        { procedureId: "p3", benefitYearId: "y1", serviceDate: "2026-10-17" },
        { procedureId: "p4", benefitYearId: crownYear, serviceDate: crownYear === "y1" ? "2026-11-15" : "2027-01-08" },
      ],
    },
    ledgers,
    totalFeeCents: 205000,
    totalInsurerCents: totals.insurer,
    totalPatientCents: totals.patient,
    assumptionFieldPaths: crownYear === "y2" ? NEXT_YEAR_ASSUMPTIONS : [],
  };
}

/** Gate A baseline: all care this year. $1,500 patient / $550 plan. */
function canonicalBaseline(revision: number): CalculationRecord {
  const y1 = ledger(
    "y1",
    { totalCents: 5000, satisfiedBeforeCents: 5000, remainingCents: 0, appliedInScheduleCents: 0 },
    { totalCents: 150000, usedBeforeCents: 110000, remainingCents: 0, consumedInScheduleCents: 40000 },
    [
      cleaningY1(40000),
      fillingY1("p2", 1, "2026-10-16", 40000, 24000),
      fillingY1("p3", 2, "2026-10-17", 24000, 8000),
      trace({
        procedureId: "p4", benefitYearId: "y1", serviceDate: "2026-11-15", processingIndex: 3,
        feeCents: 150000, insurerBasisPoints: 5000, deductibleApplies: true, annualMaximumApplies: true,
        deductibleBeforeCents: 0, deductibleAppliedCents: 0, deductibleAfterCents: 0, eligibleAfterDeductibleCents: 150000,
        potentialInsurerCents: 75000, maximumBeforeCents: 8000, maximumConsumedCents: 8000, maximumAfterCents: 0,
        insurerCents: 8000, patientCents: 142000, patientCoinsuranceCents: 75000, patientDueToMaximumCents: 67000,
      }),
    ],
    { fee: 205000, insurer: 55000, patient: 150000 },
  );
  return record(revision, "baseline", BASELINE_SCHEDULE_ID, "y1", [y1, untouchedNextYear], { insurer: 55000, patient: 150000 });
}

/** Gate A alternative: crown in next year's approved window. $855 patient / $1,195 plan. */
function canonicalCrownLater(revision: number): CalculationRecord {
  const y1 = ledger(
    "y1",
    { totalCents: 5000, satisfiedBeforeCents: 5000, remainingCents: 0, appliedInScheduleCents: 0 },
    { totalCents: 150000, usedBeforeCents: 110000, remainingCents: 8000, consumedInScheduleCents: 32000 },
    [cleaningY1(40000), fillingY1("p2", 1, "2026-10-16", 40000, 24000), fillingY1("p3", 2, "2026-10-17", 24000, 8000)],
    { fee: 55000, insurer: 47000, patient: 8000 },
  );
  return record(revision, "candidate", CROWN_LATER_SCHEDULE_ID, "y2", [y1, crownNextYear], { insurer: 119500, patient: 85500 });
}

/** Gate C baseline: no prior payments this year. $830 patient / $1,220 plan. */
function fullAllowanceBaseline(revision: number): CalculationRecord {
  const y1 = ledger(
    "y1",
    { totalCents: 5000, satisfiedBeforeCents: 5000, remainingCents: 0, appliedInScheduleCents: 0 },
    { totalCents: 150000, usedBeforeCents: 0, remainingCents: 43000, consumedInScheduleCents: 107000 },
    [
      cleaningY1(150000),
      fillingY1("p2", 1, "2026-10-16", 150000, 134000),
      fillingY1("p3", 2, "2026-10-17", 134000, 118000),
      trace({
        procedureId: "p4", benefitYearId: "y1", serviceDate: "2026-11-15", processingIndex: 3,
        feeCents: 150000, insurerBasisPoints: 5000, deductibleApplies: true, annualMaximumApplies: true,
        deductibleBeforeCents: 0, deductibleAppliedCents: 0, deductibleAfterCents: 0, eligibleAfterDeductibleCents: 150000,
        potentialInsurerCents: 75000, maximumBeforeCents: 118000, maximumConsumedCents: 75000, maximumAfterCents: 43000,
        insurerCents: 75000, patientCents: 75000, patientCoinsuranceCents: 75000, patientDueToMaximumCents: 0,
      }),
    ],
    { fee: 205000, insurer: 122000, patient: 83000 },
  );
  return record(revision, "baseline", BASELINE_SCHEDULE_ID, "y1", [y1, untouchedNextYear], { insurer: 122000, patient: 83000 });
}

/** Gate C later crown: feasible but not cheaper. $855 patient. */
function fullAllowanceCrownLater(revision: number): CalculationRecord {
  const y1 = ledger(
    "y1",
    { totalCents: 5000, satisfiedBeforeCents: 5000, remainingCents: 0, appliedInScheduleCents: 0 },
    { totalCents: 150000, usedBeforeCents: 0, remainingCents: 118000, consumedInScheduleCents: 32000 },
    [cleaningY1(150000), fillingY1("p2", 1, "2026-10-16", 150000, 134000), fillingY1("p3", 2, "2026-10-17", 134000, 118000)],
    { fee: 55000, insurer: 47000, patient: 8000 },
  );
  return record(revision, "candidate", CROWN_LATER_SCHEDULE_ID, "y2", [y1, crownNextYear], { insurer: 119500, patient: 85500 });
}

export function fixtureComparison(name: FixtureScenarioName, revision: number): ScenarioComparison {
  switch (name) {
    case "canonical": {
      const baseline = canonicalBaseline(revision);
      const later = canonicalCrownLater(revision);
      return {
        inputRevision: revision, baseline, best: later, cheaperAlternative: later, patientReductionCents: 64500,
        feasibleRecords: [baseline, later], rejectedCandidates: [], status: "cheaperPermittedAlternative",
      };
    }
    case "deadline": {
      const baseline = canonicalBaseline(revision);
      return {
        inputRevision: revision, baseline, best: baseline, cheaperAlternative: null, patientReductionCents: 0,
        feasibleRecords: [baseline],
        rejectedCandidates: [{ assignmentKey: "p1:y1|p2:y1|p3:y1|p4:y2", issueCodes: ["AFTER_DEADLINE"], procedureIds: ["p4"] }],
        status: "baselineBest",
      };
    }
    case "fullCurrentAllowance": {
      const baseline = fullAllowanceBaseline(revision);
      const later = fullAllowanceCrownLater(revision);
      return {
        inputRevision: revision, baseline, best: baseline, cheaperAlternative: null, patientReductionCents: 0,
        feasibleRecords: [baseline, later], rejectedCandidates: [], status: "baselineBest",
      };
    }
    case "unknownPermission": {
      const baseline = canonicalBaseline(revision);
      return {
        inputRevision: revision, baseline, best: baseline, cheaperAlternative: null, patientReductionCents: 0,
        feasibleRecords: [baseline], rejectedCandidates: [], status: "baselineBest",
      };
    }
  }
}
