/**
 * AT-06: Identical inputs produce identical ranked outputs — including when input
 * arrays arrive in a different order. PLANNER-OWNED, FROZEN.
 */
import { describe, expect, it } from "vitest";
import { ClaimEvent, SimulationResult } from "@/domain";
import {
  benefits,
  carePlanOptimizer,
  carePlanRequest,
  fx,
  P1,
  permute,
  POSTVISIT_AS_OF,
  registry,
  visitNavigator,
  visitRequest,
} from "./helpers";

describe("AT-06 determinism", () => {
  it("care plan: repeated runs are deep-equal", () => {
    const reg = registry();
    const a = carePlanOptimizer().optimize(reg, carePlanRequest());
    const b = carePlanOptimizer().optimize(registry(), carePlanRequest());
    expect(b).toEqual(a);
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });

  it("care plan: permuting providers, slots, prices, procedures, history and windows does not change the result", () => {
    const base = carePlanOptimizer().optimize(registry(), carePlanRequest());
    const permuted = carePlanOptimizer().optimize(
      registry(),
      carePlanRequest((r) => {
        r.providers = permute(r.providers).map((p) => ({
          ...p,
          pricing: permute(p.pricing),
          slots: { ...p.slots, items: permute(p.slots.items) },
        }));
        r.procedures = permute(r.procedures);
        r.member.procedure_history = permute(r.member.procedure_history);
        r.member.availability.weekly = permute(r.member.availability.weekly);
        r.member.availability.unavailable = permute(r.member.availability.unavailable);
      }),
    );
    expect(JSON.stringify(permuted)).toBe(JSON.stringify(base));
  });

  it("registry rule order does not change the result", () => {
    const reg = registry();
    const shuffled = structuredClone(reg);
    shuffled.plans = permute(shuffled.plans).map((p) => ({ ...p, rules: permute(p.rules) }));
    const a = carePlanOptimizer().optimize(reg, carePlanRequest());
    const b = carePlanOptimizer().optimize(shuffled, carePlanRequest());
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });

  it("visit navigator: repeated and permuted runs are identical", () => {
    const a = visitNavigator().navigate(registry(), visitRequest());
    const b = visitNavigator().navigate(
      registry(),
      visitRequest((r) => {
        r.providers = permute(r.providers).map((p) => ({ ...p, slots: { ...p.slots, items: permute(p.slots.items) } }));
        r.visit.expected_codes = permute(r.visit.expected_codes);
      }),
    );
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });

  it("benefits: event input order does not change chronological adjudication", () => {
    const events: ClaimEvent[] = [
      { event_id: "evt-a", procedure_id: "proc-rc-30", cdt_code: "D3330", tooth: "30", service_date: "2026-10-20", claim_date: null, provider_id: P1, claim_route: "IN_NETWORK_CLAIM" },
      { event_id: "evt-b", procedure_id: "proc-crown-30", cdt_code: "D2740", tooth: "30", service_date: "2026-11-05", claim_date: null, provider_id: P1, claim_route: "IN_NETWORK_CLAIM" },
      { event_id: "evt-c", procedure_id: "proc-fill-14", cdt_code: "D2392", tooth: "14", service_date: "2026-11-05", claim_date: null, provider_id: P1, claim_route: "IN_NETWORK_CLAIM" },
    ];
    const run = (evs: ClaimEvent[]) =>
      SimulationResult.parse(
        benefits.simulate(registry(), { as_of: POSTVISIT_AS_OF, scenario: "worst_case", member: fx.member(), providers: fx.providersPost(), events: evs }),
      );
    const a = run(events);
    const b = run(permute(events));
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
    // Chronological by service date, then event_id for same-day ties.
    expect(a.lines.map((l) => l.event_id)).toEqual(["evt-a", "evt-b", "evt-c"]);
  });
});
