/**
 * AT-10 Plan periods are selected by service date, not claim or payment date.
 * AT-11 Pending claims are represented, not treated as settled balances.
 * AT-12 Out-of-network balance billing is included or marked unknown.
 * AT-13 A self-pay strategy compares the entire known care portfolio.
 * PLANNER-OWNED, FROZEN.
 */
import { describe, expect, it } from "vitest";
import { ClaimEvent, MemberState, PlanRegistry, ProviderOption, SimulationResult } from "@/domain";
import {
  allLines,
  benefits,
  byLabel,
  eventFor,
  fx,
  golden,
  mutateRule,
  optimize,
  P1,
  P2,
  POSTVISIT_AS_OF,
  provider,
  PV2026,
  PV2027,
  registry,
  visitNavigator,
  visitRequest,
} from "./helpers";

function sim(
  events: ClaimEvent[],
  opts: { member?: MemberState; providers?: ProviderOption[]; reg?: PlanRegistry; scenario?: "worst_case" | "best_case" } = {},
) {
  return SimulationResult.parse(
    benefits.simulate(opts.reg ?? registry(), {
      as_of: POSTVISIT_AS_OF,
      scenario: opts.scenario ?? "worst_case",
      member: opts.member ?? fx.member(),
      providers: opts.providers ?? fx.providersPost(),
      events,
    }),
  );
}

const ev = (over: Partial<ClaimEvent> & Pick<ClaimEvent, "cdt_code" | "service_date">): ClaimEvent => ({
  event_id: "evt-1",
  procedure_id: "proc-test",
  tooth: "14",
  claim_date: null,
  provider_id: P1,
  claim_route: "IN_NETWORK_CLAIM",
  ...over,
});

describe("AT-10 service date selects the plan period", () => {
  it("a Dec 17, 2026 service adjudicated in Jan 2027 uses the 2026 plan version", () => {
    const member = fx.member();
    member.pending_claims = [];
    const s = sim([ev({ cdt_code: "D2392", service_date: "2026-12-17", claim_date: "2027-01-12" })], { member });
    const line = s.lines[0]!;
    expect(line.plan_version_id).toBe(PV2026);
    expect(line.deductible_applied_cents).toBe(5000); // 2026 deductible, not 2027's $75
    expect(line.plan_pay_cents).toBe(10400); // 80% × (18000 − 5000)
    expect(line.member_responsibility_cents).toBe(7600);
    expect(line.applied_rule_ids).toContain("deductible.2026");
    expect(line.applied_rule_ids).not.toContain("deductible.2027");
  });

  it("Jan 1, 2027 belongs only to the 2027 period (fresh deductible and maximum)", () => {
    const s = sim([ev({ cdt_code: "D2392", service_date: "2027-01-01" })]);
    const line = s.lines[0]!;
    expect(line.plan_version_id).toBe(PV2027);
    expect(line.state_before!.opened_from).toBe("plan_rules");
    expect(line.state_before!.deductible_remaining_cents).toBe(7500);
    expect(line.state_before!.annual_max_remaining_cents).toBe(150000);
    expect(line.deductible_applied_cents).toBe(7500);
    expect(line.plan_pay_cents).toBe(8400);
  });

  it("care plan funding never pays before the service date", () => {
    const result = optimize();
    for (const alt of result.alternatives) {
      for (const e of alt.events) for (const f of e.funding) expect(f.payment_date >= e.service_date).toBe(true);
    }
  });
});

