import { z } from "zod";
import { addDays, applyRateRoundHalfUp, diffDays, sumCents } from "../domain";
import { Cents, IsoDate } from "../domain/primitives";
import { RecommendationMode } from "../domain/optimizer";
import { MemberIdentity } from "./member-identity";
import type { AnalysisComparison, AnalysisEngineOptions, AnalysisPlanningContext, AnalysisRecordDetail, CalculationRecord, ConfirmedScenario, MemberBenefitAdjustments } from "./types";

const id = z.string().min(1).max(150);
const source = z.strictObject({ kind: z.enum(["userEntry", "userReportedDentist", "syntheticFixture", "aiProposal"]), label: z.string().max(500), quote: z.string().max(4000).nullable() });
const category = z.enum(["preventive", "basic", "major"]);
const rule = z.strictObject({ category, insurerBasisPoints: z.number().int().min(0).max(10000), deductibleApplies: z.boolean(), annualMaximumApplies: z.boolean() });
const rules = z.strictObject({ preventive: rule, basic: rule, major: rule });
const year = z.strictObject({ id: z.enum(["y1", "y2"]), label: z.string().max(120), startsOn: IsoDate, endsOn: IsoDate, annualMaximumCents: Cents, deductibleCents: Cents,
  utilization: z.strictObject({ priorInsurerPaymentsCents: Cents, priorDeductibleSatisfiedCents: Cents, pendingClaims: z.literal("none") }), rules, ruleStatus: z.enum(["suppliedConfirmed", "assumedUnchangedConfirmed"]) });
export const ConfirmedAnalysisScenario = z.strictObject({ revision: z.number().int().nonnegative(), plan: z.strictObject({ id: z.literal("demo-ppo"), type: z.literal("simplePPO"), currency: z.literal("USD"), network: z.literal("inNetwork"), secondaryCoverage: z.literal(false), rollover: z.literal(false), years: z.tuple([year, year]) }),
  procedures: z.array(z.strictObject({ id, label: z.string().min(1).max(200), category, contractedFeeCents: Cents, eligibilityConfirmed: z.literal(true), anchorDate: IsoDate, timingPermission: z.enum(["dentistApproved", "unknown"]), windows: z.array(z.strictObject({ benefitYearId: z.enum(["y1", "y2"]), earliestDate: IsoDate, latestDate: IsoDate, source })).max(2), deadline: IsoDate.nullable() })).min(1).max(4),
  dependencies: z.array(z.strictObject({ beforeProcedureId: id, afterProcedureId: id, minGapDays: z.number().int().min(0).max(366), source })).max(12),
  facts: z.array(z.strictObject({ fieldPath: z.string().max(256), value: z.unknown(), source, confirmedAtRevision: z.number().int().nonnegative() })).max(200),
});
export const AnalysisOptions = z.strictObject({ mode: RecommendationMode.optional(), schedule_locks: z.array(z.strictObject({ procedureId: id, serviceDate: IsoDate })).max(4).optional(), budget: z.strictObject({ hardMonthlyLimitCents: Cents, preferredMonthlyLimitCents: Cents }).optional() });
export const AnalysisCalculateRequest = z.strictObject({ requestId: id, analysisId: id, revision: z.number().int().nonnegative(), scenario: ConfirmedAnalysisScenario, engineOptions: AnalysisOptions.optional(), memberIdentity: MemberIdentity.optional() });

export class AnalysisInputError extends Error { constructor(message: string, readonly fieldPath: string) { super(message); } }
const fail = (message: string, fieldPath: string): never => { throw new AnalysisInputError(message, fieldPath); };
type Assignment = CalculationRecord["schedule"]["assignments"][number];
type Placement = { procedureId: string; benefitYearId: "y1" | "y2"; earliest: string; latest: string };
const compareStrings = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const order = (a: Assignment, b: Assignment) => compareStrings(a.serviceDate, b.serviceDate) || compareStrings(a.procedureId, b.procedureId);
const key = (assignments: Assignment[]) => [...assignments].sort((a, b) => compareStrings(a.procedureId, b.procedureId)).map((a) => `${a.procedureId}:${a.benefitYearId}:${a.serviceDate}`).join("|");
const periodOf = (scenario: ConfirmedScenario, date: string) => scenario.plan.years.find((y) => y.startsOn <= date && date <= y.endsOn);

