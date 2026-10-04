import { describe, expect, it } from "vitest";
import { buildExplanationInput, createAiAdapters, validateExplanation } from "@/ai";
import { benefits, fx, optimize, registry } from "../acceptance/helpers";

const input = () =>
  buildExplanationInput({ registry: registry(), benefits, result: { kind: "care_plan", value: optimize() }, procedures: fx.procedures(), focusId: null });

describe("validateExplanation", () => {
  it("reads $1372 as $1,372 and accepts it; rejects an unknown calc step and an ISO date not in the result", async () => {
    const inp = input();
    const good = await createAiAdapters({ mode: "synthetic" }).templateExplainer.explain(inp);
    expect(validateExplanation({ ...good, summary: "Estimated member cost is $1372." }, inp).ok).toBe(true);
    const bad = {
      ...good,
      claims: [...good.claims, { text: "Done by 2026-07-04.", fact_ids: ["calc:alt-9-e1.plan_pay"] }],
    };
    expect(validateExplanation(bad, inp).violations.map((v) => v.code).sort()).toEqual(["DATE_NOT_IN_RESULT", "UNKNOWN_FACT_ID"]);
  });

  it("reports schema failures instead of throwing", () => {
    expect(validateExplanation({ summary: 1 }, input()).violations.every((v) => v.code === "SCHEMA_INVALID")).toBe(true);
  });

  it("live mode falls back to synthetic with AI_UNAVAILABLE", async () => {
    const r = await createAiAdapters({ mode: "live" }).extractor.extract({
      as_of: "2026-10-15T21:00:00Z",
      document_id: "doc-x",
      kind: "manual",
      text: "nothing here",
      image: null,
      consent: { recording_consent: false, retain_audio: false },
    });
    expect(r.mode).toBe("synthetic");
    expect(r.warnings.map((w) => w.code)).toEqual(["AI_UNAVAILABLE"]);
  });
});
