/**
 * AT-03 plan payments never exceed the remaining maximum or sublimit.
 * AT-04 deductible and benefit balances never become negative (inconsistent inputs block, never clamp).
 * AT-05 money reconciles: member + plan + contractual adjustment = modeled charge.
 * PLANNER-OWNED, FROZEN.
 */
import { describe, expect, it } from "vitest";
import { AdjudicationLine, ClaimEvent, MemberState, ProviderOption, SimulationResult } from "@/domain";
import { allLines, benefits, fx, optimize, P1, P2, POSTVISIT_AS_OF, provider, registry } from "./helpers";

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function assertLineInvariants(line: AdjudicationLine) {
  if (line.status !== "OK" && line.status !== "NOT_COVERED") return;
  const n = (v: number | null, name: string) => {
    expect(v, `${line.line_id} ${name}`).not.toBeNull();
    return v as number;
  };
  const modeled = n(line.modeled_charge_cents, "modeled");
  const adj = n(line.contractual_adjustment_cents, "adj");
  const patient = n(line.patient_charge_cents, "patient_charge");
  const plan = n(line.plan_pay_cents, "plan");
  const member = n(line.member_responsibility_cents, "member");
  // AT-05
  expect(plan + member + adj, `${line.line_id} reconciles`).toBe(modeled);
  expect(modeled - adj, `${line.line_id} patient charge`).toBe(patient);
  expect(patient - plan, `${line.line_id} member`).toBe(member);
  // AT-03
  if (line.counts_toward_maximum) {
    expect(plan, `${line.line_id} ≤ available max`).toBeLessThanOrEqual(line.state_before!.annual_max_available_cents);
  }
  for (const sl of line.state_before?.sublimits ?? []) {
    const after = line.state_after!.sublimits.find((x) => x.rule_id === sl.rule_id)!;
    expect(after.remaining_cents).toBeLessThanOrEqual(sl.remaining_cents);
    if (line.cap_applied === "sublimit") expect(plan).toBeLessThanOrEqual(sl.remaining_cents);
  }
  if (line.claim_route !== "SELF_PAY_NO_CLAIM") {
    const pre = n(line.preliminary_plan_pay_cents, "preliminary");
    expect(plan).toBeLessThanOrEqual(pre);
    expect(n(line.deductible_applied_cents, "ded")).toBeLessThanOrEqual(n(line.eligible_basis_cents, "eligible"));
    expect(line.deductible_applied_cents!).toBeLessThanOrEqual(line.state_before!.deductible_available_cents);
  }
  // AT-04 (schema enforces non-negative cents; also check transitions)
  for (const st of [line.state_before!, line.state_after!]) {
    for (const v of [
      st.deductible_remaining_cents,
      st.annual_max_remaining_cents,
      st.annual_max_available_cents,
      st.deductible_available_cents,
      st.pending_reserved_max_cents,
    ]) {
      expect(v).toBeGreaterThanOrEqual(0);
    }
  }
}

function assertTotals(sim: SimulationResult) {
  if (!sim.totals) return;
  const ok = sim.lines.filter((l) => l.status === "OK" || l.status === "NOT_COVERED");
  const sum = (f: (l: AdjudicationLine) => number | null) => ok.reduce((a, l) => a + (f(l) ?? 0), 0);
  expect(sim.totals.plan_pay_cents).toBe(sum((l) => l.plan_pay_cents));
  expect(sim.totals.member_responsibility_cents).toBe(sum((l) => l.member_responsibility_cents));
  expect(sim.totals.modeled_charge_cents).toBe(sum((l) => l.modeled_charge_cents));
  expect(sim.totals.contractual_adjustment_cents).toBe(sum((l) => l.contractual_adjustment_cents));
}

