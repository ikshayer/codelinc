/**
 * Golden scenario (spec §14 Strict MVP, §15 demo): exact cents for the synthetic
 * member, verified independently before freezing. PLANNER-OWNED, FROZEN.
 */
import { describe, expect, it } from "vitest";
import { VisitNavigatorResult } from "@/domain";
import { byLabel, eventFor, golden, optimize, procedure, registry, visitNavigator, visitRequest } from "./helpers";

describe("golden: Visit Navigator (before the visit)", () => {
  it("returns in-network best/lowest and out-of-network soonest with exact costs and tradeoffs", () => {
    const g = golden.previsit;
    const r = VisitNavigatorResult.parse(visitNavigator().navigate(registry(), visitRequest()));
    expect(r.status).toBe(g.status);
    expect(r.as_of_date).toBe(g.as_of_date);
    expect(r.safety.urgent).toBe(false);
    expect(r.options.length).toBe(g.options.length);
    g.options.forEach((exp, i) => {
      const o = r.options[i]!;
      expect(o.labels).toEqual(exp.labels);
      expect(o.provider_id).toBe(exp.provider_id);
      expect(o.slot.slot_id).toBe(exp.slot_id);
      expect(o.claim_route).toBe(exp.claim_route);
      expect(o.days_until).toBe(exp.days_until);
      expect(o.modeled_charge).toEqual(exp.modeled_charge);
      expect(o.plan_pay).toEqual(exp.plan_pay);
      expect(o.member_cost).toEqual(exp.member_cost);
      expect(o.annual_max_used).toEqual({ low_cents: 0, high_cents: 0 });
      expect(o.deductible_applied).toEqual({ low_cents: 0, high_cents: 0 });
      for (const el of exp.lines) {
        const line = o.lines.find((l) => l.cdt_code === el.cdt_code)!;
        for (const [k, v] of Object.entries(el)) expect(line[k as keyof typeof line], `${o.provider_id} ${el.cdt_code} ${k}`).toBe(v);
      }
    });
    const soonest = r.options[1]!;
    const t = soonest.tradeoffs.find((x) => x.versus_option_id === r.options[0]!.option_id)!;
    expect(t).toEqual({ versus_option_id: r.options[0]!.option_id, ...g.options[1]!.tradeoff_vs_best_overall });
    for (const ex of g.excluded) {
      expect(r.excluded.find((x) => x.provider_id === ex.provider_id)?.reasons).toContain(ex.reasons_include);
    }
  });

  it("safety gate: red-flag symptoms route to the soonest appointment, never to saving benefits", () => {
    const g = golden.previsit.urgent_variant;
    const r = visitNavigator().navigate(
      registry(),
      visitRequest((q) => {
        q.visit.symptoms = g.symptoms;
      }),
    );
    expect(r.status).toBe(g.status);
    expect(r.safety.urgent).toBe(true);
    expect(r.safety.triggered_by).toContain("swelling");
    expect(r.safety.message).toBeTruthy();
    expect(r.options[0]!.provider_id).toBe(g.first_option.provider_id);
    for (const l of g.first_option.labels_include) expect(r.options[0]!.labels).toContain(l);
    expect(r.conditional_scenarios).toEqual([]);
  });
});

