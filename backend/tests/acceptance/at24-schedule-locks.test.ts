import { describe, expect, it } from "vitest";
import { CarePlanResult, type CarePlanRequest, type ScheduleLock, type ScheduledEvent } from "@/domain";
import { createApiHandlers } from "@/api";
import { carePlanOptimizer, carePlanRequest, fx, optimize, registry } from "./helpers";

const lockOf = ({ procedure_id, provider_id, slot_id, claim_route }: ScheduledEvent): ScheduleLock => ({ procedure_id, provider_id, slot_id, claim_route });
const baseline = optimize();
const alternate = baseline.alternatives[1]!;
const fill = alternate.events.find((event) => event.procedure_id === "proc-fill-14")!;
const lock = lockOf(fill);

describe("AT-24 exact appointment locks", () => {
  it("pins a returned alternative appointment in every schedule, without mutating inputs", () => {
    const request = carePlanRequest((body) => { body.schedule_locks = [lock]; });
    const before = structuredClone(request);
    const result = CarePlanResult.parse(carePlanOptimizer().optimize(registry(), request));
    expect(result.alternatives.length).toBeGreaterThan(0);
    for (const alt of result.alternatives) {
      expect(alt.events.find((event) => event.procedure_id === lock.procedure_id)).toMatchObject({ ...lock, service_date: fill.service_date, user_locked: true });
      expect(alt.events.filter((event) => event.user_locked)).toHaveLength(1);
      expect(alt.unscheduled.some((item) => item.procedure_id === lock.procedure_id)).toBe(false);
    }
    expect(request).toEqual(before);
    expect(result).toEqual(optimize((body) => { body.schedule_locks = [lock]; }));
  });

  it("retains the full appointment including route when reranking", () => {
    const result = optimize((body) => { body.schedule_locks = [lock]; body.preferences = { mode: "SMOOTHEST_PAYMENTS" }; });
    expect(result.alternatives.length).toBeGreaterThan(0);
    for (const alt of result.alternatives) expect(alt.events.find((event) => event.procedure_id === lock.procedure_id)).toMatchObject({ ...lock, user_locked: true });
  });

  it("removing all locks reproduces the original recommendation and all engine values", () => {
    expect(optimize((body) => { body.schedule_locks = []; })).toEqual(baseline);
    expect(baseline.alternatives.flatMap((alt) => alt.events).every((event) => !event.user_locked)).toBe(true);
    const pinned = optimize((body) => { body.schedule_locks = [lock]; });
    expect(pinned.alternatives[0]!.schedule_key).not.toBe(baseline.alternatives[0]!.schedule_key);
  });

  it.each([
    ["duplicate procedure", [lock, lock]],
    ["unknown procedure", [{ ...lock, procedure_id: "unknown" }]],
    ["unknown provider", [{ ...lock, provider_id: "unknown" }]],
    ["unknown slot", [{ ...lock, slot_id: "unknown" }]],
  ])("rejects %s instead of returning an unlocked plan", (_name, locks) => {
    const result = optimize((body) => { body.schedule_locks = locks as ScheduleLock[]; });
    expect(result.status).toBe("INVALID_INPUT");
    expect(result.alternatives).toEqual([]);
    expect(result.unresolved.some((issue) => issue.code === "SCHEMA_INVALID" && issue.field?.startsWith("schedule_locks"))).toBe(true);
  });

  it.each([
    ["availability", (body: CarePlanRequest) => { body.member.availability.weekly = []; }],
    ["travel", (body: CarePlanRequest) => { body.member.travel.hard_max_miles = 0; }],
    ["safe window", (body: CarePlanRequest) => { body.procedures.find((p) => p.procedure_id === lock.procedure_id)!.earliest_safe_date = "2026-10-23"; }],
    ["invalid route", (body: CarePlanRequest) => { body.schedule_locks = [{ ...lock, claim_route: "OUT_OF_NETWORK_CLAIM" }]; }],
  ])("does not ignore a pin outside %s", (_name, change) => {
    const result = optimize((body) => { body.schedule_locks = [lock]; change(body); });
    expect(result.status).toBe("NO_FEASIBLE_SCHEDULE");
    expect(result.alternatives).toEqual([]);
    expect(result.unresolved.some((issue) => issue.procedure_id === lock.procedure_id && issue.field === "schedule_locks")).toBe(true);
  });

  it("rejects two pins occupying one chair slot before optimization", () => {
    const result = optimize((body) => {
      const root = body.procedures.find((p) => p.procedure_id === "proc-rc-30")!;
      root.latest_safe_date = "2026-11-05";
      const crown = baseline.alternatives[0]!.events.find((event) => event.procedure_id === "proc-crown-30")!;
      body.schedule_locks = [lockOf(crown), { ...lockOf(crown), procedure_id: root.procedure_id }];
    });
    expect(result.status).toBe("INVALID_INPUT");
    expect(result.alternatives).toEqual([]);
    expect(result.unresolved).toContainEqual(expect.objectContaining({ code: "SCHEMA_INVALID", field: "schedule_locks", procedure_id: "proc-rc-30" }));
  });

  it("can pin every appointment in a returned plan", () => {
    const locks = alternate.events.map(lockOf);
    const result = optimize((body) => { body.schedule_locks = locks; });
    expect(result.alternatives).toHaveLength(1);
    expect(result.alternatives[0]!.events.every((event) => event.user_locked)).toBe(true);
    expect(result.alternatives[0]!.schedule_key).toBe(alternate.schedule_key);
    expect(result.alternatives[0]!.totals).toEqual(alternate.totals);
  });

  it("explains rejection when a pinned cash route is no longer cheaper", () => {
    const result = optimize((body) => {
      body.schedule_locks = [lock];
      body.providers.find((provider) => provider.provider_id === lock.provider_id)!.pricing.find((price) => price.cdt_code === "D2392")!.cash_quote!.value = { kind: "exact", cents: 200000 };
    });
    expect(result.status).toBe("NO_FEASIBLE_SCHEDULE");
    expect(result.alternatives).toEqual([]);
    expect(result.unresolved).toContainEqual(expect.objectContaining({ code: "CLAIM_ROUTE_INVALID", procedure_id: lock.procedure_id, provider_id: lock.provider_id, field: "schedule_locks" }));
    expect(result.unresolved[0]!.message).toContain("Unpin");
  });

  it("requires confirmed clinical fields before testing pin feasibility", () => {
    const result = optimize((body) => {
      body.schedule_locks = [lock];
      body.procedures.find((procedure) => procedure.procedure_id === lock.procedure_id)!.earliest_safe_date = null;
    });
    expect(result.status).toBe("NEEDS_CONFIRMATION");
    expect(result.alternatives).toEqual([]);
    expect(result.unresolved.some((issue) => issue.code === "PROCEDURE_UNCONFIRMED")).toBe(true);
  });

  it("retains a late pin when the remaining search is bounded", () => {
    const request = carePlanRequest();
    const template = fx.procedures().find((p) => p.procedure_id === "proc-rc-30")!;
    request.procedures = Array.from({ length: 8 }, (_, index) => ({ ...structuredClone(template), procedure_id: `bounded-${index}`, earliest_safe_date: "2026-10-16", target_date: "2026-11-05", latest_safe_date: "2026-11-05", dependencies: [] }));
    const provider = request.providers[0]!;
    provider.slots.items = Array.from({ length: 10 }, (_, index) => ({ slot_id: `pin-slot-${index}`, date: "2026-10-20", start_time: "10:00", end_time: "11:00", kind: "treatment" as const }));
    request.providers = [provider];
    request.schedule_locks = [{ procedure_id: "bounded-0", provider_id: provider.provider_id, slot_id: "pin-slot-9", claim_route: "IN_NETWORK_CLAIM" }];
    const result = CarePlanResult.parse(carePlanOptimizer().optimize(registry(), request));
    expect(result.solver_meta.status).toBe("BOUNDED_BEST_FOUND");
    expect(result.alternatives.length).toBeGreaterThan(0);
    for (const alt of result.alternatives) expect(alt.events.find((event) => event.procedure_id === "bounded-0")).toMatchObject({ ...request.schedule_locks[0], user_locked: true });
  });
});

describe("AT-24 strict API boundary", () => {
  const api = createApiHandlers();
  const call = (body: unknown) => api.care_plan({ method: "POST", headers: { "content-type": "application/json" }, body });
  it("rejects date/price overrides in an exact tuple", async () => {
    const response = await call({ ...carePlanRequest(), schedule_locks: [{ ...lock, service_date: fill.service_date, member_cost_cents: 0 }] });
    expect(response.status).toBe(400);
  });
  it("carries locks through the API to engine state", async () => {
    const response = await call({ ...carePlanRequest(), schedule_locks: [lock] });
    expect(response.status).toBe(200);
    const result = CarePlanResult.parse((response.body as { data: unknown }).data);
    expect(result.alternatives[0]!.events.find((event) => event.procedure_id === lock.procedure_id)).toMatchObject({ ...lock, user_locked: true });
  });
});
