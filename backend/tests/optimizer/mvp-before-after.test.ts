import { describe, expect, it, vi } from "vitest";
import {
  CarePlanRequest,
  CarePlanResult,
  MemberState,
  ProcedureRecommendation,
  ProviderOption,
  VisitNavigatorRequest,
  VisitNavigatorResult,
  diffDays,
  resolveMoney,
  type AdjudicationLine,
  type BenefitLedger,
  type BenefitPeriodState,
  type ClaimEvent,
  type PlanDefinition,
  type PlanRegistry,
  type SimulationRequest,
  type SimulationResult,
} from "@/domain";
import type { BenefitEngine } from "@/domain/ports";
import { createCarePlanOptimizer, createVisitNavigator } from "@/optimizer";
import memberJson from "../../fixtures/synthetic/member.json";
import proceduresJson from "../../fixtures/synthetic/procedures.confirmed.json";
import providersPostJson from "../../fixtures/synthetic/providers.postvisit.json";
import providersPreJson from "../../fixtures/synthetic/providers.previsit.json";

const registry = { registry_version: "fabricated-test", plans: [], sources: [] } as unknown as PlanRegistry;

function period(year: number): BenefitPeriodState {
  return {
    plan_version_id: `fake-dppo-${year}`,
    period_start: `${year}-01-01`,
    period_end: `${year}-12-31`,
    opened_from: year === 2026 ? "snapshot" : "plan_rules",
    deductible_remaining_cents: 0,
    annual_max_remaining_cents: 150000,
    pending_reserved_max_cents: 0,
    pending_reserved_deductible_cents: 0,
    annual_max_available_cents: 150000,
    deductible_available_cents: 0,
    sublimits: [],
    simulated_plan_paid_cents: 0,
    source: year === 2026 ? "CLAIM_EOB" : "PLAN_VERIFIED",
  };
}

function fakePlan(year: number): PlanDefinition {
  return {
    plan_version_id: `fake-dppo-${year}`,
    plan_type: "DPPO",
    rules: [
      {
        rule_id: `pretreatment_estimate.${year}`,
        rule_type: "pretreatment_estimate",
        status: "VERIFIED",
        effective_from: `${year}-01-01`,
        effective_to: `${year}-12-31`,
        applies_when: { network: null, service_class: null, cdt_codes: null },
        evidence: [{ source_id: "fake-source", page: 1, section: "test", locator: "test", quote: "fabricated rule" }],
        conflicts_with: [],
        note: null,
        value: { recommended_above_cents: 50000 },
      },
    ],
  } as unknown as PlanDefinition;
}

function fakeMemberCost(event: ClaimEvent): number {
  if (event.claim_route === "SELF_PAY_NO_CLAIM") return 15000;
  const outOfNetwork = event.claim_route === "OUT_OF_NETWORK_CLAIM";
  if (event.cdt_code === "D0140") return outOfNetwork ? 8300 : 0;
  if (event.cdt_code === "D0220") return outOfNetwork ? 2500 : 0;
  if (event.cdt_code === "D3330") return outOfNetwork ? 76000 : 20000;
  if (event.cdt_code === "D2740") return outOfNetwork ? 120000 : 107600;
  if (event.cdt_code === "D2392") return event.service_date >= "2027-01-01" ? 9600 : 15600;
  return 10000;
}