describe("golden: Care Plan Optimizer (after the visit)", () => {
  it("base scenario: exact schedule, adjudication, funding and objective", () => {
    const g = golden.postvisit.base;
    const r = optimize();
    expect(r.status).toBe(g.status);
    expect(r.as_of_date).toBe(golden.postvisit.as_of_date);
    expect(r.search_stats.pass).toBe(g.pass);
    expect(r.alternatives.length).toBe(g.alternatives.length);
    expect(r.recommended_alternative_id).toBe(r.alternatives[0]!.alternative_id);
    g.alternatives.forEach((ga, i) => {
      const a = r.alternatives[i]!;
      expect(a.labels).toEqual(ga.labels);
      expect(a.events.map((e) => e.procedure_id)).toEqual(ga.events.map((e) => e.procedure_id));
      for (const ge of ga.events as Record<string, unknown>[]) {
        const e = eventFor(a, ge.procedure_id as string);
        const line = e.line_worst;
        expect(e.line_best).toEqual(line); // exact inputs → identical scenarios
        for (const [k, v] of Object.entries(ge)) {
          if (k === "procedure_id") continue;
          if (k === "service_date" || k === "slot_id" || k === "provider_id" || k === "claim_route") {
            expect(e[k], `${ge.procedure_id}.${k}`).toBe(v);
          } else if (k === "state_after") {
            for (const [sk, sv] of Object.entries(v as object)) {
              expect(line.state_after![sk as keyof typeof line.state_after], `${ge.procedure_id}.state_after.${sk}`).toBe(sv);
            }
          } else if (k === "funding") {
            expect(
              e.funding.map((f) => ({ source_type: f.source_type, source_id: f.source_id, payment_date: f.payment_date, amount_cents: f.amount_cents })),
            ).toEqual(v);
          } else if (k === "reasons_include") {
            for (const reason of v as string[]) expect(e.reasons).toContain(reason);
          } else {
            expect(line[k as keyof typeof line], `${ge.procedure_id}.${k}`).toEqual(v);
          }
        }
      }
      const t = ga.totals;
      expect(a.totals.modeled_charge).toEqual({ low_cents: t.modeled_charge_cents, high_cents: t.modeled_charge_cents });
      expect(a.totals.contractual_adjustment).toEqual({ low_cents: t.contractual_adjustment_cents, high_cents: t.contractual_adjustment_cents });
      expect(a.totals.plan_pay).toEqual({ low_cents: t.plan_pay_cents, high_cents: t.plan_pay_cents });
      expect(a.totals.member_cost).toEqual({ low_cents: t.member_cost_cents, high_cents: t.member_cost_cents });
      expect(a.totals.fees_cents).toBe(t.fees_cents);
      expect(a.funding_gap_cents).toBe(ga.funding_gap_cents);
      expect(a.monthly.map((m) => ({ month: m.month, cash_cents: m.cash_cents }))).toEqual(ga.monthly_cash);
      for (const [k, v] of Object.entries(ga.objective)) expect(a.objective[k as keyof typeof a.objective], `objective.${k}`).toEqual(v);
      expect(a.benefit_states.map((b) => b.event_id)).toEqual(a.events.map((e) => e.event_id));
    });
    const lowest = byLabel(r, "lowest_total_cost");
    expect(eventFor(lowest, "proc-crown-30").next_actions.some((x) => x.kind === "REQUEST_PRETREATMENT_ESTIMATE")).toBe(true);
    expect(eventFor(lowest, "proc-rc-30").next_actions.some((x) => x.kind === "REQUEST_APPOINTMENT")).toBe(true);
  });

  it("deadline change: 'filling this year' removes the cheaper 2027 option from solver output", () => {
    const g = golden.postvisit.variants.filling_this_year_only;
    const r = optimize((q) => {
      const f = procedure(q.procedures, "proc-fill-14");
      f.target_date = "2026-12-31";
      f.latest_safe_date = "2026-12-31";
    });
    expect(r.status).toBe(g.status);
    for (const a of r.alternatives) for (const e of a.events) expect(e.service_date <= g.no_event_after).toBe(true);
    const first = r.alternatives[0]!;
    expect(first.labels).toEqual(g.first_alternative.labels);
    for (const [pid, d] of Object.entries(g.first_alternative.event_dates)) expect(eventFor(first, pid).service_date).toBe(d);
    for (const [pid, route] of Object.entries(g.first_alternative.routes)) expect(eventFor(first, pid).claim_route).toBe(route);
    expect(first.totals.member_cost.high_cents).toBe(g.first_alternative.member_cost_cents);
    expect(first.objective.peak_monthly_cash_cents).toBe(g.first_alternative.peak_monthly_cash_cents);
    const earliest = byLabel(r, "earliest_safe_completion");
    for (const [pid, d] of Object.entries(g.earliest_safe_completion.event_dates)) expect(eventFor(earliest, pid).service_date).toBe(d);
    expect(earliest.totals.member_cost.high_cents).toBe(g.earliest_safe_completion.member_cost_cents);
  });
});
