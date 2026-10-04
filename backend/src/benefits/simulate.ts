/**
 * DPPO adjudication: ledger (CONTRACT §3.1), ordering (§3.2), claim lines (§3.3),
 * self-pay (§3.4), steps (§3.5) and result (§3.6). Pure; never Zod-parses (hot path).
 */
import {
  addDays,
  addMonths,
  ageHours,
  applyRateRoundHalfUp,
  calcStepId,
  CONTRACT_VERSION,
  ENGINE_IDS,
  formatUsd,
  isWithin,
  issue,
  localDateOf,
  resolveMoney,
  rolloverStepId,
  STALENESS_HOURS,
  type AdjudicationLine,
  type AmountRange,
  type BenefitLedger,
  type BenefitPeriodState,
  type CalcOperand,
  type CalcStep,
  type CalcStepName,
  type Cents,
  type ClaimEvent,
  type Issue,
  type IsoDate,
  type IsoDateTime,
  type MemberCostDirection,
  type MemberState,
  type NetworkTier,
  type PlanDefinition,
  type PlanRegistry,
  type ProcedureHistoryEntry,
  type ProviderOption,
  type RolloverOutcome,
  type RolloverStepName,
  type Scenario,
  type ServiceClass,
  type SimulationRequest,
  type SimulationResult,
  type SourcedMoney,
} from "@/domain";
import { matches, missingRuleIssue, normalizeIssues, requireVerified, resolvePlanVersion, rulesOf, ruleStatusIssue } from "./rules";

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const rule = (id: string) => `rule:${id}`;
const input = (id: string) => `input:${id}`;

/** NEEDS_CONFIRMATION-sourced inputs are unknown (CONTRACT §1.6). */
export function money(m: SourcedMoney, scenario: Scenario, dir: MemberCostDirection): Cents | null {
  return m.source === "NEEDS_CONFIRMATION" ? null : resolveMoney(m.value, scenario, dir);
}
const highest = (m: SourcedMoney): Cents | null =>
  m.source === "NEEDS_CONFIRMATION" || m.value.kind === "unknown" ? null : m.value.kind === "exact" ? m.value.cents : m.value.high_cents;
const lowest = (m: SourcedMoney): Cents | null =>
  m.source === "NEEDS_CONFIRMATION" || m.value.kind === "unknown" ? null : m.value.kind === "exact" ? m.value.cents : m.value.low_cents;

// ---------------------------------------------------------------------------
// Ledger
// ---------------------------------------------------------------------------

export interface Period {
  plan: PlanDefinition;
  /** null when the period's opening values are unknown. */
  state: BenefitPeriodState | null;
  /** Blocking ledger issue present → every line in the period needs confirmation. */
  blocked: boolean;
  issues: Issue[];
  /** Blocking rule issues (fresh period, CONTRACT §1.6/§3.3) carried by every line of the period. */
  ruleIssues: Issue[];
  dedFact: string;
  maxFact: string;
  inputIds: string[];
  /** (1.5) §3.9: rollover rule whose carryover was added to this (fresh, best_case) period; null otherwise. */
  carryRuleId: string | null;
  /** (1.5) §3.9: carryover this simulation added to this fresh period (0 when none). */
  carriedIn: Cents;
}

export function openPeriod(
  registry: PlanRegistry,
  plan: PlanDefinition,
  member: MemberState,
  asOfDate: IsoDate,
  scenario: Scenario,
): Period {
  const issues: Issue[] = [];
  const ruleIssues: Issue[] = [];
  const y = plan.coverage_period.start.slice(0, 4);
  const pvid = plan.plan_version_id;
  const dedRule = rulesOf(plan, "deductible").find((r) => r.status === "VERIFIED");
  const maxRule = rulesOf(plan, "annual_maximum").find((r) => r.status === "VERIFIED");
  const snapIdx = member.accumulators.findIndex((a) => a.plan_version_id === pvid);
  const snap = member.accumulators[snapIdx];
  let dedRem: Cents | null = null;
  let maxRem: Cents | null = null;
  let dedFact = rule(`deductible.${y}`);
  let maxFact = rule(`annual_maximum.${y}`);
  const inputIds: string[] = [];
  let source: BenefitPeriodState["source"] = "PLAN_VERIFIED";
  let openedFrom: BenefitPeriodState["opened_from"] = "plan_rules";

  if (snap) {
    const f = `member.accumulators[${snapIdx}]`;
    openedFrom = "snapshot";
    source = snap.deductible_remaining.source;
    dedRem = money(snap.deductible_remaining, scenario, "higher_is_worse");
    maxRem = money(snap.annual_max_remaining, scenario, "higher_is_better");
    dedFact = input(snap.deductible_remaining.input_id);
    maxFact = input(snap.annual_max_remaining.input_id);
    inputIds.push(snap.deductible_remaining.input_id, snap.annual_max_remaining.input_id);
    for (const [m, name, v] of [
      [snap.deductible_remaining, "deductible_remaining", dedRem],
      [snap.annual_max_remaining, "annual_max_remaining", maxRem],
    ] as const) {
      if (v === null) {
        issues.push(issue("INPUT_MISSING", "blocking", `The ${name.replaceAll("_", " ")} for ${y} is unknown; confirm it with the plan.`, { field: `${f}.${name}`, input_id: m.input_id }));
      }
    }
    const inconsistent = (name: string, m: SourcedMoney, msg: string) =>
      issues.push(issue("INPUT_INCONSISTENT", "blocking", msg, { field: `${f}.${name}`, input_id: m.input_id }));
    const maxHigh = highest(snap.annual_max_remaining);
    const dedHigh = highest(snap.deductible_remaining);
    // (1.5) §3.1: an exact carryover balance is part of this period's maximum; otherwise today's check.
    const carry = snap.carryover_balance ?? null;
    const carryCents = carry && carry.source !== "NEEDS_CONFIRMATION" && carry.value.kind === "exact" ? carry.value.cents : 0;
    if (carry) inputIds.push(carry.input_id);
    if (maxRule?.value && maxHigh !== null && maxHigh > maxRule.value.individual_cents + carryCents) {
      inconsistent("annual_max_remaining", snap.annual_max_remaining, `The annual maximum remaining for ${y} is larger than the plan's annual maximum.`);
    }
    if (dedRule?.value && dedHigh !== null && dedHigh > dedRule.value.individual_cents) {
      inconsistent("deductible_remaining", snap.deductible_remaining, `The deductible remaining for ${y} is larger than the plan's deductible.`);
    }
    const ytd = snap.plan_paid_ytd;
    const allExact = [snap.annual_max_remaining, ytd].every((m) => m.source !== "NEEDS_CONFIRMATION" && m.value.kind === "exact");
    if (maxRule?.value && allExact && snap.annual_max_remaining.value.kind === "exact" && ytd.value.kind === "exact") {
      if (snap.annual_max_remaining.value.cents + ytd.value.cents !== maxRule.value.individual_cents + carryCents) {
        inconsistent("plan_paid_ytd", ytd, `The annual maximum remaining and plan paid so far for ${y} do not add up to the plan's annual maximum.`);
      }
    }
  } else if (plan.coverage_period.start > asOfDate) {
    for (const type of ["deductible", "annual_maximum"] as const) {
      const r = requireVerified(rulesOf(plan, type), type);
      if ("issues" in r) ruleIssues.push(...r.issues.map((i) => ({ ...i, rule_id: i.rule_id ?? `${type}.${y}` })));
    }
    if (!ruleIssues.length) {
      dedRem = dedRule?.value?.individual_cents ?? null;
      maxRem = maxRule?.value?.individual_cents ?? null;
    }
  } else {
    issues.push(issue("INPUT_MISSING", "blocking", `Deductible and annual maximum balances for ${y} are needed.`, { field: "member.accumulators" }));
  }

  // Pending claims (§3.1): reserved, never settled.
  let reservedMax: Cents | null = 0;
  let reservedDed: Cents | null = 0;
  for (const c of [...member.pending_claims].filter((c) => c.plan_version_id === pvid).sort((a, b) => cmp(a.claim_id, b.claim_id))) {
    const pay = money(c.estimated_plan_pay, scenario, "higher_is_worse");
    const ded = money(c.estimated_deductible_applied, scenario, "higher_is_better");
    inputIds.push(c.estimated_plan_pay.input_id, c.estimated_deductible_applied.input_id);
    for (const [m, v] of [[c.estimated_plan_pay, pay], [c.estimated_deductible_applied, ded]] as const) {
      if (v === null) issues.push(issue("INPUT_MISSING", "blocking", "A pending claim estimate is unknown; confirm it with the plan.", { input_id: m.input_id }));
    }
    reservedMax = pay === null || reservedMax === null ? null : reservedMax + pay;
    reservedDed = ded === null || reservedDed === null ? null : reservedDed + ded;
    issues.push(
      issue("PENDING_CLAIMS_PRESENT", "info", "A submitted claim is still pending; its estimate is reserved against your balances.", {
        input_id: c.estimated_plan_pay.input_id,
      }),
    );
  }

  // Rollover: a VERIFIED rule is closed by closeYear (§3.9); an unverified one is only noted.
  const prev = resolvePlanVersion(registry, plan.key, addDays(plan.coverage_period.start, -1));
  if (prev.ok) {
    for (const r of rulesOf(prev.plan, "rollover")) {
      if (r.status === "UNVERIFIED") {
        issues.push(issue("RULE_UNVERIFIED", "warning", "Maximum carryover terms are not verified; no carryover is assumed.", { rule_id: r.rule_id }));
      }
    }
  }

  let state: BenefitPeriodState | null = null;
  if (dedRem !== null && maxRem !== null && reservedMax !== null && reservedDed !== null) {
    state = {
      plan_version_id: pvid,
      period_start: plan.coverage_period.start,
      period_end: plan.coverage_period.end,
      opened_from: openedFrom,
      deductible_remaining_cents: dedRem,
      annual_max_remaining_cents: maxRem,
      pending_reserved_max_cents: reservedMax,
      pending_reserved_deductible_cents: reservedDed,
      annual_max_available_cents: Math.max(0, maxRem - reservedMax),
      deductible_available_cents: Math.max(0, dedRem - reservedDed),
      sublimits: [],
      simulated_plan_paid_cents: 0,
      source,
    };
  }
  const blocked = state === null || issues.some((i) => i.severity === "blocking");
  return { plan, state, blocked, issues, ruleIssues, dedFact, maxFact, inputIds, carryRuleId: null, carriedIn: 0 };
}

