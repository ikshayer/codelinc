/**
 * AT-23 (contract 1.7): recommendation modes that genuinely rerank (CONTRACT §5.5), concrete deltas from the
 * recommended alternative (§6.3), solver metadata / bounded search (§6.4) and the same-day order warning (§6.5).
 */
import { describe, expect, it } from "vitest";
import {
  CarePlanResult,
  RecommendationMode,
  SEARCH_LIMITS,
  type Alternative,
  type CarePlanRequest,
  type ProcedureRecommendation,
} from "@/domain";
import type { ApiResponseLike } from "@/domain/ports";
import { createApiHandlers } from "@/api";
import { carePlanRequest, carePlanOptimizer, fx, golden, optimize, registry } from "./helpers";

const MODES = RecommendationMode.options;
const MODE_LABEL: Record<RecommendationMode, string> = {
  BALANCED: "lowest_total_cost",
  LOWEST_TOTAL_COST: "lowest_member_cost",
  EARLIEST_SAFE_COMPLETION: "earliest_safe_completion",
  SMOOTHEST_PAYMENTS: "smoothest_monthly_payments",
};
const withMode = (mode: RecommendationMode) => (q: CarePlanRequest) => {
  q.preferences = { mode };
};
const recommended = (r: CarePlanResult): Alternative => {
  const alt = r.alternatives[0];
  if (!alt) throw new Error("no alternative");
  return alt;
};
/** expected.json lists provider_id only where it matters; every golden event is at prov-rivera. */
const goldenKey = (events: readonly { procedure_id: string; service_date: string; claim_route: string }[]) =>
  [...events]
    .sort((a, b) => (a.procedure_id < b.procedure_id ? -1 : 1))
    .map((e) => `${e.procedure_id}@${e.service_date}@prov-rivera@${e.claim_route}`)
    .join("|");
const results = new Map<RecommendationMode, CarePlanResult>();
/** Each mode's golden result is computed once per file (the optimizer is pure; determinism has its own test). */
const modeResult = (mode: RecommendationMode): CarePlanResult => {
  const cached = results.get(mode) ?? optimize(withMode(mode));
  results.set(mode, cached);
  return cached;
};
const GOLDEN_MODES = Object.fromEntries(Object.entries(golden.postvisit.modes).filter(([key]) => !key.startsWith("_"))) as Record<
  RecommendationMode,
  { recommended_schedule_key: string; member_cost_cents: number; labels: string[] }
>;

