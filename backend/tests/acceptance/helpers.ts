/**
 * Acceptance-suite helpers. PLANNER-OWNED, FROZEN (contract v1).
 * Tests import modules ONLY through their public entry points (src/domain/ports.ts).
 */
import fs from "node:fs";
import path from "node:path";
import {
  AdjudicationLine,
  CarePlanRequest,
  CarePlanResult,
  MemberState,
  PlanRegistry,
  PlanRule,
  ProcedureRecommendation,
  ProviderOption,
  VisitNavigatorRequest,
} from "@/domain";
import type { CarePlanOptimizer, VisitNavigator } from "@/domain/ports";
import { benefitEngine, loadRegistry } from "@/benefits";
import { createCarePlanOptimizer, createVisitNavigator } from "@/optimizer";
import scenarioJson from "../../fixtures/synthetic/scenario.json";
import memberJson from "../../fixtures/synthetic/member.json";
import providersPreJson from "../../fixtures/synthetic/providers.previsit.json";
import providersPostJson from "../../fixtures/synthetic/providers.postvisit.json";
import proceduresJson from "../../fixtures/synthetic/procedures.confirmed.json";
import goldenJson from "../../fixtures/golden/expected.json";
import registryExpectationsJson from "../../fixtures/golden/registry-expectations.json";

export const ROOT = path.resolve(import.meta.dirname, "../..");

export const scenario = scenarioJson;
export const golden = goldenJson;
export const registryExpectations = registryExpectationsJson;

export const PREVISIT_AS_OF = scenario.previsit_as_of;
export const POSTVISIT_AS_OF = scenario.postvisit_as_of;
export const P1 = "prov-rivera";
export const P2 = "prov-brightsmile";
export const P3 = "prov-lakeside";
export const PV2026 = "nwd-ppo-standard-2026";
export const PV2027 = "nwd-ppo-standard-2027";

/** Fresh, schema-validated copies so tests can mutate freely. */
export const fx = {
  member: (): MemberState => MemberState.parse(structuredClone(memberJson)),
  providersPre: (): ProviderOption[] => ProviderOption.array().parse(structuredClone(providersPreJson)),
  providersPost: (): ProviderOption[] => ProviderOption.array().parse(structuredClone(providersPostJson)),
  procedures: (): ProcedureRecommendation[] =>
    ProcedureRecommendation.array().parse(structuredClone(proceduresJson)),
};

export function readText(relPath: string): string {
  return fs.readFileSync(path.join(ROOT, relPath), "utf8");
}

export function documentText(documentId: string): string {
  const doc = scenario.documents.find((d) => d.document_id === documentId);
  if (!doc) throw new Error(`unknown document ${documentId}`);
  return readText(doc.path);
}

export const benefits = benefitEngine;

export function registry(): PlanRegistry {
  return PlanRegistry.parse(structuredClone(loadRegistry()));
}

export function carePlanOptimizer(): CarePlanOptimizer {
  return createCarePlanOptimizer(benefitEngine);
}

export function visitNavigator(): VisitNavigator {
  return createVisitNavigator(benefitEngine);
}

export function carePlanRequest(mutate?: (r: CarePlanRequest) => void): CarePlanRequest {
  const r: CarePlanRequest = {
    as_of: POSTVISIT_AS_OF,
    member: fx.member(),
    providers: fx.providersPost(),
    procedures: fx.procedures(),
    planning_horizon_end: scenario.planning_horizon_end,
    max_alternatives: 3,
  };
  mutate?.(r);
  return CarePlanRequest.parse(r);
}

export function visitRequest(mutate?: (r: VisitNavigatorRequest) => void): VisitNavigatorRequest {
  const r: VisitNavigatorRequest = {
    as_of: PREVISIT_AS_OF,
    member: fx.member(),
    providers: fx.providersPre(),
    visit: {
      intent: "new_concern",
      expected_codes: [...scenario.visit_defaults.expected_codes_by_intent.new_concern],
      symptoms: { severe_pain: false, swelling: false, trauma: false, bleeding: false, fever: false },
    },
    known_procedures: [],
    max_options: 3,
  };
  mutate?.(r);
  return VisitNavigatorRequest.parse(r);
}

export function optimize(mutate?: (r: CarePlanRequest) => void, reg: PlanRegistry = registry()): CarePlanResult {
  return CarePlanResult.parse(carePlanOptimizer().optimize(reg, carePlanRequest(mutate)));
}

/** Return a registry copy with one rule replaced (fn returns a rule) or removed (fn returns null). */
export function mutateRule(
  reg: PlanRegistry,
  planVersionId: string,
  ruleId: string,
  fn: (rule: PlanRule) => PlanRule | null,
): PlanRegistry {
  const copy = structuredClone(reg);
  const plan = copy.plans.find((p) => p.plan_version_id === planVersionId);
  if (!plan) throw new Error(`no plan ${planVersionId}`);
  const idx = plan.rules.findIndex((r) => r.rule_id === ruleId);
  if (idx < 0) throw new Error(`no rule ${ruleId} in ${planVersionId}`);
  const next = fn(structuredClone(plan.rules[idx]!));
  if (next === null) plan.rules.splice(idx, 1);
  else plan.rules[idx] = next;
  return copy;
}

export function provider(list: ProviderOption[], id: string): ProviderOption {
  const p = list.find((x) => x.provider_id === id);
  if (!p) throw new Error(`no provider ${id}`);
  return p;
}

export function procedure(list: ProcedureRecommendation[], id: string): ProcedureRecommendation {
  const p = list.find((x) => x.procedure_id === id);
  if (!p) throw new Error(`no procedure ${id}`);
  return p;
}

/** Every adjudication line in every alternative (both scenarios). */
export function allLines(result: CarePlanResult): AdjudicationLine[] {
  return result.alternatives.flatMap((a) => a.events.flatMap((e) => [e.line_worst, e.line_best]));
}

export function byLabel(result: CarePlanResult, label: CarePlanResult["alternatives"][number]["labels"][number]) {
  const alt = result.alternatives.find((a) => a.labels.includes(label));
  if (!alt) throw new Error(`no alternative labeled ${label}`);
  return alt;
}

export function eventFor(alt: CarePlanResult["alternatives"][number], procedureId: string) {
  const e = alt.events.find((x) => x.procedure_id === procedureId);
  if (!e) throw new Error(`no event for ${procedureId}`);
  return e;
}

/** Deep-walk an object and collect every numeric value under a key ending in `_cents`. */
export function collectCents(value: unknown, out: Set<number> = new Set()): Set<number> {
  if (Array.isArray(value)) value.forEach((v) => collectCents(v, out));
  else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      if (typeof v === "number" && k.endsWith("_cents")) out.add(v);
      else collectCents(v, out);
    }
  }
  return out;
}

/** Deterministic shuffle (reverse + rotate) used by the determinism tests. */
export function permute<T>(xs: readonly T[]): T[] {
  const r = [...xs].reverse();
  return r.length > 1 ? [...r.slice(1), r[0]!] : r;
}
