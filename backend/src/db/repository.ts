import { createHash } from "node:crypto";
import { MongoServerError, type Db, type Document } from "mongodb";
import {
  CarePlanBody,
  CarePlanResult,
  DemoScenario,
  PlanRegistry,
  type CarePlanRequest,
  type DemoScenario as DemoScenarioType,
  type PlanRegistry as PlanRegistryType,
} from "@/domain";
import { CANONICAL_DATASET_ID, COLLECTIONS, DEMO_DATASET_ID } from "./collections.js";
import { getDatabase } from "./client.js";

function withoutMongoId<T extends Document>(document: T | null): Omit<T, "_id"> | null {
  if (!document) return null;
  const { _id: _discarded, ...value } = document;
  void _discarded;
  return value;
}

export async function findPlanVersion(planVersionId: string) {
  const document = await getDatabase().collection(COLLECTIONS.plans).findOne({
    plan_version_id: planVersionId,
  });
  return withoutMongoId(document);
}

export async function findLatestMemberSnapshot(memberId: string) {
  const document = await getDatabase().collection(COLLECTIONS.memberSnapshots).findOne(
    { member_id: memberId },
    { sort: { observed_at: -1 } },
  );
  return withoutMongoId(document);
}

export async function getDemoDataset() {
  const db = getDatabase();
  const dataset = await db.collection(COLLECTIONS.datasets).findOne({ dataset_id: DEMO_DATASET_ID });
  if (!dataset) return null;

  const [plans, member, providers, prices, procedureCard, expectedResult] = await Promise.all([
    db.collection(COLLECTIONS.plans).find({ dataset_id: DEMO_DATASET_ID }).sort({ option_tier: 1 }).toArray(),
    db.collection(COLLECTIONS.memberSnapshots).findOne({ dataset_id: DEMO_DATASET_ID }),
    db.collection(COLLECTIONS.providerSnapshots).findOne({ dataset_id: DEMO_DATASET_ID }),
    db.collection(COLLECTIONS.priceSnapshots).findOne({ dataset_id: DEMO_DATASET_ID }),
    db.collection(COLLECTIONS.procedureCards).findOne({ dataset_id: DEMO_DATASET_ID }),
    db.collection(COLLECTIONS.optimizationResults).findOne({ dataset_id: DEMO_DATASET_ID }),
  ]);

  return {
    dataset: withoutMongoId(dataset),
    plans: plans.map((plan) => withoutMongoId(plan)),
    member: withoutMongoId(member),
    providers: withoutMongoId(providers),
    prices: withoutMongoId(prices),
    procedureCard: withoutMongoId(procedureCard),
    expectedResult: withoutMongoId(expectedResult),
  };
}

const checksum = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

export class CarePlanRequestCollisionError extends Error {
  constructor() {
    super("The request id is already associated with a different care-plan request.");
    this.name = "CarePlanRequestCollisionError";
  }
}

export class CarePlanResultIntegrityError extends Error {
  constructor() {
    super("The stored care-plan result does not match the request, registry, or result checksum.");
    this.name = "CarePlanResultIntegrityError";
  }
}

export interface CareWindowRepository {
  seedCanonical(registry: PlanRegistryType, scenario: DemoScenarioType): Promise<void>;
  loadRegistry(): Promise<PlanRegistryType>;
  loadScenario(): Promise<DemoScenarioType>;
  saveCarePlanResult(requestId: string, request: CarePlanRequest, result: unknown, registryVersion: string): Promise<void>;
}

export class MongoCareWindowRepository implements CareWindowRepository {
  constructor(private readonly db: Db) {}

  /** Idempotent synthetic seed. Stable IDs prevent duplicate records. */
  async seedCanonical(registry: PlanRegistryType, scenario: DemoScenarioType): Promise<void> {
    const registryHash = checksum(registry);
    const scenarioHash = checksum(scenario);
    await Promise.all([
      this.db.collection(COLLECTIONS.registries).replaceOne(
        { dataset_id: CANONICAL_DATASET_ID, registry_version: registry.registry_version },
        { dataset_id: CANONICAL_DATASET_ID, registry_version: registry.registry_version, checksum_sha256: registryHash, value: registry, synthetic: true },
        { upsert: true },
      ),
      this.db.collection(COLLECTIONS.scenarios).replaceOne(
        { dataset_id: CANONICAL_DATASET_ID, scenario_id: scenario.scenario_id },
        { dataset_id: CANONICAL_DATASET_ID, scenario_id: scenario.scenario_id, checksum_sha256: scenarioHash, value: scenario, synthetic: true },
        { upsert: true },
      ),
    ]);
    await this.db.collection(COLLECTIONS.datasets).replaceOne(
      { dataset_id: CANONICAL_DATASET_ID },
      { dataset_id: CANONICAL_DATASET_ID, status: "ready", registry_version: registry.registry_version, scenario_id: scenario.scenario_id, registry_checksum_sha256: registryHash, scenario_checksum_sha256: scenarioHash, synthetic: true },
      { upsert: true },
    );
  }

