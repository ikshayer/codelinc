import {
  CarePlanBody,
  ExplainRequest,
  issue,
  PassportRequest,
  PlanOptionsRequest,
  VisitNavigatorBody,
  type CarePlanRequest,
  type Issue,
  type MemberState,
  type ProviderOption,
} from "@/domain";
import type { ApiHandler, ApiHandlers, ApiRequestLike, ApiResponseLike } from "@/domain/ports";
import {
  CarePlanRequestCollisionError,
  CarePlanResultIntegrityError,
  type CareWindowRepository,
} from "@/db";
import { createApiHandlers, errorResponse, requestIdFrom } from "./index";

type NormalizedRequest = { request: ApiRequestLike; requestId: string };
type PreparedRequest<T = unknown> = NormalizedRequest & { parsedBody?: T; error?: ApiResponseLike };

/**
 * Composes persistence around the existing deterministic handlers. Mongo remains
 * an adapter: the handlers and engines receive validated domain values only.
 */
export async function createRuntimeHandlers(repository: CareWindowRepository | null = null): Promise<ApiHandlers> {
  if (!repository) return createApiHandlers();

  const [registry, scenario] = await Promise.all([repository.loadRegistry(), repository.loadScenario()]);
  const handlers = createApiHandlers({ registry, scenario });

  const normalize = (request: ApiRequestLike): NormalizedRequest => {
    const requestId = requestIdFrom(request.headers);
    return {
      requestId,
      request: { ...request, headers: { ...request.headers, "x-request-id": requestId } },
    };
  };

  const wrap = (handler: ApiHandler): ApiHandler => async (request) => handler(normalize(request).request);

  const serverOwnedMember = (submitted: MemberState): MemberState => {
    const member = structuredClone(scenario.member);
    return {
      ...member,
      budget: structuredClone(submitted.budget),
      availability: structuredClone(submitted.availability),
      travel: structuredClone(submitted.travel),
    };
  };

  const mapProviders = (
    requested: readonly ProviderOption[],
    canonical: readonly ProviderOption[],
    field: string,
  ): { providers: ProviderOption[] | null; issues: Issue[] } => {
    const byId = new Map(canonical.map((provider) => [provider.provider_id, provider]));
    const unknownIds = [...new Set(requested.filter((provider) => !byId.has(provider.provider_id)).map((provider) => provider.provider_id))];
    if (unknownIds.length > 0) {
      return {
        providers: null,
        issues: unknownIds.map((provider_id) => issue("SCHEMA_INVALID", "blocking", "Provider is not available in the canonical scenario.", { field, provider_id })),
      };
    }
    return { providers: requested.map((provider) => structuredClone(byId.get(provider.provider_id)!)), issues: [] };
  };

  const invalidProviders = (requestId: string, issues: Issue[]) =>
    errorResponse("INVALID_REQUEST", "The request contains a provider that is not available in the canonical scenario.", requestId, issues);

  const preparePassport = (normalized: NormalizedRequest): PreparedRequest => {
    const parsed = PassportRequest.safeParse(normalized.request.body);
    if (!parsed.success) return normalized;
    const body = { ...parsed.data, member: serverOwnedMember(parsed.data.member) };
    return { ...normalized, parsedBody: body, request: { ...normalized.request, body } };
  };

  const preparePlanOptions = (normalized: NormalizedRequest): PreparedRequest => {
    const parsed = PlanOptionsRequest.safeParse(normalized.request.body);
    if (!parsed.success) return normalized;
    const body = { ...parsed.data, member: serverOwnedMember(parsed.data.member) };
    return { ...normalized, parsedBody: body, request: { ...normalized.request, body } };
  };

  const prepareVisit = (normalized: NormalizedRequest): PreparedRequest => {
    const parsed = VisitNavigatorBody.safeParse(normalized.request.body);
    if (!parsed.success) return normalized;
    const mapped = mapProviders(parsed.data.providers, scenario.providers_previsit, "providers");
    if (mapped.issues.length > 0) return { ...normalized, error: invalidProviders(normalized.requestId, mapped.issues) };
    const body = { ...parsed.data, member: serverOwnedMember(parsed.data.member), providers: mapped.providers! };
    return { ...normalized, parsedBody: body, request: { ...normalized.request, body } };
  };

  const prepareCarePlan = (normalized: NormalizedRequest): PreparedRequest<CarePlanRequest> => {
    const parsed = CarePlanBody.safeParse(normalized.request.body);
    if (!parsed.success) return normalized;
    const mapped = mapProviders(parsed.data.providers, scenario.providers_postvisit, "providers");
    if (mapped.issues.length > 0) return { ...normalized, error: invalidProviders(normalized.requestId, mapped.issues) };
    const body: CarePlanRequest = { ...parsed.data, member: serverOwnedMember(parsed.data.member), providers: mapped.providers! };
    return { ...normalized, parsedBody: body, request: { ...normalized.request, body } };
  };

  const prepareExplain = (normalized: NormalizedRequest): PreparedRequest => {
    const parsed = ExplainRequest.safeParse(normalized.request.body);
    if (!parsed.success) return normalized;
    if (parsed.data.result_kind === "care_plan") {
      const mapped = mapProviders(parsed.data.request.providers, scenario.providers_postvisit, "request.providers");
      if (mapped.issues.length > 0) return { ...normalized, error: invalidProviders(normalized.requestId, mapped.issues) };
      const body = {
        ...parsed.data,
        request: { ...parsed.data.request, member: serverOwnedMember(parsed.data.request.member), providers: mapped.providers! },
      };
      return { ...normalized, parsedBody: body, request: { ...normalized.request, body } };
    }
    const mapped = mapProviders(parsed.data.request.providers, scenario.providers_previsit, "request.providers");
    if (mapped.issues.length > 0) return { ...normalized, error: invalidProviders(normalized.requestId, mapped.issues) };
    const body = {
      ...parsed.data,
      request: { ...parsed.data.request, member: serverOwnedMember(parsed.data.request.member), providers: mapped.providers! },
    };
    return { ...normalized, parsedBody: body, request: { ...normalized.request, body } };
  };

  const carePlan = async (request: ApiRequestLike): Promise<ApiResponseLike> => {
    const prepared = prepareCarePlan(normalize(request));
    if (prepared.error) return prepared.error;
    const response = await handlers.care_plan(prepared.request);
    if (response.status !== 200) return response;

    const envelope = response.body as { ok?: unknown; data?: unknown };
    if (envelope?.ok !== true || !prepared.parsedBody) return response;
    try {
      await repository.saveCarePlanResult(prepared.requestId, prepared.parsedBody, envelope.data, registry.registry_version);
      return response;
    } catch (error) {
      if (error instanceof CarePlanRequestCollisionError) {
        return errorResponse("INVALID_REQUEST", "The request id is already associated with a different care-plan request.", prepared.requestId);
      }
      if (error instanceof CarePlanResultIntegrityError) {
        return errorResponse("INTERNAL", "The stored care plan does not match the request.", prepared.requestId);
      }
      return errorResponse("INTERNAL", "The care plan could not be stored.", prepared.requestId);
    }
  };

  return {
    health: wrap(handlers.health),
    scenario: wrap(handlers.scenario),
    passport: async (request) => {
      const prepared = preparePassport(normalize(request));
      return handlers.passport(prepared.request);
    },
    plan_options: async (request) => {
      const prepared = preparePlanOptions(normalize(request));
      return handlers.plan_options(prepared.request);
    },
    visit_navigator: async (request) => {
      const prepared = prepareVisit(normalize(request));
      return prepared.error ?? handlers.visit_navigator(prepared.request);
    },
    intake_extract: wrap(handlers.intake_extract),
    intake_confirm: wrap(handlers.intake_confirm),
    care_plan: carePlan,
    explain: async (request) => {
      const prepared = prepareExplain(normalize(request));
      return prepared.error ?? handlers.explain(prepared.request);
    },
  };
}
