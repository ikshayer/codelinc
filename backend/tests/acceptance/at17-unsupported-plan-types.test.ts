/**
 * AT-17: Unsupported plan types fail clearly instead of using DPPO logic.
 * PLANNER-OWNED, FROZEN.
 */
import { describe, expect, it } from "vitest";
import { PlanRegistry, SimulationResult } from "@/domain";
import { benefits, fx, optimize, P1, POSTVISIT_AS_OF, registry, visitNavigator, visitRequest } from "./helpers";

function asType(planType: "DHMO" | "INDEMNITY" | "DISCOUNT"): PlanRegistry {
  const reg = structuredClone(registry());
  for (const p of reg.plans) p.plan_type = planType;
  return reg;
}

describe("AT-17 unsupported plan types", () => {
  it("only DPPO is supported", () => {
    expect(benefits.supportsPlanType("DPPO")).toBe(true);
    for (const t of ["DHMO", "INDEMNITY", "DISCOUNT"] as const) expect(benefits.supportsPlanType(t)).toBe(false);
  });

  for (const t of ["DHMO", "INDEMNITY", "DISCOUNT"] as const) {
    it(`${t}: benefits simulate returns UNSUPPORTED_PLAN_TYPE with no amounts`, () => {
      const reg = asType(t);
      const sim = SimulationResult.parse(
        benefits.simulate(reg, {
          as_of: POSTVISIT_AS_OF,
          scenario: "worst_case",
          member: fx.member(),
          providers: fx.providersPost(),
          events: [
            { event_id: "evt-1", procedure_id: "proc-rc-30", cdt_code: "D3330", tooth: "30", service_date: "2026-10-20", claim_date: null, provider_id: P1, claim_route: "IN_NETWORK_CLAIM" },
          ],
        }),
      );
      expect(sim.status).toBe("UNSUPPORTED_PLAN_TYPE");
      expect(sim.totals).toBeNull();
      expect(sim.lines[0]!.status).toBe("UNSUPPORTED_PLAN_TYPE");
      expect(sim.lines[0]!.plan_pay_cents).toBeNull();
      expect(sim.lines[0]!.steps).toEqual([]);
      expect(sim.issues.some((i) => i.code === "PLAN_TYPE_UNSUPPORTED" && i.severity === "blocking")).toBe(true);
    });

    it(`${t}: care plan and visit navigator return UNSUPPORTED_PLAN_TYPE with no amounts`, () => {
      const reg = asType(t);
      const care = optimize(undefined, reg);
      expect(care.status).toBe("UNSUPPORTED_PLAN_TYPE");
      expect(care.alternatives).toEqual([]);
      expect(care.unresolved.some((i) => i.code === "PLAN_TYPE_UNSUPPORTED")).toBe(true);

      const visit = visitNavigator().navigate(reg, visitRequest());
      expect(visit.status).toBe("UNSUPPORTED_PLAN_TYPE");
      for (const o of visit.options) expect(o.member_cost).toBeNull();
    });
  }
});