function simulate(request: SimulationRequest): SimulationResult {
  const providers = new Map(request.providers.map((provider) => [provider.provider_id, provider]));
  const events = [...request.events].sort(
    (a, b) => a.service_date.localeCompare(b.service_date) || a.event_id.localeCompare(b.event_id),
  );
  const lines: AdjudicationLine[] = events.map((event) => {
    const provider = providers.get(event.provider_id)!;
    const price = provider.pricing.find((value) => value.cdt_code === event.cdt_code)!;
    const rawCharge =
      event.claim_route === "SELF_PAY_NO_CLAIM"
        ? price.cash_quote!.value
        : price.provider_charge.value;
    const charge = resolveMoney(rawCharge, request.scenario, "higher_is_worse")!;
    const member = fakeMemberCost(event);
    const adjustment = event.claim_route === "IN_NETWORK_CLAIM" ? Math.min(charge, Math.round(charge * 0.25)) : 0;
    const planPay = Math.max(0, charge - adjustment - member);
    const state = period(Number(event.service_date.slice(0, 4)));
    return {
      line_id: event.event_id,
      event_id: event.event_id,
      procedure_id: event.procedure_id,
      cdt_code: event.cdt_code,
      tooth: event.tooth,
      service_date: event.service_date,
      claim_date: event.claim_date,
      provider_id: event.provider_id,
      network_tier: provider.network.tier,
      claim_route: event.claim_route,
      status: "OK",
      plan_version_id: state.plan_version_id,
      service_class: event.cdt_code === "D2740" ? "major" : "basic",
      modeled_charge_cents: charge,
      contractual_adjustment_cents: adjustment,
      patient_charge_cents: charge - adjustment,
      eligible_basis_cents: event.claim_route === "SELF_PAY_NO_CLAIM" ? null : charge - adjustment,
      balance_bill_cents: 0,
      deductible_applied_cents: 0,
      coverage_rate_bps: event.claim_route === "SELF_PAY_NO_CLAIM" ? null : 5000,
      preliminary_plan_pay_cents: event.claim_route === "SELF_PAY_NO_CLAIM" ? null : planPay,
      cap_applied: "none",
      plan_pay_cents: planPay,
      member_responsibility_cents: member,
      counts_toward_maximum: event.claim_route !== "SELF_PAY_NO_CLAIM",
      state_before: state,
      state_after: structuredClone(state),
      applied_rule_ids: [`fake-pricing-${event.service_date.slice(0, 4)}`],
      input_ids: [price.provider_charge.input_id],
      steps: [],
      issues: [],
    };
  });
  const ledger: BenefitLedger = { periods: [...new Set(lines.map((line) => Number(line.service_date.slice(0, 4))))].map(period), history: [] };
  const sum = (field: "modeled_charge_cents" | "contractual_adjustment_cents" | "plan_pay_cents" | "member_responsibility_cents") =>
    lines.reduce((total, line) => total + line[field]!, 0);
  return {
    contract_version: "1.0.0",
    engine_id: "fabricated-benefits",
    status: "OK",
    scenario: request.scenario,
    lines,
    ledger_before: ledger,
    ledger_after: structuredClone(ledger),
    totals: {
      modeled_charge_cents: sum("modeled_charge_cents"),
      contractual_adjustment_cents: sum("contractual_adjustment_cents"),
      plan_pay_cents: sum("plan_pay_cents"),
      member_responsibility_cents: sum("member_responsibility_cents"),
    },
    applied_rule_ids: [...new Set(lines.flatMap((line) => line.applied_rule_ids))].sort(),
    issues: [],
    rollover: [],
  };
}

const fakeBenefits: BenefitEngine = {
  engine_id: "fabricated-benefits",
  supportsPlanType: (planType) => planType === "DPPO",
  validatePlan: () => ({ plan_version_id: "fake", ok: true, rule_counts: { VERIFIED: 1, UNVERIFIED: 0, UNKNOWN: 0, CONFLICT: 0, NOT_APPLICABLE: 0 }, issues: [] }),
  resolvePlanVersion: (_registry, _key, date) => ({ ok: true, plan: fakePlan(Number(date.slice(0, 4))), issues: [] }),
  openLedger: (_registry, _member, asOf) => ({ ledger: { periods: [period(Number(asOf.slice(0, 4)))], history: [] }, issues: [] }),
  simulate: (_registry, request) => simulate(request),
  passport: () => {
    throw new Error("not used by optimizer tests");
  },
  evidenceFor: () => [],
};

function member(): MemberState {
  return MemberState.parse(structuredClone(memberJson));
}

function preRequest(): VisitNavigatorRequest {
  return VisitNavigatorRequest.parse({
    as_of: "2026-10-05T14:00:00Z",
    member: member(),
    providers: ProviderOption.array().parse(structuredClone(providersPreJson)),
    visit: {
      intent: "new_concern",
      expected_codes: ["D0140", "D0220"],
      symptoms: { severe_pain: false, swelling: false, trauma: false, bleeding: false, fever: false },
    },
    known_procedures: [],
    max_options: 3,
  });
}

function postRequest(): CarePlanRequest {
  return CarePlanRequest.parse({
    as_of: "2026-10-15T21:00:00Z",
    member: member(),
    providers: ProviderOption.array().parse(structuredClone(providersPostJson)),
    procedures: ProcedureRecommendation.array().parse(structuredClone(proceduresJson)),
    planning_horizon_end: "2027-06-30",
    max_alternatives: 3,
  });
}

