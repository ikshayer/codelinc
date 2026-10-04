/**
 * Builds contract-v1 mock API responses from the golden numbers so the UX/API/AI
 * agent can build screens before the engines exist (spec §12 workflow step 4).
 * PLANNER-OWNED. Run: `npx tsx scripts/build-mocks.ts`. Output: fixtures/mock-responses/*.json
 *
 * These mocks are NOT engine output: meta.generated_by = "mock". They are validated
 * against the frozen schemas by tests/contracts/fixtures.test.ts. Production code must
 * never import them.
 */
import fs from "node:fs";
import path from "node:path";
import {
  AdjudicationLine,
  Alternative,
  BenefitPassport,
  BenefitPeriodState,
  CalcStep,
  CarePlanResponse,
  CarePlanResult,
  ClaimRoute,
  CONTRACT_VERSION,
  ENGINE_IDS,
  ExplainResponse,
  ExtractResponse,
  HealthResponse,
  MemberState,
  ProcedureRecommendation,
  ProviderOption,
  RolloverOutcome,
  RouteComparison,
  VisitNavigatorResponse,
  PlanOptionsResponse,
  type PassportItem,
  type PlanOptionsResult,
  VisitNavigatorResult,
  VisitOption,
  calcStepId,
  factId,
  issue,
} from "../src/domain";
import memberJson from "../fixtures/synthetic/member.json";
import providersPreJson from "../fixtures/synthetic/providers.previsit.json";
import providersPostJson from "../fixtures/synthetic/providers.postvisit.json";
import proceduresJson from "../fixtures/synthetic/procedures.confirmed.json";

const OUT = path.resolve(import.meta.dirname, "../fixtures/mock-responses");
const member = MemberState.parse(memberJson);
const providersPre = ProviderOption.array().parse(providersPreJson);
const providersPost = ProviderOption.array().parse(providersPostJson);
const procedures = ProcedureRecommendation.array().parse(proceduresJson);
const meta = (id: string) => ({ request_id: `mock-${id}`, generated_by: "mock" as const, synthetic_data: true as const });
const env = <T>(id: string, data: T) => ({ contract_version: CONTRACT_VERSION, ok: true as const, data, meta: meta(id) });
const range = (c: number) => ({ low_cents: c, high_cents: c });

function period(pv: "2026" | "2027", s: Partial<BenefitPeriodState>): BenefitPeriodState {
  const base: BenefitPeriodState =
    pv === "2026"
      ? {
          plan_version_id: "nwd-ppo-standard-2026",
          period_start: "2026-01-01",
          period_end: "2026-12-31",
          opened_from: "snapshot",
          deductible_remaining_cents: 5000,
          annual_max_remaining_cents: 90000,
          pending_reserved_max_cents: 7600,
          pending_reserved_deductible_cents: 5000,
          annual_max_available_cents: 82400,
          deductible_available_cents: 0,
          sublimits: [],
          simulated_plan_paid_cents: 0,
          source: "CLAIM_EOB",
        }
      : {
          plan_version_id: "nwd-ppo-standard-2027",
          period_start: "2027-01-01",
          period_end: "2027-12-31",
          opened_from: "plan_rules",
          deductible_remaining_cents: 7500,
          annual_max_remaining_cents: 150000,
          pending_reserved_max_cents: 0,
          pending_reserved_deductible_cents: 0,
          annual_max_available_cents: 150000,
          deductible_available_cents: 7500,
          sublimits: [],
          simulated_plan_paid_cents: 0,
          source: "PLAN_VERIFIED",
        };
  return { ...base, ...s };
}

interface LineSpec {
  lineId: string;
  procedureId: string;
  code: string;
  tooth: string | null;
  date: string;
  providerId: string;
  route: ClaimRoute;
  year: "2026" | "2027";
  cls: "preventive" | "basic" | "major";
  charge: number;
  allowed: number | null; // in-network allowed or OON allowance
  ded: number;
  bps: number;
  prelim: number;
  plan: number;
  cap: "none" | "annual_maximum";
  before: BenefitPeriodState;
  after: BenefitPeriodState;
}

