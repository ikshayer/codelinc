/**
 * AT-21: Year-close maximum carryover (CONTRACT §3.9, §5.10; requirements §5, §14.2 #1–11).
 * PLANNER-OWNED, FROZEN (1.5). Unless stated otherwise: shipped registry, near-threshold member
 * (2026: plan paid $420, deductible met, no pending claims, carryover balance $0), as_of 2026-10-15.
 */
import { describe, expect, it } from "vitest";
import {
  CarePlanResult,
  ExplanationInput,
  MemberState,
  parseFactId,
  ROLLOVER_STEPS,
  rolloverStepId,
  SimulationResult,
  WORDING,
  type ClaimEvent,
  type PlanRegistry,
  type RolloverOutcome,
  type Scenario,
  type SourcedMoney,
} from "@/domain";
import type { ApiResponseLike } from "@/domain/ports";
import { createApiHandlers } from "@/api";
import { buildExplanationInput, createAiAdapters, validateExplanation } from "@/ai";
import {
  benefits,
  fx,
  golden,
  mutateRule,
  optimize,
  P1,
  P2,
  POSTVISIT_AS_OF,
  procedure,
  PV2026,
  PV2027,
  registry,
  scenario,
} from "./helpers";

const exact = (cents: number) => ({ kind: "exact" as const, cents });
const money = (input_id: string, cents: number): SourcedMoney => ({ input_id, value: exact(cents), source: "CLAIM_EOB", observed_at: "2026-10-05T13:00:00Z" });

/** Near-threshold member; `ytd` and `carry` keep the snapshot consistent (remaining + ytd = $1,500 + carry). */
function member(o: { ytd?: number; carry?: number | null; pending?: number[] } = {}): MemberState {
  const m = fx.member();
  const a = m.accumulators[0]!;
  const ytd = o.ytd ?? 42000;
  const carry = o.carry === undefined ? 0 : o.carry;
  a.deductible_remaining.value = exact(0);
  a.plan_paid_ytd.value = exact(ytd);
  a.annual_max_remaining.value = exact(150000 + (carry ?? 0) - ytd);
  a.carryover_balance = carry === null ? null : money("member.acc.2026.carryover_balance", carry);
  const template = fx.member().pending_claims[0]!;
  m.pending_claims = (o.pending ?? []).map((cents, i) => ({
    ...structuredClone(template),
    claim_id: `claim-pending-${i}`,
    estimated_plan_pay: { ...template.estimated_plan_pay, input_id: `member.pending.claim-pending-${i}.plan_pay`, value: exact(cents) },
    estimated_deductible_applied: { ...template.estimated_deductible_applied, input_id: `member.pending.claim-pending-${i}.deductible`, value: exact(0) },
  }));
  return MemberState.parse(m);
}

const ev = (o: Partial<ClaimEvent>): ClaimEvent => ({
  event_id: "e1",
  procedure_id: "proc-fill-14",
  cdt_code: "D2392",
  tooth: "14",
  service_date: "2027-01-05",
  claim_date: null,
  provider_id: P1,
  claim_route: "IN_NETWORK_CLAIM",
  ...o,
});
const FILL_2027 = ev({});
const FILL_2026 = ev({ event_id: "e0", service_date: "2026-10-20" });
const OON_2026 = ev({ event_id: "e0", service_date: "2026-10-17", provider_id: P2, claim_route: "OUT_OF_NETWORK_CLAIM" });

function sim(
  events: ClaimEvent[],
  o: { m?: MemberState; reg?: PlanRegistry; scenario?: Scenario; asOf?: string } = {},
): SimulationResult {
  return SimulationResult.parse(
    benefits.simulate(o.reg ?? registry(), {
      as_of: o.asOf ?? POSTVISIT_AS_OF,
      scenario: o.scenario ?? "worst_case",
      member: o.m ?? member(),
      providers: fx.providersPost(),
      events,
    }),
  );
}
const out = (s: SimulationResult): RolloverOutcome => {
  const o = s.rollover.filter((x) => x.closing_plan_version_id === PV2026);
  expect(o).toHaveLength(1);
  return o[0]!;
};
const bank = (low: number, high = low) => ({ low_cents: low, high_cents: high });
const max2027 = (s: SimulationResult) => s.lines.find((l) => l.plan_version_id === PV2027)!.state_before!.annual_max_remaining_cents;

