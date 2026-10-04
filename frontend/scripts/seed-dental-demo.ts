import { closeDatabase, getDatabase } from "../src/db/client.js";
import { seedDentalDemo } from "../src/db/seed.js";

try {
  const summary = await seedDentalDemo(getDatabase());
  console.log("Dental demo data seeded successfully:", summary);
} catch (error) {
  console.error("Dental demo seed failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await closeDatabase();
}
