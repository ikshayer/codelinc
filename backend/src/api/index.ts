/**
 * Framework-agnostic API handlers (CONTRACT §7). Dependencies are built lazily; every
 * body is schema-parsed before any engine runs. Envelopes from src/domain/api.ts.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { z } from "zod";
import {
  CarePlanBody,
  ConfirmRequest,
  confirmedProcedureProblems,
  CONTRACT_VERSION,
  DemoScenario,
  ExplainRequest,
  ExtractBody,
  HTTP_STATUS,
  issue,
  PassportRequest,
  PlanOptionsRequest,
  VisitNavigatorBody,
  type ApiErrorCode,
  type ErrorEnvelope,
  type ExplainOutcome,
  type Issue,
  type ProcedureRecommendation,
} from "@/domain";
import type { ApiDeps, ApiHandler, ApiHandlers, ApiModule, ApiRequestLike, ApiResponseLike } from "@/domain/ports";
import { buildExplanationInput, createAiAdapters, validateExplanation } from "@/ai";
import { benefitEngine, loadRegistry } from "@/benefits";
import { createCarePlanOptimizer, createVisitNavigator } from "@/optimizer";

export { readMongoDemo } from "./mongo-demo";

const REQUEST_ID = /^[A-Za-z0-9-]{1,64}$/;

export function requestIdFrom(headers: Record<string, string>): string {
  const id = headers["x-request-id"];
  return id && REQUEST_ID.test(id) ? id : crypto.randomUUID();
}

const meta = (request_id: string) => ({ request_id, generated_by: "engine" as const, synthetic_data: true as const });

export function errorResponse(code: ApiErrorCode, message: string, requestId: string, issues: Issue[] = []): ApiResponseLike {
  const body: ErrorEnvelope = {
    contract_version: CONTRACT_VERSION,
    ok: false,
    error: { code, message, retryable: code === "INTERNAL" || code === "AI_TIMEOUT" || code === "RATE_LIMITED", issues },
    meta: meta(requestId),
  };
  return { status: HTTP_STATUS[code], body };
}

/** Schema issues carry paths only, never submitted values. */
function schemaIssues(error: z.ZodError): Issue[] {
  return error.issues.slice(0, 50).map((e) => {
    const keys = e.code === "unrecognized_keys" ? e.keys : [];
    const field = [...e.path.map(String), ...keys.slice(0, 1)].join(".") || null;
    return issue("SCHEMA_INVALID", "blocking", `Request field failed validation (${e.code}).`, { field: field?.slice(0, 256) ?? null });
  });
}

/** Thrown inside a handler to return a specific error response. */
class ApiError {
  constructor(readonly response: ApiResponseLike) {}
}

function handler<S extends z.ZodType>(schema: S | null, run: (body: z.infer<S>, requestId: string) => unknown): ApiHandler {
  return async (req: ApiRequestLike) => {
    const requestId = requestIdFrom(req.headers);
    let body: z.infer<S> = undefined as z.infer<S>;
    if (schema) {
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return errorResponse("INVALID_REQUEST", "The request does not match the expected shape.", requestId, schemaIssues(parsed.error));
      body = parsed.data;
    }
    try {
      const data = await run(body, requestId);
      return { status: 200, body: { contract_version: CONTRACT_VERSION, ok: true, data, meta: meta(requestId) } };
    } catch (e) {
      if (e instanceof ApiError) return e.response;
      return errorResponse("INTERNAL", "Something went wrong while computing this result.", requestId);
    }
  };
}

