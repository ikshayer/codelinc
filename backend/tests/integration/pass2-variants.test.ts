/**
 * Pass 2 probes: variants of the pass-1 defects that the pass-1 tests did not cover.
 * Each block asserts the contract behaviour; a failure here is a pass-2 finding in REVIEW.md.
 */
import { describe, expect, it } from "vitest";
import { buildExplanationInput, validateExplanation } from "@/ai";
import { benefits, fx, mutateRule, optimize, PV2027, registry, visitNavigator, visitRequest } from "../acceptance/helpers";

const event2027 = {
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
  ["annual_maximum.2027 UNVERIFIED", "annual_maximum.2027", (r: object) => ({ ...r, status: "UNVERIFIED" })],
  ["annual_maximum.2027 CONFLICT", "annual_maximum.2027", (r: object) => ({ ...r, status: "CONFLICT" })],
  ["deductible.2027 removed", "deductible.2027", () => null],
  ["plan_share.in_network.basic.2027 UNVERIFIED", "plan_share.in_network.basic.2027", (r: object) => ({ ...r, status: "UNVERIFIED" })],
])("fresh period: %s", (_n, ruleId, fn) => {
  const reg = mutateRule(registry(), PV2027, ruleId, fn as never);
  it("simulate blocks and names the rule", () => {
    const r = benefits.simulate(reg, { as_of: "2026-10-15T14:00:00Z", scenario: "worst_case", member: fx.member(), providers: fx.providersPost(), events: [event2027] });
    expect(r.status).toBe("NEEDS_CONFIRMATION");
    const blocking = [...r.issues, ...r.lines.flatMap((l) => l.issues)].filter((i) => i.severity === "blocking");
    expect(blocking.some((i) => i.rule_id?.startsWith(ruleId.split(".2027")[0]!))).toBe(true);
  });
  it("care plan surfaces it in unresolved", () => {
    const r = optimize(undefined, reg);
    expect(r.unresolved.some((i) => i.code.startsWith("RULE_") && i.rule_id !== "rollover.2026")).toBe(true);
  });
});

describe("red flags with only out-of-network providers", () => {
  const r = visitNavigator().navigate(
    registry(),
    visitRequest((q) => {
      q.visit.symptoms.severe_pain = true;
      q.providers = q.providers.filter((p) => p.network.tier === "out_of_network");
    }),
  );
  it("stays on the urgent route with no later option", () => {
    expect(r.status).toBe("URGENT_CARE_ROUTE");
    expect(r.options.length).toBeGreaterThan(0);
    const soonest = Math.min(...r.options.map((o) => o.days_until));
    expect(r.options.filter((o) => o.days_until > soonest)).toEqual([]);
  });
});

describe("validator: further money/date formats", () => {
  const result = optimize();
  const input = buildExplanationInput({ registry: registry(), benefits, result: { kind: "care_plan", value: result }, procedures: fx.procedures(), focusId: null });
  const line = result.alternatives[0]!.events[0]!.line_worst;
  const codes = (summary: string) =>
    validateExplanation({ summary, claims: [{ text: "ok", fact_ids: [`calc:${line.line_id}.plan_pay`] }], missing_data: [...input.missing_fields] }, input).violations.map((v) => v.code);

  // Reasonable, symbol-anchored formats a model could plausibly emit.
  it.each(["You pay 1999$.", "You pay 1.999,00 $.", "You pay $1.9k.", "You pay US$1999."])("amount %s", (s) =>
    expect(codes(s)).toContain("DOLLAR_AMOUNT_NOT_IN_RESULT"),
  );
  it.each(["Done by 6 November 2026.", "Done by 11/6/26.", "Done by 2026/11/06."])("date %s", (s) => expect(codes(s)).toContain("DATE_NOT_IN_RESULT"));
  // Spelled-out numbers ("one thousand dollars") are NLP territory — documented, not asserted.
});