function validate(scenario: ConfirmedScenario, options: AnalysisEngineOptions) {
  const ids = new Set(scenario.procedures.map((p) => p.id));
  if (ids.size !== scenario.procedures.length) fail("Procedure identifiers must be distinct.", "scenario.procedures");
  const [first, second] = scenario.plan.years;
  if (first.id !== "y1" || second.id !== "y2" || first.endsOn >= second.startsOn) fail("The two benefit years must be ordered and cannot overlap.", "scenario.plan.years");
  for (const y of scenario.plan.years) {
    if (y.startsOn >= y.endsOn || diffDays(y.startsOn, y.endsOn) > 366) fail("Each benefit year must be a valid period of at most 367 days.", `scenario.plan.${y.id}`);
    if (y.utilization.priorInsurerPaymentsCents > y.annualMaximumCents || y.utilization.priorDeductibleSatisfiedCents > y.deductibleCents) fail("Settled usage cannot exceed the corresponding benefit limit.", `scenario.plan.${y.id}.utilization`);
    for (const category of ["preventive", "basic", "major"] as const) if (y.rules[category].category !== category) fail("Coverage category rules do not match their keys.", `scenario.plan.${y.id}.rules`);
  }
  for (const p of scenario.procedures) {
    if (!periodOf(scenario, p.anchorDate) || (p.deadline && p.anchorDate > p.deadline)) fail("The planned date must be inside a benefit year and before the dentist's deadline.", `care.${p.id}.anchorDate`);
    if (new Set(p.windows.map((w) => w.benefitYearId)).size !== p.windows.length) fail("Only one approved window per benefit year is supported.", `timing.${p.id}`);
    for (const w of p.windows) if (w.earliestDate > w.latestDate || periodOf(scenario, w.earliestDate)?.id !== w.benefitYearId || periodOf(scenario, w.latestDate)?.id !== w.benefitYearId) fail("Approved windows must stay inside their named benefit year.", `timing.${p.id}`);
    if (p.timingPermission === "dentistApproved" && (!p.windows.length || !p.windows.some((w) => w.earliestDate <= p.anchorDate && p.anchorDate <= w.latestDate))) fail("The planned date must be within an approved window.", `timing.${p.id}`);
  }
  for (const d of scenario.dependencies) if (!ids.has(d.beforeProcedureId) || !ids.has(d.afterProcedureId) || d.beforeProcedureId === d.afterProcedureId) fail("Dependencies must reference two different procedures in this plan.", "scenario.dependencies");
  const visit = (id: string, chain: Set<string>): void => {
    if (chain.has(id)) fail("Clinical dependencies cannot contain a cycle.", "scenario.dependencies");
    const next = new Set(chain).add(id);
    for (const d of scenario.dependencies.filter((d) => d.afterProcedureId === id)) visit(d.beforeProcedureId, next);
  };
  for (const id of ids) visit(id, new Set());
  const locked = new Set<string>();
  for (const lock of options.schedule_locks ?? []) {
    if (locked.has(lock.procedureId) || !ids.has(lock.procedureId)) fail("Each pin must refer to one distinct procedure in this plan.", "engineOptions.schedule_locks");
    const p = scenario.procedures.find((p) => p.id === lock.procedureId)!;
    if ((p.timingPermission === "unknown" && lock.serviceDate !== p.anchorDate) || (p.deadline && lock.serviceDate > p.deadline) || (p.timingPermission === "dentistApproved" && !p.windows.some((w) => w.earliestDate <= lock.serviceDate && lock.serviceDate <= w.latestDate))) fail("The pinned date is outside the dentist-approved dates. Unpin it or review the timing details.", "engineOptions.schedule_locks");
    locked.add(lock.procedureId);
  }
  if (options.budget && options.budget.preferredMonthlyLimitCents > options.budget.hardMonthlyLimitCents) fail("The preferred monthly target cannot exceed the hard monthly limit.", "engineOptions.budget");
}