function line(s: LineSpec): AdjudicationLine {
  const y = s.year;
  const inn = s.route === "IN_NETWORK_CLAIM";
  const self = s.route === "SELF_PAY_NO_CLAIM";
  const prov = s.providerId;
  const code = s.code.toLowerCase();
  const adj = inn ? s.charge - (s.allowed ?? 0) : 0;
  const patient = s.charge - adj;
  const eligible = self ? 0 : inn ? (s.allowed ?? 0) : Math.min(s.charge, s.allowed ?? 0);
  const member = patient - s.plan;
  const countsMax = !self && (s.cls === "basic" || s.cls === "major");
  const rule = (r: string) => factId.rule(`${r}.${y}`);
  const net = inn ? "in_network" : "out_of_network";
  const st = (name: Parameters<typeof calcStepId>[1], label: string, formula: string, ops: CalcStep["operands"], c: number | null, bps: number | null = null): CalcStep => ({
    step_id: calcStepId(s.lineId, name),
    label,
    formula,
    operands: ops,
    result_cents: c,
    result_bps: bps,
    result_text: null,
  });
  const op = (name: string, fact: string, cents: number | null, bps: number | null = null) => ({ name, cents, bps, text: null, fact_id: fact });
  const chargeFact = factId.input(`provider.${prov}.price.${code}.${self ? "cash" : "charge"}`);
  const steps: CalcStep[] = self
    ? [
        st("patient_charge", "Verified cash price", "cash_quote", [op("cash_quote", chargeFact, s.charge)], s.charge),
        st("plan_pay", "Plan pays (no claim submitted)", "0", [op("claim_submission", rule("claim_submission"), null)], 0),
        st("member_responsibility", "You pay", "cash_quote", [op("cash_quote", chargeFact, s.charge)], s.charge),
      ]
    : [
        st("patient_charge", "Patient charge", inn ? "allowed_amount" : "provider_charge", [op(inn ? "allowed_amount" : "provider_charge", factId.input(`provider.${prov}.price.${code}.${inn ? "allowed" : "charge"}`), patient)], patient),
        st("eligible_basis", "Amount the plan recognizes", inn ? "allowed_amount" : "min(provider_charge, oon_allowance)", inn ? [op("allowed_amount", factId.input(`provider.${prov}.price.${code}.allowed`), eligible)] : [op("provider_charge", chargeFact, s.charge), op("oon_allowance", rule("oon_allowance_schedule"), s.allowed)], eligible),
        st("deductible", "Deductible applied", "min(deductible_available, eligible_basis)", [op("deductible_available", y === "2026" ? factId.input("member.acc.2026.deductible_remaining") : rule("deductible"), s.before.deductible_available_cents), op("eligible_basis", factId.calc(calcStepId(s.lineId, "eligible_basis")), eligible)], s.ded),
        st("coverage_rate", "Plan coinsurance", "plan_share rate", [op("rate", rule(`plan_share.${net}.${s.cls}`), null, s.bps)], null, s.bps),
        st("preliminary_plan_pay", "Plan share before the maximum", "round_half_up(rate × (eligible_basis − deductible))", [op("eligible_basis", factId.calc(calcStepId(s.lineId, "eligible_basis")), eligible), op("deductible", factId.calc(calcStepId(s.lineId, "deductible")), s.ded), op("rate", rule(`plan_share.${net}.${s.cls}`), null, s.bps)], s.prelim),
        st("cap", "Annual maximum available", countsMax ? "annual_max_remaining − pending_reserved" : "not counted", countsMax ? [op("annual_max_available", y === "2026" ? factId.input("member.acc.2026.annual_max_remaining") : rule("annual_maximum"), s.before.annual_max_available_cents)] : [op("annual_maximum", rule("annual_maximum"), null)], countsMax ? s.before.annual_max_available_cents : null),
        st("plan_pay", "Plan pays", countsMax ? "min(preliminary, annual_max_available)" : "preliminary", [op("preliminary", factId.calc(calcStepId(s.lineId, "preliminary_plan_pay")), s.prelim)], s.plan),
        st("member_responsibility", "You pay", "patient_charge − plan_pay", [op("patient_charge", factId.calc(calcStepId(s.lineId, "patient_charge")), patient), op("plan_pay", factId.calc(calcStepId(s.lineId, "plan_pay")), s.plan)], member),
        st("contractual_adjustment", "Network discount", inn ? "provider_charge − allowed_amount" : "0", [op("provider_charge", chargeFact, s.charge)], adj),
      ];
  const applied = (self
    ? [`claim_submission.${y}`, `benefit_period.${y}`]
    : [`benefit_period.${y}`, `service_class_map.${s.cls}.${y}`, `plan_share.${net}.${s.cls}.${y}`, `deductible.${y}`, `annual_maximum.${y}`, `limitations_index.${y}`, ...(inn ? [] : [`oon_allowance_schedule.${y}`])]).sort();
  return AdjudicationLine.parse({
    line_id: s.lineId,
    event_id: s.lineId,
    procedure_id: s.procedureId,
    cdt_code: s.code,
    tooth: s.tooth,
    service_date: s.date,
    claim_date: null,
    provider_id: prov,
    network_tier: inn || self ? "in_network" : "out_of_network",
    claim_route: s.route,
    status: "OK",
    plan_version_id: `nwd-ppo-standard-${y}`,
    service_class: s.cls,
    modeled_charge_cents: s.charge,
    contractual_adjustment_cents: adj,
    patient_charge_cents: patient,
    eligible_basis_cents: self ? null : eligible,
    balance_bill_cents: inn || self ? 0 : patient - eligible,
    deductible_applied_cents: self ? 0 : s.ded,
    coverage_rate_bps: self ? null : s.bps,
    preliminary_plan_pay_cents: self ? null : s.prelim,
    cap_applied: self ? "none" : s.cap,
    plan_pay_cents: s.plan,
    member_responsibility_cents: member,
    counts_toward_maximum: countsMax,
    state_before: s.before,
    state_after: s.after,
    applied_rule_ids: applied,
    input_ids: self ? [`provider.${prov}.price.${code}.cash`, `provider.${prov}.self_pay`] : [`provider.${prov}.price.${code}.charge`, ...(inn ? [`provider.${prov}.price.${code}.allowed`] : [])],
    steps,
    issues: [],
  });
}

