/**
 * Reviewer (iteration 1, contract 1.4) edge probes for PLAN-002, PLAN-003, PRICE-002, §6.5, REC-006.
 * Review-only: documents boundary behavior the acceptance suite does not pin.
 */
import { describe, expect, it } from "vitest";
import { ClaimEvent, SimulationResult, type ProviderOption } from "@/domain";
import { benefits, fx, optimize, P1, permute, POSTVISIT_AS_OF, provider, PV2026, PV2027, registry } from "../acceptance/helpers";

const ev = (over: Partial<ClaimEvent> = {}): ClaimEvent => ({
  event_id: "evt-a",
  procedure_id: "proc-fill-14",
  cdt_code: "D2392",
  tooth: "14",
  service_date: "2026-10-22",
  claim_date: null,
  provider_id: P1,
  claim_route: "IN_NETWORK_CLAIM",
  ...over,
});

const sim = (events: ClaimEvent[], providers: ProviderOption[] = fx.providersPost()) =>
  SimulationResult.parse(benefits.simulate(registry(), { as_of: POSTVISIT_AS_OF, scenario: "worst_case", member: fx.member(), providers, events }));

const withRivera = (fn: (p: ProviderOption) => void) => {
  const ps = fx.providersPost();
  fn(provider(ps, P1));
  return ps;
};
const MONEY = ["modeled_charge_cents", "patient_charge_cents", "plan_pay_cents", "member_responsibility_cents"] as const;
const hoursBefore = (h: number) => new Date(Date.parse(POSTVISIT_AS_OF) - h * 3_600_000).toISOString().replace(".000Z", "Z");

describe("review iter1 PRICE-002 boundaries", () => {
  it("a quote valid_through equal to the service date is priced; one day earlier is expired", () => {
    const self = ev({ claim_route: "SELF_PAY_NO_CLAIM" });
    const on = sim([self], withRivera((p) => (p.pricing.find((x) => x.cdt_code === "D2392")!.cash_quote_valid_through = "2026-10-22"))).lines[0]!;
    expect(on.status).toBe("OK");
    expect(on.member_responsibility_cents).toBe(15000);
    const off = sim([self], withRivera((p) => (p.pricing.find((x) => x.cdt_code === "D2392")!.cash_quote_valid_through = "2026-10-21"))).lines[0]!;
    expect(off.issues.map((i) => i.code)).toEqual(["PRICE_QUOTE_EXPIRED"]);
  });

  it("staleness: exactly the policy limit is fresh, one hour past warns; cash and allowed both covered; money unchanged", () => {
    const fresh = sim([ev()]).lines[0]!;
    const at = sim([ev()], withRivera((p) => (p.pricing.find((x) => x.cdt_code === "D2392")!.contracted_allowed!.observed_at = hoursBefore(90 * 24)))).lines[0]!;
    expect(at.issues.some((i) => i.code === "INPUT_STALE")).toBe(false);
    const past = sim([ev()], withRivera((p) => (p.pricing.find((x) => x.cdt_code === "D2392")!.contracted_allowed!.observed_at = hoursBefore(90 * 24 + 1)))).lines[0]!;
    expect(past.issues.filter((i) => i.code === "INPUT_STALE").map((i) => i.severity)).toEqual(["warning"]);
    expect(past.status).toBe(fresh.status);
    for (const f of MONEY) expect(past[f], f).toBe(fresh[f]);

    const selfFresh = sim([ev({ claim_route: "SELF_PAY_NO_CLAIM" })]).lines[0]!;
    const selfStale = sim([ev({ claim_route: "SELF_PAY_NO_CLAIM" })], withRivera((p) => (p.pricing.find((x) => x.cdt_code === "D2392")!.cash_quote!.observed_at = hoursBefore(2400)))).lines[0]!;
    expect(selfStale.issues.map((i) => i.code)).toEqual(["INPUT_STALE"]);
    for (const f of MONEY) expect(selfStale[f], f).toBe(selfFresh[f]);
  });

  it("care plan with every price stale keeps identical alternatives and money", () => {
    const strip = (r: ReturnType<typeof optimize>) => r.alternatives.map((a) => [a.alternative_id, a.schedule_key, a.totals]);
    const base = optimize();
    const stale = optimize((q) => {
      for (const p of q.providers)
        for (const row of p.pricing) for (const m of [row.provider_charge, row.contracted_allowed, row.cash_quote]) if (m) m.observed_at = hoursBefore(2400);
    });
    expect(strip(stale)).toEqual(strip(base));
    expect(stale.status).toBe(base.status);
  });
});

describe("review iter1 PLAN-002 boundaries", () => {
  it("2026→2027 crossing: a status verified against nwd-ppo counts for both plan years (network_id, not plan version, scopes it)", () => {
    const r = sim([ev(), ev({ event_id: "evt-b", procedure_id: "proc-pa", cdt_code: "D0220", tooth: null, service_date: "2027-01-05" })]);
    expect(r.lines.map((l) => [l.plan_version_id, l.network_tier, l.status])).toEqual([
      [PV2026, "in_network", "OK"],
      [PV2027, "in_network", "OK"],
    ]);
  });

  it("null tier with an OON route and matching network id blocks rather than pricing as OON", () => {
    const l = sim([ev({ claim_route: "OUT_OF_NETWORK_CLAIM" })], withRivera((p) => (p.network.tier = null))).lines[0]!;
    expect(l.issues.map((i) => i.code)).toEqual(["NETWORK_STATUS_UNKNOWN"]);
    for (const f of MONEY) expect(l[f], f).toBeNull();
  });
});

describe("review iter1 PLAN-003 boundaries", () => {
  it("an educational-only source does not flag non-VERIFIED rules, and precedence order (not just set) is accepted", () => {
    const reg = registry();
    const plan = reg.plans.find((p) => p.plan_version_id === PV2027)!;
    reg.sources.find((s) => s.source_id === plan.source_documents[0]!.source_id)!.document_role = "educational";
    const report = benefits.validatePlan(reg, plan);
    const flagged = new Set(report.issues.filter((i) => i.code === "SOURCE_NOT_AUTHORITATIVE").map((i) => i.rule_id));
    for (const r of plan.rules) expect(flagged.has(r.rule_id), r.rule_id).toBe(r.status === "VERIFIED" && r.evidence.length > 0);
  });
});

describe("review iter1 §6.5 / REC-006 permutation stability", () => {
  it("three same-day events give byte-identical output under all 6 input orders", () => {
    const evs = [
      ev({ event_id: "e1", service_date: "2026-11-05" }),
      ev({ event_id: "e2", service_date: "2026-11-05", procedure_id: "proc-pa", cdt_code: "D0220", tooth: null }),
      ev({ event_id: "e3", service_date: "2026-11-05", procedure_id: "proc-fill-3", tooth: "3" }),
    ];
    const perms = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
    const outs = new Set(perms.map((p) => JSON.stringify(sim(p.map((i) => evs[i]!)))));
    expect(outs.size).toBe(1);
  });

  it("whole care-plan output is byte-identical under provider, procedure and slot permutations", () => {
    const base = JSON.stringify(optimize());
    const shuffled = JSON.stringify(
      optimize((q) => {
        q.providers = permute(q.providers);
        q.procedures = permute(q.procedures);
        for (const p of q.providers) p.slots.items = permute(p.slots.items);
      }),
    );
    expect(shuffled).toBe(base);
  });
});
