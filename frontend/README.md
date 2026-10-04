# CareWindow MongoDB data layer

The supplied dental demo package is checked into `../data/dental_demo_data_package` and imported into MongoDB as separate domain collections. All records are synthetic demo data.

The database contains two complementary datasets:

- The original one-member golden fixture, used for exact optimizer regression results.
- A deterministic expanded population used for realistic search, history, availability, uncertainty, and scale demonstrations.

## Start and seed locally

```bash
docker compose up -d mongodb
copy .env.example .env
npm install
npm run data:generate
npm run db:seed
npm run db:verify
```

The seed is idempotent: stable plan, snapshot, result, scenario, and source IDs are upserted rather than duplicated.

## Collections

- `datasets`: shared rules and package metadata
- `plans`: one document per plan version
- `member_snapshots`: member benefit/financial state
- `provider_snapshots`: network status, availability, and payment plans
- `providers`: normalized expanded provider locations
- `price_snapshots`: allowed amounts, charges, and cash quotes
- `price_quotes`: normalized location/CDT pricing records
- `claims`: paid, pending, denied, and reversed synthetic claims
- `appointments`: normalized provider appointment inventory
- `procedure_cards`: dentist-confirmed clinical inputs
- `optimization_results`: supplied expected result and audit trace
- `golden_scenarios`: one document per deterministic test fixture
- `source_documents`: authoritative synthetic benefit schedule and provenance

The expanded generator uses a fixed seed and validates unique IDs, foreign-key-style references, balanced claim amounts, member accumulator reconciliation, annual-maximum arithmetic, and affordability constraints before any database writes occur.

Use `getDemoDataset`, `findPlanVersion`, and `findLatestMemberSnapshot` from `src/db` in server-side application code. Do not import the MongoDB client into browser components, and do not expose `MONGODB_URI` through a public environment variable.