// ---------------------------------------------------------------------------
// (1.5) Year-close carryover (CONTRACT §3.9)
// ---------------------------------------------------------------------------

/**
 * Closes one benefit period under its VERIFIED rollover rule. Pure. null when the rule is absent,
 * not applicable or not verified (the unverified notice is raised by openPeriod of the next period).
 */
export function closeYear(
  registry: PlanRegistry,
  closing: Period,
  member: MemberState,
  asOfDate: IsoDate,
  closingLines: AdjudicationLine[],
): RolloverOutcome | null {
  const plan = closing.plan;
  const r = rulesOf(plan, "rollover").find((x) => x.status === "VERIFIED");
  if (!r?.value) return null;
  const v = r.value;
  const pvid = plan.plan_version_id;
  const end = plan.coverage_period.end;
  const y = plan.coverage_period.start.slice(0, 4);
  const ruleFact = rule(r.rule_id);
  const issues: Issue[] = [];
  const inputIds: string[] = [];
  let needsConfirmation = false;
  const missing = (message: string, refs: { field?: string; input_id?: string | null }) => {
    needsConfirmation = true;
    issues.push(issue("INPUT_MISSING", "warning", message, { rule_id: r.rule_id, ...refs }));
  };

  // Next plan (ROLL-006/007): the exact version on the day after the period ends.
  const next = resolvePlanVersion(registry, plan.key, addDays(end, 1));
  const nextId = next.ok ? next.plan.plan_version_id : null;
  const nextEligible = nextId !== null && v.applies_to_next_plan_version_ids.includes(nextId);
  if (nextId === null) {
    needsConfirmation = true;
    issues.push(issue("ROLLOVER_NEXT_PLAN_UNKNOWN", "warning", "Your plan for next year could not be confirmed, so no carryover is added.", { rule_id: r.rule_id }));
  } else if (!nextEligible) {
    issues.push(issue("ROLLOVER_NEXT_PLAN_INELIGIBLE", "warning", "Your plan for next year does not accept this carryover, so none is added.", { rule_id: r.rule_id }));
  }

  // Settled plan payments and prior balance. (1.6, R2-M1) Both are resolved the same way in every
  // scenario: a ranged settled amount widens the qualifying range, and only an exact prior balance
  // is used (a ranged one needs confirmation when it matters).
  const snapIdx = member.accumulators.findIndex((a) => a.plan_version_id === pvid);
  const snap = member.accumulators[snapIdx];
  const field = `member.accumulators[${snapIdx}]`;
  let settled: AmountRange | null;
  let prior: Cents | null;
  let settledOp: CalcOperand;
  let settledSpreadOps: CalcOperand[] = [];
  let priorOp: CalcOperand;
  const carry = snap?.carryover_balance ?? null;
  const exactCarry = carry && carry.source !== "NEEDS_CONFIRMATION" && carry.value.kind === "exact" ? carry.value.cents : null;
  if (closing.state === null) {
    settled = null;
    prior = null;
    settledOp = op("settled_plan_paid", ruleFact, { text: "unknown" });
    priorOp = op("prior_bank", ruleFact, { text: "unknown" });
    missing(`The ${y} balances are unknown, so the carryover needs confirmation.`, { field: "member.accumulators" });
  } else if (closing.state.opened_from === "snapshot" && snap) {
    const low = lowest(snap.plan_paid_ytd);
    const high = highest(snap.plan_paid_ytd);
    const paidId = snap.plan_paid_ytd.input_id;
    settled = low === null || high === null ? null : { low_cents: low, high_cents: high };
    inputIds.push(paidId);
    settledOp = op("settled_plan_paid", input(paidId), settled === null ? { text: "unknown" } : { cents: settled.low_cents });
    if (settled && settled.high_cents > settled.low_cents) {
      settledSpreadOps = [op("settled_plan_paid_range", input(paidId), { cents: settled.high_cents - settled.low_cents })];
    }
    if (settled === null) missing(`The plan paid so far for ${y} is unknown, so the carryover needs confirmation.`, { field: `${field}.plan_paid_ytd`, input_id: paidId });
    prior = exactCarry;
    if (carry) inputIds.push(carry.input_id);
    priorOp = carry ? op("prior_bank", input(carry.input_id), prior === null ? { text: "not exact" } : { cents: prior }) : op("prior_bank", ruleFact, { text: "unknown" });
  } else {
    settled = { low_cents: 0, high_cents: 0 };
    prior = closing.carriedIn;
    settledOp = op("settled_plan_paid", ruleFact, { text: "none (period opened from plan rules)" });
    priorOp = op("prior_bank", ruleFact, { cents: prior });
  }

  // Pending claims (ROLL-008): high estimate; unknown → needs confirmation.
  let pending: Cents | null = 0;
  const pendingOps: CalcOperand[] = [];
  for (const c of [...member.pending_claims].filter((c) => c.plan_version_id === pvid).sort((a, b) => cmp(a.claim_id, b.claim_id))) {
    const pay = highest(c.estimated_plan_pay);
    inputIds.push(c.estimated_plan_pay.input_id);
    pendingOps.push(op("pending_plan_pay", input(c.estimated_plan_pay.input_id), pay === null ? { text: "unknown" } : { cents: pay }));
    if (pay === null) missing("A pending claim estimate is unknown, so the carryover needs confirmation.", { input_id: c.estimated_plan_pay.input_id });
    pending = pay === null || pending === null ? null : pending + pay;
  }

  // Simulated plan payments that count toward the maximum (ROLL-001). Self-pay and preventive never count.
  const counted = closingLines.filter((l) => l.status === "OK" && l.counts_toward_maximum === true && l.plan_version_id === pvid);
  const simulated = counted.reduce((a, l) => a + (l.plan_pay_cents ?? 0), 0);
  const countedOps = counted.map((l) => op("plan_pay", `calc:${calcStepId(l.line_id, "plan_pay")}`, { cents: l.plan_pay_cents ?? 0 }));

  const known = settled !== null && pending !== null;
  const qLow = known ? settled!.low_cents + simulated : null;
  const qHigh = known ? settled!.high_cents + simulated + pending! : null;
  const passes = (q: Cents) => (v.threshold_comparison === "LT" ? q < v.threshold_cents : q <= v.threshold_cents);
  const eligLow = !v.requires_at_least_one_eligible_claim || (settled?.low_cents ?? 0) > 0 || simulated > 0;
  const eligHigh = eligLow || (settled?.high_cents ?? 0) > 0 || (pending ?? 0) > 0;
  const qualifiesBest = known && nextEligible && passes(qLow!) && eligHigh;
  const qualifiesWorst = known && nextEligible && passes(qHigh!) && eligLow;

  // Network bonus (ROLL-004).
  let bonusLow = false;
  let bonusHigh = false;
  if (v.network_bonus_condition === "ANY_IN_NETWORK_CLAIM") {
    bonusLow = closingLines.some(
      (l) => l.status === "OK" && l.plan_version_id === pvid && l.network_tier === "in_network" && l.claim_route === "IN_NETWORK_CLAIM" && (l.plan_pay_cents ?? 0) > 0,
    );
    // The network of settled and pending claims is unknown.
    bonusHigh = bonusLow || (settled?.high_cents ?? 0) + (pending ?? 0) > 0;
  }
  const bonus: AmountRange = { low_cents: bonusLow ? v.network_bonus_cents : 0, high_cents: bonusHigh ? v.network_bonus_cents : 0 };

  // Bank (ROLL-005).
  const addsToPrior = v.existing_bank_treatment === "ADD_AND_CAP";
  if (qualifiesBest && addsToPrior && prior === null && !needsConfirmation) {
    const why = carry && carry.value.kind === "range" ? "is not exact" : "is unknown";
    missing(`Your current carryover balance ${why}, so the ${y} carryover needs confirmation.`, { field: `${field}.carryover_balance`, input_id: carry?.input_id ?? null });
  }
  const uncapped = (b: Cents) => (addsToPrior ? prior! : 0) + v.base_award_cents + b;
  const bank = (b: Cents) => Math.min(v.bank_cap_cents, uncapped(b));
  const finalBank: AmountRange | null = needsConfirmation
    ? null
    : { low_cents: qualifiesWorst ? bank(bonus.low_cents) : 0, high_cents: qualifiesBest ? bank(bonus.high_cents) : 0 };
  const lostToCap = needsConfirmation ? null : qualifiesBest ? Math.max(0, uncapped(bonus.high_cents) - v.bank_cap_cents) : 0;
  const forfeited = needsConfirmation ? null : qualifiesWorst ? 0 : prior;

  const status: RolloverOutcome["status"] = finalBank === null
    ? "NEEDS_CONFIRMATION"
    : finalBank.low_cents !== finalBank.high_cents
      ? "UNCERTAIN"
      : !qualifiesBest
        ? "NOT_EARNED"
        : asOfDate > end && pending === 0
          ? "EARNED"
          : "CONDITIONAL";
  if (status === "UNCERTAIN") {
    issues.push(
      issue(
        "ROLLOVER_UNCERTAIN",
        "warning",
        qualifiesBest !== qualifiesWorst
          ? `Your carryover cannot be confirmed yet because ${(pending ?? 0) > 0 ? "a pending claim" : "the plan payments reported so far are not exact and"} could put the total ${v.threshold_comparison === "LT" ? "at or above" : "above"} the ${formatUsd(v.threshold_cents)} threshold.`
          : "Your carryover amount cannot be confirmed yet because it depends on claims whose network is not known.",
        { rule_id: r.rule_id },
      ),
    );
  }

  // Trace (ROLL-009).
  const steps: CalcStep[] = [];
  const calc = (name: RolloverStepName) => `calc:${rolloverStepId(pvid, name)}`;
  const add = (name: RolloverStepName, label: string, formula: string, operands: CalcOperand[], result: Val) =>
    steps.push({
      step_id: rolloverStepId(pvid, name),
      label,
      formula,
      operands,
      result_cents: result.cents ?? null,
      result_bps: null,
      result_text: result.text ?? null,
    });
  const val = (c: Cents | null): Val => (c === null ? { text: "unknown" } : { cents: c });
  const rangeVal = (x: AmountRange | null): Val =>
    x === null ? { text: "needs confirmation" } : x.low_cents === x.high_cents ? { cents: x.high_cents } : { text: `${formatUsd(x.low_cents)} to ${formatUsd(x.high_cents)}` };
  const cmpText = v.threshold_comparison === "LT" ? "below" : "at or below";
  add("threshold", "Carryover threshold", `qualifying plan payments must be ${cmpText} the threshold`, [op("threshold", ruleFact, { cents: v.threshold_cents })], { cents: v.threshold_cents });
  add("qualifying_low", "Plan payments toward the maximum (without pending claims)", "settled_plan_paid + simulated plan_pay counted toward the maximum", [settledOp, ...countedOps], val(qLow));
  add(
    "qualifying_high",
    "Plan payments toward the maximum (with pending claims)",
    settledSpreadOps.length ? "qualifying_low + settled_plan_paid_range + pending_plan_pay" : "qualifying_low + pending_plan_pay",
    [op("qualifying_low", calc("qualifying_low"), val(qLow)), ...settledSpreadOps, ...pendingOps],
    val(qHigh),
  );
  add(
    "eligible_claim",
    "At least one paid claim",
    v.requires_at_least_one_eligible_claim ? "settled, simulated or pending plan payment > 0" : "not required",
    [op("requires_at_least_one_eligible_claim", ruleFact, { text: v.requires_at_least_one_eligible_claim ? "required" : "not required" })],
    { text: eligLow ? "yes" : eligHigh ? "only if a pending claim is paid" : "no" },
  );
  add("base_award", "Carryover earned", "base_award", [op("base_award", ruleFact, { cents: v.base_award_cents })], { cents: v.base_award_cents });
  add("network_bonus", "Network bonus", v.network_bonus_condition === "NONE" ? "0 (no bonus)" : "network_bonus if any in-network claim", [op("network_bonus", ruleFact, { cents: v.network_bonus_cents })], rangeVal(bonus));
  add("prior_bank", "Carryover balance before this year closes", "prior carryover balance", [priorOp], val(prior));
  add("bank_cap", "Carryover balance limit", "bank_cap", [op("bank_cap", ruleFact, { cents: v.bank_cap_cents })], { cents: v.bank_cap_cents });
  add(
    "final_bank",
    "Carryover available next year",
    `qualifies ? min(bank_cap, ${addsToPrior ? "prior_bank + " : ""}base_award + network_bonus) : 0`,
    [
      op("qualifying_high", calc("qualifying_high"), val(qHigh)),
      op("prior_bank", calc("prior_bank"), val(prior)),
      op("base_award", calc("base_award"), { cents: v.base_award_cents }),
      op("network_bonus", calc("network_bonus"), rangeVal(bonus)),
      op("bank_cap", calc("bank_cap"), { cents: v.bank_cap_cents }),
    ],
    rangeVal(finalBank),
  );
  add(
    "lost_to_cap",
    "Carryover lost to the balance limit",
    `max(0, ${addsToPrior ? "prior_bank + " : ""}base_award + network_bonus - bank_cap)`,
    [op("final_bank", calc("final_bank"), rangeVal(finalBank)), op("bank_cap", calc("bank_cap"), { cents: v.bank_cap_cents })],
    val(lostToCap),
  );

  return {
    rule_id: r.rule_id,
    closing_plan_version_id: pvid,
    closing_period_end: end,
    next_plan_version_id: nextId,
    status,
    threshold_cents: v.threshold_cents,
    threshold_comparison: v.threshold_comparison,
    settled_plan_paid: settled,
    pending_plan_pay_cents: pending,
    qualifying_plan_paid: known ? { low_cents: qLow!, high_cents: qHigh! } : null,
    base_award_cents: v.base_award_cents,
    network_bonus: bonus,
    prior_bank_cents: prior,
    bank_cap_cents: v.bank_cap_cents,
    final_bank: finalBank,
    lost_to_cap_cents: lostToCap,
    forfeited_cents: forfeited,
    applied_rule_ids: [r.rule_id],
    input_ids: uniqSorted(inputIds),
    steps,
    issues: normalizeIssues(issues),
  };
}

