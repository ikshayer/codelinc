/**
 * AT-07 No procedure is delayed beyond the dentist-confirmed deadline to save money.
 * AT-08 Dependencies and healing intervals are respected.
 * AT-09 Provider and member availability must intersect.
 * PLANNER-OWNED, FROZEN.
 */
import { describe, expect, it } from "vitest";
import { CarePlanResult, compareDates, diffDays, isWithin, minutesOf, ProcedureRecommendation, weekdayOf } from "@/domain";
import type { CarePlanRequest, MemberState, ProviderOption } from "@/domain";
import {
  carePlanRequest,
  golden,
  optimize,
  P1,
  P2,
  procedure,
  provider,
  registry,
  visitNavigator,
  visitRequest,
} from "./helpers";

const VARIANTS: Record<string, (r: CarePlanRequest) => void> = {
  base: () => {},
  budget_hard_limit_4000: (r) => {
    r.member.budget.hard_monthly_limit_cents = 4000;
  },
  no_tuesday_availability: (r) => {
    r.member.availability.weekly = r.member.availability.weekly.filter((w) => w.weekday !== 2);
  },
  office_self_pay_unknown: (r) => {
    provider(r.providers, P1).self_pay.permitted_by_office = null;
  },
  no_pending_claims: (r) => {
    r.member.pending_claims = [];
  },
  filling_this_year_only: (r) => {
    const f = procedure(r.procedures, "proc-fill-14");
    f.target_date = "2026-12-31";
    f.latest_safe_date = "2026-12-31";
  },
};

function memberAvailable(member: MemberState, date: string, start: string, end: string): boolean {
  if (member.availability.unavailable.some((u) => isWithin(date, u.start, u.end))) return false;
  const wd = weekdayOf(date);
  return member.availability.weekly.some(
    (w) => w.weekday === wd && minutesOf(w.start_time) <= minutesOf(start) && minutesOf(end) <= minutesOf(w.end_time),
  );
}

function checkSchedule(result: CarePlanResult, req: CarePlanRequest) {
  const procs = new Map<string, ProcedureRecommendation>(req.procedures.map((p) => [p.procedure_id, p]));
  for (const alt of result.alternatives) {
    const dateOf = new Map(alt.events.map((e) => [e.procedure_id, e.service_date]));
    for (const ev of alt.events) {
      const p = procs.get(ev.procedure_id)!;
      // AT-07: inside the dentist-confirmed window — never later to save money.
      expect(compareDates(ev.service_date, p.earliest_safe_date!), `${ev.procedure_id} not before earliest`).toBeGreaterThanOrEqual(0);
      expect(compareDates(ev.service_date, p.latest_safe_date!), `${ev.procedure_id} not after latest`).toBeLessThanOrEqual(0);
      expect(ev.reasons).toContain("WITHIN_SAFE_WINDOW");
      // AT-08: dependencies and healing intervals.
      for (const dep of p.dependencies) {
        const before = dateOf.get(dep.depends_on);
        expect(before, `${ev.procedure_id} predecessor ${dep.depends_on} scheduled`).toBeDefined();
        const gap = diffDays(before!, ev.service_date);
        expect(gap).toBeGreaterThanOrEqual(dep.min_gap_days);
        if (dep.max_gap_days !== null) expect(gap).toBeLessThanOrEqual(dep.max_gap_days);
      }
      // AT-09: the slot exists, belongs to the provider, and intersects member availability.
      const prov: ProviderOption = provider(req.providers, ev.provider_id);
      const slot = prov.slots.items.find((s) => s.slot_id === ev.slot_id);
      expect(slot, `${ev.slot_id} exists at ${ev.provider_id}`).toBeDefined();
      expect(slot!.date).toBe(ev.service_date);
      expect(slot!.kind).toBe("treatment");
      expect(memberAvailable(req.member, slot!.date, slot!.start_time, slot!.end_time), ev.slot_id).toBe(true);
      expect(p.allowed_specialties).toContain(prov.specialty);
      expect(prov.travel.distance_miles).toBeLessThanOrEqual(req.member.travel.hard_max_miles);
    }
    // One procedure per slot.
    const slots = alt.events.map((e) => `${e.provider_id}/${e.slot_id}`);
    expect(new Set(slots).size).toBe(slots.length);
  }
}

