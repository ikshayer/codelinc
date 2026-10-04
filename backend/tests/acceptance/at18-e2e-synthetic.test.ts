/**
 * AT-18: The end-to-end demo works with synthetic data and no external APIs.
 * Drives the framework-agnostic API handlers through the full demo narrative (spec §15).
 * PLANNER-OWNED, FROZEN.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  BenefitPassport,
  CONTRACT_VERSION,
  CarePlanResult,
  ConfirmData,
  DemoScenario,
  ErrorEnvelope,
  ExplainOutcome,
  ExtractionResult,
  HealthData,
  ProcedureRecommendation,
  VisitNavigatorResult,
} from "@/domain";
import type { ApiHandlers, ApiResponseLike } from "@/domain/ports";
import { createApiHandlers } from "@/api";
import { documentText, fx, golden, scenario } from "./helpers";

const fetchSpy = vi.fn(() => {
  throw new Error("external network call attempted during synthetic demo");
});
let api: ApiHandlers;
const H = { "content-type": "application/json" };

function data<T>(res: ApiResponseLike, schema: { parse: (v: unknown) => T }): T {
  expect(res.status, JSON.stringify(res.body).slice(0, 500)).toBe(200);
  const body = res.body as { contract_version: string; ok: boolean; data: unknown; meta: { generated_by: string; synthetic_data: boolean } };
  expect(body.contract_version).toBe(CONTRACT_VERSION);
  expect(body.ok).toBe(true);
  expect(body.meta.generated_by).toBe("engine");
  expect(body.meta.synthetic_data).toBe(true);
  return schema.parse(body.data);
}

beforeAll(() => {
  vi.stubEnv("AI_MODE", "synthetic");
  vi.stubEnv("AI_ENABLED", "false");
  vi.stubGlobal("fetch", fetchSpy);
  api = createApiHandlers();
});
afterAll(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("AT-18 synthetic end-to-end demo, offline", () => {
  let extracted: ProcedureRecommendation[] = [];
  let confirmed: ProcedureRecommendation[] = [];

  it("1. health and scenario load from synthetic fixtures", async () => {
    const health = data(await api.health({ method: "GET", body: undefined, headers: {} }), HealthData);
    expect(health.ai_mode).toBe("synthetic");
    expect(health.plan_version_ids.sort()).toEqual(["nwd-ppo-enhanced-2026", "nwd-ppo-standard-2026", "nwd-ppo-standard-2027", "nwd-ppo-value-2026"]);
    const sc = data(await api.scenario({ method: "GET", body: undefined, headers: {} }), DemoScenario);
    expect(sc.member).toEqual(fx.member());
    expect(sc.providers_postvisit).toEqual(fx.providersPost());
    expect(sc.documents.map((d) => d.document_id).sort()).toEqual(scenario.documents.map((d) => d.document_id).sort());
  });

  it("2. Benefit Passport shows reset date, balances, pending reservation and FSA deadline", async () => {
    const p = data(
      await api.passport({ method: "POST", body: { as_of: scenario.previsit_as_of, member: fx.member() }, headers: H }),
      BenefitPassport,
    );
    expect(p.plan_version_id).toBe("nwd-ppo-standard-2026");
    expect(p.next_reset_date).toBe("2027-01-01");
    expect(p.current_period.annual_max_available_cents).toBe(82400);
    expect(p.current_period.pending_reserved_max_cents).toBe(7600);
    const items = p.sections.flatMap((s) => s.items);
    expect(items.some((i) => i.value_cents === 120000 && i.input_ids.includes("member.fsa-2026.balance"))).toBe(true);
    expect(items.some((i) => i.value_date === "2026-12-31" && i.input_ids.includes("member.fsa-2026.balance"))).toBe(true);
  });

  it("3. before the visit: sooner out-of-network vs later in-network, with concrete tradeoffs", async () => {
    const r = data(
      await api.visit_navigator({
        method: "POST",
        headers: H,
        body: {
          as_of: scenario.previsit_as_of,
          member: fx.member(),
          providers: fx.providersPre(),
          visit: {
            intent: "new_concern",
            expected_codes: scenario.visit_defaults.expected_codes_by_intent.new_concern,
            symptoms: { severe_pain: false, swelling: false, trauma: false, bleeding: false, fever: false },
          },
          known_procedures: [],
          max_options: 3,
        },
      }),
      VisitNavigatorResult,
    );
    expect(r.status).toBe("OK");
    expect(r.options.map((o) => [o.provider_id, o.labels, o.member_cost?.high_cents])).toEqual(
      golden.previsit.options.map((o) => [o.provider_id, o.labels, o.member_cost.high_cents]),
    );
  });

  it("4. after the visit: the card is extracted into UNVERIFIED procedure cards", async () => {
    const r = data(
      await api.intake_extract({
        method: "POST",
        headers: H,
        body: {
          as_of: scenario.postvisit_as_of,
          document_id: "doc-card-2026-10-15",
          kind: "card_photo",
          text: documentText("doc-card-2026-10-15"),
          image: null,
          consent: { recording_consent: false, retain_audio: false },
        },
      }),
      ExtractionResult,
    );
    expect(r.mode).toBe("synthetic");
    extracted = r.procedures;
    const key = (p: ProcedureRecommendation) => `${p.cdt_code}/${p.tooth}`;
    const expected = new Map(fx.procedures().map((p) => [key(p), p]));
    expect(extracted.map(key).sort()).toEqual([...expected.keys()].sort());
    const idMap = new Map(extracted.map((p) => [p.procedure_id, expected.get(key(p))!.procedure_id]));
    for (const p of extracted) {
      const e = expected.get(key(p))!;
      expect(p.confirmation.status).toBe("UNVERIFIED");
      expect(p.dentist_fee.value).toEqual(e.dentist_fee.value);
      expect([p.urgency, p.earliest_safe_date, p.target_date, p.latest_safe_date]).toEqual([
        e.urgency,
        e.earliest_safe_date,
        e.target_date,
        e.latest_safe_date,
      ]);
      expect(p.dependencies.map((d) => [idMap.get(d.depends_on), d.min_gap_days, d.max_gap_days])).toEqual(
        e.dependencies.map((d) => [d.depends_on, d.min_gap_days, d.max_gap_days]),
      );
    }
  });

  it("5. the member confirms the cards", async () => {
    const r = data(
      await api.intake_confirm({
        method: "POST",
        headers: H,
        body: { as_of: scenario.postvisit_as_of, confirmed_by: "member", procedures: extracted },
      }),
      ConfirmData,
    );
    confirmed = r.procedures;
    for (const p of confirmed) {
      expect(p.confirmation).toEqual({ status: "CONFIRMED", confirmed_by: "member", confirmed_at: scenario.postvisit_as_of });
    }
  });

  const carePlanBody = (procedures: ProcedureRecommendation[], mutateMember?: (m: ReturnType<typeof fx.member>) => void) => {
    const member = fx.member();
    mutateMember?.(member);
    return {
      as_of: scenario.postvisit_as_of,
      member,
      providers: fx.providersPost(),
      procedures,
      planning_horizon_end: scenario.planning_horizon_end,
      max_alternatives: 3,
    };
  };

  it("6. optimize: urgent root canal and crown in their windows, flexible filling after the reset", async () => {
    const r = data(await api.care_plan({ method: "POST", headers: H, body: carePlanBody(confirmed) }), CarePlanResult);
    const g = golden.postvisit.base;
    expect(r.status).toBe(g.status);
    expect(r.alternatives.map((a) => a.labels)).toEqual(g.alternatives.map((a) => a.labels));
    expect(r.alternatives.map((a) => a.totals.member_cost.high_cents)).toEqual(
      g.alternatives.map((a) => a.totals.member_cost_cents),
    );
    expect(r.alternatives[0]!.events.map((e) => e.service_date)).toEqual(g.alternatives[0]!.events.map((e) => e.service_date));
  });

  it("7. 'Why this plan?' explanation is grounded and offline", async () => {
    const r = data(
      await api.explain({
        method: "POST",
        headers: H,
        body: { result_kind: "care_plan", request: carePlanBody(confirmed), focus_id: null },
      }),
      ExplainOutcome,
    );
    expect(r.mode).toBe("template");
    expect(r.validation.ok).toBe(true);
    expect(r.explanation.summary).toContain("$1,372");
  });

  it("8. changing availability re-optimizes instantly", async () => {
    const g = golden.postvisit.variants.no_tuesday_availability;
    const r = data(
      await api.care_plan({
        method: "POST",
        headers: H,
        body: carePlanBody(confirmed, (m) => {
          m.availability.weekly = m.availability.weekly.filter((w) => w.weekday !== 2);
        }),
      }),
      CarePlanResult,
    );
    const dates = Object.fromEntries(r.alternatives[0]!.events.map((e) => [e.procedure_id, e.service_date]));
    const expected = Object.fromEntries(
      Object.entries(g.first_alternative.event_dates).map(([pid, d]) => [
        confirmed.find((p) => p.cdt_code === fx.procedures().find((x) => x.procedure_id === pid)!.cdt_code)!.procedure_id,
        d,
      ]),
    );
    expect(dates).toEqual(expected);
  });

  it("9. malformed requests get a clear error envelope", async () => {
    const res = await api.care_plan({ method: "POST", headers: H, body: { nonsense: true } });
    expect(res.status).toBe(400);
    const env = ErrorEnvelope.parse(res.body);
    expect(env.error.code).toBe("INVALID_REQUEST");
  });

  it("10. no external network call was made", () => {
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