function memberHistory(member: MemberState): ProcedureHistoryEntry[] {
  return [
    ...member.procedure_history,
    ...member.pending_claims.map((c) => ({
      cdt_code: c.cdt_code,
      tooth: c.tooth,
      service_date: c.service_date,
      source: "CLAIM_EOB" as const,
      claimed: true,
    })),
  ];
}

function sortHistory(h: ProcedureHistoryEntry[]): ProcedureHistoryEntry[] {
  return [...h].sort(
    (a, b) =>
      cmp(a.service_date, b.service_date) ||
      cmp(a.cdt_code, b.cdt_code) ||
      cmp(a.tooth ?? "", b.tooth ?? "") ||
      cmp(a.source, b.source) ||
      Number(a.claimed) - Number(b.claimed),
  );
}

const sortPeriods = (ps: BenefitPeriodState[]) => [...ps].sort((a, b) => cmp(a.period_start, b.period_start));

export function openLedger(
  registry: PlanRegistry,
  member: MemberState,
  asOf: IsoDateTime,
  scenario: Scenario,
): { ledger: BenefitLedger; issues: Issue[] } {
  const asOfDate = localDateOf(asOf, member.time_zone);
  const issues: Issue[] = [];
  const periods: BenefitPeriodState[] = [];
  for (const snap of member.accumulators) {
    const res = resolvePlanVersion(registry, member.plan_key, snap.period_start);
    if (!res.ok || res.plan.plan_version_id !== snap.plan_version_id) {
      issues.push(...(res.ok ? [issue("PLAN_NOT_FOUND", "blocking", "An accumulator snapshot does not match the plan version for its period.", { field: "member.accumulators" })] : res.issues));
      continue;
    }
    const p = openPeriod(registry, res.plan, member, asOfDate, scenario);
    issues.push(...p.issues);
    if (p.state) periods.push(p.state);
  }
  if (member.secondary_coverage !== null) issues.push(secondaryIssue());
  return { ledger: { periods: sortPeriods(periods), history: sortHistory(memberHistory(member)) }, issues: normalizeIssues(issues) };
}

