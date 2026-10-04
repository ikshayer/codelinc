import type { IncomingMessage } from "node:http";
import { AnalysisCalculateRequest, AnalysisInputError, compareAnalysis } from "../analysis/compare";

export type CalculateResponse = { status: number; body: Record<string, unknown> };

export class BodyTooLargeError extends Error {
  constructor() { super("Request body exceeds the byte limit."); }
}

/** Original intake compatibility endpoint: server-only modeling of confirmed in-network assumptions. */
export function calculateRequest(body: unknown): CalculateResponse {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { status: 422, body: { error: { code: "INVALID", message: "Calculation request must be an object.", retryable: false } } };
  const request = body as Record<string, unknown>;
  for (const field of ["requestId", "analysisId", "revision", "scenario"]) if (!(field in request)) return { status: 422, body: { error: { code: "INVALID", message: `Missing field: ${field}.`, retryable: false, fieldPath: field } } };
  if (typeof request.requestId !== "string" || !request.requestId.trim() || typeof request.analysisId !== "string" || !request.analysisId.trim() || typeof request.revision !== "number" || !Number.isSafeInteger(request.revision) || request.revision < 0) return { status: 422, body: { error: { code: "INVALID", message: "Invalid calculation request metadata.", retryable: false } } };
  if (!request.scenario || typeof request.scenario !== "object" || Array.isArray(request.scenario)) return { status: 422, body: { error: { code: "INVALID", message: "Scenario must be an object.", retryable: false, fieldPath: "scenario" } } };
  const parsed = AnalysisCalculateRequest.safeParse(request);
  if (!parsed.success) return { status: 422, body: { error: { code: "INVALID", message: "Complete the supported confirmed scenario before calculating.", retryable: false, fieldPath: parsed.error.issues[0]?.path.map(String).join(".") ?? "scenario" } } };
  if (parsed.data.revision !== parsed.data.scenario.revision) return { status: 409, body: { error: { code: "CONFLICT", message: "The scenario revision does not match this request.", retryable: true, fieldPath: "revision" } } };
  try {
    return { status: 200, body: compareAnalysis(parsed.data.scenario, parsed.data.engineOptions) as unknown as Record<string, unknown> };
  } catch (error) {
    if (error instanceof AnalysisInputError) return { status: 422, body: { error: { code: "INVALID", message: error.message, retryable: false, fieldPath:error.fieldPath } } };
    return { status: 422, body: { error: { code: "INVALID", message: "The confirmed values could not be reconciled. Check the amounts and dates.", retryable: false } } };
  }
}

export async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const part = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += part.length;
    if (size > 1_000_000) chunks.length = 0;
    else chunks.push(part);
  }
  if (size > 1_000_000) throw new BodyTooLargeError();
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