/** Registry copy with only the 2026 rollover value changed. */
function rolloverVariant(change: Record<string, unknown>): PlanRegistry {
  return mutateRule(registry(), PV2026, "rollover.2026", (r) => (r.rule_type === "rollover" && r.value ? { ...r, value: { ...r.value, ...change } } : r));
}

function nearThresholdPlan(mutate?: (r: Parameters<Parameters<typeof optimize>[0] & object>[0]) => void, reg?: PlanRegistry): CarePlanResult {
  return optimize((r) => {
    r.member = member();
    r.procedures = r.procedures.filter((p) => p.procedure_id === "proc-fill-14");
    mutate?.(r);
  }, reg);
}

describe("AT-21 §14.2 #1 / ROLL-001 qualifying amount below the threshold", () => {
  it("a 2027-only schedule leaves 2026 at $420: CONDITIONAL $250, added to the 2027 maximum in best_case only", () => {
    const worst = sim([FILL_2027]);
    const o = out(worst);
    expect(o.status).toBe("CONDITIONAL");
    expect(o.qualifying_plan_paid).toEqual(bank(42000));
    expect(o.final_bank).toEqual(bank(25000));
    expect(o.lost_to_cap_cents).toBe(0);
    expect(o.next_plan_version_id).toBe(PV2027);
    expect(max2027(worst)).toBe(150000);
    const best = sim([FILL_2027], { scenario: "best_case" });
    expect(max2027(best)).toBe(175000);
    expect(best.lines[0]!.applied_rule_ids).toContain("rollover.2026");
  });

  it("preventive and self-pay lines never count toward the qualifying amount", () => {
    const s = sim([
      ev({ event_id: "e0", cdt_code: "D0140", tooth: null, service_date: "2026-11-05" }),
      ev({ event_id: "e0b", service_date: "2026-10-20", claim_route: "SELF_PAY_NO_CLAIM" }),
      FILL_2027,
    ]);
    expect(s.lines.slice(0, 2).map((l) => [l.status, l.counts_toward_maximum])).toEqual([["OK", false], ["OK", false]]);
    expect(out(s).qualifying_plan_paid).toEqual(bank(42000));
    expect(out(s).status).toBe("CONDITIONAL");
  });
});

describe("AT-21 §14.2 #2–3 / ROLL-003 threshold boundary", () => {
  it("exactly $500 is not below the threshold (LT); LTE earns; $499.99 earns under LT", () => {
    expect(out(sim([FILL_2027], { m: member({ ytd: 50000 }) })).status).toBe("NOT_EARNED");
    expect(out(sim([FILL_2027], { m: member({ ytd: 50000 }), reg: rolloverVariant({ threshold_comparison: "LTE" }) })).status).toBe("CONDITIONAL");
    expect(out(sim([FILL_2027], { m: member({ ytd: 49999 }) })).status).toBe("CONDITIONAL");
  });

  it("#3 the golden scenario is over the threshold: NOT_EARNED in every alternative (expected.json)", () => {
    const r = optimize();
    const g = golden.postvisit.base.alternatives;
    expect(r.alternatives).toHaveLength(g.length);
    r.alternatives.forEach((a, i) => {
      expect(a.rollover).toHaveLength(1);
      expect(a.rollover[0]).toMatchObject(g[i]!.rollover[0]!);
      expect(a.applied_rule_ids).toContain("rollover.2026");
      for (const e of a.events) expect(e.rollover_shift, e.procedure_id).toBeNull();
    });
    expect(r.alternatives[0]!.rollover[0]!.qualifying_plan_paid).toEqual(bank(142400, 150000));
    expect(r.evidence.some((e) => e.rule_id === "rollover.2026" && e.evidence.some((x) => x.source_id === "nwd-ppo-2026-carryover-rider"))).toBe(true);
  });
});

describe("AT-21 §14.2 #4 / ROLL-004 network bonus", () => {
  const reg = () => rolloverVariant({ network_bonus_condition: "ANY_IN_NETWORK_CLAIM", network_bonus_cents: 10000 });
  it("an in-network 2026 claim earns the bonus; an out-of-network claim alone does not", () => {
    expect(out(sim([FILL_2026], { m: member({ ytd: 0 }), reg: reg() })).final_bank).toEqual(bank(35000));
    expect(out(sim([OON_2026], { m: member({ ytd: 0 }), reg: reg() })).final_bank).toEqual(bank(25000));
  });
  it("settled claims of unknown network make the bonus uncertain", () => {
    const o = out(sim([FILL_2027], { reg: reg() }));
    expect(o.status).toBe("UNCERTAIN");
    expect(o.final_bank).toEqual(bank(25000, 35000));
    expect(o.network_bonus).toEqual(bank(0, 10000));
  });
});