/** Financial records use the engine's shared cent rounding, chronological service dates, and independent annual ledgers. */
function calculate(scenario: ConfirmedScenario, assignments: Assignment[], baseline: boolean, adjustments?: MemberBenefitAdjustments): CalculationRecord {
  const ordered = [...assignments].sort(order);
  const ledgers = scenario.plan.years.map((y) => ({ benefitYearId: y.id,
    deductible: { totalCents:y.deductibleCents, satisfiedBeforeCents:y.utilization.priorDeductibleSatisfiedCents, remainingCents:y.deductibleCents - y.utilization.priorDeductibleSatisfiedCents, appliedInScheduleCents:0 },
    maximum: { totalCents:y.annualMaximumCents, usedBeforeCents:y.utilization.priorInsurerPaymentsCents, remainingCents:Math.max(0, y.annualMaximumCents - y.utilization.priorInsurerPaymentsCents - (y.id === "y1" ? adjustments?.pendingReserveCents ?? 0 : 0)), consumedInScheduleCents:0,
      ...(adjustments && y.id === "y1" ? { reservedBeforeCents: Math.min(adjustments.pendingReserveCents, Math.max(0, y.annualMaximumCents - y.utilization.priorInsurerPaymentsCents)) } : {}) }, procedures:[], totalFeeCents:0, totalInsurerCents:0, totalPatientCents:0 })) as unknown as CalculationRecord["ledgers"];
  for (const [processingIndex, a] of ordered.entries()) {
    const p = scenario.procedures.find((p) => p.id === a.procedureId)!;
    const y = scenario.plan.years.find((y) => y.id === a.benefitYearId)!;
    const ledger = ledgers.find((l) => l.benefitYearId === y.id)!;
    const rule = y.rules[p.category];
    const deductibleBeforeCents = ledger.deductible.remainingCents;
    const deductibleAppliedCents = rule.deductibleApplies ? Math.min(p.contractedFeeCents, deductibleBeforeCents) : 0;
    const eligibleAfterDeductibleCents = p.contractedFeeCents - deductibleAppliedCents;
    const potentialInsurerCents = applyRateRoundHalfUp(eligibleAfterDeductibleCents, rule.insurerBasisPoints);
    const maximumBeforeCents = ledger.maximum.remainingCents;
    const insurerCents = rule.annualMaximumApplies ? Math.min(potentialInsurerCents, maximumBeforeCents) : potentialInsurerCents;
    const maximumConsumedCents = rule.annualMaximumApplies ? insurerCents : 0;
    ledger.deductible.remainingCents -= deductibleAppliedCents;
    ledger.deductible.appliedInScheduleCents += deductibleAppliedCents;
    ledger.maximum.remainingCents -= maximumConsumedCents;
    ledger.maximum.consumedInScheduleCents += maximumConsumedCents;
    const patientCents = p.contractedFeeCents - insurerCents;
    ledger.procedures.push({ ...a, processingIndex, feeCents:p.contractedFeeCents, insurerBasisPoints:rule.insurerBasisPoints, deductibleApplies:rule.deductibleApplies, annualMaximumApplies:rule.annualMaximumApplies,
      deductibleBeforeCents, deductibleAppliedCents, deductibleAfterCents:ledger.deductible.remainingCents, eligibleAfterDeductibleCents, potentialInsurerCents, maximumBeforeCents, maximumConsumedCents, maximumAfterCents:ledger.maximum.remainingCents, insurerCents, patientCents,
      patientCoinsuranceCents:eligibleAfterDeductibleCents - potentialInsurerCents, patientDueToMaximumCents:potentialInsurerCents - insurerCents,
      ruleFieldPaths:[`care.${p.id}.fee`, `plan.rules.${p.category}.insurerPercent`, `plan.rules.${p.category}.deductibleApplies`, `plan.rules.${p.category}.maximumApplies`, `plan.${y.id}.deductible`, `plan.${y.id}.annualMaximum`] });
    ledger.totalFeeCents = sumCents([ledger.totalFeeCents, p.contractedFeeCents]);
    ledger.totalInsurerCents = sumCents([ledger.totalInsurerCents, insurerCents]);
    ledger.totalPatientCents = sumCents([ledger.totalPatientCents, patientCents]);
  }
  const scheduleId = key(ordered);
  const assumptionFieldPaths = ordered.some((a) => a.benefitYearId === "y2") ? ["plan.y2.alreadyUsed", "plan.y2.deductibleSatisfied", ...(scenario.plan.years[1].ruleStatus === "assumedUnchangedConfirmed" ? ["plan.y2.rulesUnchanged"] : [])] : [];
  return { id:`cw-1:r${scenario.revision}:${scheduleId}`, engineVersion:"cw-1", inputRevision:scenario.revision, schedule:{ id:scheduleId, kind:baseline ? "baseline" : "candidate", assignments:ordered }, ledgers,
    totalFeeCents:sumCents(ledgers.map((l) => l.totalFeeCents)), totalInsurerCents:sumCents(ledgers.map((l) => l.totalInsurerCents)), totalPatientCents:sumCents(ledgers.map((l) => l.totalPatientCents)), assumptionFieldPaths };
}

