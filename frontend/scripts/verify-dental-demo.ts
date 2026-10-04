import { closeDatabase } from "../src/db/client.js";
import { getDemoDataset } from "../src/db/repository.js";
import { COLLECTIONS, EXPANDED_DEMO_DATASET_ID } from "../src/db/collections.js";
import { getDatabase } from "../src/db/client.js";
import { generateExpandedDemoData } from "../src/db/expanded-demo.js";

try {
  const data = await getDemoDataset();
  if (!data) throw new Error("Demo dataset is not seeded");
  if (!data.member || !data.providers || !data.prices || !data.procedureCard || !data.expectedResult) {
    throw new Error("Demo dataset is incomplete");
  }
  const db = getDatabase();
  const expected = generateExpandedDemoData();
  const expandedManifest = await db.collection(COLLECTIONS.datasets).findOne({ dataset_id: EXPANDED_DEMO_DATASET_ID });
  if (!expandedManifest || expandedManifest.status !== "ready") throw new Error("Expanded dataset is not marked ready");
  if (expandedManifest.checksum_sha256 !== expected.manifest.checksum_sha256) throw new Error("Expanded dataset checksum does not match the generator");
  const expectedCounts = expected.manifest.counts as Record<string, number>;
  const actualCounts = {
    members: await db.collection(COLLECTIONS.memberSnapshots).countDocuments({ dataset_id: EXPANDED_DEMO_DATASET_ID }),
    providers: await db.collection(COLLECTIONS.providers).countDocuments({ dataset_id: EXPANDED_DEMO_DATASET_ID }),
    priceQuotes: await db.collection(COLLECTIONS.priceQuotes).countDocuments({ dataset_id: EXPANDED_DEMO_DATASET_ID }),
    claims: await db.collection(COLLECTIONS.claims).countDocuments({ dataset_id: EXPANDED_DEMO_DATASET_ID }),
    appointments: await db.collection(COLLECTIONS.appointments).countDocuments({ dataset_id: EXPANDED_DEMO_DATASET_ID }),
    procedureCards: await db.collection(COLLECTIONS.procedureCards).countDocuments({ dataset_id: EXPANDED_DEMO_DATASET_ID }),
  };
  for (const [collection, expectedCount] of Object.entries(expectedCounts)) {
    if (actualCounts[collection as keyof typeof actualCounts] !== expectedCount) {
      throw new Error(`${collection} count mismatch: expected ${expectedCount}, found ${actualCounts[collection as keyof typeof actualCounts]}`);
    }
  }
  console.log("Dental demo database verified:", {
    datasetId: data.dataset!.dataset_id,
    plans: data.plans.length,
    memberId: data.member.member_id,
    optimizationResultId: data.expectedResult.optimization_result_id,
    expandedDatasetId: EXPANDED_DEMO_DATASET_ID,
    expandedCounts: actualCounts,
    expandedChecksum: expected.manifest.checksum_sha256,
  });
} catch (error) {
  console.error("Dental demo verification failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await closeDatabase();
}
