/**
 * Reviewer (iteration 2, contract 1.5) rollover edge probes (§5.3, §14.2, EDU-004).
 * Review-only: pins boundary behavior the acceptance suite does not, and documents findings.
 */
import { describe, expect, it } from "vitest";
import { ExplanationInput, MemberState, SimulationResult, type ClaimEvent, type MoneyInput, type PlanRegistry, type Scenario } from "@/domain";
import { buildExplanationInput, createAiAdapters, validateExplanation } from "@/ai";
import { benefits, fx, mutateRule, optimize, P1, POSTVISIT_AS_OF, PV2026, PV2027, registry } from "../acceptance/helpers";

const exact = (cents: number): MoneyInput => ({ kind: "exact", cents });

function member(o: { ytd?: MoneyInput; remaining?: number; carry?: number; deductible?: number } = {}): MemberState {
  const m = fx.member();
  const a = m.accumulators[0]!;
  a.deductible_remaining.value = exact(o.deductible ?? 0);
  a.plan_paid_ytd.value = o.ytd ?? exact(42000);
  const ytd = a.plan_paid_ytd.value.kind === "exact" ? a.plan_paid_ytd.value.cents : 0;
  a.annual_max_remaining.value = exact(o.remaining ?? 150000 + (o.carry ?? 0) - ytd);
  a.carryover_balance = { input_id: "member.acc.2026.carryover_balance", value: exact(o.carry ?? 0), source: "CLAIM_EOB", observed_at: "2026-10-05T13:00:00Z" };
  m.pending_claims = [];
  return MemberState.parse(m);
}
const ev = (o: Partial<ClaimEvent> = {}): ClaimEvent => ({
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
const sim = (events: ClaimEvent[], m: MemberState, scenario: Scenario = "worst_case", reg: PlanRegistry = registry()) =>
  SimulationResult.parse(benefits.simulate(reg, { as_of: POSTVISIT_AS_OF, scenario, member: m, providers: fx.providersPost(), events }));
const out2026 = (s: SimulationResult) => s.rollover.find((o) => o.closing_plan_version_id === PV2026)!;
const max2027 = (s: SimulationResult) => s.lines.find((l) => l.plan_version_id === PV2027)!.state_before!.annual_max_remaining_cents;

describe("review iter2 threshold boundary around $500 (strict LT)", () => {
  it.each([
    [49999, "CONDITIONAL", 25000],
    [50000, "NOT_EARNED", 0],
    [50001, "NOT_EARNED", 0],
  ])("plan paid %i → %s, bank %i", (ytd, status, bank) => {
    const o = out2026(sim([ev()], member({ ytd: exact(ytd) })));
    expect(o.status).toBe(status);
    expect(o.final_bank).toEqual({ low_cents: bank, high_cents: bank });
  });
});

describe("review iter2 qualifying basis", () => {
  it("a 2026 in-network claim adds its plan pay; a 2026 self-pay claim adds nothing", () => {
    const inNet = out2026(sim([ev({ service_date: "2026-10-20" })], member({ ytd: exact(30000) })));
    expect(inNet.qualifying_plan_paid).toEqual({ low_cents: 44400, high_cents: 44400 });
    expect(inNet.status).toBe("CONDITIONAL");
    const self = out2026(sim([ev({ service_date: "2026-10-22", claim_route: "SELF_PAY_NO_CLAIM" })], member({ ytd: exact(30000) })));
    expect(self.qualifying_plan_paid).toEqual({ low_cents: 30000, high_cents: 30000 });
  });
});

describe("review iter2 bank cap and forfeit", () => {
  it("balance $800 + $250 → $1,000 with $50 lost; balance $1,000 → $1,000 with $250 lost", () => {
    const a = out2026(sim([ev()], member({ carry: 80000 })));
    expect([a.final_bank, a.lost_to_cap_cents, a.forfeited_cents]).toEqual([{ low_cents: 100000, high_cents: 100000 }, 5000, 0]);
    const b = out2026(sim([ev()], member({ carry: 100000 })));
    expect([b.final_bank, b.lost_to_cap_cents]).toEqual([{ low_cents: 100000, high_cents: 100000 }, 25000]);
  });
  it("best_case 2027 maximum = $1,500 + final bank; worst_case never adds it", () => {
    expect(max2027(sim([ev()], member({ carry: 80000 }), "best_case"))).toBe(250000);
    expect(max2027(sim([ev()], member({ carry: 80000 }), "worst_case"))).toBe(150000);
  });
});

describe("review iter2 ranged settled amount (ROLL-008 / EDU-004)", () => {
  it("FINDING M-1: a plan_paid_ytd range straddling $500 is reported as a definitive NOT_EARNED in worst_case", () => {
    const m = member({ ytd: { kind: "range", low_cents: 45000, high_cents: 55000 }, remaining: 100000 });
    const worst = out2026(sim([ev()], m, "worst_case"));
    const best = out2026(sim([ev()], m, "best_case"));
    // Documents actual behavior: each scenario resolves the range to one end, so neither outcome is UNCERTAIN.
    expect(worst.status).toBe("NOT_EARNED");
    expect(worst.qualifying_plan_paid).toEqual({ low_cents: 55000, high_cents: 55000 });
    expect(best.status).toBe("CONDITIONAL");
    expect(worst.issues.map((i) => i.code)).not.toContain("ROLLOVER_UNCERTAIN");
  });
});

describe("review iter2 unknown inputs never become an assumed carryover", () => {
  it("unknown carryover balance with a qualifying year → NEEDS_CONFIRMATION, nothing added", () => {
    const m = member();
    m.accumulators[0]!.carryover_balance = { ...m.accumulators[0]!.carryover_balance!, value: { kind: "unknown" } };
    for (const sc of ["best_case", "worst_case"] as const) {
      const s = sim([ev()], m, sc);
      expect(out2026(s).status).toBe("NEEDS_CONFIRMATION");
      expect(out2026(s).final_bank).toBeNull();
      expect(max2027(s)).toBe(150000);
    }
  });
  it("a pending claim with an unknown estimate → NEEDS_CONFIRMATION", () => {
    const m = member();
    const t = fx.member().pending_claims[0]!;
    m.pending_claims = [{ ...t, estimated_plan_pay: { ...t.estimated_plan_pay, value: { kind: "unknown" } } }];
    const o = out2026(sim([ev()], MemberState.parse(m)));
    expect(o.status).toBe("NEEDS_CONFIRMATION");
    expect(o.final_bank).toBeNull();
  });
});

describe("review iter2 care plan never ranks on rollover and the shift sentence", () => {
  it("near-threshold schedules equal the NOT_APPLICABLE run", () => {
    const na = mutateRule(registry(), PV2026, "rollover.2026", (r) => ({ ...r, status: "NOT_APPLICABLE" }));
    const near = (reg: PlanRegistry) =>
      optimize((r) => {
        r.member = member();
        r.procedures = r.procedures.filter((p) => p.procedure_id === "proc-fill-14");
      }, reg).alternatives.map((a) => [a.schedule_key, a.labels, a.events.map((e) => e.line_worst.service_date)]);
    expect(near(registry())).toEqual(near(na));
  });

  it("FINDING L-1: a negative shift delta makes the template explanation itself fail validation", async () => {
    // Test-only registry: 2027 deductible 0 and basic in-network 85%, so moving the filling lowers member cost.
    const reg = structuredClone(registry());
    const plan27 = reg.plans.find((p) => p.plan_version_id === PV2027)!;
    for (const r of plan27.rules) {
      if (r.rule_id === "deductible.2027") (r.value as { individual_cents: number }).individual_cents = 0;
      if (r.rule_id === "plan_share.in_network.basic.2027") (r.value as { rate_bps: number }).rate_bps = 8500;
    }
    const result = optimize((r) => {
      r.member = member({ ytd: exact(42000) });
      r.procedures = r.procedures.filter((p) => p.procedure_id === "proc-fill-14");
    }, reg);
    const alt = result.alternatives.find((a) => a.events.some((e) => (e.rollover_shift?.member_cost_delta_cents ?? 0) < 0))!;
    const shift = alt.events[0]!.rollover_shift;
    expect(shift?.member_cost_delta_cents).toBe(-900);
    const input = ExplanationInput.parse(
      buildExplanationInput({ registry: reg, benefits, result: { kind: "care_plan", value: result }, procedures: fx.procedures(), focusId: alt.alternative_id }),
    );
    const expl = await createAiAdapters({ mode: "synthetic" }).templateExplainer.explain(input);
    const v = validateExplanation(expl, input);
    expect([expl.summary, ...expl.claims.map((c) => c.text)].join("\n")).toContain("changes your estimated cost by $9");
    expect(v.ok).toBe(false);
    expect(v.violations.map((x) => x.code)).toContain("DOLLAR_AMOUNT_NOT_IN_RESULT");
  });
});

