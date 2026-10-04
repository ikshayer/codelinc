import type { ExplainOutcome, ExtractionRequest, ExtractionResult } from "@engine/ai";
import type { ConfirmRequest, DemoScenario, ExplainRequest, HealthData, PassportRequest } from "@engine/api";
import type { BenefitPassport } from "@engine/benefits";
import type { CarePlanRequest, CarePlanResult, VisitNavigatorRequest, VisitNavigatorResult } from "@engine/optimizer";
import type { ProcedureRecommendation } from "@engine/procedure";
import type { Issue } from "@engine/issues";

import { adapterError, requestJson } from "../shared";
import type { AdapterResult, EngineEnvelopeMetadata } from "../types";

// Deterministic CareWindow engine (backend/, `npm run serve`), reached through the
// same-origin Next rewrite /api/engine/* (next.config.ts). Types are the backend's
// frozen contract, imported type-only. The UI renders these fields; it does no benefit math.

export const ENGINE_BASE = "/api/engine";

export interface ConfirmData {
  procedures: ProcedureRecommendation[];
  issues: Issue[];
}

/** Unwraps the engine success envelope { ok: true, data }. Anything else is an unusable response. */
export function unwrapEnvelope<T>(body: unknown): AdapterResult<T> {
  if (body && typeof body === "object" && (body as { ok?: unknown }).ok === true && "data" in body) {
    const envelope = body as { data: T; contract_version?: unknown; meta?: { request_id?: unknown; generated_by?: unknown; synthetic_data?: unknown } };
    const meta = envelope.meta;
    const metadata: EngineEnvelopeMetadata | undefined = typeof envelope.contract_version === "string" && typeof meta?.request_id === "string" &&
      (meta.generated_by === "engine" || meta.generated_by === "mock") && meta.synthetic_data === true
      ? { contract_version: envelope.contract_version, request_id: meta.request_id, generated_by: meta.generated_by, synthetic_data: true as const }
      : undefined;
    return { ok: true, value: envelope.data, ...(metadata ? { metadata } : {}) };
  }
  return { ok: false, error: adapterError("UNAVAILABLE", "The care engine returned an unusable response. Try again.", true) };
}

async function call<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<AdapterResult<T>> {
  const result = await requestJson<unknown>(`${ENGINE_BASE}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
    service: "care engine",
  });
  return result.ok ? unwrapEnvelope<T>(result.value) : result;
}

export const engine = {
  health: (signal?: AbortSignal) => call<HealthData>("/health", undefined, signal),
  scenario: (signal?: AbortSignal) => call<DemoScenario>("/scenario", undefined, signal),
  passport: (body: PassportRequest, signal?: AbortSignal) => call<BenefitPassport>("/passport", body, signal),
  visitNavigator: (body: VisitNavigatorRequest, signal?: AbortSignal) => call<VisitNavigatorResult>("/visit-navigator", body, signal),
  extract: (body: ExtractionRequest, signal?: AbortSignal) => call<ExtractionResult>("/intake/extract", body, signal),
  confirm: (body: ConfirmRequest, signal?: AbortSignal) => call<ConfirmData>("/intake/confirm", body, signal),
  carePlan: (body: CarePlanRequest, signal?: AbortSignal) => call<CarePlanResult>("/care-plan", body, signal),
  explain: (body: ExplainRequest, signal?: AbortSignal) => call<ExplainOutcome>("/explain", body, signal),
};

export type {
  BenefitPassport,
  CarePlanRequest,
  CarePlanResult,
  DemoScenario,
  ExplainOutcome,
  ExtractionResult,
  Issue,
  ProcedureRecommendation,
  VisitNavigatorRequest,
  VisitNavigatorResult,
};
