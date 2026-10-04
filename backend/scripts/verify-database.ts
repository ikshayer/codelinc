import { CarePlanBody, type CarePlanResult } from "../src/domain/index";
import { loadDemoScenario } from "../src/api/index";
import { createRuntimeHandlers } from "../src/api/runtime";
import { loadRegistry } from "../src/benefits/index";
import {
  CANONICAL_DATASET_ID,
  CarePlanRequestCollisionError,
  closeDatabase,
  COLLECTIONS,
  getDatabase,
  migrateDatabase,
  MongoCareWindowRepository,
} from "../src/db/index";
import proceduresJson from "../fixtures/synthetic/procedures.confirmed.json";

try {
  const db = getDatabase();
  await migrateDatabase(db);
  await migrateDatabase(db);
  const repository = new MongoCareWindowRepository(db);
  const registry = loadRegistry();
  const scenario = loadDemoScenario();
  await repository.seedCanonical(registry, scenario);
  await repository.seedCanonical(registry, scenario);
  const [storedRegistry, storedScenario, registryCount, scenarioCount] = await Promise.all([
    repository.loadRegistry(),
    repository.loadScenario(),
    db.collection(COLLECTIONS.registries).countDocuments({ dataset_id: CANONICAL_DATASET_ID, registry_version: registry.registry_version }),
    db.collection(COLLECTIONS.scenarios).countDocuments({ dataset_id: CANONICAL_DATASET_ID, scenario_id: scenario.scenario_id }),
  ]);
  if (storedRegistry.registry_version !== registry.registry_version || storedScenario.scenario_id !== scenario.scenario_id) throw new Error("Database round trip changed canonical IDs.");
  if (registryCount !== 1 || scenarioCount !== 1) throw new Error("Database seed is not idempotent.");

  const requestId = `db-verify-${storedRegistry.registry_version.replace(/[^A-Za-z0-9-]/g, "-")}`;
  const api = await createRuntimeHandlers(repository);
  const carePlanRequest = CarePlanBody.parse({
    as_of: storedScenario.postvisit_as_of,
    member: storedScenario.member,
    providers: storedScenario.providers_postvisit,
    procedures: proceduresJson,
    planning_horizon_end: storedScenario.planning_horizon_end,
    max_alternatives: 3,
  });
  const result = await api.care_plan({
    method: "POST",
    headers: { "x-request-id": requestId },
    body: carePlanRequest,
  });
  if (result.status !== 200) throw new Error("API-to-database care-plan round trip returned a non-success response.");
  const resultData = (result.body as { data: CarePlanResult }).data;
  const replay = await api.care_plan({ method: "POST", headers: { "x-request-id": requestId }, body: carePlanRequest });
  if (replay.status !== 200 || JSON.stringify((replay.body as { data: CarePlanResult }).data) !== JSON.stringify(resultData)) {
    throw new Error("Same request id was not idempotent.");
  }

  let collision = false;
  try {
    await repository.saveCarePlanResult(
      requestId,
      { ...carePlanRequest, max_alternatives: 2 },
      resultData,
      storedRegistry.registry_version,
    );
  } catch (error) {
    // tsx path aliases can load the same error class through two module URLs;
    // retain the typed check and accept the stable error name across that boundary.
    collision =
      error instanceof CarePlanRequestCollisionError ||
      (error instanceof Error && error.name === "CarePlanRequestCollisionError");
    if (!collision) throw error;
  }
  if (!collision) throw new Error("A request-id collision was allowed to overwrite the stored result.");

  const storedResult = await db.collection(COLLECTIONS.carePlanResults).findOne({ dataset_id: CANONICAL_DATASET_ID, request_id: requestId });
  if (
    !storedResult ||
    storedResult.registry_version !== storedRegistry.registry_version ||
    typeof storedResult.request_sha256 !== "string" ||
    !/^[a-f0-9]{64}$/.test(storedResult.request_sha256) ||
    typeof storedResult.result_sha256 !== "string" ||
    !/^[a-f0-9]{64}$/.test(storedResult.result_sha256)
  ) {
    throw new Error("Persisted care-plan audit metadata is incomplete.");
  }
  const resultCount = await db.collection(COLLECTIONS.carePlanResults).countDocuments({ dataset_id: CANONICAL_DATASET_ID, request_id: requestId });
  if (resultCount !== 1) throw new Error("API-to-database care-plan round trip is not idempotent.");
  console.log(`Database verified: ${storedRegistry.plans.length} plan versions, scenario ${storedScenario.scenario_id}, one idempotent persisted care plan with audit hashes.`);
} finally {
  await closeDatabase();
}