describe("AT-23 §4.1 modes", () => {
  it("BALANCED is the default and reproduces the golden alternatives (ids, labels, schedule keys, member costs)", () => {
    const byDefault = optimize();
    const explicit = optimize(withMode("BALANCED"));
    expect(byDefault.mode).toBe("BALANCED");
    expect(explicit).toEqual(byDefault);
    const expected = golden.postvisit.base.alternatives;
    expect(byDefault.alternatives).toHaveLength(expected.length);
    expected.forEach((g, index) => {
      const alt = byDefault.alternatives[index]!;
      expect(alt.alternative_id).toBe(`alt-${index + 1}`);
      expect(alt.labels).toEqual(g.labels);
      expect(alt.schedule_key).toBe(goldenKey(g.events));
      expect(alt.totals.member_cost.high_cents).toBe(g.totals.member_cost_cents);
    });
    expect(byDefault.recommended_alternative_id).toBe("alt-1");
  });

  it("each mode recommends its own key's winner (expected.json → postvisit.modes)", () => {
    for (const mode of MODES) {
      const r = modeResult(mode);
      const alt = recommended(r);
      const g = GOLDEN_MODES[mode];
      expect(r.mode, mode).toBe(mode);
      expect(r.recommended_alternative_id, mode).toBe("alt-1");
      expect(alt.schedule_key, mode).toBe(g.recommended_schedule_key);
      expect(alt.totals.member_cost.high_cents, mode).toBe(g.member_cost_cents);
      expect(alt.labels, mode).toEqual(g.labels);
      expect(alt.labels, mode).toContain(MODE_LABEL[mode]);
    }
  });

  it("EARLIEST_SAFE_COMPLETION recommends the golden $1,426 earlier schedule", () => {
    const alt = recommended(modeResult("EARLIEST_SAFE_COMPLETION"));
    expect(alt.totals.member_cost.high_cents).toBe(142600);
    expect(alt.objective.completion_date).toBe("2026-11-05");
  });

  it("modes genuinely rerank (§14.3 #1): at least two modes recommend different schedules; LOWEST_TOTAL_COST is never costlier", () => {
    const recommendations = MODES.map((mode) => recommended(modeResult(mode)));
    expect(new Set(recommendations.map((alt) => alt.schedule_key)).size).toBeGreaterThanOrEqual(2);
    const lowest = recommendations[MODES.indexOf("LOWEST_TOTAL_COST")]!.totals.member_cost.high_cents;
    for (const alt of recommendations) expect(lowest).toBeLessThanOrEqual(alt.totals.member_cost.high_cents);
  });

  it("LOWEST_TOTAL_COST ranks cost before target-date lateness; BALANCED keeps the dentist's target date first", () => {
    const earlyTarget = (q: CarePlanRequest) => {
      q.procedures.find((p) => p.procedure_id === "proc-fill-14")!.target_date = "2026-10-22";
    };
    const balanced = recommended(optimize(earlyTarget));
    const cheapest = recommended(optimize((q) => (earlyTarget(q), withMode("LOWEST_TOTAL_COST")(q))));
    expect(balanced.totals.member_cost.high_cents).toBeGreaterThan(cheapest.totals.member_cost.high_cents);
    expect(balanced.objective.lateness_days_by_urgency).toEqual([0, 0, 0]);
    expect(cheapest.objective.lateness_days_by_urgency[2]).toBeGreaterThan(0);
    expect(cheapest.labels).toContain("lowest_member_cost");
    expect(balanced.labels).not.toContain("lowest_member_cost");
    // Safety first in every mode: nothing urgent is ever left unscheduled or moved outside its window.
    for (const mode of MODES) {
      const alt = recommended(optimize((q) => (earlyTarget(q), withMode(mode)(q))));
      expect(alt.unscheduled, mode).toEqual([]);
      expect(alt.objective.unscheduled_by_urgency, mode).toEqual([0, 0, 0]);
    }
  });

  it("alternatives: the mode winner is first, schedules are distinct, and lowest_member_cost never appears outside LOWEST_TOTAL_COST", () => {
    for (const mode of MODES) {
      const r = modeResult(mode);
      expect(new Set(r.alternatives.map((alt) => alt.schedule_key)).size, mode).toBe(r.alternatives.length);
      const withMemberCost = r.alternatives.filter((alt) => alt.labels.includes("lowest_member_cost"));
      expect(withMemberCost.length, mode).toBe(mode === "LOWEST_TOTAL_COST" ? 1 : 0);
      if (mode === "LOWEST_TOTAL_COST") expect(withMemberCost[0]!.alternative_id).toBe("alt-1");
    }
    expect(optimize((q) => (q.max_alternatives = 1, withMode("EARLIEST_SAFE_COMPLETION")(q))).alternatives).toHaveLength(1);
  });
});

describe("AT-23 §4.1 determinism", () => {
  it.each(MODES)("%s gives an identical result twice", (mode) => {
    expect(optimize(withMode(mode))).toEqual(optimize(withMode(mode)));
  });
});

