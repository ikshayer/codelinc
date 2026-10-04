/**
 * DEFECT (P2, dental-uxapi, src/ai/explain.ts:192-201): validateExplanation only recognizes
 * "$1,234(.56)" and "Mmm D, YYYY"/ISO dates, so a (future live) explainer can state fabricated
 * amounts and dates in other common formats, and forbidden phrases slip through with spacing tricks.
 */
import { describe, expect, it } from "vitest";
import { buildExplanationInput, validateExplanation } from "@/ai";
import { benefits, fx, optimize, registry } from "../acceptance/helpers";

const result = optimize();
const input = buildExplanationInput({ registry: registry(), benefits, result: { kind: "care_plan", value: result }, procedures: fx.procedures(), focusId: null });
const line = result.alternatives[0]!.events[0]!.line_worst;
const check = (summary: string) =>
  validateExplanation({ summary, claims: [{ text: "ok", fact_ids: [`calc:${line.line_id}.plan_pay`] }], missing_data: [...input.missing_fields] }, input);

describe("explanation validator rejects fabricated values in any common format", () => {
  it.each([
    "You pay 1,999 dollars.",
    "You pay $ 1,999.",
    "You pay USD 1999.",
    "You pay ＄1999.",
    "You pay $1,99.",
    "You pay $1,372.999.",
    "You pay $1,372 and 50 cents.",
  ])("amount: %s", (s) => expect(check(s).violations.map((v) => v.code)).toContain("DOLLAR_AMOUNT_NOT_IN_RESULT"));

  it.each(["Done by November 6, 2026.", "Done by Nov 6 2026.", "Done by 11/06/2026.", "Done by Nov. 6, 2026."])("date: %s", (s) =>
    expect(check(s).violations.map((v) => v.code)).toContain("DATE_NOT_IN_RESULT"),
  );

  it.each(["This is guar​anteed.", "Your benefits  expire soon."])("forbidden phrase: %s", (s) =>
    expect(check(s).violations.map((v) => v.code)).toContain("FORBIDDEN_PHRASE"),
  );
});
