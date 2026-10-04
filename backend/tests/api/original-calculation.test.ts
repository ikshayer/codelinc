import { describe,expect,it } from "vitest";
import { calculateRequest } from "../../src/api/calculate";
import { compareAnalysis } from "../../src/analysis/compare";
import { originalScenario } from "../analysis/helpers";

describe("original user flow deterministic calculation",() => {
  it("prices the original confirmed sample rather than canonical backend demo facts",() => {
    const result=compareAnalysis(originalScenario());
    expect(result.baseline.totalFeeCents).toBe(205000);
    expect(result.baseline.totalPatientCents).toBe(150000);
    expect(result.best.totalPatientCents).toBe(85500);
    expect(result.patientReductionCents).toBe(64500);
    expect(result.best.schedule.assignments.find((a) => a.procedureId==="p4")!.serviceDate).toBe("2027-01-08");
    expect(result.planning.model).toBe("confirmed-in-network-assumptions");
  });
  it("uses confirmed fee and coverage edits without substituting fixtures",() => {
    const scenario=originalScenario();
    scenario.procedures[3].contractedFeeCents=100000;
    const first=compareAnalysis(scenario);
    expect(first.baseline.totalFeeCents).toBe(155000);
    expect(first.best.totalPatientCents).toBe(60500);
    for(const y of scenario.plan.years) y.rules.major.insurerBasisPoints=8000;
    const second=compareAnalysis(scenario);
    expect(second.best.totalPatientCents).toBe(32000);
  });
  it("reconciles every line, ledger, total and patient component in integer cents",() => {
    const result=compareAnalysis(originalScenario());
    for(const record of result.feasibleRecords) {
      expect(record.totalFeeCents).toBe(record.totalInsurerCents+record.totalPatientCents);
      for(const ledger of record.ledgers) {
        expect(ledger.totalFeeCents).toBe(ledger.totalInsurerCents+ledger.totalPatientCents);
        for(const line of ledger.procedures) {
          expect(line.feeCents).toBe(line.insurerCents+line.patientCents);
          expect(line.patientCents).toBe(line.deductibleAppliedCents+line.patientCoinsuranceCents+line.patientDueToMaximumCents);
          expect(Number.isSafeInteger(line.patientCents)).toBe(true);
        }
      }
    }
  });
  it("honors deadlines and unknown timing permission",() => {
    const scenario=originalScenario(); scenario.procedures[3].deadline="2026-12-31";
    const result=compareAnalysis(scenario);
    expect(result.best.totalPatientCents).toBe(150000);
    expect(result.rejectedCandidates.some((c) => c.issueCodes.includes("AFTER_DEADLINE"))).toBe(true);
    scenario.procedures[3].timingPermission="unknown"; scenario.procedures[3].windows=[];
    expect(compareAnalysis(scenario).best.schedule.assignments.find((a) => a.procedureId==="p4")!.serviceDate).toBe("2026-11-15");
  });
  it("pins one returned service date, preserves it, and unpin returns the recommendation",() => {
    const scenario=originalScenario();
    const pinned=compareAnalysis(scenario,{schedule_locks:[{procedureId:"p4",serviceDate:"2026-11-15"}]});
    expect(pinned.best.schedule.assignments.find((a) => a.procedureId==="p4")!.serviceDate).toBe("2026-11-15");
    expect(pinned.planning.records.find((r) => r.recordId===pinned.best.id)!.events.find((e) => e.procedureId==="p4")!.userLocked).toBe(true);
    expect(compareAnalysis(scenario,{schedule_locks:[]})).toEqual(compareAnalysis(scenario));
    expect(() => compareAnalysis(scenario,{schedule_locks:[{procedureId:"p4",serviceDate:"2028-01-01"}]})).toThrow("outside");
    expect(() => compareAnalysis(scenario,{schedule_locks:[{procedureId:"p4",serviceDate:"2026-11-15"},{procedureId:"p4",serviceDate:"2026-12-01"}]})).toThrow("distinct");
  });
  it("reranks earliest safe completion and reports real cash funding shortfall",() => {
    const scenario=originalScenario();
    expect(compareAnalysis(scenario,{mode:"EARLIEST_SAFE_COMPLETION"}).best.schedule.assignments.find((a) => a.procedureId==="p4")!.serviceDate).toBe("2026-11-15");
    const limited=compareAnalysis(scenario,{budget:{hardMonthlyLimitCents:40000,preferredMonthlyLimitCents:20000}});
    expect(limited.planning.status).toBe("BUDGET_SHORTFALL");
    expect(limited.planning.records.find((r) => r.recordId===limited.best.id)!.fundingGapCents).toBe(37500);
  });
  it("spreads flexible approved visits across months to meet the hard monthly budget",() => {
    const scenario=originalScenario();
    scenario.procedures=scenario.procedures.slice(1,3).map((p) => ({...p,contractedFeeCents:10000,anchorDate:"2026-10-16",deadline:"2026-12-31",windows:[{...p.windows[0],earliestDate:"2026-10-16",latestDate:"2026-12-31"}]}));
    scenario.dependencies=[];
    for(const y of scenario.plan.years) y.rules.basic.insurerBasisPoints=0;
    const result=compareAnalysis(scenario,{mode:"SMOOTHEST_PAYMENTS",budget:{hardMonthlyLimitCents:10000,preferredMonthlyLimitCents:10000}});
    const detail=result.planning.records.find((r) => r.recordId===result.best.id)!;
    expect(detail.fundingGapCents).toBe(0);
    expect(detail.monthly).toHaveLength(2);
    expect(detail.peakMonthlyCashCents).toBe(10000);
    expect(result.planning.status).toBe("OK");
  });
  it("uses service date and stable procedure-id order for same-day financial processing",() => {
    const scenario=originalScenario(); scenario.procedures=scenario.procedures.slice(1,3).reverse(); scenario.dependencies=[];
    scenario.procedures=scenario.procedures.map((p) => ({...p,anchorDate:"2026-10-16",deadline:"2026-10-16",windows:[{...p.windows[0],earliestDate:"2026-10-16",latestDate:"2026-10-16"}]}));
    const result=compareAnalysis(scenario);
    expect(result.baseline.ledgers[0].procedures.map((p) => p.procedureId)).toEqual(["p2","p3"]);
  });
  it("returns the original bare comparison contract through calculateRequest and rejects stale/unknown properties",() => {
    const body={requestId:"test",analysisId:"original",revision:0,scenario:originalScenario()};
    expect(calculateRequest(body)).toMatchObject({status:200,body:{inputRevision:0,planning:{syntheticData:true}}});
    expect(calculateRequest({...body,revision:1}).status).toBe(409);
    expect(calculateRequest({...body,engineOptions:{arbitraryProvider:"fake"}}).status).toBe(422);
  });
});
