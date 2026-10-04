import { describe, expect, it } from "vitest";
import { CarePlanBody, CarePlanResult, ProcedureRecommendation, type CarePlanRequest, type DemoScenario, type PlanRegistry } from "@/domain";
import { CarePlanRequestCollisionError, type CareWindowRepository } from "@/db";
import { createRuntimeHandlers } from "@/api/runtime";
import { loadDemoScenario } from "@/api";
import { loadRegistry } from "@/benefits";
import proceduresJson from "../../fixtures/synthetic/procedures.confirmed.json";

type StoredResult = { request: CarePlanRequest; result: CarePlanResult; registryVersion: string };

class MemoryRepository implements CareWindowRepository {
  readonly results = new Map<string, StoredResult>();

  constructor(
    private registry: PlanRegistry,
    private scenario: DemoScenario,
  ) {}

  async seedCanonical(registry: PlanRegistry, scenario: DemoScenario) {
    this.registry = registry;
    this.scenario = scenario;
  }

  async loadRegistry() {
    return structuredClone(this.registry);
  }

  async loadScenario() {
    return structuredClone(this.scenario);
  }

  async saveCarePlanResult(requestId: string, request: CarePlanRequest, result: unknown, registryVersion: string) {
    const parsedRequest = CarePlanBody.parse(request);
    const parsedResult = CarePlanResult.parse(result);
    const existing = this.results.get(requestId);
    if (existing) {
      if (JSON.stringify(existing.request) !== JSON.stringify(parsedRequest)) throw new CarePlanRequestCollisionError();
      expect(existing.result).toEqual(parsedResult);
      expect(existing.registryVersion).toBe(registryVersion);
      return;
    }
    this.results.set(requestId, { request: parsedRequest, result: parsedResult, registryVersion });
  }
}

function carePlanRequest(scenario: DemoScenario): CarePlanRequest {
  return {
    as_of: scenario.postvisit_as_of,
    member: scenario.member,
    providers: scenario.providers_postvisit,
    procedures: ProcedureRecommendation.array().parse(proceduresJson),
    planning_horizon_end: scenario.planning_horizon_end,
    max_alternatives: 3,
  };
}

function responseData(response: { body: unknown }): CarePlanResult {
  return (response.body as { data: CarePlanResult }).data;
}

function responseMeta(response: { body: unknown }): { request_id: string } {
  return (response.body as { meta: { request_id: string } }).meta;
}