describe("AT-21 §14.2 #5–6 / ROLL-005 bank treatment and cap", () => {
  it("#5 a $500 balance plus the $250 award stays under the cap", () => {
    const s = sim([FILL_2027], { m: member({ carry: 50000 }) });
    expect(s.issues.filter((i) => i.code === "INPUT_INCONSISTENT")).toEqual([]);
    const o = out(s);
    expect(o.prior_bank_cents).toBe(50000);
    expect(o.final_bank).toEqual(bank(75000));
    expect(o.lost_to_cap_cents).toBe(0);
  });
  it("#6 a $900 balance is capped at $1,000 and $150 is lost; not qualifying forfeits the balance", () => {
    const o = out(sim([FILL_2027], { m: member({ carry: 90000 }) }));
    expect(o.final_bank).toEqual(bank(100000));
    expect(o.lost_to_cap_cents).toBe(15000);
    const lost = out(sim([FILL_2027], { m: member({ ytd: 60000, carry: 90000 }) }));
    expect(lost.status).toBe("NOT_EARNED");
    expect(lost.final_bank).toEqual(bank(0));
    expect(lost.forfeited_cents).toBe(90000);
  });
});

describe("AT-21 §14.2 #7 no eligible claim", () => {
  it("no paid claim in 2026 earns nothing when one is required", () => {
    expect(out(sim([FILL_2027], { m: member({ ytd: 0 }) })).status).toBe("NOT_EARNED");
    const reg = rolloverVariant({ requires_at_least_one_eligible_claim: false });
    expect(out(sim([FILL_2027], { m: member({ ytd: 0 }), reg })).status).toBe("CONDITIONAL");
  });
});

describe("AT-21 §14.2 #8 / ROLL-008 pending claims", () => {
  it("a pending claim that crosses the threshold gives a range, never a definitive award", () => {
    const m = member({ pending: [10000] });
    m.accumulators[0]!.annual_max_remaining.value = exact(108000);
    const s = sim([FILL_2027], { m });
    const o = out(s);
    expect(o.status).toBe("UNCERTAIN");
    expect(o.qualifying_plan_paid).toEqual(bank(42000, 52000));
    expect(o.final_bank).toEqual(bank(0, 25000));
    expect(o.issues.map((i) => i.code)).toContain("ROLLOVER_UNCERTAIN");
    expect(max2027(s)).toBe(150000);
    expect(max2027(sim([FILL_2027], { m, scenario: "best_case" }))).toBe(175000);
  });

  it("the explanation never calls an uncertain carryover earned", async () => {
    const result = nearThresholdPlan((r) => {
      r.member = member({ pending: [10000] });
      procedure(r.procedures, "proc-fill-14").earliest_safe_date = "2027-01-04";
    });
    const alt = result.alternatives[0]!;
    expect(alt.rollover[0]!.status).toBe("UNCERTAIN");
    const input = ExplanationInput.parse(
      buildExplanationInput({ registry: registry(), benefits, result: { kind: "care_plan", value: result }, procedures: fx.procedures(), focusId: null }),
    );
    const expl = await createAiAdapters({ mode: "synthetic" }).templateExplainer.explain(input);
    expect(validateExplanation(expl, input).ok).toBe(true);
    const text = [expl.summary, ...expl.claims.map((c) => c.text)].join("\n");
    expect(text).toContain("cannot be confirmed yet");
    expect(text).not.toMatch(/\bearned\b|is carried|guarantee/i);
  });

  // (1.6, R2-M1) A ranged settled amount is resolved the same way in every scenario.
  it("a plan_paid_ytd range straddling the threshold gives the same UNCERTAIN range in both scenarios", () => {
    const m = member({ ytd: 50000 });
    m.accumulators[0]!.plan_paid_ytd.value = { kind: "range", low_cents: 45000, high_cents: 55000 };
    const worst = out(sim([FILL_2027], { m }));
    const best = out(sim([FILL_2027], { m, scenario: "best_case" }));
    expect(worst.status).toBe("UNCERTAIN");
    expect(worst.settled_plan_paid).toEqual(bank(45000, 55000));
    expect(worst.qualifying_plan_paid).toEqual(bank(45000, 55000));
    expect(worst.final_bank).toEqual(bank(0, 25000));
    expect(worst.issues.find((i) => i.code === "ROLLOVER_UNCERTAIN")?.message).toContain("not exact");
    expect(best).toEqual(worst);
    const high = worst.steps.find((s) => s.step_id === rolloverStepId(PV2026, "qualifying_high"))!;
    expect(high.operands.map((o) => o.name)).toContain("settled_plan_paid_range");
  });

  it("a ranged carryover balance in a qualifying year needs confirmation instead of using one end", () => {
    const m = member({ ytd: 42000, carry: 0 });
    m.accumulators[0]!.carryover_balance!.value = { kind: "range", low_cents: 0, high_cents: 50000 };
    for (const scenario of ["worst_case", "best_case"] as const) {
      const s = sim([FILL_2027], { m, scenario });
      const o = out(s);
      expect(o.status).toBe("NEEDS_CONFIRMATION");
      expect(o.final_bank).toBeNull();
      expect(o.issues.find((i) => i.code === "INPUT_MISSING")?.message).toContain("is not exact");
      expect(max2027(s)).toBe(150000);
    }
  });
});

