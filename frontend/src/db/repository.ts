import type { Document } from "mongodb";
import { COLLECTIONS, DEMO_DATASET_ID } from "./collections.js";
import { getDatabase } from "./client.js";

function withoutMongoId<T extends Document>(document: T | null): Omit<T, "_id"> | null {
  if (!document) return null;
  const { _id: _discarded, ...value } = document;
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
