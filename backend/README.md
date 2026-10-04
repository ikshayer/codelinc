# Dental optimizer backend

This folder is the backend boundary for the project. It contains MongoDB access,
the synthetic dental dataset and read-only demo API, as well as shared
domain contracts, deterministic benefits and optimization engines,
framework-independent API/AI modules, synthetic/reference data, fixtures,
tests, verification scripts, and backend documentation.

The Next.js frontend remains at the repository root under `src/app`. It should
communicate with this backend through HTTP; client code must not import the
benefits engine, optimizer, plan registry, fixtures, or raw payer data.

## Current status

- Contract v1.1.0 is frozen and synthetic-only.
- MongoDB serves synthetic plans, members, claims, treatment cards, and providers
  through `npm run dev:api` on port 3001.
- The optimizer implementation and its fabricated before/after unit tests are
  present.
- Benefits, API, and AI entry points are still incomplete stubs.
- The production insurance-ID design is proposed v2 work and does not alter v1.

## Quick start

```bash
cd backend
npm install
npm run db:verify
npm run dev:api
npm run check:frozen
npm run typecheck
npm test
```

Run `npm run verify` for every backend gate. The acceptance suite will remain
red until the unfinished benefits, API, and AI modules are implemented.

Copy `.env.example` to `.env` and set the MongoDB URI. `npm run db:verify` checks the
already-imported MongoDB dataset; raw seed files are not checked into the repository.
The API exposes `GET /api/demo`, `/api/demo/health`, `/api/demo/providers`, and
`/api/demo/members/:id`. These routes query MongoDB. The optimizer's Northwind
contract is separate; the dental package requires the mapping described in
before financial calculations can use it.

## Layout

```text
src/domain/       frozen Zod contracts and ports
src/db/           MongoDB client, repository, indexes, synthetic generator
src/benefits/     plan registry and benefit adjudication
src/optimizer/    visit navigator and care-plan optimizer
src/api/          framework-independent API handlers
data/sources/     authoritative source summaries
fixtures/         synthetic inputs, golden answers, mock responses
tests/            contracts, optimizer, acceptance, integration
scripts/          freeze, golden, and fixture tooling
docs/             contract, workflow, architecture, and delivery plan
```

Start with the [production architecture plan](docs/production-architecture-plan.md)
and the [frozen v1 contract](docs/contracts/CONTRACT-v1.md).
