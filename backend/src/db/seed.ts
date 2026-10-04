import type { AnyBulkWriteOperation, Db, Document } from "mongodb";
import { COLLECTIONS, DEMO_DATASET_ID, EXPANDED_DEMO_DATASET_ID } from "./collections.js";
import { generateExpandedDemoData, validateExpandedDemoData } from "./expanded-demo.js";

const importedAt = () => new Date();

function replaceBy(key: string, documents: Document[], datasetId = DEMO_DATASET_ID): AnyBulkWriteOperation<Document>[] {
  return documents.map((document) => ({
    replaceOne: {
      filter: { [key]: document[key] },
      replacement: { ...document, dataset_id: datasetId, imported_at: importedAt() },
      upsert: true,
    },
  }));
}

async function pruneMissing(db: Db, collection: string, key: string, documents: Document[]): Promise<void> {
  const currentIds = documents.map((document) => document[key]);
  await db.collection(collection).deleteMany({
    dataset_id: EXPANDED_DEMO_DATASET_ID,
    [key]: { $nin: currentIds },
  });
}

export async function ensureDentalIndexes(db: Db): Promise<void> {
  await Promise.all([
    db.collection(COLLECTIONS.datasets).createIndex({ dataset_id: 1 }, { unique: true }),
    db.collection(COLLECTIONS.plans).createIndex({ plan_version_id: 1 }, { unique: true }),
    db.collection(COLLECTIONS.plans).createIndex({ effective_from: 1, effective_to: 1 }),
    db.collection(COLLECTIONS.memberSnapshots).createIndex({ member_snapshot_id: 1 }, { unique: true }),
    db.collection(COLLECTIONS.memberSnapshots).createIndex({ member_id: 1, observed_at: -1 }),
    db.collection(COLLECTIONS.providerSnapshots).createIndex({ provider_snapshot_id: 1 }, { unique: true }),
    db.collection(COLLECTIONS.providers).createIndex({ provider_id: 1 }, { unique: true }),
    db.collection(COLLECTIONS.providers).createIndex({ "address.postal_code": 1, specialties: 1 }),
    db.collection(COLLECTIONS.priceSnapshots).createIndex({ price_snapshot_id: 1 }, { unique: true }),
    db.collection(COLLECTIONS.priceQuotes).createIndex({ price_quote_id: 1 }, { unique: true }),
    db.collection(COLLECTIONS.priceQuotes).createIndex({ provider_id: 1, cdt: 1 }),
    db.collection(COLLECTIONS.claims).createIndex({ claim_id: 1 }, { unique: true }),
    db.collection(COLLECTIONS.claims).createIndex({ member_id: 1, service_date: -1 }),
    db.collection(COLLECTIONS.claims).createIndex({ status: 1, service_date: -1 }),
    db.collection(COLLECTIONS.appointments).createIndex({ appointment_id: 1 }, { unique: true }),
    db.collection(COLLECTIONS.appointments).createIndex({ provider_id: 1, start: 1, status: 1 }),
    db.collection(COLLECTIONS.procedureCards).createIndex({ procedure_card_id: 1 }, { unique: true }),
    db.collection(COLLECTIONS.optimizationResults).createIndex({ optimization_result_id: 1 }, { unique: true }),
    db.collection(COLLECTIONS.goldenScenarios).createIndex({ scenario_id: 1 }, { unique: true }),
    db.collection(COLLECTIONS.sourceDocuments).createIndex({ source_id: 1 }, { unique: true }),
  ]);
}

export async function seedExpandedDemo(db: Db) {
  const expanded = generateExpandedDemoData();
  const expandedErrors = validateExpandedDemoData(expanded);
  if (expandedErrors.length > 0) {
    throw new Error(`Expanded demo data is invalid: ${expandedErrors.slice(0, 10).join("; ")}`);
  }
  await ensureDentalIndexes(db);

  await db.collection(COLLECTIONS.datasets).updateOne(
    { dataset_id: EXPANDED_DEMO_DATASET_ID },
    {
      $set: {
        dataset_id: EXPANDED_DEMO_DATASET_ID,
        status: "importing",
        import_run_id: expanded.manifest.checksum_sha256,
        import_started_at: importedAt(),
        synthetic_demo: true,
      },
    },
    { upsert: true },
  );

  await Promise.all([
    db.collection(COLLECTIONS.memberSnapshots).bulkWrite(replaceBy("member_snapshot_id", expanded.members, EXPANDED_DEMO_DATASET_ID)),
    db.collection(COLLECTIONS.providers).bulkWrite(replaceBy("provider_id", expanded.providers, EXPANDED_DEMO_DATASET_ID)),
    db.collection(COLLECTIONS.priceQuotes).bulkWrite(replaceBy("price_quote_id", expanded.priceQuotes, EXPANDED_DEMO_DATASET_ID)),
    db.collection(COLLECTIONS.claims).bulkWrite(replaceBy("claim_id", expanded.claims, EXPANDED_DEMO_DATASET_ID)),
    db.collection(COLLECTIONS.appointments).bulkWrite(replaceBy("appointment_id", expanded.appointments, EXPANDED_DEMO_DATASET_ID)),
    db.collection(COLLECTIONS.procedureCards).bulkWrite(replaceBy("procedure_card_id", expanded.procedureCards, EXPANDED_DEMO_DATASET_ID)),
  ]);

  await Promise.all([
    pruneMissing(db, COLLECTIONS.memberSnapshots, "member_snapshot_id", expanded.members),
    pruneMissing(db, COLLECTIONS.providers, "provider_id", expanded.providers),
    pruneMissing(db, COLLECTIONS.priceQuotes, "price_quote_id", expanded.priceQuotes),
    pruneMissing(db, COLLECTIONS.claims, "claim_id", expanded.claims),
    pruneMissing(db, COLLECTIONS.appointments, "appointment_id", expanded.appointments),
    pruneMissing(db, COLLECTIONS.procedureCards, "procedure_card_id", expanded.procedureCards),
  ]);

  await db.collection(COLLECTIONS.datasets).replaceOne(
    { dataset_id: EXPANDED_DEMO_DATASET_ID },
    {
      ...expanded.manifest,
      status: "ready",
      import_run_id: expanded.manifest.checksum_sha256,
      imported_at: importedAt(),
    },
    { upsert: true },
  );

  return {
    datasetId: EXPANDED_DEMO_DATASET_ID,
    expanded: expanded.manifest.counts,
    expandedChecksum: expanded.manifest.checksum_sha256,
  };
}
