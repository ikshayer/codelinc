/**
 * Reviewer: hand-computed adjudications (golden-scenario.md + plan source pages 2/5) vs the
 * public benefit engine. Expected values are literals computed by hand, never from src/.
 */
import { describe, expect, it } from "vitest";
import type { ClaimEvent, Scenario } from "@/domain";
import { benefits, fx, registry } from "../acceptance/helpers";

type Mut = (m: ReturnType<typeof fx.member>, p: ReturnType<typeof fx.providersPost>) => void;
const ev = (id: string, code: string, date: string, provider = "prov-rivera", tooth: string | null = "30"): ClaimEvent => ({
  event_id: id,
  procedure_id: `p-${id}`,
  cdt_code: code,
  tooth,
  service_date: date,
  claim_date: null,
  provider_id: provider,
  claim_route: provider === "prov-rivera" ? "IN_NETWORK_CLAIM" : "OUT_OF_NETWORK_CLAIM",
});
function sim(events: ClaimEvent[], mut?: Mut, scenario: Scenario = "worst_case") {
  const member = fx.member();
  const providers = fx.providersPost();
  mut?.(member, providers);
  return benefits.simulate(registry(), { as_of: "2026-10-15T14:00:00Z", scenario, member, providers, events });
}
const money = (r: ReturnType<typeof sim>) =>
  r.lines.map((l) => [l.status, l.deductible_applied_cents, l.plan_pay_cents, l.member_responsibility_cents, l.contractual_adjustment_cents]);

describe("independent arithmetic (reviewer)", () => {
  it("golden alt-1: $800/$200, $24/$1,076 (cap), 2027 reset $84/$96; charges reconcile", () => {
    const r = sim([ev("a", "D3330", "2026-10-20"), ev("b", "D2740", "2026-11-05"), ev("c", "D2392", "2027-01-05", "prov-rivera", "14")]);
    expect(money(r)).toEqual([
      ["OK", 0, 80000, 20000, 45000],
      ["OK", 0, 2400, 107600, 50000],
      ["OK", 7500, 8400, 9600, 8000],
    ]);
    expect(r.totals).toEqual({ modeled_charge_cents: 331000, contractual_adjustment_cents: 103000, plan_pay_cents: 90800, member_responsibility_cents: 137200 });
  });

  it("Dec 31 uses 2026 balances; Jan 1 opens 2027 fresh ($75 deductible)", () => {
    const r = sim([ev("a", "D3330", "2026-12-31"), ev("b", "D3330", "2027-01-01", "prov-rivera", "19")]);
    expect(r.lines.map((l) => l.plan_version_id)).toEqual(["nwd-ppo-standard-2026", "nwd-ppo-standard-2027"]);
    expect(money(r)).toEqual([
      ["OK", 0, 80000, 20000, 45000],
      ["OK", 7500, 74000, 26000, 45000], // 80% x (1000 - 75)
    ]);
  });

  it("out-of-network: balance bill = charge - allowance; cap binds on the crown", () => {
    const r = sim([ev("a", "D3330", "2026-10-20", "prov-brightsmile"), ev("b", "D2740", "2026-11-05", "prov-brightsmile")]);
    // RC: 60% x min(1300, 900) = 540; crown: 40% x 950 = 380, capped at 824 - 540 = 284
    expect(money(r)).toEqual([
      ["OK", 0, 54000, 76000, 0],
      ["OK", 0, 28400, 121600, 0],
    ]);
    expect(r.lines.map((l) => l.balance_bill_cents)).toEqual([40000, 55000]);
  });

  it("no pending claim: deductible $50 then cap at $140", () => {
    const r = sim([ev("a", "D3330", "2026-10-20"), ev("b", "D2740", "2026-11-05")], (m) => void (m.pending_claims = []));
    expect(money(r)).toEqual([
      ["OK", 5000, 76000, 24000, 45000],
      ["OK", 0, 14000, 96000, 50000],
    ]);
  });

  it("pending range $60-$76: best case leaves $40 for the crown", () => {
    const r = sim(
      [ev("a", "D3330", "2026-10-20"), ev("b", "D2740", "2026-11-05")],
      (m) => void (m.pending_claims[0]!.estimated_plan_pay.value = { kind: "range", low_cents: 6000, high_cents: 7600 }),
      "best_case",
    );
    expect(r.lines.map((l) => l.plan_pay_cents)).toEqual([80000, 4000]);
  });

  it("round half-up per line: 50% of $1.01 = 51 cents", () => {
    const r = sim([ev("a", "D2740", "2026-10-20")], (m, p) => {
      m.pending_claims = [];
      m.accumulators[0]!.deductible_remaining.value = { kind: "exact", cents: 0 };
      p.find((x) => x.provider_id === "prov-rivera")!.pricing.find((x) => x.cdt_code === "D2740")!.contracted_allowed!.value = { kind: "exact", cents: 101 };
    });
    expect(r.lines[0]!.plan_pay_cents).toBe(51);
  });

  it("frequency: D0120 in March + D0140 Oct 20 uses both; Oct 22 exam is NOT_COVERED and priced", () => {
    const r = sim([ev("a", "D0140", "2026-10-20", "prov-rivera", null), ev("b", "D0140", "2026-10-22", "prov-rivera", null)]);
    expect(money(r)).toEqual([
      ["OK", 0, 7500, 0, 3500],
      ["NOT_COVERED", 0, 0, 7500, 3500],
    ]);
  });
});