// ---------------------------------------------------------------- visit navigator
const P1 = "prov-rivera";
const P2 = "prov-brightsmile";
const pre2026 = period("2026", {});
const vLines = (prefix: string, prov: string, route: ClaimRoute, rows: [string, number, number, number][]) =>
  rows.map(([code, charge, allowed, plan], i) =>
    line({ lineId: `${prefix}-l${i + 1}`, procedureId: `visit-${code.toLowerCase()}`, code, tooth: null, date: prefix.includes("rivera") ? "2026-10-15" : "2026-10-08", providerId: prov, route, year: "2026", cls: "preventive", charge, allowed, ded: 0, bps: route === "IN_NETWORK_CLAIM" ? 10000 : 8000, prelim: plan, plan, cap: "none", before: pre2026, after: pre2026 }),
  );
const slotOf = (list: ProviderOption[], prov: string, slotId: string) => list.find((p) => p.provider_id === prov)!.slots.items.find((s) => s.slot_id === slotId)!;
const optRivera: VisitOption = {
  option_id: "opt-prov-rivera",
  labels: ["best_overall", "lowest_cost"],
  status: "OK",
  provider_id: P1,
  location_id: "loc-rivera-fairfax",
  provider_name: "Rivera Family Dentistry (synthetic)",
  network_tier: "in_network",
  network_observed_at: "2026-10-01T15:00:00Z",
  network_stale: false,
  slot: slotOf(providersPre, P1, "prov-rivera-e-20261015-1600"),
  days_until: 10,
  distance_miles: 4.2,
  travel_minutes: 14,
  claim_route: "IN_NETWORK_CLAIM",
  modeled_charge: range(15000),
  plan_pay: range(10500),
  member_cost: range(0),
  deductible_applied: range(0),
  annual_max_used: range(0),
  exceeds_hard_monthly_limit: false,
  tradeoffs: [{ versus_option_id: "opt-prov-brightsmile", cost_delta_cents: -10800, days_delta: 7, miles_delta: 2.1, minutes_delta: 5 }],
  lines: vLines("opt-prov-rivera", P1, "IN_NETWORK_CLAIM", [["D0140", 11000, 7500, 7500], ["D0220", 4000, 3000, 3000]]),
  issues: [],
};
const optBright: VisitOption = {
  ...optRivera,
  option_id: "opt-prov-brightsmile",
  labels: ["soonest"],
  provider_id: P2,
  location_id: "loc-brightsmile-vienna",
  provider_name: "BrightSmile Dental Studio (synthetic)",
  network_tier: "out_of_network",
  slot: slotOf(providersPre, P2, "prov-brightsmile-e-20261008-0900"),
  days_until: 3,
  distance_miles: 2.1,
  travel_minutes: 9,
  claim_route: "OUT_OF_NETWORK_CLAIM",
  modeled_charge: range(18000),
  plan_pay: range(7200),
  member_cost: range(10800),
  tradeoffs: [{ versus_option_id: "opt-prov-rivera", cost_delta_cents: 10800, days_delta: -7, miles_delta: -2.1, minutes_delta: -5 }],
  lines: vLines("opt-prov-brightsmile", P2, "OUT_OF_NETWORK_CLAIM", [["D0140", 13500, 6500, 5200], ["D0220", 4500, 2500, 2000]]),
};
const evidence = (ruleIds: string[]) =>
  ruleIds.map((rule_id) => ({
    rule_id,
    plan_version_id: rule_id.endsWith("2027") ? "nwd-ppo-standard-2027" : "nwd-ppo-standard-2026",
    evidence: [{ source_id: rule_id.endsWith("2027") ? "nwd-ppo-2027-summary" : "nwd-ppo-2026-summary", page: 2, section: "Deductible and Maximums", locator: "mock", quote: "MOCK — see data/sources for the real passage" }],
  }));