describe("AT-21 §14.2 #9 / ROLL-006/007 next-year plan", () => {
  it("an unknown next plan needs confirmation and adds nothing", () => {
    const reg = registry();
    reg.plans = reg.plans.filter((p) => p.plan_version_id !== PV2027);
    const o = out(sim([FILL_2026], { reg }));
    expect(o.status).toBe("NEEDS_CONFIRMATION");
    expect(o.next_plan_version_id).toBeNull();
    expect(o.final_bank).toBeNull();
    expect(o.issues.map((i) => i.code)).toContain("ROLLOVER_NEXT_PLAN_UNKNOWN");
  });
  it("a next plan the rule does not list is ineligible: nothing is carried in either scenario", () => {
    const reg = rolloverVariant({ applies_to_next_plan_version_ids: ["other"] });
    const o = out(sim([FILL_2027], { reg }));
    expect(o.status).toBe("NOT_EARNED");
    expect(o.issues.map((i) => i.code)).toContain("ROLLOVER_NEXT_PLAN_INELIGIBLE");
    expect(max2027(sim([FILL_2027], { reg, scenario: "best_case" }))).toBe(150000);
    expect(max2027(sim([FILL_2027], { reg }))).toBe(150000);
  });
  it("the shipped registry resolves the exact 2027 version", () => {
    expect(out(sim([FILL_2027])).next_plan_version_id).toBe(PV2027);
  });
});

describe("AT-21 §14.2 #10 / ROLL-002 never double-credited", () => {
  it("repeated simulation is identical and two 2027 events add the carryover once", () => {
    const events = [FILL_2027, ev({ event_id: "e2", tooth: "3", service_date: "2027-02-09" })];
    const a = sim(events, { scenario: "best_case" });
    expect(sim(events, { scenario: "best_case" })).toEqual(a);
    expect(a.rollover).toHaveLength(1);
    expect(a.lines[0]!.state_before!.annual_max_remaining_cents).toBe(175000);
    expect(a.lines[1]!.state_before!.annual_max_remaining_cents).toBe(175000 - a.lines[0]!.plan_pay_cents!);
  });

  it("a 2027 snapshot already includes the carryover: nothing is added; the closed year is EARNED", () => {
    const m = member();
    m.accumulators.push({
      plan_version_id: PV2027,
      period_start: "2027-01-01",
      period_end: "2027-12-31",
      deductible_remaining: money("member.acc.2027.deductible_remaining", 7500),
      annual_max_remaining: money("member.acc.2027.annual_max_remaining", 175000),
      plan_paid_ytd: money("member.acc.2027.plan_paid_ytd", 0),
      carryover_balance: money("member.acc.2027.carryover_balance", 25000),
    });
    const s = sim([ev({ service_date: "2027-01-14" })], { m: MemberState.parse(m), scenario: "best_case", asOf: "2027-01-10T15:00:00Z" });
    expect(s.issues.filter((i) => i.severity === "blocking")).toEqual([]);
    expect(s.lines[0]!.state_before!.opened_from).toBe("snapshot");
    expect(s.lines[0]!.state_before!.annual_max_remaining_cents).toBe(175000);
    expect(out(s).status).toBe("EARNED");
  });

  it("the care-plan result is byte-identical across runs", () => {
    const runs = [0, 1, 2].map(() => JSON.stringify(nearThresholdPlan()));
    expect(new Set(runs).size).toBe(1);
  });
});

