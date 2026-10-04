/**
 * HTTP API contract (Next.js route handlers under src/app/api delegate to
 * framework-agnostic handlers in src/api). FROZEN (contract v1).
 *
 * Every request schema is strict: unknown keys are rejected. No request can carry
 * plan rules; the server loads the registry itself (decision D-007, AT-15).
 */
import { z } from "zod";
import { ExplainOutcome, ExtractionRequest, ExtractionResult, AiMode } from "./ai";
import { BenefitPassport } from "./benefits";
import { Issue } from "./issues";
import { MemberState } from "./member";
import { CarePlanRequest, CarePlanResult, VisitNavigatorRequest, VisitNavigatorResult } from "./optimizer";
import { ProviderOption } from "./provider";
import { ProcedureRecommendation, IntakeSourceKind } from "./procedure";
import { Id, IsoDate, IsoDateTime } from "./primitives";

export const ApiErrorCode = z.enum([
  "INVALID_REQUEST",
  "PAYLOAD_TOO_LARGE",
  "UNSUPPORTED_CONFIGURATION",
  "AI_UNAVAILABLE",
  "AI_TIMEOUT",
  "AI_INVALID_OUTPUT",
  "RATE_LIMITED",
  "INTERNAL",
]);
export type ApiErrorCode = z.infer<typeof ApiErrorCode>;

export const ApiMeta = z.strictObject({
  request_id: z.string().max(64),
  /** "mock" only in fixtures/mock-responses; production handlers always return "engine". */
  generated_by: z.enum(["engine", "mock"]),
  synthetic_data: z.literal(true),
});

export function okEnvelope<T extends z.ZodType>(data: T) {
  return z.strictObject({ contract_version: z.string(), ok: z.literal(true), data, meta: ApiMeta });
}

export const ErrorEnvelope = z.strictObject({
  contract_version: z.string(),
  ok: z.literal(false),
  error: z.strictObject({
    code: ApiErrorCode,
    message: z.string().max(300),
    retryable: z.boolean(),
    issues: z.array(Issue),
  }),
  meta: ApiMeta,
});
export type ErrorEnvelope = z.infer<typeof ErrorEnvelope>;

/** HTTP status mapping (handlers must follow it). */
export const HTTP_STATUS: Record<ApiErrorCode, number> = {
  INVALID_REQUEST: 400,
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_CONFIGURATION: 422,
  AI_UNAVAILABLE: 503,
  AI_TIMEOUT: 504,
  AI_INVALID_OUTPUT: 502,
  RATE_LIMITED: 429,
  INTERNAL: 500,
};

// ---------------------------------------------------------------------------
// Routes. Engine statuses such as NEEDS_CONFIRMATION are 200 responses with
// data.status set; only request/transport failures use ErrorEnvelope.
// ---------------------------------------------------------------------------

/** GET /api/health */
export const HealthData = z.strictObject({
  contract_version: z.string(),
  ai_mode: AiMode,
  registry_version: z.string(),
  plan_version_ids: z.array(Id),
});
export const HealthResponse = okEnvelope(HealthData);

/** GET /api/scenario — synthetic INPUTS only (never precomputed results). */
export const DemoScenario = z.strictObject({
  scenario_id: Id,
  title: z.string(),
  previsit_as_of: IsoDateTime,
  postvisit_as_of: IsoDateTime,
  planning_horizon_end: IsoDate,
  member: MemberState,
  providers_previsit: z.array(ProviderOption),
  providers_postvisit: z.array(ProviderOption),
  documents: z.array(
    z.strictObject({ document_id: Id, kind: IntakeSourceKind, title: z.string(), text: z.string().max(20_000) }),
  ),
  visit_defaults: z.strictObject({
    intent: z.enum(["routine", "new_concern", "follow_up"]),
    expected_codes_by_intent: z.strictObject({
      routine: z.array(z.string()),
      new_concern: z.array(z.string()),
      follow_up: z.array(z.string()),
    }),
  }),
});
export type DemoScenario = z.infer<typeof DemoScenario>;
export const ScenarioResponse = okEnvelope(DemoScenario);

/** POST /api/passport */
export const PassportRequest = z.strictObject({ as_of: IsoDateTime, member: MemberState });
export type PassportRequest = z.infer<typeof PassportRequest>;
export const PassportResponse = okEnvelope(BenefitPassport);

/** POST /api/visit-navigator — body is exactly VisitNavigatorRequest (domain/optimizer.ts). */
export const VisitNavigatorBody = VisitNavigatorRequest;
export const VisitNavigatorResponse = okEnvelope(VisitNavigatorResult);

/** POST /api/intake/extract — body is exactly ExtractionRequest (domain/ai.ts). */
export const ExtractBody = ExtractionRequest;
export const ExtractResponse = okEnvelope(ExtractionResult);

/** POST /api/intake/confirm — member/dentist confirms (possibly edited) procedures. */
export const ConfirmRequest = z.strictObject({
  as_of: IsoDateTime,
  confirmed_by: z.enum(["member", "dentist"]),
  procedures: z.array(ProcedureRecommendation).min(1),
});
export type ConfirmRequest = z.infer<typeof ConfirmRequest>;
export const ConfirmData = z.strictObject({
  /** Server stamps status CONFIRMED, confirmed_by and confirmed_at = as_of for valid procedures only. */
  procedures: z.array(ProcedureRecommendation),
  issues: z.array(Issue),
});
export const ConfirmResponse = okEnvelope(ConfirmData);

/** POST /api/care-plan — body is exactly CarePlanRequest (domain/optimizer.ts). */
export const CarePlanBody = CarePlanRequest;
export const CarePlanResponse = okEnvelope(CarePlanResult);

/**
 * POST /api/explain — the server RECOMPUTES the result from the request (never trusts
 * client totals), then explains it and validates the explanation.
 */
export const ExplainRequest = z.discriminatedUnion("result_kind", [
  z.strictObject({ result_kind: z.literal("care_plan"), request: CarePlanRequest, focus_id: Id.nullable() }),
  z.strictObject({ result_kind: z.literal("visit_navigator"), request: VisitNavigatorRequest, focus_id: Id.nullable() }),
]);
export type ExplainRequest = z.infer<typeof ExplainRequest>;
export const ExplainResponse = okEnvelope(ExplainOutcome);

export const API_ROUTES = {
  health: { method: "GET", path: "/api/health" },
  scenario: { method: "GET", path: "/api/scenario" },
  passport: { method: "POST", path: "/api/passport" },
  visit_navigator: { method: "POST", path: "/api/visit-navigator" },
  intake_extract: { method: "POST", path: "/api/intake/extract" },
  intake_confirm: { method: "POST", path: "/api/intake/confirm" },
  care_plan: { method: "POST", path: "/api/care-plan" },
  explain: { method: "POST", path: "/api/explain" },
} as const;
export type ApiRouteId = keyof typeof API_ROUTES;