const secondaryIssue = () =>
  issue("SECONDARY_COVERAGE_NOT_MODELED", "blocking", "You have a second dental plan; coordination of benefits is not estimated.", {
    field: "member.secondary_coverage",
  });

// ---------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------

type Val = { cents?: Cents; bps?: number; text?: string };
const op = (name: string, fact_id: string, v: Val): CalcOperand => ({
  name,
  cents: v.cents ?? null,
  bps: v.bps ?? null,
  text: v.text ?? null,
  fact_id,
});

function stepper(lineId: string) {
  const steps: CalcStep[] = [];
  const calc = (name: CalcStepName) => `calc:${calcStepId(lineId, name)}`;
  const add = (name: CalcStepName, label: string, formula: string, operands: CalcOperand[], result: Val) =>
    steps.push({
      step_id: calcStepId(lineId, name),
      label,
      formula,
      operands,
      result_cents: result.cents ?? null,
      result_bps: result.bps ?? null,
      result_text: result.text ?? null,
    });
  return { steps, calc, add };
}

// ---------------------------------------------------------------------------
// Simulation
// ---------------------------------------------------------------------------

type Money = Pick<
  AdjudicationLine,
  | "modeled_charge_cents"
  | "contractual_adjustment_cents"
  | "patient_charge_cents"
  | "eligible_basis_cents"
  | "balance_bill_cents"
  | "deductible_applied_cents"
  | "coverage_rate_bps"
  | "preliminary_plan_pay_cents"
  | "cap_applied"
  | "plan_pay_cents"
  | "member_responsibility_cents"
  | "counts_toward_maximum"
>;