describe("AT-03/04/05 benefit invariants", () => {
  it("hold on every line of the golden care plan", () => {
    const result = optimize();
    expect(result.status).toBe("OK");
    for (const line of allLines(result)) assertLineInvariants(line);
    for (const alt of result.alternatives) {
      const t = alt.totals;
      expect(t.plan_pay.high_cents + t.member_cost.high_cents + t.contractual_adjustment.high_cents).toBe(
        t.modeled_charge.high_cents,
      );
    }
  });

  it("hold across 300 seeded random multi-claim simulations", () => {
    const reg = registry();
    const rand = mulberry32(20261015);
    const codes = ["D3330", "D2740", "D2392"] as const;
    const dates = ["2026-10-20", "2026-11-05", "2026-12-17", "2027-01-05", "2027-02-09"];
    for (let i = 0; i < 300; i++) {
      const member: MemberState = fx.member();
      const acc = member.accumulators[0]!;
      const maxRemaining = Math.floor(rand() * 150_001);
      acc.annual_max_remaining.value = { kind: "exact", cents: maxRemaining };
      acc.plan_paid_ytd.value = { kind: "exact", cents: 150_000 - maxRemaining };
      acc.deductible_remaining.value = { kind: "exact", cents: Math.floor(rand() * 5_001) };
      member.pending_claims = [];
      const providers: ProviderOption[] = fx.providersPost();
      for (const p of [provider(providers, P1), provider(providers, P2)]) {
        for (const price of p.pricing) {
          const charge = 1_000 + Math.floor(rand() * 300_000);
          price.provider_charge.value = { kind: "exact", cents: charge };
          if (price.contracted_allowed) {
            price.contracted_allowed.value = { kind: "exact", cents: Math.floor(charge * (0.4 + rand() * 0.6)) };
          }
        }
      }
      const n = 1 + Math.floor(rand() * 4);
      const events: ClaimEvent[] = Array.from({ length: n }, (_, k) => {
        const oon = rand() < 0.3;
        return {
          event_id: `evt-${k}`,
          procedure_id: `proc-${k}`,
          cdt_code: codes[Math.floor(rand() * codes.length)]!,
          tooth: String(1 + k),
          service_date: dates[Math.floor(rand() * dates.length)]!,
          claim_date: null,
          provider_id: oon ? P2 : P1,
          claim_route: oon ? "OUT_OF_NETWORK_CLAIM" : "IN_NETWORK_CLAIM",
        };
      });
      const sim = SimulationResult.parse(
        benefits.simulate(reg, { as_of: POSTVISIT_AS_OF, scenario: "worst_case", member, providers, events }),
      );
      for (const line of sim.lines) {
        if (line.cdt_code === "D2740" && line.service_date >= "2027-01-01") continue; // 2027 crown rule is CONFLICT
        expect(line.status, `${i}:${line.line_id} ${JSON.stringify(line.issues)}`).not.toBe("NEEDS_CONFIRMATION");
        assertLineInvariants(line);
      }
      assertTotals(sim);
      // Per period, total counted plan pay never exceeds the available maximum at the start.
      for (const period of sim.ledger_before.periods) {
        const paid = sim.lines
          .filter((l) => l.plan_version_id === period.plan_version_id && l.counts_toward_maximum)
          .reduce((a, l) => a + (l.plan_pay_cents ?? 0), 0);
        expect(paid).toBeLessThanOrEqual(period.annual_max_available_cents);
      }
    }
  });

  it("AT-04: an impossible accumulator snapshot blocks instead of clamping", () => {
    const member = fx.member();
    member.accumulators[0]!.annual_max_remaining.value = { kind: "exact", cents: 160_000 }; // > $1,500 maximum
    const sim = SimulationResult.parse(
      benefits.simulate(registry(), {
        as_of: POSTVISIT_AS_OF,
        scenario: "worst_case",
        member,
        providers: fx.providersPost(),
        events: [
          {
            event_id: "evt-1",
            procedure_id: "proc-rc-30",
            cdt_code: "D3330",
            tooth: "30",
            service_date: "2026-10-20",
            claim_date: null,
            provider_id: P1,
            claim_route: "IN_NETWORK_CLAIM",
          },
        ],
      }),
    );
    expect(sim.status).toBe("NEEDS_CONFIRMATION");
    expect(sim.issues.some((i) => i.code === "INPUT_INCONSISTENT" && i.severity === "blocking")).toBe(true);
  });
});