describe("AT-11 pending claims", () => {
  it("are reserved against the maximum and deductible, and surfaced as an issue", () => {
    const result = optimize();
    const rc = eventFor(byLabel(result, "lowest_total_cost"), "proc-rc-30");
    const before = rc.line_worst.state_before!;
    expect(before.annual_max_remaining_cents).toBe(90000);
    expect(before.pending_reserved_max_cents).toBe(7600);
    expect(before.annual_max_available_cents).toBe(82400);
    expect(before.deductible_remaining_cents).toBe(5000);
    expect(before.pending_reserved_deductible_cents).toBe(5000);
    expect(before.deductible_available_cents).toBe(0);
    expect(result.unresolved.some((i) => i.code === "PENDING_CLAIMS_PRESENT")).toBe(true);
  });

  it("removing the pending claim changes the result exactly as expected", () => {
    const g = golden.postvisit.variants.no_pending_claims;
    const result = optimize((r) => {
      r.member.pending_claims = [];
    });
    const alt = result.alternatives[0]!;
    expect(alt.totals.member_cost.high_cents).toBe(g.first_alternative.member_cost_cents);
    for (const [pid, exp] of Object.entries(g.first_alternative.lines)) {
      const line = eventFor(alt, pid).line_worst;
      for (const [k, v] of Object.entries(exp)) expect(line[k as keyof typeof line], `${pid}.${k}`).toBe(v);
    }
  });

  it("an uncertain pending estimate yields a member-cost range (best..worst), ranked on worst case", () => {
    const result = optimize((r) => {
      r.member.pending_claims[0]!.estimated_plan_pay.value = { kind: "range", low_cents: 6000, high_cents: 7600 };
    });
    const alt = byLabel(result, "lowest_total_cost");
    const crown = eventFor(alt, "proc-crown-30");
    expect(crown.member_cost).toEqual({ low_cents: 106000, high_cents: 107600 });
    // AmountRange is numeric [min, max]: plan pay is 2400 in the worst case and 4000 in the best case.
    expect(crown.plan_pay).toEqual({ low_cents: 2400, high_cents: 4000 });
    expect(alt.totals.member_cost).toEqual({ low_cents: 135600, high_cents: 137200 });
    expect(eventFor(alt, "proc-fill-14").service_date).toBe("2027-01-05");
  });
});

describe("AT-12 out-of-network balance billing", () => {
  it("is included in member responsibility", () => {
    const s = sim([ev({ cdt_code: "D3330", tooth: "30", service_date: "2026-10-17", provider_id: P2, claim_route: "OUT_OF_NETWORK_CLAIM" })]);
    const l = s.lines[0]!;
    expect(l.status).toBe("OK");
    expect(l.network_tier).toBe("out_of_network");
    expect(l.modeled_charge_cents).toBe(130000);
    expect(l.contractual_adjustment_cents).toBe(0);
    expect(l.patient_charge_cents).toBe(130000);
    expect(l.eligible_basis_cents).toBe(90000);
    expect(l.balance_bill_cents).toBe(40000);
    expect(l.deductible_applied_cents).toBe(0);
    expect(l.coverage_rate_bps).toBe(6000);
    expect(l.plan_pay_cents).toBe(54000);
    expect(l.member_responsibility_cents).toBe(76000);
    expect(l.applied_rule_ids).toContain("oon_allowance_schedule.2026");
  });

  it("is marked unknown (NEEDS_CONFIRMATION) when the OON charge is unknown", () => {
    const providers = fx.providersPost();
    provider(providers, P2).pricing.find((p) => p.cdt_code === "D3330")!.provider_charge.value = { kind: "unknown" };
    const s = sim(
      [ev({ cdt_code: "D3330", tooth: "30", service_date: "2026-10-17", provider_id: P2, claim_route: "OUT_OF_NETWORK_CLAIM" })],
      { providers },
    );
    expect(s.lines[0]!.status).toBe("NEEDS_CONFIRMATION");
    expect(s.lines[0]!.member_responsibility_cents).toBeNull();
    expect(s.lines[0]!.issues.some((i) => i.code === "OON_CHARGE_UNKNOWN")).toBe(true);
  });

  it("is shown in the visit navigator lines", () => {
    const result = visitNavigator().navigate(registry(), visitRequest());
    const oon = result.options.find((o) => o.provider_id === P2)!;
    const exp = golden.previsit.options[1]!;
    for (const expLine of exp.lines as { cdt_code: string; balance_bill_cents: number; member_responsibility_cents: number }[]) {
      const line = oon.lines.find((l) => l.cdt_code === expLine.cdt_code)!;
      expect(line.balance_bill_cents).toBe(expLine.balance_bill_cents);
      expect(line.member_responsibility_cents).toBe(expLine.member_responsibility_cents);
    }
  });
});