  async loadRegistry(): Promise<PlanRegistryType> {
    const dataset = await this.db.collection(COLLECTIONS.datasets).findOne({ dataset_id: CANONICAL_DATASET_ID, status: "ready" });
    if (!dataset || typeof dataset.registry_version !== "string" || typeof dataset.registry_checksum_sha256 !== "string") {
      throw new Error("Canonical dataset metadata is not seeded.");
    }
    const doc = await this.db.collection(COLLECTIONS.registries).findOne({ dataset_id: CANONICAL_DATASET_ID, registry_version: dataset.registry_version });
    if (!doc) throw new Error("Canonical plan registry is not seeded.");
    const parsed = PlanRegistry.parse(doc.value);
    if (checksum(parsed) !== doc.checksum_sha256 || doc.checksum_sha256 !== dataset.registry_checksum_sha256) {
      throw new Error("Stored plan registry checksum does not match its canonical value.");
    }
    return parsed;
  }

  async loadScenario(): Promise<DemoScenarioType> {
    const dataset = await this.db.collection(COLLECTIONS.datasets).findOne({ dataset_id: CANONICAL_DATASET_ID, status: "ready" });
    if (!dataset || typeof dataset.scenario_id !== "string" || typeof dataset.scenario_checksum_sha256 !== "string") {
      throw new Error("Canonical dataset metadata is not seeded.");
    }
    const doc = await this.db.collection(COLLECTIONS.scenarios).findOne({ dataset_id: CANONICAL_DATASET_ID, scenario_id: dataset.scenario_id });
    if (!doc) throw new Error("Canonical demo scenario is not seeded.");
    const parsed = DemoScenario.parse(doc.value);
    if (checksum(parsed) !== doc.checksum_sha256 || doc.checksum_sha256 !== dataset.scenario_checksum_sha256) {
      throw new Error("Stored scenario checksum does not match its canonical value.");
    }
    return parsed;
  }

  async saveCarePlanResult(requestId: string, request: CarePlanRequest, result: unknown, registryVersion: string): Promise<void> {
    const parsedRequest = CarePlanBody.parse(request);
    const parsed = CarePlanResult.parse(result);
    const requestHash = checksum(parsedRequest);
    const resultHash = checksum(parsed);
    const collection = this.db.collection(COLLECTIONS.carePlanResults);
    const record = {
      dataset_id: CANONICAL_DATASET_ID,
      request_id: requestId,
      registry_version: registryVersion,
      request_sha256: requestHash,
      result_sha256: resultHash,
      contract_version: parsed.contract_version,
      created_at: new Date(),
      synthetic: true,
      value: parsed,
    };

    const assertCompatible = (existing: {
      [key: string]: unknown;
      request_sha256?: unknown;
      result_sha256?: unknown;
      registry_version?: unknown;
    }) => {
      if (typeof existing.request_sha256 !== "string" || typeof existing.result_sha256 !== "string" || typeof existing.registry_version !== "string") {
        throw new CarePlanResultIntegrityError();
      }
      if (existing.request_sha256 !== requestHash) throw new CarePlanRequestCollisionError();
      try {
        if (checksum(CarePlanResult.parse(existing.value)) !== existing.result_sha256) throw new CarePlanResultIntegrityError();
      } catch (error) {
        if (error instanceof CarePlanResultIntegrityError) throw error;
        throw new CarePlanResultIntegrityError();
      }
      if (existing.result_sha256 !== resultHash || existing.registry_version !== registryVersion) throw new CarePlanResultIntegrityError();
    };

    const existing = await collection.findOne({ dataset_id: CANONICAL_DATASET_ID, request_id: requestId });
    if (existing) {
      assertCompatible(existing);
      return;
    }

    try {
      await collection.insertOne(record);
    } catch (error) {
      // A concurrent identical/different request may have won the unique-key
      // race. Re-read it and apply the same collision rules; never overwrite.
      if (!(error instanceof MongoServerError) || error.code !== 11000) throw error;
      const raced = await collection.findOne({ dataset_id: CANONICAL_DATASET_ID, request_id: requestId });
      if (!raced) throw error;
      assertCompatible(raced);
    }
  }
}
