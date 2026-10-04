export const COLLECTIONS = {
  migrations: "schema_migrations",
  datasets: "datasets",
  registries: "plan_registries",
  scenarios: "demo_scenarios",
  carePlanResults: "care_plan_results",
  plans: "plans",
  memberSnapshots: "member_snapshots",
  providerSnapshots: "provider_snapshots",
  providers: "providers",
  priceSnapshots: "price_snapshots",
  priceQuotes: "price_quotes",
  claims: "claims",
  appointments: "appointments",
  procedureCards: "procedure_cards",
  optimizationResults: "optimization_results",
  goldenScenarios: "golden_scenarios",
  sourceDocuments: "source_documents",
} as const;

export const DEMO_DATASET_ID = "synthetic-dental-demo-2026-2027-v1";
export const EXPANDED_DEMO_DATASET_ID = "synthetic-dental-population-2026-v2";
export const CANONICAL_DATASET_ID = "northwind-synthetic-carewindow-v1";
