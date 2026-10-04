import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { RolloverOutcome, RolloverStatus } from "@engine/benefits";

import { RolloverPanel, RolloverShiftNote } from "@/features/care-window/care-plan";

// UI-007 (contract 1.5): the carryover panel only formats the engine's outcome.
// The golden 2026 close (fixtures/golden/expected.json, base alternative 1).
const base: RolloverOutcome = {
  rule_id: "rollover.2026",
  closing_plan_version_id: "nwd-ppo-standard-2026",
  closing_period_end: "2026-12-31",
  next_plan_version_id: "nwd-ppo-standard-2027",
  status: "NOT_EARNED",
  threshold_cents: 50000,
  threshold_comparison: "LT",
  settled_plan_paid: { low_cents: 60000, high_cents: 60000 },
  pending_plan_pay_cents: 7600,
  qualifying_plan_paid: { low_cents: 142400, high_cents: 150000 },
  base_award_cents: 25000,
  network_bonus: { low_cents: 0, high_cents: 0 },
  prior_bank_cents: 0,
  bank_cap_cents: 100000,
  final_bank: { low_cents: 0, high_cents: 0 },
  lost_to_cap_cents: 0,
  forfeited_cents: 0,
  applied_rule_ids: ["rollover.2026"],
  input_ids: ["member.acc.2026.plan_paid_ytd"],
  steps: [
    { step_id: "rollover.nwd-ppo-standard-2026.final_bank", label: "Carryover available next year", formula: "f", operands: [], result_cents: 0, result_bps: null, result_text: null },
  ],
  issues: [],
};
const evidence = [
  {
    rule_id: "rollover.2026",
    plan_version_id: "nwd-ppo-standard-2026",
    evidence: [{ source_id: "nwd-ppo-2026-carryover-rider", page: 1, section: "Earning a Carryover", locator: "page 1, Earning a Carryover", quote: "A total of exactly $500 does not earn a carryover." }],
  },
];
const render = (o: RolloverOutcome) => renderToStaticMarkup(createElement(RolloverPanel, { outcomes: [o], evidence }));

const cases: [RolloverStatus, Partial<RolloverOutcome>, string[]][] = [
  ["EARNED", { final_bank: { low_cents: 25000, high_cents: 25000 } }, ["Earned", "$250"]],
  ["CONDITIONAL", { final_bank: { low_cents: 25000, high_cents: 25000 }, qualifying_plan_paid: { low_cents: 42000, high_cents: 42000 } }, ["Conditional: may be added", "$420", "$250"]],
  ["NOT_EARNED", { forfeited_cents: 90000 }, ["Not earned", "$1,424 to $1,500", "Carryover balance lost: $900"]],
  ["UNCERTAIN", { final_bank: { low_cents: 0, high_cents: 25000 } }, ["Uncertain", "$0 to $250"]],
  ["NEEDS_CONFIRMATION", { final_bank: null, lost_to_cap_cents: null, forfeited_cents: null }, ["Needs confirmation"]],
];

describe("care plan rollover panel", () => {
  for (const [status, change, texts] of cases) {
    it(`renders ${status}`, () => {
      const html = render({ ...base, ...change, status });
      for (const t of texts) expect(html).toContain(t);
      expect(html).toContain("rollover.2026");
      expect(html).toContain("A total of exactly $500 does not earn a carryover.");
      expect(html).toContain("below $500");
      expect(html.toLowerCase()).not.toContain("guarantee");
    });
  }

  it("shows the amount lost to the cap", () => {
    expect(render({ ...base, status: "CONDITIONAL", final_bank: { low_cents: 100000, high_cents: 100000 }, lost_to_cap_cents: 15000 })).toContain("Lost to cap: $150");
  });

  it("renders nothing without outcomes", () => {
    expect(renderToStaticMarkup(createElement(RolloverPanel, { outcomes: [], evidence }))).toBe("");
  });

  // (1.6) A ranged settled amount (R2-M1) is shown as a range, never collapsed to one end.
  it("shows the plan paid so far, as a range when the input is a range", () => {
    expect(render(base)).toContain("Plan paid so far this year: $600");
    const ranged = render({ ...base, status: "UNCERTAIN", settled_plan_paid: { low_cents: 45000, high_cents: 55000 }, final_bank: { low_cents: 0, high_cents: 25000 } });
    expect(ranged).toContain("Plan paid so far this year: $450 to $550");
  });

  const shift = {
    closing_plan_version_id: "nwd-ppo-standard-2026",
    moved_to_date: "2027-01-05",
    moved_to_slot_id: "prov-rivera-t-20270105-1000",
    plan_pay_in_closing_period_cents: 14400,
    status_if_moved: "CONDITIONAL" as RolloverStatus,
    final_bank_if_moved: { low_cents: 25000, high_cents: 25000 },
    member_cost_delta_cents: 6000,
  };
  const note = (s: typeof shift) => renderToStaticMarkup(createElement(RolloverShiftNote, { shift: s, outcome: base }));

  // (1.6, R2-L2) An UNCERTAIN moved status must not claim the move keeps payments under the threshold.
  it("the shift note does not claim 'keeps … below' when the moved status is uncertain", () => {
    const html = note({ ...shift, status_if_moved: "UNCERTAIN", final_bank_if_moved: { low_cents: 0, high_cents: 25000 } });
    expect(html).not.toContain("keeps this year");
    expect(html).toContain("may keep this year&#x27;s plan payments below $500, depending on pending claims");
    expect(html).toContain("uncertain, $0 to $250");
  });

  it("the shift note uses only engine fields", () => {
    const html = note(shift);
    expect(html).toContain("Optional: moving this to");
    expect(html).toContain("keeps this year&#x27;s plan payments below $500");
    expect(html).toContain("estimated cost change +$60");
    expect(html.toLowerCase()).not.toContain("guarantee");
  });
});