describe("AT-23 §4.2 deltas reconcile with the finished alternatives", () => {
  const sumBank = (alt: Alternative, side: "low_cents" | "high_cents") => alt.rollover.reduce((sum, outcome) => sum + (outcome.final_bank?.[side] ?? 0), 0);
  const dateOf = (alt: Alternative, procedureId: string) => alt.events.find((e) => e.procedure_id === procedureId)?.service_date ?? null;
  const lastMax = (alt: Alternative) => {
    const map = new Map<string, number>();
    for (const state of alt.benefit_states) {
      const event = alt.events.find((e) => e.event_id === state.event_id)!;
      map.set(event.line_worst.plan_version_id!, state.state_after.annual_max_remaining_cents);
    }
    return map;
  };
  const days = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 864e5);

  it.each(MODES)("%s: every non-recommended alternative's delta is the field arithmetic on the two alternatives", (mode) => {
    const r = modeResult(mode);
    const rec = recommended(r);
    expect(rec.difference_from_recommended).toBeNull();
    expect(r.alternatives.length).toBeGreaterThan(1);
    for (const alt of r.alternatives.slice(1)) {
      const d = alt.difference_from_recommended!;
      expect(d, alt.alternative_id).not.toBeNull();
      expect(d.member_cost_delta_cents).toBe(alt.totals.member_cost.high_cents - rec.totals.member_cost.high_cents);
      expect(d.plan_pay_delta_cents).toBe(alt.totals.plan_pay.high_cents - rec.totals.plan_pay.high_cents);
      expect(d.peak_monthly_cash_delta_cents).toBe(alt.objective.peak_monthly_cash_cents - rec.objective.peak_monthly_cash_cents);
      const cash = (a: Alternative, month: string) => a.monthly.find((m) => m.month === month)?.cash_cents ?? 0;
      const months = [...new Set([...rec.monthly, ...alt.monthly].map((m) => m.month))].sort();
      expect(d.monthly).toEqual(months.map((month) => ({ month, cash_delta_cents: cash(alt, month) - cash(rec, month) })));
      expect(d.completion_shift_days).toBe(days(rec.objective.completion_date!, alt.objective.completion_date!));
      const changed = [...new Set([...rec.events, ...alt.events].map((e) => e.procedure_id))]
        .sort()
        .filter((id) => dateOf(rec, id) !== dateOf(alt, id))
        .map((id) => ({
          procedure_id: id,
          recommended_date: dateOf(rec, id),
          this_date: dateOf(alt, id),
          shift_days: days(dateOf(rec, id)!, dateOf(alt, id)!),
        }));
      expect(d.service_date_changes).toEqual(changed);
      expect(d.rollover_final_bank_delta).toEqual({
        low_cents: sumBank(alt, "low_cents") - sumBank(rec, "low_cents"),
        high_cents: sumBank(alt, "high_cents") - sumBank(rec, "high_cents"),
      });
      const recMax = lastMax(rec);
      const thisMax = lastMax(alt);
      expect(d.annual_max_remaining_delta).toEqual(
        [...thisMax.keys()]
          .filter((id) => recMax.has(id))
          .sort()
          .map((id) => ({ plan_version_id: id, delta_cents: thisMax.get(id)! - recMax.get(id)! })),
      );
      const codes = (a: Alternative) => new Set(a.issues.map((i) => i.code));
      expect(d.warnings_added).toEqual([...codes(alt)].filter((c) => !codes(rec).has(c)).sort());
      expect(d.warnings_removed).toEqual([...codes(rec)].filter((c) => !codes(alt).has(c)).sort());
    }
  });

  it("golden BALANCED alt-2 vs alt-1: +$54.00 member cost, finishes 61 days earlier, filling moves to 2026-10-22", () => {
    const d = modeResult("BALANCED").alternatives[1]!.difference_from_recommended!;
    const [g1, g2] = golden.postvisit.base.alternatives;
    expect(d.member_cost_delta_cents).toBe(g2!.totals.member_cost_cents - g1!.totals.member_cost_cents);
    expect(d.plan_pay_delta_cents).toBe(g2!.totals.plan_pay_cents - g1!.totals.plan_pay_cents);
    expect(d.peak_monthly_cash_delta_cents).toBe(g2!.objective.peak_monthly_cash_cents - g1!.objective.peak_monthly_cash_cents);
    expect(d.completion_shift_days).toBe(-61);
    expect(d.service_date_changes).toEqual([
      { procedure_id: "proc-fill-14", recommended_date: "2027-01-05", this_date: "2026-10-22", shift_days: -75 },
    ]);
    expect(d.warnings_added).toEqual([]);
    expect(d.warnings_removed).toEqual([]);
  });
});

