/**
 * DEFECT (P1, dental-benefits): a fresh (no-snapshot) period whose deductible/annual-maximum
 * rule is not VERIFIED yields NEEDS_CONFIRMATION lines with NO issue anywhere, so the care plan
 * silently drops every option in that year and reports OK without saying what to confirm.
 * src/benefits/simulate.ts openPeriod (fresh branch, ~L122-124) never records the rule issue.
 */
import { describe, expect, it } from "vitest";
import { benefits, fx, mutateRule, optimize, PV2027, registry } from "../acceptance/helpers";

const event = {
  event_id: "a",
  procedure_id: "p-a",
  cdt_code: "D2392",
  tooth: "14",
  service_date: "2027-01-05",
  claim_date: null,
  provider_id: "prov-rivera",
  claim_route: "IN_NETWORK_CLAIM" as const,
};

describe.each([
  ["deductible.2027 UNVERIFIED", "deductible.2027", (r: object) => ({ ...r, status: "UNVERIFIED" })],
  ["annual_maximum.2027 removed", "annual_maximum.2027", () => null],
])("%s", (_name, ruleId, fn) => {
  const reg = mutateRule(registry(), PV2027, ruleId, fn as never);

  it("simulate names the blocking rule problem", () => {
    const r = benefits.simulate(reg, { as_of: "2026-10-15T14:00:00Z", scenario: "worst_case", member: fx.member(), providers: fx.providersPost(), events: [event] });
    expect(r.status).toBe("NEEDS_CONFIRMATION");
    const blocking = [...r.issues, ...r.lines.flatMap((l) => l.issues)].filter((i) => i.severity === "blocking");
    expect(blocking.length).toBeGreaterThan(0);
  });

  it("care plan tells the member why 2027 options were not evaluated", () => {
    const r = optimize(undefined, reg);
    expect(r.unresolved.some((i) => i.code.startsWith("RULE_") && i.rule_id !== "rollover.2026")).toBe(true);
  });
});