const visitResult: VisitNavigatorResult = {
  contract_version: CONTRACT_VERSION,
  engine_id: ENGINE_IDS.optimizer,
  status: "OK",
  as_of: "2026-10-05T14:00:00Z",
  as_of_date: "2026-10-05",
  safety: { urgent: false, triggered_by: [], message: null },
  options: [optRivera, optBright],
  excluded: [{ provider_id: "prov-lakeside", reasons: ["TRAVEL_LIMIT_EXCEEDED"] }],
  conditional_scenarios: [],
  evidence: evidence(["plan_share.in_network.preventive.2026", "plan_share.out_of_network.preventive.2026", "oon_allowance_schedule.2026"]),
  issues: [issue("PENDING_CLAIMS_PRESENT", "info", "A claim from Sep 28, 2026 is still pending; its estimated payment is reserved.", { input_id: "member.pending.claim-2026-0928-d2391.plan_pay" })],
  decision_trace: [{ seq: 0, kind: "INPUT_VALIDATED", message: "mock", data: {} }],
};

// ---------------------------------------------------------------- care plan
const s0 = period("2026", {});
const sRc = period("2026", { annual_max_remaining_cents: 10000, annual_max_available_cents: 2400, simulated_plan_paid_cents: 80000 });
const sCrown = period("2026", { annual_max_remaining_cents: 7600, annual_max_available_cents: 0, simulated_plan_paid_cents: 82400 });
const y27 = period("2027", {});
const y27After = period("2027", { deductible_remaining_cents: 0, deductible_available_cents: 0, annual_max_remaining_cents: 141600, annual_max_available_cents: 141600, simulated_plan_paid_cents: 8400 });
const rcLine = (id: string) => line({ lineId: id, procedureId: "proc-rc-30", code: "D3330", tooth: "30", date: "2026-10-20", providerId: P1, route: "IN_NETWORK_CLAIM", year: "2026", cls: "basic", charge: 145000, allowed: 100000, ded: 0, bps: 8000, prelim: 80000, plan: 80000, cap: "none", before: s0, after: sRc });
const crownLine = (id: string, before: BenefitPeriodState, after: BenefitPeriodState) => line({ lineId: id, procedureId: "proc-crown-30", code: "D2740", tooth: "30", date: "2026-11-05", providerId: P1, route: "IN_NETWORK_CLAIM", year: "2026", cls: "major", charge: 160000, allowed: 110000, ded: 0, bps: 5000, prelim: 55000, plan: 2400, cap: "annual_maximum", before, after });
const fill27 = line({ lineId: "alt-1-e3", procedureId: "proc-fill-14", code: "D2392", tooth: "14", date: "2027-01-05", providerId: P1, route: "IN_NETWORK_CLAIM", year: "2027", cls: "basic", charge: 26000, allowed: 18000, ded: 7500, bps: 8000, prelim: 8400, plan: 8400, cap: "none", before: y27, after: y27After });
const fillSelf = line({ lineId: "alt-2-e2", procedureId: "proc-fill-14", code: "D2392", tooth: "14", date: "2026-10-22", providerId: P1, route: "SELF_PAY_NO_CLAIM", year: "2026", cls: "basic", charge: 15000, allowed: null, ded: 0, bps: 0, prelim: 0, plan: 0, cap: "none", before: sRc, after: sRc });
const fund = (id: string, ev: string, type: "FSA" | "CASH", date: string, cents: number) => ({ allocation_id: `${ev}-f${id.split("-f")[1]}`, event_id: ev, source_id: type === "FSA" ? "fsa-2026" : "cash", source_type: type, payment_date: date, amount_cents: cents, fees_cents: 0, input_id: type === "FSA" ? "member.fsa-2026.balance" : "member.budget" });
const appt = (slot: string) => ({ kind: "REQUEST_APPOINTMENT" as const, provider_id: P1, slot_id: slot, by_date: null });
const ev = (eventId: string, l: AdjudicationLine, slot: string, funding: ReturnType<typeof fund>[], reasons: Alternative["events"][number]["reasons"], extra: Alternative["events"][number]["next_actions"] = [], cmp: RouteComparison | null = null) => ({
  event_id: eventId, procedure_id: l.procedure_id, service_date: l.service_date, slot_id: slot, provider_id: P1, location_id: "loc-rivera-fairfax", claim_route: l.claim_route,
  line_worst: l, line_best: l, member_cost: range(l.member_responsibility_cents!), plan_pay: range(l.plan_pay_cents!), funding, shortfall_cents: 0, reasons, next_actions: [appt(slot), ...extra],
  route_comparison: cmp,
  rollover_shift: null,
});
// (1.5) CONTRACT §3.9 golden 2026 year-close (worst case): $600 settled + simulated + $76 pending ≥ $500 → NOT_EARNED.
// Steps omitted in the mock (the engine emits the ten rollover.<pv>.* steps).
const rollover2026 = (simulated: number): RolloverOutcome => ({
  rule_id: "rollover.2026", closing_plan_version_id: "nwd-ppo-standard-2026", closing_period_end: "2026-12-31", next_plan_version_id: "nwd-ppo-standard-2027",
  status: "NOT_EARNED", threshold_cents: 50000, threshold_comparison: "LT", settled_plan_paid: range(60000), pending_plan_pay_cents: 7600,
  qualifying_plan_paid: { low_cents: 60000 + simulated, high_cents: 67600 + simulated }, base_award_cents: 25000, network_bonus: range(0),
  prior_bank_cents: 0, bank_cap_cents: 100000, final_bank: range(0), lost_to_cap_cents: 0, forfeited_cents: 0, applied_rule_ids: ["rollover.2026"],
  input_ids: ["member.acc.2026.carryover_balance", "member.acc.2026.plan_paid_ytd", "member.pending.claim-2026-0928-d2391.plan_pay"], steps: [], issues: [],
});
// (1.2) CONTRACT §5.9 golden route comparisons for the filling (root canal and crown have no cash quote → null).
const cmpFill27: RouteComparison = {
  claim_route: "IN_NETWORK_CLAIM", claim_total_cents: 137200, cash_total_cents: null, difference_cents: null, winner_claim_route: null,
  missing: [issue("RULE_UNKNOWN", "warning", "The 2027 plan document does not address paying a network dentist without a claim.", { rule_id: "claim_submission.2027", procedure_id: "proc-fill-14" })],
};
const cmpFillSelf: RouteComparison = {
  claim_route: "IN_NETWORK_CLAIM", claim_total_cents: 145600, cash_total_cents: 142600, difference_cents: 3000, winner_claim_route: "SELF_PAY_NO_CLAIM", missing: [],
};
const pte = { kind: "REQUEST_PRETREATMENT_ESTIMATE" as const, provider_id: P1, slot_id: null, by_date: null };
const fsaClaim = { kind: "SUBMIT_FSA_CLAIM" as const, provider_id: null, slot_id: null, by_date: "2027-03-31" };
const altA: Alternative = {
  alternative_id: "alt-1",
  labels: ["lowest_total_cost", "smoothest_monthly_payments"],
  schedule_key: "proc-crown-30@2026-11-05@prov-rivera@IN_NETWORK_CLAIM|proc-fill-14@2027-01-05@prov-rivera@IN_NETWORK_CLAIM|proc-rc-30@2026-10-20@prov-rivera@IN_NETWORK_CLAIM",
  events: [
    ev("alt-1-e1", rcLine("alt-1-e1"), "prov-rivera-t-20261020-0800", [fund("alt-1-f1", "alt-1-e1", "FSA", "2026-10-20", 20000)], ["WITHIN_SAFE_WINDOW", "MEETS_DENTIST_TARGET", "USES_EXPIRING_FUNDS"], [pte, fsaClaim]),
    ev("alt-1-e2", crownLine("alt-1-e2", sRc, sCrown), "prov-rivera-t-20261105-1500", [fund("alt-1-f1", "alt-1-e2", "FSA", "2026-11-05", 100000), fund("alt-1-f2", "alt-1-e2", "CASH", "2026-11-05", 7600)], ["WITHIN_SAFE_WINDOW", "MEETS_DENTIST_TARGET", "HEALING_INTERVAL", "USES_EXPIRING_FUNDS", "FITS_MONTHLY_BUDGET"], [pte, fsaClaim]),
    ev("alt-1-e3", fill27, "prov-rivera-t-20270105-1000", [fund("alt-1-f1", "alt-1-e3", "CASH", "2027-01-05", 9600)], ["WITHIN_SAFE_WINDOW", "MEETS_DENTIST_TARGET", "AFTER_PLAN_RESET", "FITS_MONTHLY_BUDGET"], [], cmpFill27),
  ],
  unscheduled: [],
  totals: { modeled_charge: range(331000), contractual_adjustment: range(103000), plan_pay: range(90800), member_cost: range(137200), fees_cents: 0 },
  funding_gap_cents: 0,
  monthly: [
    { month: "2026-10", cash_cents: 0, by_source: [{ source_type: "FSA", amount_cents: 20000 }], exceeds_preferred: false, exceeds_hard: false },
    { month: "2026-11", cash_cents: 7600, by_source: [{ source_type: "FSA", amount_cents: 100000 }, { source_type: "CASH", amount_cents: 7600 }], exceeds_preferred: false, exceeds_hard: false },
    { month: "2027-01", cash_cents: 9600, by_source: [{ source_type: "CASH", amount_cents: 9600 }], exceeds_preferred: false, exceeds_hard: false },
  ],
  benefit_states: [
    { event_id: "alt-1-e1", state_after: sRc },
    { event_id: "alt-1-e2", state_after: sCrown },
    { event_id: "alt-1-e3", state_after: y27After },
  ],
  objective: { unscheduled_by_urgency: [0, 0, 0], lateness_days_by_urgency: [0, 0, 0], funding_shortfall_cents: 0, total_member_cost_cents: 137200, total_fees_cents: 0, peak_monthly_cash_cents: 9600, travel_minutes_total: 42, visit_days: 3, wait_days_total: 108, expiring_funds_unused_cents: 0, completion_date: "2027-01-05" },
  applied_rule_ids: [],
  issues: [],
  rollover: [rollover2026(82400)],
  difference_from_recommended: null,
};
altA.applied_rule_ids = [...new Set([...altA.events.flatMap((e) => e.line_worst.applied_rule_ids), "rollover.2026"])].sort();
const altB: Alternative = {
  ...altA,
  alternative_id: "alt-2",
  labels: ["earliest_safe_completion"],
  schedule_key: "proc-crown-30@2026-11-05@prov-rivera@IN_NETWORK_CLAIM|proc-fill-14@2026-10-22@prov-rivera@SELF_PAY_NO_CLAIM|proc-rc-30@2026-10-20@prov-rivera@IN_NETWORK_CLAIM",
  events: [
    ev("alt-2-e1", rcLine("alt-2-e1"), "prov-rivera-t-20261020-0800", [fund("alt-2-f1", "alt-2-e1", "FSA", "2026-10-20", 20000)], ["WITHIN_SAFE_WINDOW", "MEETS_DENTIST_TARGET", "USES_EXPIRING_FUNDS"], [pte, fsaClaim]),
    ev("alt-2-e2", fillSelf, "prov-rivera-t-20261022-1400", [fund("alt-2-f1", "alt-2-e2", "FSA", "2026-10-22", 15000)], ["WITHIN_SAFE_WINDOW", "MEETS_DENTIST_TARGET", "BEFORE_PLAN_RESET", "USES_EXPIRING_FUNDS", "SELF_PAY_LOWER_PORTFOLIO_COST"], [{ kind: "CONFIRM_SELF_PAY_WITH_OFFICE", provider_id: P1, slot_id: "prov-rivera-t-20261022-1400", by_date: "2026-10-22" }, fsaClaim], cmpFillSelf),
    ev("alt-2-e3", crownLine("alt-2-e3", sRc, sCrown), "prov-rivera-t-20261105-1500", [fund("alt-2-f1", "alt-2-e3", "FSA", "2026-11-05", 85000), fund("alt-2-f2", "alt-2-e3", "CASH", "2026-11-05", 22600)], ["WITHIN_SAFE_WINDOW", "MEETS_DENTIST_TARGET", "HEALING_INTERVAL", "USES_EXPIRING_FUNDS", "FITS_MONTHLY_BUDGET"], [pte, fsaClaim]),
  ],
  totals: { modeled_charge: range(320000), contractual_adjustment: range(95000), plan_pay: range(82400), member_cost: range(142600), fees_cents: 0 },
  monthly: [
    { month: "2026-10", cash_cents: 0, by_source: [{ source_type: "FSA", amount_cents: 35000 }], exceeds_preferred: false, exceeds_hard: false },
    { month: "2026-11", cash_cents: 22600, by_source: [{ source_type: "FSA", amount_cents: 85000 }, { source_type: "CASH", amount_cents: 22600 }], exceeds_preferred: true, exceeds_hard: false },
  ],
  benefit_states: [
    { event_id: "alt-2-e1", state_after: sRc },
    { event_id: "alt-2-e2", state_after: sRc },
    { event_id: "alt-2-e3", state_after: sCrown },
  ],
  objective: { ...altA.objective, total_member_cost_cents: 142600, peak_monthly_cash_cents: 22600, wait_days_total: 33, completion_date: "2026-11-05" },
  // (1.7) §6.3 this − recommended (worst case): the 2027 plan version appears only in alt-1, so it is omitted.
  difference_from_recommended: {
    member_cost_delta_cents: 5400,
    plan_pay_delta_cents: -8400,
    peak_monthly_cash_delta_cents: 13000,
    monthly: [
      { month: "2026-10", cash_delta_cents: 0 },
      { month: "2026-11", cash_delta_cents: 15000 },
      { month: "2027-01", cash_delta_cents: -9600 },
    ],
    completion_shift_days: -61,
    service_date_changes: [{ procedure_id: "proc-fill-14", recommended_date: "2027-01-05", this_date: "2026-10-22", shift_days: -75 }],
    rollover_final_bank_delta: { low_cents: 0, high_cents: 0 },
    annual_max_remaining_delta: [{ plan_version_id: "nwd-ppo-standard-2026", delta_cents: 0 }],
    warnings_added: [],
    warnings_removed: [],
  },
};
altB.applied_rule_ids = [...new Set([...altB.events.flatMap((e) => e.line_worst.applied_rule_ids), "rollover.2026"])].sort();
const careResult: CarePlanResult = {
  contract_version: CONTRACT_VERSION,
  engine_id: ENGINE_IDS.optimizer,
  status: "OK",
  as_of: "2026-10-15T21:00:00Z",
  as_of_date: "2026-10-15",
  recommended_alternative_id: "alt-1",
  mode: "BALANCED",
  alternatives: [altA, altB],
  evidence: evidence([...new Set([...altA.applied_rule_ids, ...altB.applied_rule_ids])].sort()),
  unresolved: [
    issue("RULE_UNKNOWN", "warning", "2027 self-pay was not evaluated: the 2027 plan document does not address paying a network dentist without a claim.", { rule_id: "claim_submission.2027" }),
    issue("PENDING_CLAIMS_PRESENT", "info", "A claim from Sep 28, 2026 is still pending; its estimated payment is reserved.", { input_id: "member.pending.claim-2026-0928-d2391.plan_pay" }),
  ],
  decision_trace: [{ seq: 0, kind: "INPUT_VALIDATED", message: "mock", data: {} }],
  search_stats: { candidates_built: 0, schedules_evaluated: 0, schedules_feasible: 0, pass: 1 },
  solver_meta: {
    status: "OPTIMAL",
    candidates_built: 0,
    schedules_evaluated: 0,
    schedules_rejected: 0,
    elapsed_ms: null,
    deterministic_tie_breaker: "service dates, then provider ids, then claim routes, then slot ids, urgency-then-procedure-id order",
    bounds_applied: [],
  },
};

