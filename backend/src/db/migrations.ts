import { MongoServerError, type Db } from "mongodb";
import { COLLECTIONS } from "./collections";

type Migration = { version: number; name: string; apply(db: Db): Promise<void> };

const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    name: "canonical-runtime-collections",
    async apply(db) {
      await Promise.all([
        db.collection(COLLECTIONS.datasets).createIndex({ dataset_id: 1 }, { unique: true }),
        db.collection(COLLECTIONS.registries).createIndex({ dataset_id: 1, registry_version: 1 }, { unique: true }),
        db.collection(COLLECTIONS.scenarios).createIndex({ dataset_id: 1, scenario_id: 1 }, { unique: true }),
        db.collection(COLLECTIONS.carePlanResults).createIndex({ dataset_id: 1, request_id: 1 }, { unique: true }),
        db.collection(COLLECTIONS.carePlanResults).createIndex({ dataset_id: 1, created_at: -1 }),
      ]);
    },
  },
];

/** Ordered, forward-only Mongo schema migrations. Existing versions are never rewritten. */
export async function migrateDatabase(db: Db): Promise<void> {
  await db.collection(COLLECTIONS.migrations).createIndex({ version: 1 }, { unique: true });
  const applied = new Set((await db.collection(COLLECTIONS.migrations).find({}, { projection: { version: 1 } }).toArray()).map((m) => m.version));
  for (const migration of MIGRATIONS) {
    if (applied.has(migration.version)) continue;
    await migration.apply(db);
    try {
      await db.collection(COLLECTIONS.migrations).insertOne({
        version: migration.version,
        name: migration.name,
        applied_at: new Date(),
      });
    } catch (error) {
      // Two processes may both observe a missing migration and both apply the
      // current index-only migration. The unique ledger insert is the only
      // expected race; all other errors must still fail startup.
      if (!(error instanceof MongoServerError) || error.code !== 11000) throw error;
    }
  }
}