const NO_MONEY: Money = {
  modeled_charge_cents: null,
  contractual_adjustment_cents: null,
  patient_charge_cents: null,
  eligible_basis_cents: null,
  balance_bill_cents: null,
  deductible_applied_cents: null,
  coverage_rate_bps: null,
  preliminary_plan_pay_cents: null,
  cap_applied: null,
  plan_pay_cents: null,
  member_responsibility_cents: null,
  counts_toward_maximum: null,
};

const uniqSorted = (xs: string[]) => [...new Set(xs)].sort(cmp);

/** (1.4) CONTRACT §3.3 step 1: a tier counts only when verified against this plan version's network. */
function effectiveNetworkTier(plan: PlanDefinition, provider: ProviderOption): NetworkTier | null {
  return provider.network.network_id === plan.key.network_id ? provider.network.tier : null;
}

export function simulate(registry: PlanRegistry, request: SimulationRequest): SimulationResult {
  const { member, scenario } = request;
  const asOfDate = localDateOf(request.as_of, member.time_zone);
  const providers = new Map(request.providers.map((p) => [p.provider_id, p]));
  const events = [...request.events].sort((a, b) => cmp(a.service_date, b.service_date) || cmp(a.event_id, b.event_id));
  const periods = new Map<string, Period>();
  const initial = new Map<string, BenefitPeriodState>();
  const simIssues: Issue[] = [];
  const baseHistory = memberHistory(member);
  const simulated: ProcedureHistoryEntry[] = [];
  const secondary = member.secondary_coverage !== null;
  if (secondary) simIssues.push(secondaryIssue());

  const lines: AdjudicationLine[] = [];
  /** (1.5) §3.9: each period is closed at most once per simulation (ROLL-002). */
  const closed = new Map<string, RolloverOutcome | null>();
  const close = (p: Period): RolloverOutcome | null => {
    const id = p.plan.plan_version_id;
    if (!closed.has(id)) closed.set(id, closeYear(registry, p, member, asOfDate, lines.filter((l) => l.plan_version_id === id)));
    return closed.get(id)!;
  };

  const periodFor = (plan: PlanDefinition): Period => {
    let p = periods.get(plan.plan_version_id);
    if (!p) {
      // Close the previous period first; a period this run never opened is opened privately (its issues stay out).
      const prev = resolvePlanVersion(registry, plan.key, addDays(plan.coverage_period.start, -1));
      const outcome = prev.ok ? close(periods.get(prev.plan.plan_version_id) ?? openPeriod(registry, prev.plan, member, asOfDate, scenario)) : null;
      p = openPeriod(registry, plan, member, asOfDate, scenario);
      // Carry-in: fresh period, best_case only (a snapshot already includes it; worst_case never assumes it).
      const carried = outcome?.final_bank?.high_cents ?? 0;
      if (carried > 0 && scenario === "best_case" && p.state?.opened_from === "plan_rules") {
        const maxRem = p.state.annual_max_remaining_cents + carried;
        p.state = { ...p.state, annual_max_remaining_cents: maxRem, annual_max_available_cents: Math.max(0, maxRem - p.state.pending_reserved_max_cents) };
        p.maxFact = rule(outcome!.rule_id);
        p.carryRuleId = outcome!.rule_id;
        p.carriedIn = carried;
      }
      periods.set(plan.plan_version_id, p);
      simIssues.push(...p.issues);
      if (p.state) initial.set(plan.plan_version_id, p.state);
    }
    return p;
  };

  const adjudicateEvent = (ev: ClaimEvent): AdjudicationLine => {
    const provider = providers.get(ev.provider_id);
    const line: AdjudicationLine = {
      line_id: ev.event_id,
      event_id: ev.event_id,
      procedure_id: ev.procedure_id,
      cdt_code: ev.cdt_code,
      tooth: ev.tooth,
      service_date: ev.service_date,
      claim_date: ev.claim_date,
      provider_id: ev.provider_id,
      network_tier: null,
      claim_route: ev.claim_route,
      status: "NEEDS_CONFIRMATION",
      plan_version_id: null,
      service_class: null,
      ...NO_MONEY,
      state_before: null,
      state_after: null,
      applied_rule_ids: [],
      input_ids: [],
      steps: [],
      issues: [],
    };
    const block = (issues: Issue[]): AdjudicationLine => ({ ...line, ...NO_MONEY, status: "NEEDS_CONFIRMATION", issues: normalizeIssues(issues), steps: [], applied_rule_ids: [], input_ids: [] });
    const refs = { procedure_id: ev.procedure_id, provider_id: ev.provider_id };
    const unknownNetwork = (input_id: string) =>
      issue("NETWORK_STATUS_UNKNOWN", "blocking", "Confirm this office is in network for your plan.", { ...refs, input_id });
    /** (1.4) §1.9: a price input older than the policy limit adds a warning; status and money are unchanged. */
    const stale = (ms: (SourcedMoney | null)[]): Issue[] =>
      ms.flatMap((m) =>
        m && ageHours(m.observed_at, request.as_of) > STALENESS_HOURS.prices
          ? [issue("INPUT_STALE", "warning", "This price was checked a while ago and may be out of date; confirm it with the office.", { ...refs, input_id: m.input_id })]
          : [],
      );

    // 1. Provider & price
    if (!provider) return block([issue("INPUT_MISSING", "blocking", "This office is not in the request.", { ...refs, field: "providers" })]);
    const price = provider.pricing.find((p) => p.cdt_code === ev.cdt_code);
    if (!price) return block([issue("INPUT_MISSING", "blocking", `This office has not given a price for ${ev.cdt_code}.`, { ...refs, field: "providers.pricing" })]);

    // 2. Plan version → effective network tier → route (1.4)
    const res = resolvePlanVersion(registry, member.plan_key, ev.service_date);
    if (!res.ok) {
      if (res.status === "UNSUPPORTED_PLAN_TYPE") {
        simIssues.push(...res.issues);
        return { ...line, status: "UNSUPPORTED_PLAN_TYPE" };
      }
      return block(res.issues);
    }
    const plan = res.plan;
    line.plan_version_id = plan.plan_version_id;
    const tier = effectiveNetworkTier(plan, provider);
    line.network_tier = tier;
    if (ev.claim_route !== "SELF_PAY_NO_CLAIM") {
      if (tier === null) return block([unknownNetwork(provider.network.input_id)]);
      if (ev.claim_route !== (tier === "in_network" ? "IN_NETWORK_CLAIM" : "OUT_OF_NETWORK_CLAIM")) {
        return block([issue("CLAIM_ROUTE_INVALID", "blocking", "The claim route does not match this office's network status.", { ...refs, input_id: provider.network.input_id })]);
      }
    }
    const period = periodFor(plan);
    line.state_before = line.state_after = period.state;
    if (period.blocked || secondary) return block(period.ruleIssues);
    const state = period.state!;

    // Service class (lookup only; blocks claim lines below)
    const maps = rulesOf(plan, "service_class_map").filter((r) => r.value?.cdt_codes.includes(ev.cdt_code));
    const verifiedMaps = maps.filter((r) => r.status === "VERIFIED");
    const cls: ServiceClass | null = verifiedMaps.length === 1 && maps.length === 1 ? verifiedMaps[0]!.value!.service_class : null;
    line.service_class = cls;

    // §3.4 Self-pay
    if (ev.claim_route === "SELF_PAY_NO_CLAIM") {
      const cs = requireVerified(rulesOf(plan, "claim_submission"), "claim_submission");
      if ("issues" in cs) return block(cs.issues);
      const v = cs.rule.value!;
      if (!v.member_may_decline_claim || (tier === "in_network" && v.network_provider_must_submit)) {
        return block([issue("CLAIM_ROUTE_INVALID", "blocking", "The plan requires a claim for this office.", { ...refs, rule_id: cs.rule.rule_id })]);
      }
      if (tier === null && v.network_provider_must_submit) return block([unknownNetwork(provider.network.input_id)]);
      if (v.self_pay_counts_toward_accumulators) {
        return block([issue("RULE_TYPE_UNSUPPORTED", "blocking", "Self-paid services that count toward plan balances are not modeled.", { ...refs, rule_id: cs.rule.rule_id })]);
      }
      if (provider.self_pay.permitted_by_office !== true) {
        return block([
          provider.self_pay.permitted_by_office === false
            ? issue("CLAIM_ROUTE_INVALID", "blocking", "This office does not accept direct payment without a claim.", { ...refs, input_id: provider.self_pay.input_id })
            : issue("SELF_PAY_NOT_VERIFIED", "blocking", "Ask the office whether it accepts direct payment without a claim.", { ...refs, input_id: provider.self_pay.input_id }),
        ]);
      }
      const q = price.cash_quote;
      if (!q || q.source === "NEEDS_CONFIRMATION" || q.value.kind !== "exact") {
        return block([issue("SELF_PAY_NOT_VERIFIED", "blocking", "A verified cash price is needed for direct payment.", { ...refs, input_id: q?.input_id ?? null, field: "providers.pricing.cash_quote" })]);
      }
      // (1.4) PRICE-002: a quote is definitive only on or before its valid-through date.
      if (price.cash_quote_valid_through === null) {
        return block([issue("SELF_PAY_NOT_VERIFIED", "blocking", "Ask the office how long its cash price is valid.", { ...refs, input_id: q.input_id, field: "providers.pricing.cash_quote_valid_through" })]);
      }
      if (ev.service_date > price.cash_quote_valid_through) {
        return block([issue("PRICE_QUOTE_EXPIRED", "blocking", "The office's cash price has expired; ask for a new quote.", { ...refs, input_id: q.input_id, field: "providers.pricing.cash_quote_valid_through" })]);
      }
      const cash = q.value.cents;
      const s = stepper(ev.event_id);
      s.add("patient_charge", "Cash price", "cash_quote", [op("cash_quote", input(q.input_id), { cents: cash })], { cents: cash });
      s.add("plan_pay", "Plan pays", "0 (no claim submitted)", [op("claim_submission", rule(cs.rule.rule_id), { text: "paid directly, no claim" })], { cents: 0 });
      s.add("member_responsibility", "You pay", "patient_charge - plan_pay", [op("patient_charge", s.calc("patient_charge"), { cents: cash }), op("plan_pay", s.calc("plan_pay"), { cents: 0 })], { cents: cash });
      return {
        ...line,
        status: "OK",
        modeled_charge_cents: cash,
        contractual_adjustment_cents: 0,
        patient_charge_cents: cash,
        eligible_basis_cents: null,
        balance_bill_cents: 0,
        deductible_applied_cents: 0,
        coverage_rate_bps: null,
        preliminary_plan_pay_cents: null,
        cap_applied: "none",
        plan_pay_cents: 0,
        member_responsibility_cents: cash,
        counts_toward_maximum: false,
        applied_rule_ids: [cs.rule.rule_id],
        input_ids: uniqSorted([q.input_id, provider.self_pay.input_id]),
        steps: s.steps,
        issues: normalizeIssues(stale([q])),
      };
    }

    // 3. Service class
    if (cls === null) {
      if (maps.length === 0) return block([missingRuleIssue("service_class_map")]);
      const bad = maps.filter((r) => r.status !== "VERIFIED");
      return block((bad.length ? bad : maps).map(ruleStatusIssue));
    }
    const network = tier;
    if (network === null) return block([unknownNetwork(provider.network.input_id)]);
    const m = { network, serviceClass: cls, code: ev.cdt_code };
    const applied = [verifiedMaps[0]!.rule_id];
    const info: Issue[] = [];
    let notCovered: { fact: string; text: string } | null = null;

    // 4. Coverage checks
    const li = requireVerified(rulesOf(plan, "limitations_index"), "limitations_index");
    if ("issues" in li) return block(li.issues);
    applied.push(li.rule.rule_id);

    const exclusions = rulesOf(plan, "exclusion").filter((r) => r.status !== "NOT_APPLICABLE" && matches(r, m));
    if (exclusions.some((r) => r.status !== "VERIFIED")) return block(exclusions.filter((r) => r.status !== "VERIFIED").map(ruleStatusIssue));
    if (exclusions.length) {
      const r = exclusions[0]!;
      applied.push(r.rule_id);
      info.push(issue("EXCLUDED_SERVICE", "info", `${ev.cdt_code} is not covered by the plan.`, { ...refs, rule_id: r.rule_id }));
      notCovered = { fact: rule(r.rule_id), text: "excluded service" };
    }

    if (!notCovered) {
      const waits = rulesOf(plan, "waiting_period").filter((r) => matches(r, m));
      if (waits.length === 0) return block([missingRuleIssue("waiting_period")]);
      const badWaits = waits.filter((r) => r.status !== "VERIFIED" && r.status !== "NOT_APPLICABLE");
      if (badWaits.length) return block(badWaits.map(ruleStatusIssue));
      for (const r of waits) {
        if (r.status !== "VERIFIED") continue;
        applied.push(r.rule_id);
        if (ev.service_date < addMonths(member.coverage_effective_from, r.value!.months)) {
          info.push(issue("WAITING_PERIOD", "info", `${ev.cdt_code} is inside the plan's waiting period.`, { ...refs, rule_id: r.rule_id }));
          notCovered = { fact: rule(r.rule_id), text: "waiting period" };
          break;
        }
      }
    }

    if (!notCovered) {
      const freqs = rulesOf(plan, "frequency_limit").filter((r) => matches(r, m));
      const badFreqs = freqs.filter((r) => r.status !== "VERIFIED" && r.status !== "NOT_APPLICABLE");
      if (badFreqs.length) return block(badFreqs.map(ruleStatusIssue));
      const cs = rulesOf(plan, "claim_submission").find((r) => r.status === "VERIFIED");
      const countSelfPay = cs?.value?.self_pay_counts_toward_frequency === true;
      for (const r of freqs) {
        if (r.status !== "VERIFIED") continue;
        const v = r.value!;
        applied.push(r.rule_id);
        const count = [...baseHistory, ...simulated].filter(
          (h) =>
            (h.claimed || countSelfPay) &&
            v.cdt_codes.includes(h.cdt_code) &&
            (v.scope === "per_member" || h.tooth === ev.tooth) &&
            h.service_date <= ev.service_date &&
            (v.window.kind === "benefit_period"
              ? isWithin(h.service_date, plan.coverage_period.start, plan.coverage_period.end)
              : h.service_date > addMonths(ev.service_date, -v.window.months)),
        ).length;
        if (count >= v.max_count) {
          info.push(issue("FREQUENCY_LIMIT", "info", `${ev.cdt_code} is over the plan's frequency limit.`, { ...refs, rule_id: r.rule_id }));
          notCovered = { fact: rule(r.rule_id), text: "frequency limit reached" };
          break;
        }
      }
    }

    // 4.5 Not modeled in v1
    if (!notCovered) {
      const unsupported = [
        ...rulesOf(plan, "alternate_benefit").filter((r) => r.status === "VERIFIED" && r.value!.cdt_code === ev.cdt_code),
        ...rulesOf(plan, "lifetime_maximum").filter((r) => r.status === "VERIFIED" && r.value!.service_class === cls),
        ...rulesOf(plan, "sublimit").filter((r) => r.status === "VERIFIED" && (r.value!.cdt_codes.includes(ev.cdt_code) || r.applies_when.service_class === cls)),
        ...rulesOf(plan, "deductible").filter((r) => r.status === "VERIFIED" && !r.value!.shared_across_networks),
        ...rulesOf(plan, "annual_maximum").filter((r) => r.status === "VERIFIED" && !r.value!.shared_across_networks),
      ];
      if (unsupported.length) {
        return block(unsupported.map((r) => issue("RULE_TYPE_UNSUPPORTED", "blocking", `Plan rule ${r.rule_id} is not modeled in this version.`, { ...refs, rule_id: r.rule_id })));
      }
    }

    // 5. Charge and basis
    const charge = money(price.provider_charge, scenario, "higher_is_worse");
    const inputs = [provider.network.input_id, price.provider_charge.input_id];
    const s = stepper(ev.event_id);
    let patient: Cents;
    let eligible: Cents;
    let adjustment: Cents;
    let balanceBill = 0;
    const chargeOp = () => op("provider_charge", input(price.provider_charge.input_id), { cents: charge! });
    if (network === "in_network") {
      if (charge === null) return block([issue("INPUT_MISSING", "blocking", "The office charge is unknown.", { ...refs, input_id: price.provider_charge.input_id })]);
      const allowed = price.contracted_allowed ? money(price.contracted_allowed, scenario, "higher_is_worse") : null;
      if (allowed === null || !price.contracted_allowed) {
        return block([issue("ALLOWED_AMOUNT_UNKNOWN", "blocking", "The network allowed amount is unknown.", { ...refs, input_id: price.contracted_allowed?.input_id ?? null })]);
      }
      if (allowed > charge) {
        return block([issue("INPUT_INCONSISTENT", "blocking", "The allowed amount is larger than the office charge.", { ...refs, input_id: price.contracted_allowed.input_id })]);
      }
      const allowedOp = op("contracted_allowed", input(price.contracted_allowed.input_id), { cents: allowed });
      inputs.push(price.contracted_allowed.input_id);
      patient = allowed;
      eligible = notCovered ? 0 : allowed;
      adjustment = charge - allowed;
      s.add("patient_charge", "Patient charge", "contracted_allowed", [allowedOp], { cents: patient });
      if (!notCovered) s.add("eligible_basis", "Amount the plan recognizes", "contracted_allowed", [allowedOp], { cents: eligible });
      s.add("contractual_adjustment", "Network discount", "provider_charge - contracted_allowed", [chargeOp(), allowedOp], { cents: adjustment });
    } else {
      if (charge === null) return block([issue("OON_CHARGE_UNKNOWN", "blocking", "The out-of-network office charge is unknown.", { ...refs, input_id: price.provider_charge.input_id })]);
      if (notCovered) {
        patient = charge;
        eligible = 0;
        adjustment = 0;
        s.add("patient_charge", "Patient charge", "provider_charge", [chargeOp()], { cents: patient });
        s.add("contractual_adjustment", "Network discount", "0 (out-of-network)", [chargeOp()], { cents: 0 });
      } else {
        const sched = requireVerified(rulesOf(plan, "oon_allowance_schedule").filter((r) => matches(r, m)), "oon_allowance_schedule");
        if ("issues" in sched) return block(sched.issues);
        const allowance = sched.rule.value!.allowances.find((a) => a.cdt_code === ev.cdt_code)?.cents;
        if (allowance === undefined) return block([missingRuleIssue("oon_allowance_schedule")]);
        applied.push(sched.rule.rule_id);
        const allowOp = op("oon_allowance", rule(sched.rule.rule_id), { cents: allowance });
        eligible = Math.min(charge, allowance);
        s.add("eligible_basis", "Amount the plan recognizes", "min(provider_charge, oon_allowance)", [chargeOp(), allowOp], { cents: eligible });
        if (sched.rule.value!.balance_billing_permitted) {
          patient = charge;
          adjustment = 0;
          balanceBill = charge - eligible;
          s.add("patient_charge", "Patient charge", "provider_charge (balance billing permitted)", [chargeOp(), allowOp], { cents: patient });
          s.add("contractual_adjustment", "Network discount", "0 (out-of-network)", [chargeOp()], { cents: 0 });
        } else {
          patient = eligible;
          adjustment = charge - eligible;
          s.add("patient_charge", "Patient charge", "min(provider_charge, oon_allowance)", [chargeOp(), allowOp], { cents: patient });
          s.add("contractual_adjustment", "Write-off", "provider_charge - eligible_basis", [chargeOp(), op("eligible_basis", s.calc("eligible_basis"), { cents: eligible })], { cents: adjustment });
        }
      }
    }

    info.push(...stale([price.provider_charge, network === "in_network" ? price.contracted_allowed : null]));

    // §3.3.12 NOT_COVERED
    if (notCovered) {
      const nc = op("coverage", notCovered.fact, { text: notCovered.text });
      s.add("eligible_basis", "Amount the plan recognizes", "0 (not covered)", [nc], { cents: 0 });
      s.add("deductible", "Deductible applied", "0 (not covered)", [nc], { cents: 0 });
      s.add("coverage_rate", "Plan share", "0 (not covered)", [nc], { bps: 0 });
      s.add("preliminary_plan_pay", "Plan share before limits", "0 (not covered)", [nc], { cents: 0 });
      s.add("plan_pay", "Plan pays", "0 (not covered)", [nc], { cents: 0 });
      s.add("member_responsibility", "You pay", "patient_charge - plan_pay", [op("patient_charge", s.calc("patient_charge"), { cents: patient }), op("plan_pay", s.calc("plan_pay"), { cents: 0 })], { cents: patient });
      return {
        ...line,
        status: "NOT_COVERED",
        modeled_charge_cents: charge,
        contractual_adjustment_cents: adjustment,
        patient_charge_cents: patient,
        eligible_basis_cents: 0,
        balance_bill_cents: 0,
        deductible_applied_cents: 0,
        coverage_rate_bps: 0,
        preliminary_plan_pay_cents: 0,
        cap_applied: "none",
        plan_pay_cents: 0,
        member_responsibility_cents: patient,
        counts_toward_maximum: false,
        applied_rule_ids: uniqSorted(applied),
        input_ids: uniqSorted(inputs),
        steps: s.steps,
        issues: normalizeIssues(info),
      };
    }

    // 6. Deductible
    const ded = requireVerified(rulesOf(plan, "deductible"), "deductible");
    if ("issues" in ded) return block(ded.issues);
    applied.push(ded.rule.rule_id);
    const dedApplies = ded.rule.value!.applies_to_classes.includes(cls);
    const dedApplied = dedApplies ? Math.min(state.deductible_available_cents, eligible) : 0;
    s.add(
      "deductible",
      "Deductible applied",
      dedApplies ? "min(deductible_available, eligible_basis)" : `0 (deductible does not apply to ${cls})`,
      dedApplies
        ? [op("deductible_available", period.dedFact, { cents: state.deductible_available_cents }), op("eligible_basis", s.calc("eligible_basis"), { cents: eligible })]
        : [op("deductible_rule", rule(ded.rule.rule_id), { text: `applies to ${ded.rule.value!.applies_to_classes.join(", ")}` })],
      { cents: dedApplied },
    );

    // 7. Rate
    const share = requireVerified(rulesOf(plan, "plan_share").filter((r) => matches(r, m)), "plan_share");
    if ("issues" in share) return block(share.issues);
    const wantBasis = network === "in_network" ? "allowed_amount_after_deductible" : "oon_allowance_after_deductible";
    if (share.rule.value!.basis !== wantBasis) {
      return block([issue("RULE_TYPE_UNSUPPORTED", "blocking", `Plan rule ${share.rule.rule_id} uses a basis that does not match this claim.`, { ...refs, rule_id: share.rule.rule_id })]);
    }
    applied.push(share.rule.rule_id);
    const rate = share.rule.value!.rate_bps;
    s.add("coverage_rate", "Plan share", "plan_share rate", [op("plan_share", rule(share.rule.rule_id), { bps: rate })], { bps: rate });

    // 8. Preliminary plan pay
    const prelim = applyRateRoundHalfUp(eligible - dedApplied, rate);
    s.add(
      "preliminary_plan_pay",
      "Plan share before limits",
      "round_half_up((eligible_basis - deductible) * rate)",
      [
        op("eligible_basis", s.calc("eligible_basis"), { cents: eligible }),
        op("deductible", s.calc("deductible"), { cents: dedApplied }),
        op("rate", s.calc("coverage_rate"), { bps: rate }),
      ],
      { cents: prelim },
    );

    // 9. Caps
    const max = requireVerified(rulesOf(plan, "annual_maximum"), "annual_maximum");
    if ("issues" in max) return block(max.issues);
    applied.push(max.rule.rule_id);
    const counts = max.rule.value!.counts_classes.includes(cls);
    if (counts && period.carryRuleId) applied.push(period.carryRuleId);
    const planPay = counts ? Math.min(prelim, state.annual_max_available_cents) : prelim;
    const cap = planPay < prelim ? "annual_maximum" : "none";
    s.add(
      "plan_pay",
      "Plan pays",
      counts ? "min(preliminary_plan_pay, annual_max_available)" : "preliminary_plan_pay (not counted toward the annual maximum)",
      counts
        ? [op("preliminary_plan_pay", s.calc("preliminary_plan_pay"), { cents: prelim }), op("annual_max_available", period.maxFact, { cents: state.annual_max_available_cents })]
        : [op("preliminary_plan_pay", s.calc("preliminary_plan_pay"), { cents: prelim }), op("annual_maximum", rule(max.rule.rule_id), { text: `counts ${max.rule.value!.counts_classes.join(", ")} only` })],
      { cents: planPay },
    );

    // 10. Member responsibility
    const memberPays = patient - planPay;
    s.add("member_responsibility", "You pay", "patient_charge - plan_pay", [op("patient_charge", s.calc("patient_charge"), { cents: patient }), op("plan_pay", s.calc("plan_pay"), { cents: planPay })], { cents: memberPays });

    // 11. State update
    const after: BenefitPeriodState = {
      ...state,
      deductible_remaining_cents: state.deductible_remaining_cents - dedApplied,
      deductible_available_cents: state.deductible_available_cents - dedApplied,
      annual_max_remaining_cents: counts ? state.annual_max_remaining_cents - planPay : state.annual_max_remaining_cents,
      annual_max_available_cents: counts ? state.annual_max_available_cents - planPay : state.annual_max_available_cents,
      simulated_plan_paid_cents: state.simulated_plan_paid_cents + planPay,
    };
    period.state = after;
    simulated.push({ cdt_code: ev.cdt_code, tooth: ev.tooth, service_date: ev.service_date, source: "ESTIMATE", claimed: true });

    return {
      ...line,
      status: "OK",
      modeled_charge_cents: charge,
      contractual_adjustment_cents: adjustment,
      patient_charge_cents: patient,
      eligible_basis_cents: eligible,
      balance_bill_cents: balanceBill,
      deductible_applied_cents: dedApplied,
      coverage_rate_bps: rate,
      preliminary_plan_pay_cents: prelim,
      cap_applied: cap,
      plan_pay_cents: planPay,
      member_responsibility_cents: memberPays,
      counts_toward_maximum: counts,
      state_after: after,
      applied_rule_ids: uniqSorted(applied),
      input_ids: uniqSorted([...inputs, ...period.inputIds]),
      steps: s.steps,
      issues: normalizeIssues(info),
    };
  };
  for (const ev of events) lines.push(adjudicateEvent(ev));
  // End of run: close every opened period not yet closed (no carry-in).
  for (const p of periods.values()) close(p);
  const rollover = [...closed.values()]
    .filter((o): o is RolloverOutcome => o !== null)
    .sort((a, b) => cmp(a.closing_period_end, b.closing_period_end));

  const issues = normalizeIssues(simIssues);
  const status = lines.some((l) => l.status === "UNSUPPORTED_PLAN_TYPE")
    ? "UNSUPPORTED_PLAN_TYPE"
    : lines.some((l) => l.status === "NEEDS_CONFIRMATION") || issues.some((i) => i.severity === "blocking")
      ? "NEEDS_CONFIRMATION"
      : "OK";
  const sum = (f: (l: AdjudicationLine) => number | null) => lines.reduce((a, l) => a + (f(l) ?? 0), 0);
  const history = sortHistory(baseHistory);
  return {
    contract_version: CONTRACT_VERSION,
    engine_id: ENGINE_IDS.benefits,
    status,
    scenario,
    lines,
    ledger_before: { periods: sortPeriods([...initial.values()]), history },
    ledger_after: {
      periods: sortPeriods([...periods.values()].flatMap((p) => (p.state ? [p.state] : []))),
      history: sortHistory([...baseHistory, ...simulated]),
    },
    totals:
      status === "OK"
        ? {
            modeled_charge_cents: sum((l) => l.modeled_charge_cents),
            contractual_adjustment_cents: sum((l) => l.contractual_adjustment_cents),
            plan_pay_cents: sum((l) => l.plan_pay_cents),
            member_responsibility_cents: sum((l) => l.member_responsibility_cents),
          }
        : null,
    applied_rule_ids: uniqSorted(lines.flatMap((l) => l.applied_rule_ids)),
    issues,
    rollover,
  };
}