export function createApiHandlers(deps: Partial<ApiDeps> = {}): ApiHandlers {
  let built: Omit<ApiDeps, "scenario"> | null = null;
  const d = () => {
    if (!built) {
      const benefits = deps.benefits ?? benefitEngine;
      built = {
        registry: deps.registry ?? loadRegistry(),
        benefits,
        visitNavigator: deps.visitNavigator ?? createVisitNavigator(benefits),
        carePlanOptimizer: deps.carePlanOptimizer ?? createCarePlanOptimizer(benefits),
        ai: deps.ai ?? createAiAdapters(),
      };
    }
    return built;
  };

  return {
    health: handler(null, () => {
      const { registry, ai } = d();
      return {
        contract_version: CONTRACT_VERSION,
        ai_mode: ai.mode,
        registry_version: registry.registry_version,
        plan_version_ids: registry.plans.map((p) => p.plan_version_id).sort(),
      };
    }),
    scenario: handler(null, () => deps.scenario ?? loadDemoScenario()),
    passport: handler(PassportRequest, (body, requestId) => {
      const { registry, benefits } = d();
      try {
        return benefits.passport(registry, body.member, body.as_of);
      } catch {
        throw new ApiError(
          errorResponse("INVALID_REQUEST", "Benefit balances for the current plan year are needed.", requestId, [
            issue("INPUT_MISSING", "blocking", "Benefit balances for the current plan year are needed.", { field: "member.accumulators" }),
          ]),
        );
      }
    }),
    plan_options: handler(PlanOptionsRequest, (body) => d().benefits.planOptions(d().registry, body.member, body.as_of)),
    visit_navigator: handler(VisitNavigatorBody, (body) => d().visitNavigator.navigate(d().registry, body)),
    intake_extract: handler(ExtractBody, (body) => d().ai.extractor.extract(body)),
    intake_confirm: handler(ConfirmRequest, (body) => {
      const issues: Issue[] = [];
      const procedures = body.procedures.map((p): ProcedureRecommendation => {
        const stamped: ProcedureRecommendation = {
          ...p,
          confirmation: { status: "CONFIRMED", confirmed_by: body.confirmed_by, confirmed_at: body.as_of },
        };
        const problems = confirmedProcedureProblems(stamped);
        if (problems.length === 0) return stamped;
        issues.push(
          issue("PROCEDURE_UNCONFIRMED", "blocking", `Please complete: ${problems.join(", ")}.`.slice(0, 500), { procedure_id: p.procedure_id }),
        );
        return p;
      });
      return { procedures, issues };
    }),
    care_plan: handler(CarePlanBody, (body) => d().carePlanOptimizer.optimize(d().registry, body)),
    explain: handler(ExplainRequest, async (body): Promise<ExplainOutcome> => {
      const { registry, benefits, visitNavigator, carePlanOptimizer, ai } = d();
      const input = buildExplanationInput({
        registry,
        benefits,
        result:
          body.result_kind === "care_plan"
            ? { kind: "care_plan", value: carePlanOptimizer.optimize(registry, body.request) }
            : { kind: "visit_navigator", value: visitNavigator.navigate(registry, body.request) },
        procedures: body.result_kind === "care_plan" ? body.request.procedures : body.request.known_procedures,
        focusId: body.focus_id,
      });
      let explainer = ai.explainer;
      let explanation = await explainer.explain(input);
      let validation = validateExplanation(explanation, input);
      const fellBack = !validation.ok && explainer !== ai.templateExplainer;
      if (fellBack) {
        explainer = ai.templateExplainer;
        explanation = await explainer.explain(input);
        validation = validateExplanation(explanation, input);
      }
      return { contract_version: CONTRACT_VERSION, mode: explainer.mode, explanation, validation, fell_back_to_template: fellBack };
    }),
  };
}

// ---------------------------------------------------------------------------
// Demo scenario (synthetic inputs only)
// ---------------------------------------------------------------------------

const ROOT = path.resolve(import.meta.dirname, "../..");
let scenarioCache: DemoScenario | null = null;

export function loadDemoScenario(): DemoScenario {
  if (scenarioCache) return scenarioCache;
  const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");
  const json = (rel: string) => JSON.parse(read(rel));
  const sc = json("fixtures/synthetic/scenario.json");
  scenarioCache = DemoScenario.parse({
    scenario_id: sc.scenario_id,
    title: sc.title,
    previsit_as_of: sc.previsit_as_of,
    postvisit_as_of: sc.postvisit_as_of,
    planning_horizon_end: sc.planning_horizon_end,
    member: json(sc.files.member),
    providers_previsit: json(sc.files.providers_previsit),
    providers_postvisit: json(sc.files.providers_postvisit),
    documents: sc.documents.map((doc: { document_id: string; kind: string; title: string; path: string }) => ({
      document_id: doc.document_id,
      kind: doc.kind,
      title: doc.title,
      text: read(doc.path),
    })),
    visit_defaults: sc.visit_defaults,
  });
  return scenarioCache;
}

export const apiModule = { createApiHandlers, loadDemoScenario } satisfies ApiModule;
