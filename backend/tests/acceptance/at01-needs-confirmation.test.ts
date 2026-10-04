/**
 * AT-01: Missing annual maximum, coverage rate, or out-of-network rule returns
 * NEEDS_CONFIRMATION — never an "industry typical" default. CONFLICT blocks too.
 * PLANNER-OWNED, FROZEN.
 */
import { describe, expect, it } from "vitest";
import { ClaimEvent, PlanRegistry, SimulationResult } from "@/domain";
import {
  benefits,
  fx,
  mutateRule,
  optimize,
  P1,
  P2,
  POSTVISIT_AS_OF,
  PV2026,
  registry,
  visitNavigator,
  visitRequest,
} from "./helpers";

function simulateOne(reg: PlanRegistry, event: Partial<ClaimEvent> & Pick<ClaimEvent, "cdt_code" | "service_date">) {
  const ev: ClaimEvent = {
    event_id: "evt-1",
    procedure_id: "proc-test",
    tooth: "30",
    claim_date: null,
    provider_id: P1,
    claim_route: "IN_NETWORK_CLAIM",
    ...event,
  };
  return SimulationResult.parse(
    benefits.simulate(reg, {
      as_of: POSTVISIT_AS_OF,
      scenario: "worst_case",
      member: fx.member(),
      providers: fx.providersPost(),
      events: [ev],
    }),
  );
}

function expectBlocked(sim: SimulationResult, code: string, match: { field?: string; rule_id?: string }) {
  expect(sim.status).toBe("NEEDS_CONFIRMATION");
  expect(sim.totals).toBeNull();
  const line = sim.lines[0]!;
  expect(line.status).toBe("NEEDS_CONFIRMATION");
  expect(line.plan_pay_cents).toBeNull();
  expect(line.member_responsibility_cents).toBeNull();
  const all = [...sim.issues, ...line.issues];
  expect(
    all.some(
      (i) =>
        i.code === code &&
        i.severity === "blocking" &&
        (match.field === undefined || i.field === match.field) &&
        (match.rule_id === undefined || i.rule_id === match.rule_id),
    ),
    JSON.stringify(all),
  ).toBe(true);
}

describe("AT-01 missing or unverified required rules", () => {
  it("missing annual maximum → NEEDS_CONFIRMATION (field rules.annual_maximum)", () => {
    const reg = mutateRule(registry(), PV2026, "annual_maximum.2026", () => null);
    expectBlocked(simulateOne(reg, { cdt_code: "D3330", service_date: "2026-10-20" }), "RULE_MISSING", {
      field: "rules.annual_maximum",
    });
  });

  it("unverified coverage rate → NEEDS_CONFIRMATION citing the rule", () => {
    const reg = mutateRule(registry(), PV2026, "plan_share.in_network.basic.2026", (r) => ({ ...r, status: "UNVERIFIED" }));
    expectBlocked(simulateOne(reg, { cdt_code: "D3330", service_date: "2026-10-20" }), "RULE_UNVERIFIED", {
      rule_id: "plan_share.in_network.basic.2026",
    });
  });

  it("missing coverage rate → NEEDS_CONFIRMATION (field rules.plan_share)", () => {
    const reg = mutateRule(registry(), PV2026, "plan_share.in_network.basic.2026", () => null);
    expectBlocked(simulateOne(reg, { cdt_code: "D3330", service_date: "2026-10-20" }), "RULE_MISSING", {
      field: "rules.plan_share",
    });
  });

  it("missing out-of-network allowance rule → NEEDS_CONFIRMATION for an OON claim", () => {
    const reg = mutateRule(registry(), PV2026, "oon_allowance_schedule.2026", () => null);
    expectBlocked(
      simulateOne(reg, {
        cdt_code: "D3330",
        service_date: "2026-10-17",
        provider_id: P2,
        claim_route: "OUT_OF_NETWORK_CLAIM",
      }),
      "RULE_MISSING",
      { field: "rules.oon_allowance_schedule" },
    );
  });

  it("conflicting rules block the affected result (2027 crown frequency conflict)", () => {
    expectBlocked(simulateOne(registry(), { cdt_code: "D2740", service_date: "2027-02-09" }), "RULE_CONFLICT", {
      rule_id: "frequency_limit.crowns.2027",
    });
  });

  it("an unknown plan identity is never resolved to a similar plan (spec §3)", () => {
    const member = fx.member();
    member.plan_key.group_id = "acme-synthetic-002";
    const sim = SimulationResult.parse(
      benefits.simulate(registry(), {
        as_of: POSTVISIT_AS_OF,
        scenario: "worst_case",
        member,
        providers: fx.providersPost(),
        events: [
          { event_id: "evt-1", procedure_id: "proc-test", cdt_code: "D3330", tooth: "30", service_date: "2026-10-20", claim_date: null, provider_id: P1, claim_route: "IN_NETWORK_CLAIM" },
        ],
      }),
    );
    expect(sim.status).toBe("NEEDS_CONFIRMATION");
    expect(sim.lines[0]!.plan_pay_cents).toBeNull();
    expect([...sim.issues, ...sim.lines[0]!.issues].some((i) => i.code === "PLAN_NOT_FOUND")).toBe(true);
  });

  it("care plan with a missing annual maximum returns NEEDS_CONFIRMATION and no priced alternatives", () => {
    const reg = mutateRule(registry(), PV2026, "annual_maximum.2026", () => null);
    const result = optimize(undefined, reg);
    expect(result.status).toBe("NEEDS_CONFIRMATION");
    expect(result.alternatives).toEqual([]);
    expect(result.recommended_alternative_id).toBeNull();
    expect(result.unresolved.some((i) => i.code === "RULE_MISSING" && i.field === "rules.annual_maximum")).toBe(true);
  });

  it("visit navigator: missing OON rule marks the OON option NEEDS_CONFIRMATION, in-network still priced", () => {
    const reg = mutateRule(registry(), PV2026, "oon_allowance_schedule.2026", () => null);
    const result = visitNavigator().navigate(reg, visitRequest());
    const oon = result.options.find((o) => o.provider_id === P2);
    const inn = result.options.find((o) => o.provider_id === P1);
    expect(inn?.status).toBe("OK");
    expect(inn?.labels).toContain("lowest_cost");
    // NEEDS_CONFIRMATION options may only carry the "soonest" label (CONTRACT-v1 §4.6).
    expect(oon).toBeDefined();
    expect(oon!.status).toBe("NEEDS_CONFIRMATION");
    expect(oon!.member_cost).toBeNull();
    expect(oon!.labels).toEqual(["soonest"]);
    expect(oon!.issues.some((i) => i.code === "RULE_MISSING" && i.field === "rules.oon_allowance_schedule")).toBe(true);
  });
});