describe("optimizer MVP with fully fabricated benefit results", () => {
  it("runs the complete before-and-after flow and returns schema-valid, funded alternatives", () => {
    const before = VisitNavigatorResult.parse(createVisitNavigator(fakeBenefits).navigate(registry, preRequest()));
    expect(before.status).toBe("OK");
    expect(before.options.map((option) => option.labels)).toEqual([["best_overall", "lowest_cost"], ["soonest"]]);
    expect(before.excluded).toContainEqual({ provider_id: "prov-lakeside", reasons: ["TRAVEL_LIMIT_EXCEEDED"] });
    expect(before.options[0]!.member_cost).toEqual({ low_cents: 0, high_cents: 0 });
    expect(before.options[1]!.tradeoffs[0]!.cost_delta_cents).toBe(10800);

    const after = CarePlanResult.parse(createCarePlanOptimizer(fakeBenefits).optimize(registry, postRequest()));
    expect(after.status).toBe("OK");
    expect(after.search_stats.pass).toBe(1);
    expect(after.alternatives.length).toBeGreaterThanOrEqual(2);
    expect(after.recommended_alternative_id).toBe("alt-1");
    expect(after.alternatives.flatMap((alternative) => alternative.labels).sort()).toEqual(
      ["lowest_total_cost", "earliest_safe_completion", "smoothest_monthly_payments"].sort(),
    );
    for (const alternative of after.alternatives) {
      expect(alternative.events).toHaveLength(3);
      expect(alternative.funding_gap_cents).toBe(0);
      for (const event of alternative.events) {
        const procedure = proceduresJson.find((value) => value.procedure_id === event.procedure_id)!;
        expect(event.service_date >= procedure.earliest_safe_date).toBe(true);
        expect(event.service_date <= procedure.latest_safe_date).toBe(true);
        expect(event.funding.every((allocation) => allocation.payment_date >= event.service_date)).toBe(true);
      }
      const root = alternative.events.find((event) => event.procedure_id === "proc-rc-30")!;
      const crown = alternative.events.find((event) => event.procedure_id === "proc-crown-30")!;
      expect(diffDays(root.service_date, crown.service_date)).toBeGreaterThanOrEqual(14);
      expect(diffDays(root.service_date, crown.service_date)).toBeLessThanOrEqual(60);
    }
    expect(after.decision_trace.map((entry) => entry.kind)).toContain("SEARCH_PASS");
    expect(after.decision_trace.filter((entry) => entry.kind === "ALTERNATIVE_SELECTED")).toHaveLength(after.alternatives.length);
    expect(after.decision_trace.map((entry) => entry.kind)).toEqual([
      "INPUT_VALIDATED",
      "CANDIDATES_BUILT",
      "SEARCH_PASS",
      ...after.alternatives.map(() => "ALTERNATIVE_SELECTED" as const),
    ]);
  });

  it("uses the urgent safety route and ranks the soonest practical appointment first", () => {
    const request = preRequest();
    request.visit.symptoms.swelling = true;
    const result = VisitNavigatorResult.parse(createVisitNavigator(fakeBenefits).navigate(registry, request));
    expect(result.status).toBe("URGENT_CARE_ROUTE");
    expect(result.safety.triggered_by).toEqual(["swelling"]);
    expect(result.options[0]!.provider_id).toBe("prov-brightsmile");
    // (1.3) §4.6: under urgency every option is on the soonest date; no later option to save money.
    expect(result.options[0]!.labels).toEqual(["best_overall", "lowest_cost", "soonest"]);
    expect(new Set(result.options.map((o) => o.slot.date)).size).toBe(1);
    expect(result.conditional_scenarios).toEqual([]);
  });

  it("switches to pass 2 with an exact budget gap without relaxing clinical deadlines", () => {
    const request = postRequest();
    request.member.funding_accounts = [];
    request.member.budget.hard_monthly_limit_cents = 1000;
    request.member.budget.preferred_monthly_limit_cents = 500;
    const result = CarePlanResult.parse(createCarePlanOptimizer(fakeBenefits).optimize(registry, request));
    expect(result.status).toBe("BUDGET_SHORTFALL");
    expect(result.search_stats.pass).toBe(2);
    expect(result.alternatives[0]!.funding_gap_cents).toBeGreaterThan(0);
    expect(result.alternatives[0]!.unscheduled).toEqual([]);
    for (const alternative of result.alternatives) {
      for (const event of alternative.events) {
        const procedure = request.procedures.find((value) => value.procedure_id === event.procedure_id)!;
        expect(event.service_date <= procedure.latest_safe_date!).toBe(true);
      }
    }
  });

  it("never lets an unconfirmed procedure become a clinical constraint", () => {
    const request = postRequest();
    request.procedures[0]!.confirmation = { status: "UNVERIFIED", confirmed_by: null, confirmed_at: null };
    const result = createCarePlanOptimizer(fakeBenefits).optimize(registry, request);
    expect(result.status).toBe("NEEDS_CONFIRMATION");
    expect(result.alternatives).toEqual([]);
    expect(result.unresolved).toContainEqual(expect.objectContaining({ code: "PROCEDURE_UNCONFIRMED", procedure_id: "proc-rc-30" }));
  });

  it("rejects unknown dependencies and cycles before search", () => {
    const unknown = postRequest();
    unknown.procedures[0]!.dependencies.push({ depends_on: "missing-procedure", min_gap_days: 1, max_gap_days: null });
    expect(createCarePlanOptimizer(fakeBenefits).optimize(registry, unknown)).toEqual(
      expect.objectContaining({ status: "INVALID_INPUT", alternatives: [] }),
    );

    const cycle = postRequest();
    cycle.procedures[0]!.dependencies.push({ depends_on: "proc-crown-30", min_gap_days: 1, max_gap_days: null });
    expect(createCarePlanOptimizer(fakeBenefits).optimize(registry, cycle)).toEqual(
      expect.objectContaining({ status: "INVALID_INPUT", alternatives: [] }),
    );
  });

  it("defers every dentist-approved alternative group instead of choosing clinically", () => {
    const request = postRequest();
    request.procedures[0]!.alternative_group_id = "clinical-choice-1";
    request.procedures[1]!.alternative_group_id = "clinical-choice-1";
    const result = createCarePlanOptimizer(fakeBenefits).optimize(registry, request);
    expect(result.status).toBe("NEEDS_CONFIRMATION");
    expect(result.alternatives).toEqual([]);
    expect(result.unresolved).toContainEqual(expect.objectContaining({ code: "ALTERNATIVE_NOT_APPROVED" }));
  });

  it("checks the schedule-combination cap before making any benefit simulation", () => {
    const request = postRequest();
    for (const procedure of request.procedures) {
      procedure.dependencies = [];
      procedure.earliest_safe_date = "2026-10-16";
      procedure.target_date = "2026-12-01";
      procedure.latest_safe_date = "2027-03-31";
    }
    const rivera = request.providers.find((provider) => provider.provider_id === "prov-rivera")!;
    const template = rivera.slots.items.find((slot) => slot.slot_id === "prov-rivera-t-20261020-0800")!;
    rivera.slots.items = Array.from({ length: 40 }, (_, index) => ({ ...template, slot_id: `fabricated-slot-${index + 1}` }));
    request.providers = [rivera];
    const simulateSpy = vi.fn(fakeBenefits.simulate);
    const result = createCarePlanOptimizer({ ...fakeBenefits, simulate: simulateSpy }).optimize(registry, request);
    expect(result.status).toBe("INVALID_INPUT");
    expect(result.unresolved).toContainEqual(expect.objectContaining({ code: "SCHEMA_INVALID" }));
    expect(result.search_stats.schedules_evaluated).toBe(0);
    expect(simulateSpy).not.toHaveBeenCalled();
  });

  it("returns NEEDS_CONFIRMATION when missing benefit data—not the calendar—forces care to be omitted", () => {
    const blockedBenefits: BenefitEngine = {
      ...fakeBenefits,
      simulate: (_registry, request) => {
        const result = simulate(request);
        const crown = result.lines.find((line) => line.cdt_code === "D2740");
        if (!crown) return result;
        crown.status = "NEEDS_CONFIRMATION";
        crown.plan_pay_cents = null;
        crown.member_responsibility_cents = null;
        crown.issues = [
          {
            code: "RULE_MISSING",
            severity: "blocking",
            message: "The annual maximum rule is missing.",
            field: "rules.annual_maximum",
            rule_id: null,
            input_id: null,
            procedure_id: crown.procedure_id,
            provider_id: null,
          },
        ];
        result.status = "NEEDS_CONFIRMATION";
        result.totals = null;
        return result;
      },
    };
    const result = createCarePlanOptimizer(blockedBenefits).optimize(registry, postRequest());
    expect(result.status).toBe("NEEDS_CONFIRMATION");
    expect(result.alternatives).toEqual([]);
    expect(result.unresolved).toContainEqual(expect.objectContaining({ code: "RULE_MISSING", severity: "blocking" }));
  });

  it("rejects self-pay schedules unless the same whole schedule is strictly cheaper than claiming", () => {
    const expensiveSelfPay: BenefitEngine = {
      ...fakeBenefits,
      simulate: (_registry, request) => {
        const result = simulate(request);
        for (const line of result.lines) {
          if (line.claim_route !== "SELF_PAY_NO_CLAIM") continue;
          line.member_responsibility_cents = 25000;
        }
        if (result.totals) {
          result.totals.member_responsibility_cents = result.lines.reduce(
            (sum, line) => sum + (line.member_responsibility_cents ?? 0),
            0,
          );
        }
        return result;
      },
    };
    const result = CarePlanResult.parse(createCarePlanOptimizer(expensiveSelfPay).optimize(registry, postRequest()));
    expect(result.alternatives.flatMap((alternative) => alternative.events)).not.toContainEqual(
      expect.objectContaining({ claim_route: "SELF_PAY_NO_CLAIM" }),
    );
  });

  it("keeps a procedure unscheduled when no slot is inside its safe window", () => {
    const request = postRequest();
    const root = request.procedures.find((procedure) => procedure.procedure_id === "proc-rc-30")!;
    root.earliest_safe_date = "2026-10-16";
    root.target_date = "2026-10-16";
    root.latest_safe_date = "2026-10-16";
    const result = CarePlanResult.parse(createCarePlanOptimizer(fakeBenefits).optimize(registry, request));
    expect(result.status).toBe("NO_FEASIBLE_SCHEDULE");
    expect(result.alternatives[0]!.unscheduled).toContainEqual(expect.objectContaining({ procedure_id: "proc-rc-30", reason: "NO_SLOT_IN_WINDOW" }));
    expect(result.unresolved.map((value) => value.code)).toEqual(expect.arrayContaining(["NO_SLOT_IN_WINDOW", "DEADLINE_UNMET"]));
  });

  it("is byte-for-byte deterministic when unordered inputs are permuted", () => {
    const original = postRequest();
    const permuted = structuredClone(original);
    permuted.providers.reverse();
    permuted.procedures.reverse();
    permuted.member.availability.weekly.reverse();
    for (const provider of permuted.providers) {
      provider.slots.items.reverse();
      provider.pricing.reverse();
    }
    const optimizer = createCarePlanOptimizer(fakeBenefits);
    expect(optimizer.optimize(registry, permuted)).toEqual(optimizer.optimize(registry, original));
  });
});