function dependenciesFit(scenario: ConfirmedScenario, assignments: Assignment[]) {
  return scenario.dependencies.every((d) => diffDays(assignments.find((a) => a.procedureId === d.beforeProcedureId)!.serviceDate, assignments.find((a) => a.procedureId === d.afterProcedureId)!.serviceDate) >= d.minGapDays);
}

function recordDetail(_scenario: ConfirmedScenario, record: CalculationRecord, baseline: CalculationRecord, options: AnalysisEngineOptions, adjustments?: MemberBenefitAdjustments): AnalysisRecordDetail {
  const used = new Map<string, number>();
  let fundingGapCents = 0;
  const events = record.ledgers.flatMap((l) => l.procedures).sort((a, b) => a.processingIndex - b.processingIndex).map((line) => {
    const month = line.serviceDate.slice(0, 7);
    const available = options.budget ? Math.max(0, options.budget.hardMonthlyLimitCents - (used.get(month) ?? 0)) : line.patientCents;
    const amountCents = Math.min(available, line.patientCents), shortfallCents = line.patientCents - amountCents;
    used.set(month, (used.get(month) ?? 0) + line.patientCents);
    fundingGapCents += shortfallCents;
    const operand = (name:string, value:number, unit:"cents"|"basisPoints" = "cents") => ({ name,value,unit });
    return { procedureId:line.procedureId, serviceDate:line.serviceDate, benefitYearId:line.benefitYearId, userLocked:(options.schedule_locks ?? []).some((lock) => lock.procedureId === line.procedureId && lock.serviceDate === line.serviceDate),
      funding:amountCents > 0 ? [{ sourceType:"CASH" as const, paymentDate:line.serviceDate, amountCents, feesCents:0 }] : [], shortfallCents,
      benefitsAfter:{ deductibleRemainingCents:line.deductibleAfterCents, annualMaximumRemainingCents:line.maximumAfterCents },
      issues:[...(shortfallCents ? ["This visit exceeds the cash available under your hard monthly limit."] : []), ...(line.patientDueToMaximumCents ? ["The annual maximum limits the modeled plan payment for this visit."] : [])],
      calculationSteps:[
        ...(adjustments && line.benefitYearId === "y1" ? [{ label:"Available base maximum before this visit", formula:"max(0, base maximum - settled plan payments - pending reserve - prior scheduled maximum use)", operands:[operand("base maximum",record.ledgers[0].maximum.totalCents),operand("settled plan payments",record.ledgers[0].maximum.usedBeforeCents),operand("projected pending reserve",adjustments.pendingReserveCents),operand("prior scheduled maximum use",Math.max(0,record.ledgers[0].maximum.totalCents - record.ledgers[0].maximum.usedBeforeCents - Math.min(adjustments.pendingReserveCents, Math.max(0,record.ledgers[0].maximum.totalCents - record.ledgers[0].maximum.usedBeforeCents)) - line.maximumBeforeCents))], resultCents:line.maximumBeforeCents }] : []),
        { label:"Deductible applied", formula:line.deductibleApplies ? "min(fee, deductible remaining)" : "0 (deductible does not apply)", operands:[operand("fee",line.feeCents),operand("deductible remaining",line.deductibleBeforeCents)], resultCents:line.deductibleAppliedCents },
        { label:"Eligible after deductible", formula:"fee - deductible applied", operands:[operand("fee",line.feeCents),operand("deductible applied",line.deductibleAppliedCents)], resultCents:line.eligibleAfterDeductibleCents },
        { label:"Potential plan payment", formula:"round_half_up(eligible after deductible × share / 10000)", operands:[operand("eligible after deductible",line.eligibleAfterDeductibleCents),operand("share",line.insurerBasisPoints,"basisPoints")], resultCents:line.potentialInsurerCents },
        { label:"Plan pays", formula:line.annualMaximumApplies ? "min(potential payment, maximum remaining)" : "potential payment (not subject to maximum)", operands:[operand("potential payment",line.potentialInsurerCents),operand("maximum remaining",line.maximumBeforeCents)], resultCents:line.insurerCents },
        { label:"You pay", formula:"fee - plan pays", operands:[operand("fee",line.feeCents),operand("plan pays",line.insurerCents)], resultCents:line.patientCents },
      ] };
  });
  const monthly = [...used].sort(([a],[b]) => compareStrings(a,b)).map(([month,cashCents]) => ({ month,cashCents, exceedsHard:!!options.budget && cashCents > options.budget.hardMonthlyLimitCents, exceedsPreferred:!!options.budget && cashCents > options.budget.preferredMonthlyLimitCents }));
  const baselineMonthly = new Map<string,number>();
  for (const line of baseline.ledgers.flatMap((l) => l.procedures)) { const m=line.serviceDate.slice(0,7); baselineMonthly.set(m,(baselineMonthly.get(m) ?? 0)+line.patientCents); }
  const completion = record.schedule.assignments.map((a) => a.serviceDate).sort().at(-1)!;
  const baselineCompletion = baseline.schedule.assignments.map((a) => a.serviceDate).sort().at(-1)!;
  const peak = Math.max(...monthly.map((m) => m.cashCents));
  return { recordId:record.id, completionDate:completion, peakMonthlyCashCents:peak, fundingGapCents, monthly, events,
    differenceFromBaseline:{ patientDeltaCents:record.totalPatientCents - baseline.totalPatientCents, insurerDeltaCents:record.totalInsurerCents - baseline.totalInsurerCents, peakMonthlyCashDeltaCents:peak - Math.max(...baselineMonthly.values()), completionShiftDays:diffDays(baselineCompletion,completion),
      serviceDateChanges:record.schedule.assignments.flatMap((a) => { const b=baseline.schedule.assignments.find((b) => b.procedureId===a.procedureId)!; return b.serviceDate===a.serviceDate ? [] : [{procedureId:a.procedureId,baselineDate:b.serviceDate,serviceDate:a.serviceDate,shiftDays:diffDays(b.serviceDate,a.serviceDate)}]; }) },
    issues:[...(fundingGapCents ? ["This schedule has a funding shortfall under your hard monthly cash limit."] : []), ...(record.assumptionFieldPaths.length ? ["Next-year estimates rely on the confirmed utilization and rule assumptions."] : [])] };
}

