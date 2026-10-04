# CareWindow / Dental Payment & Scheduling Optimizer

The root package contains the Next.js scaffold and MongoDB data tools. The
standalone `backend/` package contains the frozen v1.1 contracts and optimizer.

## Setup

Run from the repository root with Node 22 (see `.nvmrc`):

```sh
npm install
npm --prefix backend ci
npm run dev
```

MongoDB commands also run from the root:

```sh
npm run data:generate
npm run db:seed
npm run db:verify
```

Configure `MONGODB_URI` and `MONGODB_DB` in root `.env` using `.env.example`.
The database scripts also accept the existing `frontend/.env` when root `.env`
does not exist. Existing process environment variables take precedence. Never
commit credentials. Docker Compose is optional for local MongoDB; Atlas uses the
same connection setting. Seeding writes synthetic data to the configured database
and prunes obsolete records scoped to the expanded synthetic dataset.

## Data and backend contracts

`data/dental_demo_data_package/` retains the original three-plan fixture and its
expanded population. Server-side MongoDB helpers live in `src/db/`; query helpers
include `getDemoDataset`, `findPlanVersion`, and `findLatestMemberSnapshot`.
Collections contain plans, member snapshots, provider/price snapshots, normalized
providers and quotes, claims, appointments, procedure cards, expected results,
scenario fixtures, source documents, and dataset manifests.

The backend uses a different Northwind scenario and frozen v1.1 schema. The
MongoDB package is not yet an input adapter for that optimizer. Its expected
results must not be substituted for the backend's golden answers. See
[import notes](backend/data/reference/dental-demo-data-package-v1/IMPORT-NOTES.md).

The backend's benefits, API, and AI entry points are currently stubs; their
acceptance tests fail until those implementations land. This merge supplies the
optimizer and scaffold, not a completed end-to-end product.

## Checks

```sh
npm run typecheck
npm run lint
npm test                 # MongoDB fixture checks and backend optimizer tests
npm run test:contracts
npm run check:frozen
npm run golden:check
npm run backend:typecheck
npm run backend:lint
npm run test:acceptance  # currently exposes upstream stubs
npm run build
```

Backend details: [backend/README.md](backend/README.md).