describe("route comparison (contract 1.2, CONTRACT §5.9)", () => {
  // Rivera only (the office with a cash quote), so both the 2026 and 2027 fillings land there.
  const riveraRequest = () => {
    const request = postRequest();
    request.providers = request.providers.filter((value) => value.provider_id === "prov-rivera");
    return request;
  };
  const fillEvents = (result: CarePlanResult) =>
    result.alternatives.flatMap((alternative) =>
      alternative.events.filter((event) => event.procedure_id === "proc-fill-14" && event.provider_id === "prov-rivera").map((event) => ({ alternative, event })),
    );
  const withSelfPay = (patch: (line: AdjudicationLine) => void, blocks = false): BenefitEngine => ({
    ...fakeBenefits,
    simulate: (_registry, request) => {
      const result = simulate(request);
      const selfPay = result.lines.filter((line) => line.claim_route === "SELF_PAY_NO_CLAIM");
      selfPay.forEach(patch);
      if (blocks && selfPay.length) {
        result.status = "NEEDS_CONFIRMATION";
        result.totals = null;
      } else if (result.totals) {
        result.totals.member_responsibility_cents = result.lines.reduce((sum, line) => sum + line.member_responsibility_cents!, 0);
      }
      return result;
    },
  });

  it("compares the whole schedule both ways: cash wins in 2026, the claim wins in 2027", () => {
    const result = CarePlanResult.parse(createCarePlanOptimizer(fakeBenefits).optimize(registry, riveraRequest()));
    const fills = fillEvents(result);
    expect(fills.some(({ event }) => event.service_date < "2027-01-01")).toBe(true);
    expect(fills.some(({ event }) => event.service_date >= "2027-01-01")).toBe(true);
    for (const { alternative, event } of fills) {
      const comparison = event.route_comparison!;
      expect(comparison.claim_route).toBe("IN_NETWORK_CLAIM");
      expect(comparison.missing).toEqual([]);
      // The chosen route's side equals the alternative's own whole-schedule total.
      const chosenTotal = event.claim_route === "SELF_PAY_NO_CLAIM" ? comparison.cash_total_cents : comparison.claim_total_cents;
      expect(chosenTotal).toBe(alternative.totals.member_cost.high_cents);
      if (event.service_date < "2027-01-01") {
        // fake: 2026 claim $156 vs cash $150
        expect(comparison.claim_total_cents! - comparison.cash_total_cents!).toBe(600);
        expect(comparison.difference_cents).toBe(600);
        expect(comparison.winner_claim_route).toBe("SELF_PAY_NO_CLAIM");
      } else {
        // fake: 2027 claim $96 vs cash $150
        expect(comparison.cash_total_cents! - comparison.claim_total_cents!).toBe(5400);
        expect(comparison.difference_cents).toBe(5400);
        expect(comparison.winner_claim_route).toBe("IN_NETWORK_CLAIM");
      }
    }
    for (const alternative of result.alternatives) {
      // Only Rivera quotes cash, and only for the filling.
      for (const event of alternative.events) {
        if (event.procedure_id !== "proc-fill-14" || event.provider_id !== "prov-rivera") expect(event.route_comparison).toBeNull();
      }
    }
  });

  it("a tie goes to the claim route", () => {
    const tie = withSelfPay((line) => {
      line.member_responsibility_cents = line.service_date < "2027-01-01" ? 15600 : 9600;
    });
    const result = CarePlanResult.parse(createCarePlanOptimizer(tie).optimize(registry, riveraRequest()));
    const fills = fillEvents(result);
    expect(fills.length).toBeGreaterThan(0);
    for (const { event } of fills) {
      expect(event.claim_route).toBe("IN_NETWORK_CLAIM"); // self-pay must be strictly cheaper (§5.3)
      expect(event.route_comparison!.difference_cents).toBe(0);
      expect(event.route_comparison!.winner_claim_route).toBe("IN_NETWORK_CLAIM");
    }
  });

  it("an unevaluable version with only warning-level issues still names what is missing", () => {
    const warningOnly = withSelfPay((line) => {
      line.status = "NEEDS_CONFIRMATION";
      line.plan_pay_cents = null;
      line.member_responsibility_cents = null;
      line.issues = [
        {
          code: "INPUT_STALE",
          severity: "warning",
          message: "The cash quote is stale.",
          field: null,
          rule_id: null,
          input_id: "provider.prov-rivera.price.d2392.cash",
          procedure_id: line.procedure_id,
          provider_id: line.provider_id,
        },
      ];
    }, true);
    const result = CarePlanResult.parse(createCarePlanOptimizer(warningOnly).optimize(registry, riveraRequest()));
    const fills = fillEvents(result);
    expect(fills.length).toBeGreaterThan(0);
    for (const { event } of fills) {
      expect(event.route_comparison!.cash_total_cents).toBeNull();
      expect(event.route_comparison!.missing).toEqual([
        expect.objectContaining({ code: "INPUT_STALE", severity: "warning", input_id: "provider.prov-rivera.price.d2392.cash" }),
      ]);
    }
  });

  it("an unevaluable cash version stays unknown, never 0, and names what is missing", () => {
    const blocked = withSelfPay((line) => {
      line.status = "NEEDS_CONFIRMATION";
      line.plan_pay_cents = null;
      line.member_responsibility_cents = null;
      line.issues = [
        {
          code: "SELF_PAY_NOT_VERIFIED",
          severity: "blocking",
          message: "The office has not confirmed self-pay.",
          field: null,
          rule_id: null,
          input_id: "provider.prov-rivera.self_pay",
          procedure_id: line.procedure_id,
          provider_id: line.provider_id,
        },
      ];
    }, true);
    const result = CarePlanResult.parse(createCarePlanOptimizer(blocked).optimize(registry, riveraRequest()));
    const fills = fillEvents(result);
    expect(fills.length).toBeGreaterThan(0);
    for (const { alternative, event } of fills) {
      expect(event.claim_route).toBe("IN_NETWORK_CLAIM");
      expect(event.route_comparison).toEqual({
        claim_route: "IN_NETWORK_CLAIM",
        claim_total_cents: alternative.totals.member_cost.high_cents,
        cash_total_cents: null,
        difference_cents: null,
        winner_claim_route: null,
        missing: [expect.objectContaining({ code: "SELF_PAY_NOT_VERIFIED", severity: "warning", input_id: "provider.prov-rivera.self_pay" })],
      });
    }
  });
});