describe("AT-13 self-pay compares the entire known care portfolio", () => {
  it("the cheapest plan claims the filling in 2027 even though its 2026 cash price is lower than the 2026 claim", () => {
    const result = optimize();
    const lowest = byLabel(result, "lowest_total_cost");
    const fill = eventFor(lowest, "proc-fill-14");
    expect(fill.claim_route).toBe("IN_NETWORK_CLAIM");
    expect(fill.service_date).toBe("2027-01-05");
    expect(lowest.totals.member_cost.high_cents).toBe(137200);
    // Earliest completion: paying the verified $150 cash price beats the claim over the whole horizon.
    const earliest = byLabel(result, "earliest_safe_completion");
    expect(eventFor(earliest, "proc-fill-14").claim_route).toBe("SELF_PAY_NO_CLAIM");
    expect(earliest.totals.member_cost.high_cents).toBe(142600);
    expect(eventFor(earliest, "proc-fill-14").reasons).toContain("SELF_PAY_LOWER_PORTFOLIO_COST");
    expect(eventFor(earliest, "proc-fill-14").next_actions.some((a) => a.kind === "CONFIRM_SELF_PAY_WITH_OFFICE")).toBe(true);
  });

  it("self-paid services do not touch accumulators or frequency history", () => {
    const result = optimize();
    const fill = eventFor(byLabel(result, "earliest_safe_completion"), "proc-fill-14");
    expect(fill.line_worst.plan_pay_cents).toBe(0);
    expect(fill.line_worst.state_after).toEqual(fill.line_worst.state_before);
  });

  it("is never used when the office has not confirmed it (variant: office_self_pay_unknown)", () => {
    const g = golden.postvisit.variants.office_self_pay_unknown;
    const result = optimize((r) => {
      provider(r.providers, P1).self_pay.permitted_by_office = null;
    });
    expect(allLines(result).some((l) => l.claim_route === "SELF_PAY_NO_CLAIM")).toBe(false);
    const earliest = byLabel(result, "earliest_safe_completion");
    expect(earliest.totals.member_cost.high_cents).toBe(g.earliest_safe_completion.member_cost_cents);
  });

  it("is never used when the plan rule is missing or unknown (claim_submission)", () => {
    const reg = mutateRule(registry(), PV2026, "claim_submission.2026", () => null);
    const result = optimize(undefined, reg);
    expect(allLines(result).some((l) => l.claim_route === "SELF_PAY_NO_CLAIM")).toBe(false);
    // 2027's claim_submission rule is UNKNOWN in the source: a 2027 self-pay line is blocked.
    const s = sim([ev({ cdt_code: "D2392", service_date: "2027-01-05", claim_route: "SELF_PAY_NO_CLAIM" })]);
    expect(s.lines[0]!.status).toBe("NEEDS_CONFIRMATION");
    expect(s.lines[0]!.issues.some((i) => i.code === "RULE_UNKNOWN" && i.rule_id === "claim_submission.2027")).toBe(true);
  });

  it("an office-level unknown blocks a direct self-pay simulation with SELF_PAY_NOT_VERIFIED", () => {
    const providers = fx.providersPost();
    provider(providers, P1).self_pay.permitted_by_office = null;
    const s = sim([ev({ cdt_code: "D2392", service_date: "2026-10-22", claim_route: "SELF_PAY_NO_CLAIM" })], { providers });
    expect(s.lines[0]!.status).toBe("NEEDS_CONFIRMATION");
    expect(s.lines[0]!.issues.some((i) => i.code === "SELF_PAY_NOT_VERIFIED" && i.input_id === "provider.prov-rivera.self_pay")).toBe(true);
  });
});