describe("AT-21 §14.2 #11 / ROLL-010 urgent care is never delayed for a carryover", () => {
  const withUrgent = (r: Parameters<Parameters<typeof optimize>[0] & object>[0]) => {
    const all = fx.procedures();
    const rc = procedure(all, "proc-rc-30");
    rc.earliest_safe_date = "2026-12-15";
    rc.target_date = "2026-12-17";
    rc.latest_safe_date = "2027-01-20";
    r.procedures = [rc, procedure(all, "proc-fill-14")];
  };
  it("rollover never changes the selected schedules, urgent dates or shift eligibility", () => {
    const withRule = nearThresholdPlan(withUrgent);
    const noRule = nearThresholdPlan(withUrgent, mutateRule(registry(), PV2026, "rollover.2026", (r) => ({ ...r, status: "NOT_APPLICABLE", value: null })));
    expect(withRule.alternatives.map((a) => a.schedule_key)).toEqual(noRule.alternatives.map((a) => a.schedule_key));
    for (const [i, a] of withRule.alternatives.entries()) {
      const urgent = a.events.find((e) => e.procedure_id === "proc-rc-30")!;
      expect(urgent.rollover_shift).toBeNull();
      expect(urgent.service_date <= noRule.alternatives[i]!.events.find((e) => e.procedure_id === "proc-rc-30")!.service_date).toBe(true);
    }
    expect(noRule.alternatives.every((a) => a.rollover.length === 0 && a.events.every((e) => e.rollover_shift === null))).toBe(true);
  });
});

