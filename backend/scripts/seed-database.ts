import { loadDemoScenario } from "../src/api/index";
import { loadRegistry } from "../src/benefits/index";
import { closeDatabase, getDatabase, migrateDatabase, MongoCareWindowRepository } from "../src/db/index";

try {
  const db = getDatabase();
  await migrateDatabase(db);
  const repository = new MongoCareWindowRepository(db);
  await repository.seedCanonical(loadRegistry(), loadDemoScenario());
  console.log("Canonical synthetic CareWindow dataset seeded.");
} finally {
  await closeDatabase();
}
