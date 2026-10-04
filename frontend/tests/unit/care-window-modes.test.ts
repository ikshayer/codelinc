import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { AlternativeDifference, CarePlanRequest, SolverMeta } from "@engine/optimizer";

import { ALT_LABEL } from "@/features/care-window/care-plan";
import { DifferenceList, MODE_OPTIONS, PrioritySelector, SolverLine, withMode } from "@/features/care-window/plan-modes";

// UI-002 / UI-011 (contract 1.7): formatting only; every number below is an engine field.
const baseDifference: AlternativeDifference = {
  member_cost_delta_cents: 12000,
  plan_pay_delta_cents: -5000,
  peak_monthly_cash_delta_cents: 0,
  monthly: [{ month: "2026-11", cash_delta_cents: -30000 }],
  completion_shift_days: 14,
  service_date_changes: [{ procedure_id: "p1", recommended_date: "2026-11-02", this_date: "2026-11-16", shift_days: 14 }],
  rollover_final_bank_delta: { low_cents: 0, high_cents: 25000 },
  annual_max_remaining_delta: [{ plan_version_id: "plan-2026", delta_cents: 5000 }],
  warnings_added: ["SAME_DAY_ORDER_AFFECTS_COST"],
  warnings_removed: [],
};
const render = (difference: AlternativeDifference) => renderToStaticMarkup(createElement(DifferenceList, { difference, procedureName: () => "Crown on tooth 14" }));

describe("priority selector", () => {
  it("builds the care-plan request body with preferences.mode and keeps the rest", () => {
    const request = { as_of: "2026-10-04T00:00:00Z", max_alternatives: 3 } as unknown as CarePlanRequest;
    const body = withMode(request, "EARLIEST_SAFE_COMPLETION");
    expect(body.preferences).toEqual({ mode: "EARLIEST_SAFE_COMPLETION" });
    expect(body.max_alternatives).toBe(3);
    expect(request.preferences).toBeUndefined();
  });

  it("renders the four options as radios with the current one checked", () => {
    const html = renderToStaticMarkup(createElement(PrioritySelector, { value: "BALANCED", onChange: () => undefined }));
    for (const label of ["Balanced", "Lowest cost", "Earliest safe", "Smoothest payments"]) expect(html).toContain(label);
    expect(MODE_OPTIONS).toHaveLength(4);
    expect(html.match(/role="radio"/g)).toHaveLength(4);
    expect(html).toContain('aria-checked="true"');
  });
});

describe("alternative labels", () => {
  it("uses the plan's label text", () => {
    expect(ALT_LABEL.lowest_total_cost).toBe("Balanced: lowest cost on your dentist's target dates");
    expect(ALT_LABEL.lowest_member_cost).toBe("Lowest total cost");
    expect(ALT_LABEL.earliest_safe_completion).toBe("Earliest safe completion");
    expect(ALT_LABEL.smoothest_monthly_payments).toBe("Smoothest monthly payments");
  });
});

describe("difference from recommended", () => {
  it("formats a worse alternative with signed money, later finish and added warnings", () => {
    const html = render(baseDifference);
    expect(html).toContain("Compared with the recommended plan");
    expect(html).toContain("You pay in total: +$120");
    expect(html).toContain("Plan pays: −$50");
    expect(html).toContain("Finishes 14 days later");
    expect(html).toContain("Crown on tooth 14");
    expect(html).toContain("Plan can still pay $50 more");
    expect(html).toContain("Carryover to next year: No change to +$250");
    expect(html).toContain("New warning: Same day order affects cost");
  });

  it("formats a cheaper, earlier alternative with a negative member cost and removed warnings", () => {
    const html = render({
      ...baseDifference,
      member_cost_delta_cents: -8000,
      completion_shift_days: -1,
      service_date_changes: [],
      rollover_final_bank_delta: null,
      annual_max_remaining_delta: [{ plan_version_id: "plan-2026", delta_cents: -5000 }],
      warnings_added: [],
      warnings_removed: ["SAME_DAY_ORDER_AFFECTS_COST"],
    });
    expect(html).toContain("You pay in total: −$80");
    expect(html).toContain("Finishes 1 day earlier");
    expect(html).toContain("Plan can still pay $50 less");
    expect(html).toContain("Warning avoided: Same day order affects cost");
    expect(html).not.toContain("Carryover to next year");
  });
});

describe("solver line", () => {
  const meta: SolverMeta = { status: "OPTIMAL", candidates_built: 9, schedules_evaluated: 1234, schedules_rejected: 4, elapsed_ms: null, deterministic_tie_breaker: "x", bounds_applied: [] };
  const line = (m: SolverMeta) => renderToStaticMarkup(createElement(SolverLine, { meta: m }));

  it("says all schedules were checked when optimal", () => {
    expect(line(meta)).toContain("Checked all 1,234 possible schedules");
  });
  it("says the search was bounded", () => {
    expect(line({ ...meta, status: "BOUNDED_BEST_FOUND", bounds_applied: ["limit"] })).toContain("Best plan found within search limits");
  });
});
