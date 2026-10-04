import type { ConfirmedScenario } from "../../src/analysis/types";
export function originalScenario(): ConfirmedScenario {
  const source={kind:"syntheticFixture" as const,label:"Reviewed original sample",quote:null};
  const rules={preventive:{category:"preventive" as const,insurerBasisPoints:10000,deductibleApplies:false,annualMaximumApplies:false},basic:{category:"basic" as const,insurerBasisPoints:8000,deductibleApplies:true,annualMaximumApplies:true},major:{category:"major" as const,insurerBasisPoints:5000,deductibleApplies:true,annualMaximumApplies:true}};
  return {revision:0,plan:{id:"demo-ppo",type:"simplePPO",currency:"USD",network:"inNetwork",secondaryCoverage:false,rollover:false,years:[
    {id:"y1",label:"2026 benefit year",startsOn:"2026-01-01",endsOn:"2026-12-31",annualMaximumCents:150000,deductibleCents:5000,utilization:{priorInsurerPaymentsCents:110000,priorDeductibleSatisfiedCents:5000,pendingClaims:"none"},rules:structuredClone(rules),ruleStatus:"suppliedConfirmed"},
    {id:"y2",label:"2027 benefit year",startsOn:"2027-01-01",endsOn:"2027-12-31",annualMaximumCents:150000,deductibleCents:5000,utilization:{priorInsurerPaymentsCents:0,priorDeductibleSatisfiedCents:0,pendingClaims:"none"},rules:structuredClone(rules),ruleStatus:"assumedUnchangedConfirmed"},
  ]},procedures:[
    {id:"p1",label:"Cleaning",category:"preventive",contractedFeeCents:15000,eligibilityConfirmed:true,anchorDate:"2026-10-15",timingPermission:"dentistApproved",windows:[{benefitYearId:"y1",earliestDate:"2026-10-15",latestDate:"2026-10-15",source}],deadline:"2026-10-15"},
    {id:"p2",label:"Filling A",category:"basic",contractedFeeCents:20000,eligibilityConfirmed:true,anchorDate:"2026-10-16",timingPermission:"dentistApproved",windows:[{benefitYearId:"y1",earliestDate:"2026-10-16",latestDate:"2026-10-16",source}],deadline:"2026-10-16"},
    {id:"p3",label:"Filling B",category:"basic",contractedFeeCents:20000,eligibilityConfirmed:true,anchorDate:"2026-10-17",timingPermission:"dentistApproved",windows:[{benefitYearId:"y1",earliestDate:"2026-10-17",latestDate:"2026-10-17",source}],deadline:"2026-10-17"},
    {id:"p4",label:"Crown",category:"major",contractedFeeCents:150000,eligibilityConfirmed:true,anchorDate:"2026-11-15",timingPermission:"dentistApproved",windows:[{benefitYearId:"y1",earliestDate:"2026-11-15",latestDate:"2026-12-15",source},{benefitYearId:"y2",earliestDate:"2027-01-08",latestDate:"2027-01-31",source}],deadline:"2027-01-31"},
  ],dependencies:[{beforeProcedureId:"p2",afterProcedureId:"p4",minGapDays:1,source},{beforeProcedureId:"p3",afterProcedureId:"p4",minGapDays:1,source}],facts:[]};
}