// ---------------------------------------------------------------- others
const passport: BenefitPassport = {
  contract_version: CONTRACT_VERSION,
  as_of: "2026-10-05T14:00:00Z",
  member_id: member.member_id,
  plan_version_id: "nwd-ppo-standard-2026",
  plan_name: "PPO Standard",
  carrier_name: "Northwind Mutual Dental (synthetic)",
  synthetic: true,
  coverage_period_start: "2026-01-01",
  coverage_period_end: "2026-12-31",
  next_reset_date: "2027-01-01",
  current_period: s0,
  sections: [
    {
      section_id: "balances",
      title: "What's left this year",
      items: [
        { item_id: "annual-max-available", label: "Annual maximum available for new claims", value_cents: 82400, value_range: null, value_bps: null, value_date: null, value_text: null, source: "CLAIM_EOB", rule_status: null, rule_ids: ["annual_maximum.2026"], input_ids: ["member.acc.2026.annual_max_remaining", "member.pending.claim-2026-0928-d2391.plan_pay"], observed_at: "2026-10-05T13:00:00Z" },
      ],
    },
    {
      section_id: "rules",
      title: "Plan rules",
      items: [
        { item_id: "reset-date", label: "Deductible and annual maximum reset on", value_cents: null, value_range: null, value_bps: null, value_date: "2027-01-01", value_text: null, source: "PLAN_VERIFIED", rule_status: "VERIFIED", rule_ids: ["benefit_period.2026"], input_ids: [], observed_at: null },
        { item_id: "waiting-periods", label: "Waiting periods", value_cents: null, value_range: null, value_bps: null, value_date: null, value_text: "No waiting periods", source: "PLAN_VERIFIED", rule_status: "NOT_APPLICABLE", rule_ids: ["waiting_period.all.2026"], input_ids: [], observed_at: null },
        { item_id: "rollover", label: "Unused maximum carryover", value_cents: null, value_range: null, value_bps: null, value_date: null, value_text: "Up to $250 next year if plan payments stay below $500; balance capped at $1,000", source: "PLAN_VERIFIED", rule_status: "VERIFIED", rule_ids: ["rollover.2026"], input_ids: [], observed_at: null },
      ],
    },
    {
      section_id: "funding",
      title: "Funding",
      items: [
        { item_id: "fsa-balance", label: "2026 Health FSA balance", value_cents: 120000, value_range: null, value_bps: null, value_date: null, value_text: null, source: "MEMBER_CONFIRMED", rule_status: null, rule_ids: [], input_ids: ["member.fsa-2026.balance"], observed_at: "2026-10-05T13:00:00Z" },
        { item_id: "fsa-deadline", label: "FSA pays for services through", value_cents: null, value_range: null, value_bps: null, value_date: "2026-12-31", value_text: null, source: "MEMBER_CONFIRMED", rule_status: null, rule_ids: [], input_ids: ["member.fsa-2026.balance"], observed_at: "2026-10-05T13:00:00Z" },
      ],
    },
  ],
  issues: [],
};
const extractedId = (id: string) => {
  const p = procedures.find((x) => x.procedure_id === id)!;
  return `proc-${(p.cdt_code ?? "na").toLowerCase()}-${p.tooth ?? "na"}`;
};
const extraction = {
  contract_version: CONTRACT_VERSION,
  mode: "synthetic" as const,
  document_id: "doc-card-2026-10-15",
  procedures: procedures.map((p) => ({
    ...p,
    procedure_id: extractedId(p.procedure_id),
    dentist_fee: { ...p.dentist_fee, input_id: `proc.${extractedId(p.procedure_id)}.dentist_fee` },
    dependencies: p.dependencies.map((d) => ({ ...d, depends_on: extractedId(d.depends_on) })),
    confirmation: { status: "UNVERIFIED" as const, confirmed_by: null, confirmed_at: null } })),
  ignored_instructions: [],
  warnings: [issue("EXTRACTION_UNVERIFIED", "info", "Please confirm every field. Your dentist's words are shown beside each value.")],
  raw_retained: false as const,
};
const explanation = {
  contract_version: CONTRACT_VERSION,
  mode: "template" as const,
  explanation: {
    summary: "Estimated member cost is $1,372 across three visits (MOCK TEXT).",
    claims: [{ text: "The crown's plan payment is limited to $24 because the 2026 annual maximum is nearly used.", fact_ids: ["rule:annual_maximum.2026", "calc:alt-1-e2.plan_pay"] }],
    missing_data: [],
  },
  validation: { ok: true, violations: [] },
  fell_back_to_template: false,
};

