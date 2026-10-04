/**
 * Fixture and mock validation against the frozen schemas. PLANNER-OWNED.
 * Must pass at freeze time and forever after.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  CarePlanRequest,
  CarePlanResponse,
  confirmedProcedureProblems,
  ExplainResponse,
  ExtractResponse,
  HealthResponse,
  MemberState,
  PassportResponse,
  PLAN_RULE_TYPES,
  ProcedureRecommendation,
  ProviderOption,
  splitSourcePages,
  VisitNavigatorRequest,
  VisitNavigatorResponse,
} from "@/domain";
import manifest from "../../data/sources/manifest.json";
import golden from "../../fixtures/golden/expected.json";
import expectations from "../../fixtures/golden/registry-expectations.json";
import scenario from "../../fixtures/synthetic/scenario.json";

const ROOT = path.resolve(import.meta.dirname, "../..");
const json = (p: string) => JSON.parse(fs.readFileSync(path.join(ROOT, p), "utf8"));

describe("synthetic fixtures", () => {
  const member = MemberState.parse(json(scenario.files.member));
  const pre = ProviderOption.array().parse(json(scenario.files.providers_previsit));
  const post = ProviderOption.array().parse(json(scenario.files.providers_postvisit));
  const procs = ProcedureRecommendation.array().parse(json(scenario.files.procedures_confirmed));

  it("parse against contract v1", () => {
    expect(member.member_id).toBe("member-alex-synthetic");
    expect(pre.map((p) => p.provider_id)).toEqual(["prov-rivera", "prov-brightsmile", "prov-lakeside"]);
    expect(post.map((p) => p.provider_id)).toEqual(["prov-rivera", "prov-brightsmile"]);
    expect(procs.map((p) => p.procedure_id)).toEqual(["proc-rc-30", "proc-crown-30", "proc-fill-14"]);
  });

  it("confirmed procedures are complete and ordered", () => {
    for (const p of procs) expect(confirmedProcedureProblems(p), p.procedure_id).toEqual([]);
  });

  it("build valid requests", () => {
    expect(() =>
      CarePlanRequest.parse({ as_of: scenario.postvisit_as_of, member, providers: post, procedures: procs, planning_horizon_end: scenario.planning_horizon_end, max_alternatives: 3 }),
    ).not.toThrow();
    expect(() =>
      VisitNavigatorRequest.parse({
        as_of: scenario.previsit_as_of,
        member,
        providers: pre,
        visit: { intent: "new_concern", expected_codes: scenario.visit_defaults.expected_codes_by_intent.new_concern, symptoms: { severe_pain: false, swelling: false, trauma: false, bleeding: false, fever: false } },
        known_procedures: [],
        max_options: 3,
      }),
    ).not.toThrow();
  });

  it("input ids are globally unique", () => {
    const ids: string[] = [];
    const walk = (v: unknown) => {
      if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === "object") {
        for (const [k, x] of Object.entries(v)) {
          if (k === "input_id") ids.push(x as string);
          else walk(x);
        }
      }
    };
    walk(member);
    walk(post);
    walk(procs);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("documents exist and are synthetic", () => {
    for (const d of scenario.documents) {
      const text = fs.readFileSync(path.join(ROOT, d.path), "utf8");
      expect(text).toMatch(/synthetic/i);
    }
  });

  it("strict schemas reject unknown keys (prompt-injection boundary)", () => {
    expect(() => MemberState.parse({ ...member, annual_maximum_override: 1 })).toThrow();
  });
});

describe("immutable sources", () => {
  it("manifest checksums match the bytes and pages split cleanly", () => {
    for (const s of manifest.sources) {
      const bytes = fs.readFileSync(path.join(ROOT, s.path));
      expect(crypto.createHash("sha256").update(bytes).digest("hex"), s.path).toBe(s.sha256);
      const pages = splitSourcePages(bytes.toString("utf8"));
      // (1.5) The 2026 carryover rider has two pages; each summary has five.
      expect(pages.map((p) => p.page)).toEqual(s.source_id === "nwd-ppo-2026-carryover-rider" ? [1, 2] : [1, 2, 3, 4, 5]);
    }
  });
});

describe("golden expectations", () => {
  it("registry expectations use known rule types and the id convention", () => {
    for (const plan of expectations.plans) {
      const year = plan.coverage_period.start.slice(0, 4);
      for (const r of plan.rules) {
        expect(PLAN_RULE_TYPES).toContain(r.rule_type);
        expect(r.rule_id.startsWith(`${r.rule_type}`)).toBe(true);
        expect(r.rule_id.endsWith(`.${year}`)).toBe(true);
      }
    }
  });

  it("golden care-plan numbers reconcile internally", () => {
    type GEvent = {
      member_responsibility_cents: number;
      plan_pay_cents: number;
      contractual_adjustment_cents: number;
      modeled_charge_cents: number;
      funding: { amount_cents: number }[];
    };
    for (const alt of golden.postvisit.base.alternatives) {
      const t = alt.totals;
      expect(t.plan_pay_cents + t.member_cost_cents + t.contractual_adjustment_cents).toBe(t.modeled_charge_cents);
      const member = (alt.events as { member_responsibility_cents: number }[]).reduce((a, e) => a + e.member_responsibility_cents, 0);
      expect(member).toBe(t.member_cost_cents);
    }
    for (const e of golden.postvisit.base.alternatives[0]!.events as GEvent[]) {
      expect(e.plan_pay_cents + e.member_responsibility_cents + e.contractual_adjustment_cents).toBe(e.modeled_charge_cents);
      const funded = e.funding.reduce((a, f) => a + f.amount_cents, 0);
      expect(funded).toBe(e.member_responsibility_cents);
    }
  });
});

describe("mock API responses", () => {
  const dir = path.join(ROOT, "fixtures/mock-responses");
  const cases: [string, { parse: (v: unknown) => unknown }][] = [
    ["health.json", HealthResponse],
    ["passport.json", PassportResponse],
    ["visit-navigator.json", VisitNavigatorResponse],
    ["intake-extract.json", ExtractResponse],
    ["care-plan.json", CarePlanResponse],
    ["explain.json", ExplainResponse],
  ];
  for (const [file, schema] of cases) {
    it(`${file} is a valid contract-v1 envelope marked as mock`, () => {
      const body = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
      expect(() => schema.parse(body)).not.toThrow();
      expect(body.meta.generated_by).toBe("mock");
    });
  }
});
