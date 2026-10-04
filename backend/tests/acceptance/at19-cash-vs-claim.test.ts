/**
 * AT-19 (contract 1.2, CONTRACT §5.9): for each event with a cash quote, compare the WHOLE schedule's
 * worst-case member total with that event as a claim vs paid cash (spec §8). PLANNER-OWNED, FROZEN.
 */
import { describe, expect, it } from "vitest";
import type { AlternativeLabel, CarePlanRequest, CarePlanResult } from "@/domain";
import { allLines, byLabel, eventFor, golden, optimize, P1, procedure, provider } from "./helpers";

const RC = golden.postvisit.route_comparisons;

const mutations: Record<string, (r: CarePlanRequest) => void> = {
  base: () => {},
  filling_this_year_only: (q) => {
    const f = procedure(q.procedures, "proc-fill-14");
    f.target_date = "2026-12-31";
    f.latest_safe_date = "2026-12-31";
  },
  office_self_pay_unknown: (q) => {
    provider(q.providers, P1).self_pay.permitted_by_office = null;
  },
};

const results = new Map<string, CarePlanResult>();
function resultFor(variant: string): CarePlanResult {
  if (!results.has(variant)) results.set(variant, optimize(mutations[variant]));
  return results.get(variant)!;
}

describe("AT-19 cash vs claim compares the whole schedule", () => {
  for (const c of RC.cases) {
    it(`${c.variant} / ${c.label}: ${c.procedure_id} on ${c.service_date}`, () => {
      const e = eventFor(byLabel(resultFor(c.variant), c.label as AlternativeLabel), c.procedure_id);
      expect(e.service_date).toBe(c.service_date);
      expect(e.claim_route).toBe(c.chosen_route);
      const rc = e.route_comparison;
      expect(rc).not.toBeNull();
      expect({
        claim_route: rc!.claim_route,
        claim_total_cents: rc!.claim_total_cents,
        cash_total_cents: rc!.cash_total_cents,
        difference_cents: rc!.difference_cents,
        winner_claim_route: rc!.winner_claim_route,
      }).toEqual({
        claim_route: c.claim_route,
        claim_total_cents: c.claim_total_cents,
        cash_total_cents: c.cash_total_cents,
        difference_cents: c.difference_cents,
        winner_claim_route: c.winner_claim_route,
      });
      expect([...new Set(rc!.missing.map((i) => i.code))].sort()).toEqual(c.missing_codes);
      expect(rc!.missing.every((i) => i.severity === "warning")).toBe(true);
    });
  }

  it("events whose price row has no cash quote have no comparison", () => {
    for (const variant of Object.keys(mutations)) {
      for (const alt of resultFor(variant).alternatives) {
        for (const e of alt.events) {
          if (RC.null_for.includes(e.procedure_id)) expect(e.route_comparison, `${variant} ${alt.alternative_id} ${e.procedure_id}`).toBeNull();
        }
      }
    }
  });

  it("a self-pay event always carries a cash-wins comparison and the confirm-with-office action", () => {
    for (const variant of Object.keys(mutations)) {
      for (const alt of resultFor(variant).alternatives) {
        for (const e of alt.events.filter((x) => x.claim_route === "SELF_PAY_NO_CLAIM")) {
          expect(e.route_comparison?.winner_claim_route).toBe("SELF_PAY_NO_CLAIM");
          expect(e.next_actions.some((a) => a.kind === "CONFIRM_SELF_PAY_WITH_OFFICE")).toBe(true);
        }
      }
    }
    expect(allLines(resultFor("office_self_pay_unknown")).some((l) => l.claim_route === "SELF_PAY_NO_CLAIM")).toBe(false);
  });
});