// (1.6) CONTRACT §3.10 plan options for the golden member on 2026-10-15 (headline items only; the engine
// also emits coverage, rule and orthodontic items).
const optionItem = (item_id: string, label: string, rule_id: string, value: Partial<Pick<PassportItem, "value_cents" | "value_bps">>): PassportItem => ({
  item_id, label, value_cents: null, value_range: null, value_bps: null, value_date: null, value_text: null, ...value,
  source: "PLAN_VERIFIED", rule_status: "VERIFIED", rule_ids: [rule_id], input_ids: [], observed_at: null,
});
const option = (opt: string, name: string, suffix: string, premium: number, ded: number, max: number, basicBps: number): PlanOptionsResult["options"][number] => ({
  plan_version_id: `nwd-${opt}-2026`, plan_id: `nwd-${opt}`, plan_option_id: opt, plan_name: name, plan_type: "DPPO",
  coverage_period_start: "2026-01-01", coverage_period_end: "2026-12-31", is_member_plan: opt === "ppo-standard", adjudication_supported: true,
  items: [
    optionItem("premium.employee_only", "Monthly premium: employee only", `premium${suffix}`, { value_cents: premium }),
    optionItem("coverage.in_network.basic", "Basic", `plan_share.in_network.basic${suffix}`, { value_bps: basicBps }),
    optionItem("rules.deductible", "Deductible", `deductible${suffix}`, { value_cents: ded }),
    optionItem("rules.annual_maximum", "Annual maximum", `annual_maximum${suffix}`, { value_cents: max }),
  ],
});
const planOptions: PlanOptionsResult = {
  contract_version: CONTRACT_VERSION, as_of: "2026-10-15T09:00:00-04:00", member_plan_version_id: "nwd-ppo-standard-2026",
  options: [
    option("ppo-enhanced", "PPO Enhanced", ".enhanced.2026", 3160, 5000, 250000, 9000),
    option("ppo-standard", "PPO Standard", ".2026", 1825, 5000, 150000, 8000),
    option("ppo-value", "PPO Value", ".value.2026", 980, 10000, 100000, 7000),
  ],
  issues: [],
};