/** Enumerate benefit-year choices and every financial ordering for up to four procedures. */
export function compareAnalysis(scenario: ConfirmedScenario, options: AnalysisEngineOptions = {}, adjustments?: MemberBenefitAdjustments): AnalysisComparison {
  validate(scenario, options);
  const baselineAssignments = scenario.procedures.map((p) => ({ procedureId:p.id, benefitYearId:periodOf(scenario,p.anchorDate)!.id, serviceDate:p.anchorDate }));
  if (!dependenciesFit(scenario,baselineAssignments)) fail("Planned dates do not satisfy the dentist-confirmed dependencies.", "scenario.dependencies");
  const baseline = calculate(scenario,baselineAssignments,true,adjustments);
  const locks = new Map((options.schedule_locks ?? []).map((lock) => [lock.procedureId,lock.serviceDate]));
  const candidates = new Map<string,CalculationRecord>();
  const accepted = (assignments:Assignment[]) => {
    if (!dependenciesFit(scenario,assignments) || assignments.some((a) => locks.has(a.procedureId) && locks.get(a.procedureId)!==a.serviceDate)) return;
    const record=calculate(scenario,assignments,key(assignments)===baseline.schedule.id,adjustments); candidates.set(record.id,record);
  };
  if (!locks.size || baselineAssignments.every((a) => !locks.has(a.procedureId) || locks.get(a.procedureId)===a.serviceDate)) accepted(baselineAssignments);
  const rejectedCandidates: AnalysisComparison["rejectedCandidates"] = [];
  let evaluated=1;
  let bounded=false;
  const searchLimit=50_000;
  const choices=scenario.procedures.map((p) => p.timingPermission==="unknown" ? [{procedureId:p.id,benefitYearId:periodOf(scenario,p.anchorDate)!.id,earliest:p.anchorDate,latest:p.anchorDate}] : p.windows.map((w) => ({procedureId:p.id,benefitYearId:w.benefitYearId,earliest:w.earliestDate,latest:w.latestDate})));
  const yearChoices=(index:number,placements:Placement[]) => {
    if(bounded) return;
    if (index < choices.length) { for (const choice of choices[index]) yearChoices(index+1,[...placements,choice]); return; }
    const permutations=(remaining:Placement[],sorted:Placement[]) => {
      if(bounded) return;
      if (remaining.length) { for (const p of remaining) if (!scenario.dependencies.some((d) => d.afterProcedureId===p.procedureId && remaining.some((r) => r.procedureId===d.beforeProcedureId))) permutations(remaining.filter((r) => r!==p),[...sorted,p]); return; }
      const placeDates=(position:number,assignments:Assignment[]) => {
        if(bounded) return;
        if(position===sorted.length) {
          if(evaluated>=searchLimit) { bounded=true; return; }
          evaluated++;
          accepted(assignments);
          return;
        }
        const placement=sorted[position];
          const p=scenario.procedures.find((p) => p.id===placement.procedureId)!;
          let earliest=placement.earliest;
          for (const dependency of scenario.dependencies.filter((d) => d.afterProcedureId===p.id)) {
            const prior=assignments.find((a) => a.procedureId===dependency.beforeProcedureId)!;
            const required=addDays(prior.serviceDate,dependency.minGapDays); if (required > earliest) earliest=required;
          }
          const previous=assignments.at(-1);
          if (previous) { const required=addDays(previous.serviceDate,compareStrings(p.id,previous.procedureId)<0 ? 1 : 0); if (required > earliest) earliest=required; }
          const pinned=locks.get(p.id);
          const dates=new Set<string>([earliest,p.anchorDate]);
          let month=earliest.slice(0,7);
          for(let months=0;months<14;months++) {
            const [yy,mm]=month.split("-").map(Number);
            const next=new Date(Date.UTC(yy,mm,1)).toISOString().slice(0,10);
            if(next>placement.latest) break;
            dates.add(next); month=next.slice(0,7);
          }
          for(const date of pinned ? [pinned] : [...dates].sort()) {
            if(date<earliest || date>placement.latest) continue;
            if(p.deadline && date>p.deadline) { rejectedCandidates.push({assignmentKey:placements.map((p) => `${p.procedureId}:${p.benefitYearId}`).join("|"),issueCodes:["AFTER_DEADLINE"],procedureIds:[p.id]}); continue; }
            placeDates(position+1,[...assignments,{procedureId:p.id,benefitYearId:placement.benefitYearId,serviceDate:date}]);
          }
      };
      placeDates(0,[]);
    };
    permutations(placements,[]);
  };
  yearChoices(0,[]);
  if (!candidates.size) fail("Pinned dates cannot satisfy the approved windows and dependencies together. Unpin a date to try again.", "engineOptions.schedule_locks");
  const mode=options.mode ?? "BALANCED";
  const details=new Map([...candidates.values(),baseline].map((record) => [record.id,recordDetail(scenario,record,baseline,options,adjustments)]));
  const ranking=(record:CalculationRecord,selectedMode:typeof mode) => {
    const detail=details.get(record.id)!;
    const targetDeviation=record.schedule.assignments.reduce((sum,a) => sum+Math.abs(diffDays(scenario.procedures.find((p) => p.id===a.procedureId)!.anchorDate,a.serviceDate)),0);
    const completion=diffDays(scenario.plan.years[0].startsOn,detail.completionDate);
    return [detail.fundingGapCents,...(selectedMode==="EARLIEST_SAFE_COMPLETION" ? [completion,record.totalPatientCents,detail.peakMonthlyCashCents] : selectedMode==="SMOOTHEST_PAYMENTS" ? [detail.peakMonthlyCashCents,record.totalPatientCents,completion] : [record.totalPatientCents,targetDeviation,detail.peakMonthlyCashCents]), record.schedule.id] as (number|string)[];
  };
  const rank=(a:CalculationRecord,b:CalculationRecord,selectedMode:typeof mode) => { const aa=ranking(a,selectedMode),bb=ranking(b,selectedMode); for(let i=0;i<aa.length;i++) { if(aa[i]!==bb[i]) return typeof aa[i]==="number" ? (aa[i] as number)-(bb[i] as number) : compareStrings(aa[i] as string,bb[i] as string); } return 0; };
  const pool=[...candidates.values()];
  const best=[...pool].sort((a,b) => rank(a,b,mode))[0];
  const chosen=new Map<string,{record:CalculationRecord;labels:string[]}>();
  for (const choice of [mode,"LOWEST_TOTAL_COST","EARLIEST_SAFE_COMPLETION","SMOOTHEST_PAYMENTS"] as const) { const winner=[...pool].sort((a,b) => rank(a,b,choice))[0]; const existing=chosen.get(winner.id); if(existing) { if(!existing.labels.includes(choice)) existing.labels.push(choice); } else if(chosen.size<3) chosen.set(winner.id,{record:winner,labels:[choice]}); }
  const records=[baseline,...[...chosen.values()].map((v) => v.record).filter((r) => r.id!==baseline.id)];
  const cheapest=[...pool].sort((a,b) => rank(a,b,"LOWEST_TOTAL_COST"))[0];
  const cheaperAlternative=best.totalPatientCents<baseline.totalPatientCents ? best : null;
  const planning:AnalysisPlanningContext={syntheticData:true,engineVersion:"cw-1",model:"confirmed-in-network-assumptions",mode,locks:options.schedule_locks ?? [],budget:options.budget ?? null,recommendedRecordId:best.id,records:records.map((r) => details.get(r.id)!),alternatives:[...chosen.values()].map((v) => ({recordId:v.record.id,labels:v.labels})),search:{evaluated,feasible:pool.length,bounded},status:details.get(best.id)!.fundingGapCents>0 ? "BUDGET_SHORTFALL" : "OK",issues:[...details.get(best.id)!.issues,...(bounded ? ["Best plan found within the 50,000 modeled-schedule search limit; a global optimum is not established."] : [])],
    limitations:["These are modeled costs from your confirmed in-network fees, plan rules and dentist-approved dates; payer coverage is not independently verified.","Search models approved starts, planned dates, month boundaries, propagated dependencies and pinned dates. It does not enumerate every calendar date.","Service dates are modeled choices, not booked appointments. Provider search, network discounts, cash-versus-claim routes, account funding, rollover and pending claims require facts absent from this intake."]};
  const seenRejections=new Map(rejectedCandidates.map((r) => [JSON.stringify(r),r]));
  return {inputRevision:scenario.revision,baseline,best,cheaperAlternative,patientReductionCents:Math.max(0,baseline.totalPatientCents-best.totalPatientCents),feasibleRecords:records,rejectedCandidates:[...seenRejections.values()],status:cheaperAlternative ? "cheaperPermittedAlternative" : cheapest.id!==baseline.id && cheapest.totalPatientCents===baseline.totalPatientCents ? "equalCost" : "baselineBest",planning};
}
