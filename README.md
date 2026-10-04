# CareWindow / Dental Payment & Scheduling Optimizer

The root package contains the Next.js frontend. The `backend/` package owns
MongoDB, synthetic data, the read-only demo API, frozen v1.1 contracts, and optimizer.

## Setup

Run from the repository root with Node 22 (see `.nvmrc`):

```sh
npm install
npm --prefix backend ci
npm --prefix backend run dev:api
```

In a second terminal:

```sh
npm run dev
```

MongoDB commands run from `backend/`:

```sh
npm --prefix backend run db:verify
```

Configure `MONGODB_URI` and `MONGODB_DB` in `backend/.env` using
`backend/.env.example`. For existing local installs the backend also checks
`frontend/.env` and root `.env`; environment variables take precedence. The
frontend calls the backend through `BACKEND_BASE_URL` (default port 3001).
MongoDB Atlas is the supported database deployment. Never commit credentials.

## Data and backend contracts

The raw demo package is not checked in; MongoDB is the source of truth. Server-side MongoDB helpers live in `backend/src/db/`; query helpers
include `getDemoDataset`, `findPlanVersion`, and `findLatestMemberSnapshot`.
Collections contain plans, member snapshots, provider/price snapshots, normalized
providers and quotes, claims, appointments, procedure cards, expected results,
scenario fixtures, source documents, and dataset manifests.

The backend now reads MongoDB through `GET /api/demo`,
`GET /api/demo/health`, `GET /api/demo/providers`, and
`GET /api/demo/members/:id`; Next.js proxies those paths. The backend's frozen
optimizer uses a different Northwind scenario and v1.1 schema. MongoDB data
still needs a validated adapter before that optimizer can price it.

The backend's v1.1 benefits, calculation API, and AI entry points are currently stubs; their
acceptance tests fail until those implementations land. This merge supplies the
optimizer and scaffold, not a completed end-to-end product.

## Checks

```sh
npm run typecheck
npm run lint
npm test                 # backend data checks and optimizer tests
npm run test:contracts
npm run check:frozen
npm run golden:check
npm run backend:typecheck
npm run backend:lint
npm run test:acceptance  # currently exposes upstream stubs
npm run build
```

Backend details: [backend/README.md](backend/README.md).