describe("AT-21 ROLL-009 trace", () => {
  it("the outcome shows every step and each operand resolves", () => {
    const m = member({ ytd: 20000 });
    const s = sim([FILL_2026, FILL_2027], { m });
    const o = out(s);
    expect(o.qualifying_plan_paid).toEqual(bank(34400));
    expect(o.steps.map((x) => x.step_id)).toEqual(ROLLOVER_STEPS.map((n) => rolloverStepId(PV2026, n)));
    const reg = registry();
    const inputs = new Set(JSON.stringify(m).match(/"input_id":"[^"]+"/g)!.map((x) => x.slice(12, -1)));
    const steps = new Set([...s.lines.flatMap((l) => l.steps.map((x) => x.step_id)), ...o.steps.map((x) => x.step_id)]);
    for (const step of o.steps) {
      for (const operand of step.operands) {
        const f = parseFactId(operand.fact_id)!;
        expect(f, operand.fact_id).not.toBeNull();
        if (f.kind === "rule") expect(reg.plans.flatMap((p) => p.rules).find((r) => r.rule_id === f.ref)?.status).toBe("VERIFIED");
        else if (f.kind === "input") expect(inputs.has(f.ref), operand.fact_id).toBe(true);
        else if (f.kind === "calc") expect(steps.has(f.ref), operand.fact_id).toBe(true);
        else throw new Error(`unexpected fact ${operand.fact_id}`);
      }
    }
    expect(o.steps.find((x) => x.step_id.endsWith(".qualifying_low"))!.operands.map((x) => x.fact_id)).toContain("calc:e0.plan_pay");
    expect(o.applied_rule_ids).toEqual(["rollover.2026"]);
  });
});

describe("AT-21 unverified rule keeps the conservative path", () => {
  it("an UNVERIFIED rollover rule is noted, never modeled or applied", () => {
    const reg = mutateRule(registry(), PV2026, "rollover.2026", (r) => ({ ...r, status: "UNVERIFIED" }));
    const s = sim([FILL_2027], { reg, scenario: "best_case" });
    expect(s.rollover).toEqual([]);
    expect(s.issues.some((i) => i.code === "RULE_UNVERIFIED" && i.rule_id === "rollover.2026")).toBe(true);
    expect(max2027(s)).toBe(150000);
  });
});

describe("AT-21 golden rollover_near_threshold variant", () => {
  it("matches expected.json: per-alternative outcomes and the display-only shift", () => {
    const g = golden.postvisit.variants.rollover_near_threshold;
    const r = nearThresholdPlan();
    expect(r.status).toBe(g.status);
    expect(r.alternatives.map((a) => a.labels)).toEqual(g.alternatives.map((a) => a.labels));
    r.alternatives.forEach((a, i) => {
      const ga = g.alternatives[i]!;
      expect(a.totals.member_cost.high_cents).toBe(ga.member_cost_cents);
      expect(a.rollover).toHaveLength(1);
      expect(a.rollover[0]).toMatchObject(ga.rollover[0]!);
      a.events.forEach((e, j) => {
        const { rollover_shift, ...fields } = ga.events[j]!;
        expect(e).toMatchObject({ procedure_id: fields.procedure_id, service_date: fields.service_date, slot_id: fields.slot_id, provider_id: fields.provider_id, claim_route: fields.claim_route });
        expect(e.line_worst.plan_pay_cents).toBe(fields.plan_pay_cents);
        expect(e.rollover_shift).toEqual(rollover_shift);
      });
    });
  });
});

describe("AT-21 §5.4 explanation", () => {
  async function explain(result: CarePlanResult) {
    const input = ExplanationInput.parse(
      buildExplanationInput({ registry: registry(), benefits, result: { kind: "care_plan", value: result }, procedures: fx.procedures(), focusId: null }),
    );
    const expl = await createAiAdapters({ mode: "synthetic" }).templateExplainer.explain(input);
    return { expl, validation: validateExplanation(expl, input), text: [expl.summary, ...expl.claims.map((c) => c.text)].join("\n") };
  }
  it("the near-threshold explanation states the optional shift and validates; no forbidden wording", async () => {
    const near = await explain(nearThresholdPlan());
    expect(near.validation).toEqual({ ok: true, violations: [] });
    expect(near.text).toContain("Your plan has paid $420 toward this year's maximum so far.");
    expect(near.text).toContain("Moving it to Jan 5, 2027 is optional, stays within your dentist's window, and increases your estimated cost by $60.");
    const base = await explain(optimize());
    expect(base.validation.ok).toBe(true);
    expect(base.text).toContain("are not below the $500 carryover threshold, so no carryover is earned.");
    for (const t of [near.text, base.text]) for (const phrase of WORDING.forbidden_phrases) expect(t.toLowerCase()).not.toContain(phrase.toLowerCase());
  });

  // (1.6, R2-L1) A move that lowers the cost says so, and the template explanation still validates.
  it("a negative shift delta is stated as a saving and validates", async () => {
    let reg = mutateRule(registry(), PV2027, "deductible.2027", (r) => ({ ...r, value: { ...(r.value as object), individual_cents: 0 } }) as typeof r);
    reg = mutateRule(reg, PV2027, "plan_share.in_network.basic.2027", (r) => ({ ...r, value: { ...(r.value as object), rate_bps: 8500 } }) as typeof r);
    const result = nearThresholdPlan(undefined, reg);
    const alt = result.alternatives.find((a) => a.events.some((e) => (e.rollover_shift?.member_cost_delta_cents ?? 0) < 0))!;
    expect(alt.events.find((e) => e.rollover_shift)!.rollover_shift!.member_cost_delta_cents).toBe(-900);
    const input = ExplanationInput.parse(
      buildExplanationInput({ registry: reg, benefits, result: { kind: "care_plan", value: result }, procedures: fx.procedures(), focusId: alt.alternative_id }),
    );
    const expl = await createAiAdapters({ mode: "synthetic" }).templateExplainer.explain(input);
    expect(validateExplanation(expl, input)).toEqual({ ok: true, violations: [] });
    expect([expl.summary, ...expl.claims.map((c) => c.text)].join("\n")).toContain("lowers your estimated cost by $9.");
  });
});

describe("AT-21 API: carryover_balance is optional on input (L-2)", () => {
  const api = createApiHandlers();
  const H = { "content-type": "application/json" };
  const body = (mutate: (m: Record<string, unknown>) => void) => {
    const m = structuredClone(fx.member()) as unknown as { accumulators: Record<string, unknown>[] };
    mutate(m.accumulators[0]!);
    return {
      as_of: scenario.postvisit_as_of,
      member: m,
      providers: fx.providersPost(),
      procedures: fx.procedures(),
      planning_horizon_end: scenario.planning_horizon_end,
      max_alternatives: 3,
    };
  };
  it("a request without carryover_balance parses; an unknown accumulator key is rejected", async () => {
    const ok: ApiResponseLike = await api.care_plan({ method: "POST", headers: H, body: body((a) => delete a.carryover_balance) });
    expect(ok.status).toBe(200);
    const r = CarePlanResult.parse((ok.body as { data: unknown }).data);
    expect(r.alternatives.map((a) => a.rollover[0]!.status)).toEqual(["NOT_EARNED", "NOT_EARNED"]);
    const bad = await api.care_plan({ method: "POST", headers: H, body: body((a) => (a.carryover_override = 1)) });
    expect(bad.status).toBe(400);
  });
});