describe("database-backed API runtime", () => {
  it("normalizes request ids, overlays server-owned facts, and persists a successful result", async () => {
    const scenario = loadDemoScenario();
    const repository = new MemoryRepository(loadRegistry(), scenario);
    const api = await createRuntimeHandlers(repository);
    const request = carePlanRequest(scenario);
    const forgedMember = {
      ...structuredClone(request.member),
      member_id: "forged-member",
      display_name: "Forged Member",
      plan_key: { ...request.member.plan_key, plan_option_id: "ppo-value" },
      coverage_effective_from: "2020-01-01",
      accumulators: [],
      pending_claims: [],
      procedure_history: [],
      secondary_coverage: { carrier_name: "forged-secondary", relationship: "self" as const },
      funding_accounts: request.member.funding_accounts.map((account) => ({
        ...account,
        balance: { ...account.balance, value: { kind: "exact" as const, cents: 0 } },
      })),
    };
    const forgedProviders = request.providers.map((provider) => ({ ...provider, name: "Forged Provider" }));
    const forgedRequest = { ...request, member: forgedMember, providers: forgedProviders };

    const scenarioResponse = await api.scenario({ method: "GET", body: undefined, headers: {} });
    expect((scenarioResponse.body as { data: DemoScenario }).data.scenario_id).toBe(scenario.scenario_id);

    const response = await api.care_plan({
      method: "POST",
      headers: {},
      body: forgedRequest,
    });

    expect(response.status).toBe(200);
    const requestId = responseMeta(response).request_id;
    const stored = repository.results.get(requestId);
    expect(stored?.result).toEqual(responseData(response));
    expect(stored?.registryVersion).toBe(loadRegistry().registry_version);
    expect(stored?.request.member.member_id).toBe(scenario.member.member_id);
    expect(stored?.request.member.plan_key).toEqual(scenario.member.plan_key);
    expect(stored?.request.member.accumulators).toEqual(scenario.member.accumulators);
    expect(stored?.request.member.pending_claims).toEqual(scenario.member.pending_claims);
    expect(stored?.request.member.procedure_history).toEqual(scenario.member.procedure_history);
    expect(stored?.request.member.secondary_coverage).toEqual(scenario.member.secondary_coverage);
    expect(stored?.request.member.funding_accounts).toEqual(scenario.member.funding_accounts);
    expect(stored?.request.member.budget).toEqual(forgedRequest.member.budget);
    expect(stored?.request.member.availability).toEqual(forgedRequest.member.availability);
    expect(stored?.request.member.travel).toEqual(forgedRequest.member.travel);
    expect(stored?.request.providers).toEqual(scenario.providers_postvisit);

    const replay = await api.care_plan({ method: "POST", headers: { "x-request-id": requestId }, body: forgedRequest });
    expect(replay.status).toBe(200);
    expect(repository.results.size).toBe(1);
  });

  it("rejects an id collision when the effective request changes", async () => {
    const scenario = loadDemoScenario();
    const repository = new MemoryRepository(loadRegistry(), scenario);
    const api = await createRuntimeHandlers(repository);
    const request = carePlanRequest(scenario);

    const first = await api.care_plan({ method: "POST", headers: { "x-request-id": "collision-check" }, body: request });
    expect(first.status).toBe(200);
    const changed = { ...request, member: { ...request.member, budget: { ...request.member.budget, hard_monthly_limit_cents: 1 } } };
    const second = await api.care_plan({ method: "POST", headers: { "x-request-id": "collision-check" }, body: changed });
    expect(second.status).toBe(400);
    expect(second.body).toMatchObject({ ok: false, error: { code: "INVALID_REQUEST" }, meta: { request_id: "collision-check" } });
  });

  it("uses canonical member facts and providers for passport, visit, and explain", async () => {
    const scenario = loadDemoScenario();
    const repository = new MemoryRepository(loadRegistry(), scenario);
    const api = await createRuntimeHandlers(repository);
    const request = carePlanRequest(scenario);
    const forgedMember = {
      ...structuredClone(request.member),
      member_id: "forged-member",
      plan_key: { ...request.member.plan_key, plan_option_id: "ppo-value" },
      accumulators: [],
      pending_claims: [],
      procedure_history: [],
      funding_accounts: [],
    };
    const forgedProviders = request.providers.map((provider) => ({ ...provider, name: "Forged Provider" }));
    const forgedVisitProviders = scenario.providers_previsit.map((provider) => ({ ...provider, name: "Forged Provider" }));
    const canonicalPassport = await api.passport({ method: "POST", headers: { "x-request-id": "passport-canonical" }, body: { as_of: scenario.postvisit_as_of, member: scenario.member } });
    const forgedPassport = await api.passport({ method: "POST", headers: { "x-request-id": "passport-forged" }, body: { as_of: scenario.postvisit_as_of, member: forgedMember } });
    expect(forgedPassport.status).toBe(200);
    expect((forgedPassport.body as { data: unknown }).data).toEqual((canonicalPassport.body as { data: unknown }).data);

    const visitBody = {
      as_of: scenario.previsit_as_of,
      member: scenario.member,
      providers: scenario.providers_previsit,
      visit: { intent: "new_concern" as const, expected_codes: ["D0140" as const], symptoms: { severe_pain: false, swelling: false, trauma: false, bleeding: false, fever: false } },
      known_procedures: [],
      max_options: 3,
    };
    const forgedVisitBody = { ...visitBody, member: forgedMember, providers: forgedVisitProviders };
    const canonicalVisit = await api.visit_navigator({ method: "POST", headers: { "x-request-id": "visit-canonical" }, body: visitBody });
    const forgedVisit = await api.visit_navigator({ method: "POST", headers: { "x-request-id": "visit-forged" }, body: forgedVisitBody });
    expect(forgedVisit.status).toBe(200);
    expect((forgedVisit.body as { data: unknown }).data).toEqual((canonicalVisit.body as { data: unknown }).data);

    const canonicalExplain = await api.explain({ method: "POST", headers: { "x-request-id": "explain-canonical" }, body: { result_kind: "care_plan", request, focus_id: null } });
    const forgedExplain = await api.explain({ method: "POST", headers: { "x-request-id": "explain-forged" }, body: { result_kind: "care_plan", request: { ...request, member: forgedMember, providers: forgedProviders }, focus_id: null } });
    expect(forgedExplain.status).toBe(200);
    expect((forgedExplain.body as { data: unknown }).data).toEqual((canonicalExplain.body as { data: unknown }).data);
  });

  it("fails the request when durable result storage fails", async () => {
    const scenario = loadDemoScenario();
    const repository = new MemoryRepository(loadRegistry(), scenario);
    repository.saveCarePlanResult = async () => {
      throw new Error("storage unavailable");
    };
    const api = await createRuntimeHandlers(repository);

    const response = await api.care_plan({
      method: "POST",
      headers: { "x-request-id": "integration-db-failure" },
      body: carePlanRequest(scenario),
    });

    expect(response.status).toBe(500);
    expect(response.body).toMatchObject({ ok: false, error: { code: "INTERNAL" }, meta: { request_id: "integration-db-failure" } });
  });

  it("rejects unknown canonical providers consistently for visit, care plan, and explain", async () => {
    const scenario = loadDemoScenario();
    const repository = new MemoryRepository(loadRegistry(), scenario);
    const api = await createRuntimeHandlers(repository);
    const unknownProvider = { ...scenario.providers_postvisit[0]!, provider_id: "provider-not-in-scenario" };
    const careRequest = { ...carePlanRequest(scenario), providers: [unknownProvider] };
    const visitRequest = {
      as_of: scenario.previsit_as_of,
      member: scenario.member,
      providers: [{ ...scenario.providers_previsit[0]!, provider_id: "provider-not-in-scenario" }],
      visit: { intent: "new_concern" as const, expected_codes: ["D0140" as const], symptoms: { severe_pain: false, swelling: false, trauma: false, bleeding: false, fever: false } },
      known_procedures: [],
      max_options: 3,
    };
    const requests = [
      api.visit_navigator({ method: "POST", headers: { "x-request-id": "unknown-visit" }, body: visitRequest }),
      api.care_plan({ method: "POST", headers: { "x-request-id": "unknown-care" }, body: careRequest }),
      api.explain({
        method: "POST",
        headers: { "x-request-id": "unknown-explain" },
        body: { result_kind: "care_plan" as const, request: careRequest, focus_id: null },
      }),
    ];
    const responses = await Promise.all(requests);
    expect(responses.map((response) => response.status)).toEqual([400, 400, 400]);
    expect(responses.map((response) => (response.body as { error: { code: string } }).error.code)).toEqual([
      "INVALID_REQUEST",
      "INVALID_REQUEST",
      "INVALID_REQUEST",
    ]);
  });
});
