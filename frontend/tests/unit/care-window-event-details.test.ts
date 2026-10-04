import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { AdjudicationLine, BenefitPeriodState } from "@engine/benefits";
import { BenefitsAfterEvent, EventCostBreakdown, RouteComparisonCard } from "@/features/care-window/event-details";

const state: BenefitPeriodState = {
  plan_version_id: "plan-2026", period_start: "2026-01-01", period_end: "2026-12-31", opened_from: "snapshot",
  deductible_remaining_cents: 4500, pending_reserved_deductible_cents: 1200, deductible_available_cents: 3300,
  annual_max_remaining_cents: 143210, pending_reserved_max_cents: 43210, annual_max_available_cents: 100000,
  simulated_plan_paid_cents: 10000, sublimits: [{ rule_id: "sublimit", remaining_cents: 54321 }], source: "CLAIM_EOB",
};
const line: AdjudicationLine = {
  line_id: "line", event_id: "event", procedure_id: "procedure", cdt_code: "D2740", tooth: "30", service_date: "2026-11-02", claim_date: null,
  provider_id: "provider", network_tier: "in_network", claim_route: "IN_NETWORK_CLAIM", status: "OK", plan_version_id: "plan-2026", service_class: "major",
  modeled_charge_cents: 123456, contractual_adjustment_cents: 23456, patient_charge_cents: 100000, eligible_basis_cents: 100000,
  balance_bill_cents: 0, deductible_applied_cents: 4500, coverage_rate_bps: 5000, preliminary_plan_pay_cents: 47750,
  cap_applied: "annual_maximum", plan_pay_cents: 30000, member_responsibility_cents: 70000, counts_toward_maximum: true,
  state_before: state, state_after: state, applied_rule_ids: ["coverage"], input_ids: ["provider.quote"],
  steps: [{ step_id: "step", label: "Plan share before cap", formula: "basis * coverage", operands: [{ name: "basis", cents: 100000, bps: null, text: null, fact_id: "input:provider.quote" }], result_cents: 47750, result_bps: null, result_text: null }], issues: [],
};

describe("member care-plan detail disclosures", () => {
  it("keeps pending reservations distinct from settled and available benefits", () => {
    const html = renderToStaticMarkup(createElement(BenefitsAfterEvent, { state }));
    for (const text of ["Benefits left after this visit", "Annual maximum remaining (settled)", "$1,432.10", "Pending maximum reservation", "$432.10", "Annual maximum available after pending", "$1,000", "sublimit", "$543.21"]) expect(html).toContain(text);
  });

  it("renders full line pricing, formulas, operands, input facts and matching evidence", () => {
    const html = renderToStaticMarkup(createElement(EventCostBreakdown, { worst: line, best: line, evidence: [{ rule_id: "coverage", plan_version_id: "plan-2026", evidence: [{ source_id: "plan-doc", page: 3, section: "Major", locator: "page 3, Major", quote: "The plan pays half of the allowed basis." }] }] }));
    for (const text of ["$1,234.56", "$234.56", "Eligible / allowed basis", "Balance bill", "Deductible applied", "50%", "Annual maximum", "$700", "basis * coverage", "input:provider.quote", "page 3, Major"]) expect(html).toContain(text);
  });

  it("shows different uncertainty cases and unknown line amounts without inferring them", () => {
    const html = renderToStaticMarkup(createElement(EventCostBreakdown, { worst: { ...line, plan_pay_cents: null }, best: line, evidence: [] }));
    expect(html).toContain("Worst case"); expect(html).toContain("Best case"); expect(html).toContain("Unknown");
  });

  it("keeps route comparison visible when totals and winner are unknown", () => {
    const html = renderToStaticMarkup(createElement(RouteComparisonCard, { comparison: { claim_route: "IN_NETWORK_CLAIM", claim_total_cents: 12345, cash_total_cents: null, difference_cents: null, winner_claim_route: null, missing: [{ code: "SELF_PAY_NOT_VERIFIED", severity: "warning", message: "The office has not confirmed the cash quote.", field: null, input_id: null, rule_id: null, procedure_id: null, provider_id: null }] } }));
    expect(html).toContain("$123.45"); expect(html).toContain("Self-pay without claim: Unknown"); expect(html).toContain("The office has not confirmed the cash quote."); expect(html).not.toContain("saves");
  });
});