const outputs: [string, unknown, { parse: (v: unknown) => unknown }][] = [
  [
    "health.json",
    env("health", {
      contract_version: CONTRACT_VERSION,
      ai_mode: "synthetic",
      registry_version: "mock",
      plan_version_ids: ["nwd-ppo-enhanced-2026", "nwd-ppo-standard-2026", "nwd-ppo-standard-2027", "nwd-ppo-value-2026"],
    }),
    HealthResponse,
  ],
  ["plan-options.json", env("plan-options", planOptions), PlanOptionsResponse],
  ["passport.json", env("passport", passport), { parse: (v) => v }],
  ["visit-navigator.json", env("visit", visitResult), VisitNavigatorResponse],
  ["intake-extract.json", env("extract", extraction), ExtractResponse],
  ["care-plan.json", env("care", careResult), CarePlanResponse],
  ["explain.json", env("explain", explanation), ExplainResponse],
];
fs.mkdirSync(OUT, { recursive: true });
for (const [name, body, schema] of outputs) {
  schema.parse(body);
  fs.writeFileSync(path.join(OUT, name), `${JSON.stringify(body, null, 2)}\n`);
}
BenefitPassport.parse(passport);
void providersPost;
console.log(`wrote ${outputs.length} mock responses to ${OUT}`);
