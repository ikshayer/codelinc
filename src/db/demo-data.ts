import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { DEMO_DATASET_ID } from "./collections.js";

const objectDocument = z.object({
  schema_version: z.string(),
  synthetic_demo: z.literal(true),
}).passthrough();

const planRegistrySchema = objectDocument.extend({
  dataset_id: z.string(),
  currency: z.string(),
  money_unit: z.string(),
  rate_unit: z.string(),
  source: z.object({
    source_id: z.string(),
  }).passthrough(),
  shared_rules: z.record(z.string(), z.unknown()),
  plans: z.array(z.object({
    plan_id: z.string(),
    plan_version_id: z.string(),
  }).passthrough()).min(1),
});

const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../data/dental_demo_data_package",
);

async function readJson(relativePath: string): Promise<unknown> {
  return JSON.parse(await readFile(path.join(packageRoot, relativePath), "utf8"));
}

export type DentalDemoImport = Awaited<ReturnType<typeof loadDentalDemoPackage>>;

export async function loadDentalDemoPackage() {
  const [registryRaw, memberRaw, providersRaw, pricesRaw, cardRaw, resultRaw, scenariosRaw, sourceText] =
    await Promise.all([
      readJson("plan-registry/demo_plans.json"),
      readJson("member-snapshots/demo_member.json"),
      readJson("providers/demo_providers.json"),
      readJson("pricing/demo_dental_prices.json"),
      readJson("procedure-cards/demo_procedure_card.json"),
      readJson("expected-output/demo_optimization_result.json"),
      readJson("test-fixtures/golden_scenarios.json"),
      readFile(path.join(packageRoot, "sources/SYNTHETIC_DEMO_BENEFIT_SCHEDULE.md"), "utf8"),
    ]);

  const registry = planRegistrySchema.parse(registryRaw);
  if (registry.dataset_id !== DEMO_DATASET_ID) {
    throw new Error(`Unexpected dataset_id: ${registry.dataset_id}`);
  }

  const member = objectDocument.extend({
    member_snapshot_id: z.string(),
    member_id: z.string(),
    plan_version_id: z.string(),
  }).parse(memberRaw);
  const providers = objectDocument.extend({ provider_snapshot_id: z.string() }).parse(providersRaw);
  const prices = objectDocument.extend({ price_snapshot_id: z.string() }).parse(pricesRaw);
  const procedureCard = objectDocument.extend({ procedure_card_id: z.string(), member_id: z.string() }).parse(cardRaw);
  const optimizationResult = objectDocument.extend({ optimization_result_id: z.string() }).parse(resultRaw);
  const goldenScenarios = objectDocument.extend({ scenarios: z.array(z.object({ scenario_id: z.string() }).passthrough()) }).parse(scenariosRaw);

  return { registry, member, providers, prices, procedureCard, optimizationResult, goldenScenarios, sourceText };
}
