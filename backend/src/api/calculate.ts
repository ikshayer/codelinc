import type { IncomingMessage } from "node:http";
import { AnalysisCalculateRequest, AnalysisInputError, compareAnalysis } from "../analysis/compare";
import { authoritativeMemberScenario } from "../analysis/member-benefits";
import type { MemberIdentity } from "../analysis/member-identity";

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
  if (parsed.data.memberIdentity) return { status: 503, body: { error: { code: "UNAVAILABLE", message: "Member calculation requires an authoritative database lookup.", retryable: true } } };
  try {
    return { status: 200, body: compareAnalysis(parsed.data.scenario, parsed.data.engineOptions) as unknown as Record<string, unknown> };
  } catch (error) {
    if (error instanceof AnalysisInputError) return { status: 422, body: { error: { code: "INVALID", message: error.message, retryable: false, fieldPath:error.fieldPath } } };
    return { status: 422, body: { error: { code: "INVALID", message: "The confirmed values could not be reconciled. Check the amounts and dates.", retryable: false } } };
  }
}

export type MemberLookupReader = (identity: MemberIdentity) => Promise<CalculateResponse>;

/** Member calculations never fall back to guest values when identity, source data or benefit semantics fail. */
export async function calculateRequestWithMember(body: unknown, lookup: MemberLookupReader): Promise<CalculateResponse> {
  const parsed = AnalysisCalculateRequest.safeParse(body);
  if (!parsed.success || !parsed.data.memberIdentity || parsed.data.revision !== parsed.data.scenario.revision) return calculateRequest(body);
  try {
    const loaded = await lookup(parsed.data.memberIdentity);
    if (loaded.status !== 200) return { status: loaded.status, body: { error: { code: "UNAVAILABLE", message: "Authoritative member benefits could not be loaded.", retryable: loaded.status >= 500 } } };
    if (loaded.body.matched === false) return { status: 404, body: { error: { code: "MEMBER_NOT_FOUND", message: "No member matched that member ID and date of birth.", retryable: false } } };
    const { scenario, context, adjustments, limitations } = authoritativeMemberScenario(parsed.data.scenario, parsed.data.memberIdentity, loaded.body);
    if (context.status === "NEEDS_CONFIRMATION") return { status: 422, body: { error: { code: "NEEDS_CONFIRMATION", message: "The stored member benefits need confirmation before costs can be calculated.", retryable: false, fieldPath: "memberIdentity" }, memberBenefitContext: context } };
    const result = compareAnalysis(scenario, parsed.data.engineOptions, adjustments);
    result.memberBenefitContext = context;
    result.planning.limitations = [...limitations, ...result.planning.limitations.filter((limitation) => !limitation.includes("rollover and pending claims require facts absent")), "Service dates are modeled choices, not booked appointments. Provider search, network discounts, cash-versus-claim routes and account funding require facts absent from this intake."];
    result.planning.issues = [...context.issues, ...result.planning.issues];
    return { status: 200, body: result as unknown as Record<string, unknown> };
  } catch (error) {
    if (error instanceof AnalysisInputError) return { status: 422, body: { error: { code: "NEEDS_CONFIRMATION", message: error.message, retryable: false, fieldPath: error.fieldPath } } };
    return { status: 503, body: { error: { code: "UNAVAILABLE", message: "Authoritative member benefits could not be loaded.", retryable: true } } };
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