describe("AT-23 §4.3 solver metadata and bounded search", () => {
  it("the golden run is OPTIMAL with consistent counts and the deterministic tie-breaker", () => {
    const r = modeResult("BALANCED");
    const meta = r.solver_meta;
    expect(meta.status).toBe("OPTIMAL");
    expect(meta.bounds_applied).toEqual([]);
    expect(meta.elapsed_ms).toBeNull();
    expect(meta.candidates_built).toBe(r.search_stats.candidates_built);
    expect(meta.schedules_evaluated).toBe(r.search_stats.schedules_evaluated);
    expect(meta.schedules_rejected).toBe(r.search_stats.schedules_evaluated - r.search_stats.schedules_feasible);
    expect(meta).toMatchObject({ candidates_built: 35, schedules_evaluated: 628, schedules_rejected: 102 });
    expect(meta.deterministic_tie_breaker).toBe(
      "service dates, then provider ids, then claim routes, then slot ids, urgency-then-procedure-id order",
    );
  });

  it("a search with no schedule at all is NO_FEASIBLE_SOLUTION, never OPTIMAL", () => {
    const r = optimize((q) => {
      for (const provider of q.providers) provider.slots.items = [];
    });
    expect(r.status).toBe("NO_FEASIBLE_SCHEDULE");
    expect(r.solver_meta.status).toBe("NO_FEASIBLE_SOLUTION");
  });

  it("more than 50,000 combinations is searched within a deterministic per-procedure candidate cap: BOUNDED_BEST_FOUND", () => {
    // 8 procedures x 10 candidates at one provider: Π(10 + 1) = 11^8 ≈ 2.1e8 > 50,000; the largest common k is 2 (3^8 = 6,561; k = 3 gives 4^8 = 65,536).
    const template = fx.procedures().find((p) => p.procedure_id === "proc-rc-30")!;
    const build = (q: CarePlanRequest) => {
      q.procedures = Array.from({ length: SEARCH_LIMITS.max_procedures }, (_, index): ProcedureRecommendation => ({
        ...structuredClone(template),
        procedure_id: `proc-bulk-${index + 1}`,
        urgency: "can_plan_later",
        earliest_safe_date: "2026-10-16",
        target_date: "2027-03-31",
        latest_safe_date: "2027-03-31",
        dependencies: [],
      }));
      q.providers = q.providers.filter((p) => p.provider_id === "prov-rivera");
    };
    const r = optimize(build);
    expect(r.solver_meta.status).toBe("BOUNDED_BEST_FOUND");
    expect(r.solver_meta.status).not.toBe("OPTIMAL");
    expect(r.solver_meta.bounds_applied).toEqual(["max_schedules_evaluated=50000: candidates per procedure capped at 2"]);
    expect(r.status).not.toBe("INVALID_INPUT");
    expect(r.solver_meta.candidates_built).toBe(8 * 10);
    expect(r.solver_meta.schedules_evaluated).toBeGreaterThan(0);
    expect(r.solver_meta.schedules_evaluated).toBeLessThanOrEqual(SEARCH_LIMITS.max_schedules_evaluated);
    expect(r.solver_meta.schedules_rejected).toBe(r.search_stats.schedules_evaluated - r.search_stats.schedules_feasible);
    expect(optimize(build)).toEqual(r);
  });
});

