import type { IncomingMessage } from "node:http";

export type CalculateResponse = { status: number; body: Record<string, unknown> };

/** Contract endpoint scaffold: validates the live request and reports readiness honestly. */
export function calculateRequest(body: unknown): CalculateResponse {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { status: 422, body: { error: { code: "INVALID", message: "Calculation request must be an object.", retryable: false } } };
  const request = body as Record<string, unknown>;
  for (const field of ["requestId", "analysisId", "revision", "scenario"]) if (!(field in request)) return { status: 422, body: { error: { code: "INVALID", message: `Missing field: ${field}.`, retryable: false, fieldPath: field } } };
  if (typeof request.requestId !== "string" || typeof request.analysisId !== "string" || typeof request.revision !== "number" || !Number.isInteger(request.revision) || request.revision < 0) return { status: 422, body: { error: { code: "INVALID", message: "Invalid calculation request metadata.", retryable: false } } };
  return { status: 503, body: { error: { code: "UNAVAILABLE", message: "The benefits calculation engine is not ready to price this scenario yet.", retryable: true } } };
}

export async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) { const part = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk); size += part.length; if (size > 1_000_000) throw new Error("body too large"); chunks.push(part); }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
