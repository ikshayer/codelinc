/**
 * AT-16: The explanation matches the decision trace down to the cent, and the
 * validator rejects every spec §9 violation. PLANNER-OWNED, FROZEN.
 */
import { describe, expect, it } from "vitest";
import { Explanation, ExplanationInput, formatUsd } from "@/domain";
import { buildExplanationInput, createAiAdapters, validateExplanation } from "@/ai";
import { benefits, byLabel, collectCents, fx, optimize, registry, visitNavigator, visitRequest } from "./helpers";

function carePlanInput(focus: "lowest_total_cost" | "earliest_safe_completion" = "lowest_total_cost") {
  const result = optimize();
  const alt = byLabel(result, focus);
  const input = ExplanationInput.parse(
    buildExplanationInput({
      registry: registry(),
      benefits,
      result: { kind: "care_plan", value: result },
      procedures: fx.procedures(),
      focusId: alt.alternative_id,
    }),
  );
  return { result, alt, input };
}

function dollarAmounts(text: string): number[] {
  return [...text.matchAll(/\$(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{2}))?(?!\d|,\d)/g)].map(
    (m) => Number(m[1]!.replace(/,/g, "")) * 100 + Number(m[2] ?? "0"),
  );
}

describe("AT-16 explanation grounding", () => {
  it("the deterministic template explanation passes validation and quotes engine numbers exactly", async () => {
    const { result, alt, input } = carePlanInput();
    const ai = createAiAdapters({ mode: "synthetic" });
    const expl = Explanation.parse(await ai.templateExplainer.explain(input));
    expect(validateExplanation(expl, input)).toEqual({ ok: true, violations: [] });
    expect(expl.summary).toContain(formatUsd(alt.totals.member_cost.high_cents)); // "$1,372"
    const allowed = collectCents(result);
    const text = [expl.summary, ...expl.claims.map((c) => c.text)].join("\n");
    for (const cents of dollarAmounts(text)) expect(allowed.has(cents), `$ amount ${cents}`).toBe(true);
    for (const c of expl.claims) expect(c.fact_ids.length).toBeGreaterThan(0);
    // The plan-limited crown payment is explained with its rule.
    expect(expl.claims.some((c) => c.fact_ids.includes("rule:annual_maximum.2026"))).toBe(true);
  });

  it("visit navigator explanations also validate", async () => {
    const result = visitNavigator().navigate(registry(), visitRequest());
    const input = buildExplanationInput({
      registry: registry(),
      benefits,
      result: { kind: "visit_navigator", value: result },
      procedures: [],
      focusId: null,
    });
    const ai = createAiAdapters({ mode: "synthetic" });
    const expl = await ai.templateExplainer.explain(input);
    expect(validateExplanation(expl, input).ok).toBe(true);
  });

  const cases: [string, (e: Explanation) => Explanation, string][] = [
    [
      "a dollar amount absent from engine output",
      (e) => ({ ...e, summary: e.summary.replace("$1,372", "$1,372.01") }),
      "DOLLAR_AMOUNT_NOT_IN_RESULT",
    ],
    [
      "an unknown fact id",
      (e) => ({ ...e, claims: [...e.claims, { text: "The plan pays 50% for major services.", fact_ids: ["rule:plan_share.in_network.major.2025"] }] }),
      "UNKNOWN_FACT_ID",
    ],
    [
      "a plan claim citing an unverified rule",
      // (1.5) rollover.2026 is now VERIFIED; claim_submission.2027 is UNKNOWN.
      (e) => ({ ...e, claims: [...e.claims, { text: "You may pay the office directly.", fact_ids: ["rule:claim_submission.2027"] }] }),
      "UNVERIFIED_RULE_CITED",
    ],
    [
      "a changed dentist urgency",
      (e) => ({ ...e, claims: [...e.claims, { text: "Your dentist said the root canal is Can plan later.", fact_ids: ["proc:proc-rc-30.urgency"] }] }),
      "URGENCY_CHANGED",
    ],
    [
      "a date that is not in the result",
      (e) => ({ ...e, claims: [...e.claims, { text: "Schedule the crown on Jul 4, 2026.", fact_ids: ["proc:proc-crown-30.target_date"] }] }),
      "DATE_NOT_IN_RESULT",
    ],
    [
      "a forbidden phrase",
      (e) => ({ ...e, summary: `AI determined this. ${e.summary}` }),
      "FORBIDDEN_PHRASE",
    ],
  ];

  for (const [name, mutate, code] of cases) {
    it(`rejects ${name} (${code})`, async () => {
      const { input } = carePlanInput();
      const ai = createAiAdapters({ mode: "synthetic" });
      const good = await ai.templateExplainer.explain(input);
      const v = validateExplanation(mutate(structuredClone(good)), input);
      expect(v.ok).toBe(false);
      expect(v.violations.map((x) => x.code)).toContain(code);
    });
  }

  it("rejects a claim without fact ids (schema)", async () => {
    const { input } = carePlanInput();
    const ai = createAiAdapters({ mode: "synthetic" });
    const good = await ai.templateExplainer.explain(input);
    const bad = { ...good, claims: [{ text: "The plan pays 80%.", fact_ids: [] }] };
    const v = validateExplanation(bad, input);
    expect(v.ok).toBe(false);
    expect(v.violations.map((x) => x.code)).toEqual(expect.arrayContaining(["SCHEMA_INVALID"]));
  });

  it("rejects the wrong plan version for the explained alternative", async () => {
    const { input } = carePlanInput("earliest_safe_completion"); // every event is in 2026
    const ai = createAiAdapters({ mode: "synthetic" });
    const good = await ai.templateExplainer.explain(input);
    const bad = { ...good, claims: [...good.claims, { text: "Your deductible is $75.", fact_ids: ["rule:deductible.2027"] }] };
    const v = validateExplanation(bad, input);
    expect(v.violations.map((x) => x.code)).toContain("WRONG_PLAN_VERSION");
  });

  it("rejects an explanation that drops explicitly missing data", async () => {
    const { input } = carePlanInput();
    const withMissing = { ...input, missing_fields: ["Office has not confirmed the crown fee in writing"] };
    const ai = createAiAdapters({ mode: "synthetic" });
    const good = await ai.templateExplainer.explain(withMissing);
    expect(good.missing_data).toContain("Office has not confirmed the crown fee in writing");
    const v = validateExplanation({ ...good, missing_data: [] }, withMissing);
    expect(v.violations.map((x) => x.code)).toContain("MISSING_DATA_OMITTED");
  });
});
