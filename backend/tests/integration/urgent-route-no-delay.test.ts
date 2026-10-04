/**
 * DEFECT (P1, dental-optimizer): with a red-flag symptom the navigator still offers a later,
 * cheaper option labeled lowest_cost (Rivera Oct 15, $108 less, 7 days later). Spec §5 / CONTRACT
 * §4.1: "Do not recommend delay to save benefits" / "no option may suggest delay".
 * P2: red flag + plan not resolvable → status NEEDS_CONFIRMATION with zero options instead of the
 * urgent route (CONTRACT §4.8 urgent → URGENT_CARE_ROUTE).
 */
import { describe, expect, it } from "vitest";
import { registry, visitNavigator, visitRequest } from "../acceptance/helpers";

describe("red-flag symptoms never surface a delay-for-savings option", () => {
  it("no urgent option is later than the soonest one", () => {
    const r = visitNavigator().navigate(registry(), visitRequest((q) => void (q.visit.symptoms.swelling = true)));
    expect(r.status).toBe("URGENT_CARE_ROUTE");
    const soonest = Math.min(...r.options.map((o) => o.days_until));
    const later = r.options.filter((o) => o.days_until > soonest).map((o) => `${o.provider_id}:${o.labels.join("+")}`);
    expect(later).toEqual([]);
  });

  it("urgent status survives an unresolvable plan", () => {
    const r = visitNavigator().navigate(
      registry(),
      visitRequest((q) => {
        q.visit.symptoms.swelling = true;
        q.member.plan_key.group_id = "unknown-group";
      }),
    );
    expect(r.safety.urgent).toBe(true);
    expect(r.status).toBe("URGENT_CARE_ROUTE");
  });
});
