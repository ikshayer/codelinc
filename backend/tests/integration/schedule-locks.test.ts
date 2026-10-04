import { describe, expect, it } from "vitest";
import { carePlanOptimizer, carePlanRequest, registry } from "../acceptance/helpers";

describe("member schedule locks", () => {
  it("preserves a selected provider, appointment and claim route across re-optimization", () => {
    const optimizer = carePlanOptimizer();
    const initial = optimizer.optimize(registry(), carePlanRequest());
    const selected = initial.alternatives
      .flatMap((alternative) => alternative.events)
      .find((event) => event.procedure_id === "proc-fill-14" && event.claim_route === "SELF_PAY_NO_CLAIM")!;

    const recalculated = optimizer.optimize(
      registry(),
      carePlanRequest((request) => {
        request.member.budget.hard_monthly_limit_cents = 4_000;
        request.member.budget.preferred_monthly_limit_cents = 4_000;
        request.schedule_locks = [
          {
            procedure_id: selected.procedure_id,
            provider_id: selected.provider_id,
            slot_id: selected.slot_id,
            claim_route: selected.claim_route,
          },
        ];
      }),
    );

    expect(recalculated.alternatives.length).toBeGreaterThan(0);
    for (const alternative of recalculated.alternatives) {
      const event = alternative.events.find((value) => value.procedure_id === selected.procedure_id);
      expect(event).toMatchObject({
        provider_id: selected.provider_id,
        slot_id: selected.slot_id,
        claim_route: selected.claim_route,
        user_locked: true,
      });
    }
  });

  it("rejects duplicate or unknown locks before optimization", () => {
    const request = carePlanRequest();
    request.schedule_locks = [
      { procedure_id: "proc-fill-14", provider_id: "prov-rivera", slot_id: "missing-slot", claim_route: "IN_NETWORK_CLAIM" },
      { procedure_id: "proc-fill-14", provider_id: "prov-rivera", slot_id: "missing-slot", claim_route: "IN_NETWORK_CLAIM" },
    ];

    const result = carePlanOptimizer().optimize(registry(), request);
    expect(result.status).toBe("INVALID_INPUT");
    expect(result.unresolved).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "SCHEMA_INVALID", field: "schedule_locks", procedure_id: "proc-fill-14" }),
      ]),
    );
  });

  it("rejects locks that assign one appointment to multiple procedures", () => {
    const request = carePlanRequest();
    request.schedule_locks = [
      { procedure_id: "proc-rc-30", provider_id: "prov-rivera", slot_id: "prov-rivera-t-20261020-0800", claim_route: "IN_NETWORK_CLAIM" },
      { procedure_id: "proc-fill-14", provider_id: "prov-rivera", slot_id: "prov-rivera-t-20261020-0800", claim_route: "IN_NETWORK_CLAIM" },
    ];

    const result = carePlanOptimizer().optimize(registry(), request);
    expect(result.status).toBe("INVALID_INPUT");
    expect(result.unresolved).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "SCHEMA_INVALID", field: "schedule_locks", procedure_id: "proc-fill-14" }),
      ]),
    );
  });
});