describe("AT-07/08/09 clinical and availability constraints", () => {
  for (const [name, mutate] of Object.entries(VARIANTS)) {
    it(`hold in every alternative: ${name}`, () => {
      const req = carePlanRequest(mutate);
      const result = optimize(mutate);
      expect(result.alternatives.length).toBeGreaterThan(0);
      checkSchedule(result, req);
      for (const alt of result.alternatives) {
        expect(alt.events.map((e) => e.procedure_id).sort()).toEqual(["proc-crown-30", "proc-fill-14", "proc-rc-30"]);
      }
    });
  }

  it("AT-07: a hard budget gap never pushes urgent care past its deadline", () => {
    const g = golden.postvisit.variants.budget_hard_limit_4000;
    const result = optimize(VARIANTS.budget_hard_limit_4000);
    expect(result.status).toBe(g.status);
    expect(result.search_stats.pass).toBe(g.pass);
    const first = result.alternatives[0]!;
    expect(first.funding_gap_cents).toBe(g.first_alternative.funding_gap_cents);
    for (const [pid, date] of Object.entries(g.first_alternative.event_dates)) {
      expect(first.events.find((e) => e.procedure_id === pid)!.service_date, pid).toBe(date);
    }
    expect(result.unresolved.some((i) => i.code === "BUDGET_SHORTFALL")).toBe(true);
  });

  it("AT-07: when no slot fits the dentist window, the procedure stays unscheduled (never moved later)", () => {
    const mutate = (r: CarePlanRequest) => {
      for (const p of r.providers) {
        p.slots.items = p.slots.items.filter((s) => s.date > "2026-10-30");
      }
    };
    const result = optimize(mutate);
    expect(result.status).toBe("NO_FEASIBLE_SCHEDULE");
    // The safest partial schedule is still returned (the flexible filling can be planned).
    expect(result.alternatives.length).toBeGreaterThan(0);
    expect(result.alternatives[0]!.events.map((e) => e.procedure_id)).toEqual(["proc-fill-14"]);
    expect(result.unresolved.some((i) => i.code === "NO_SLOT_IN_WINDOW" && i.procedure_id === "proc-rc-30")).toBe(true);
    for (const alt of result.alternatives) {
      expect(alt.events.some((e) => e.procedure_id === "proc-rc-30")).toBe(false);
      expect(alt.events.some((e) => e.procedure_id === "proc-crown-30")).toBe(false);
      expect(alt.unscheduled.some((u) => u.procedure_id === "proc-rc-30" && u.reason === "NO_SLOT_IN_WINDOW")).toBe(true);
      expect(alt.unscheduled.some((u) => u.procedure_id === "proc-crown-30")).toBe(true);
      expect(alt.objective.unscheduled_by_urgency[0]).toBe(1);
    }
  });

  it("AT-08: the crown never uses the Oct 29 slot (only 9 days after the root canal)", () => {
    // Open the crown's window so only the 14-day healing gap can exclude Oct 29.
    const result = optimize((r) => {
      procedure(r.procedures, "proc-crown-30").earliest_safe_date = "2026-10-16";
    });
    for (const alt of result.alternatives) {
      const crown = alt.events.find((e) => e.procedure_id === "proc-crown-30")!;
      expect(crown.slot_id).not.toBe("prov-rivera-t-20261029-1000");
    }
  });

  it("AT-08: a dependency on an unknown procedure or a cycle is INVALID_INPUT", () => {
    const unknown = optimize((r) => {
      procedure(r.procedures, "proc-crown-30").dependencies = [{ depends_on: "proc-missing", min_gap_days: 1, max_gap_days: null }];
    });
    expect(unknown.status).toBe("INVALID_INPUT");
    expect(unknown.unresolved.some((i) => i.code === "DEPENDENCY_INVALID")).toBe(true);
    const cycle = optimize((r) => {
      procedure(r.procedures, "proc-rc-30").dependencies = [{ depends_on: "proc-crown-30", min_gap_days: 1, max_gap_days: null }];
    });
    expect(cycle.status).toBe("INVALID_INPUT");
    expect(cycle.unresolved.some((i) => i.code === "DEPENDENCY_INVALID")).toBe(true);
  });

  it("AT-09: slot time-of-day matters (the 18:30 slot is outside member hours)", () => {
    const result = optimize();
    for (const alt of result.alternatives) {
      for (const e of alt.events) expect(e.slot_id).not.toBe("prov-rivera-t-20261020-1830");
    }
    const rc = result.alternatives[0]!.events.find((e) => e.procedure_id === "proc-rc-30")!;
    expect(rc.slot_id).toBe("prov-rivera-t-20261020-0800");
  });

  it("AT-09: re-optimizing after an availability change follows the new availability", () => {
    const g = golden.postvisit.variants.no_tuesday_availability;
    const result = optimize(VARIANTS.no_tuesday_availability);
    expect(result.status).toBe(g.status);
    const first = result.alternatives[0]!;
    for (const [pid, slotId] of Object.entries(g.first_alternative.slot_ids)) {
      expect(first.events.find((e) => e.procedure_id === pid)!.slot_id, pid).toBe(slotId);
    }
    expect(first.totals.member_cost.high_cents).toBe(g.first_alternative.member_cost_cents);
    expect(first.objective.lateness_days_by_urgency).toEqual(g.first_alternative.lateness_days_by_urgency);
  });

  it("AT-09: the visit navigator never offers a slot outside member availability or travel limit", () => {
    const result = visitNavigator().navigate(registry(), visitRequest());
    const req = visitRequest();
    const ids = result.options.map((o) => o.slot.slot_id);
    expect(ids).not.toContain("prov-rivera-e-20261012-1000"); // Monday
    expect(ids).not.toContain("prov-brightsmile-e-20261006-1900"); // 19:00, outside hours
    expect(result.options.some((o) => o.provider_id === "prov-lakeside")).toBe(false); // 22 miles > 15
    for (const o of result.options) {
      expect(memberAvailable(req.member, o.slot.date, o.slot.start_time, o.slot.end_time)).toBe(true);
      expect(o.slot.kind).toBe("exam");
    }
    expect(result.excluded.find((x) => x.provider_id === "prov-lakeside")?.reasons).toContain("TRAVEL_LIMIT_EXCEEDED");
    void P2;
  });
});