describe("AT-23 §4.4 same-day order warning", () => {
  /**
   * Root canal (basic 80%) and crown (major 50%) on the same Thursday at one provider, with the whole $50 deductible
   * open and the annual maximum not binding: whichever claim is processed first absorbs the deductible at its own rate.
   */
  const sameDay = (q: CarePlanRequest) => {
    q.member.pending_claims = [];
    const accumulator = q.member.accumulators.find((a) => a.plan_version_id === "nwd-ppo-standard-2026")!;
    accumulator.annual_max_remaining.value = { kind: "exact", cents: 150000 };
    accumulator.plan_paid_ytd.value = { kind: "exact", cents: 0 };
    q.providers = q.providers.filter((p) => p.provider_id === "prov-rivera");
    const rivera = q.providers[0]!;
    const crownSlot = rivera.slots.items.find((s) => s.slot_id === "prov-rivera-t-20261105-1500")!;
    rivera.slots.items = [crownSlot, { ...crownSlot, slot_id: "prov-rivera-t-20261105-0900", start_time: "09:00", end_time: "10:00" }];
    q.procedures = q.procedures
      .filter((p) => p.procedure_id !== "proc-fill-14")
      .map((p) => ({ ...p, earliest_safe_date: "2026-11-05", target_date: "2026-11-05", latest_safe_date: "2026-11-05", dependencies: [] }));
  };

  it("warns when processing same-day claims in the other order changes the member's cost", () => {
    const r = optimize(sameDay);
    const alt = recommended(r);
    expect(alt.events.map((e) => e.service_date)).toEqual(["2026-11-05", "2026-11-05"]);
    const warning = alt.issues.find((i) => i.code === "SAME_DAY_ORDER_AFFECTS_COST");
    expect(warning).toBeDefined();
    expect(warning!.severity).toBe("warning");
    expect(warning!.procedure_id).toBe(alt.events[0]!.procedure_id);
    expect(warning!.message).toMatch(/^The order the plan processes same-day claims changes your cost: \$[\d,.]+ in this order, \$[\d,.]+ in the other\.$/);
    const own = alt.totals.member_cost.high_cents / 100;
    expect(warning!.message).toContain(`$${own.toLocaleString("en-US", { maximumFractionDigits: 2 })} in this order`);
    expect(r.unresolved.map((i) => i.code)).toContain("SAME_DAY_ORDER_AFFECTS_COST");
  });

  it("does not warn without a same-day pair of claims (the golden scenario has none)", () => {
    for (const mode of MODES) {
      for (const alt of modeResult(mode).alternatives) {
        expect(alt.issues.map((i) => i.code), `${mode} ${alt.alternative_id}`).not.toContain("SAME_DAY_ORDER_AFFECTS_COST");
      }
    }
    const spread = optimize((q) => {
      sameDay(q);
      q.procedures.find((p) => p.procedure_id === "proc-crown-30")!.earliest_safe_date = "2026-12-03";
      q.procedures.find((p) => p.procedure_id === "proc-crown-30")!.latest_safe_date = "2026-12-03";
      q.procedures.find((p) => p.procedure_id === "proc-crown-30")!.target_date = "2026-12-03";
      q.providers[0]!.slots.items.push({ ...q.providers[0]!.slots.items[0]!, slot_id: "prov-rivera-t-20261203-1300", date: "2026-12-03", start_time: "13:00", end_time: "14:00" });
    });
    expect(spread.alternatives.length).toBeGreaterThan(0);
    for (const alt of spread.alternatives) expect(alt.issues.map((i) => i.code)).not.toContain("SAME_DAY_ORDER_AFFECTS_COST");
  });
});

describe("AT-23 §7 API", () => {
  const api = createApiHandlers();
  const call = async (body: unknown): Promise<ApiResponseLike> =>
    api.care_plan({ method: "POST", headers: { "content-type": "application/json" }, body });

  it("rejects an unknown preferences key with 400", async () => {
    const body = { ...carePlanRequest(), preferences: { mode: "BALANCED", unknown_key: true } };
    const res = await call(body);
    expect(res.status).toBe(400);
    expect((res.body as { ok: boolean }).ok).toBe(false);
    const badMode = await call({ ...carePlanRequest(), preferences: { mode: "CHEAPEST" } });
    expect(badMode.status).toBe(400);
  });

  it("a mode sent over the API reaches the engine", async () => {
    const res = await call({ ...carePlanRequest(), preferences: { mode: "EARLIEST_SAFE_COMPLETION" } });
    expect(res.status).toBe(200);
    const r = CarePlanResult.parse((res.body as { data: unknown }).data);
    expect(r.mode).toBe("EARLIEST_SAFE_COMPLETION");
    expect(recommended(r).totals.member_cost.high_cents).toBe(142600);
    const omitted = await call(carePlanRequest());
    expect(CarePlanResult.parse((omitted.body as { data: unknown }).data).mode).toBe("BALANCED");
    expect(carePlanOptimizer().optimize(registry(), carePlanRequest(withMode("EARLIEST_SAFE_COMPLETION"))).mode).toBe("EARLIEST_SAFE_COMPLETION");
  });
});
