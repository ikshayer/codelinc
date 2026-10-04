# Dental optimizer backend

This folder is the backend boundary for the project. It contains the shared
domain contracts, deterministic benefits and optimization engines,
framework-independent API/AI modules, synthetic/reference data, fixtures,
tests, verification scripts, and backend documentation.

The Next.js frontend remains at the repository root under `src/app`. It should
communicate with this backend through HTTP; client code must not import the
benefits engine, optimizer, plan registry, fixtures, or raw payer data.

## Current status

- Contract v1.1.0 is frozen and synthetic-only.
- The optimizer implementation and its fabricated before/after unit tests are
  present.
- Benefits, API, and AI entry points are still incomplete stubs.
- The production insurance-ID design is proposed v2 work and does not alter v1.

## Quick start

```bash
cd backend
npm install
npm run check:frozen
npm run typecheck
npm test
```

Run `npm run verify` for every backend gate. The acceptance suite will remain
red until the unfinished benefits, API, and AI modules are implemented.

## Layout

```text
src/domain/       frozen Zod contracts and ports
src/benefits/     plan registry and benefit adjudication
src/optimizer/    visit navigator and care-plan optimizer
src/api/          framework-independent API handlers
src/ai/           extraction and explanation adapters
data/             plan sources and quarantined reference package
fixtures/         synthetic inputs, golden answers, mock responses
tests/            contracts, optimizer, acceptance, integration
scripts/          freeze, golden, and fixture tooling
docs/             contract, workflow, architecture, and delivery plan
```

Start with the [production architecture plan](docs/production-architecture-plan.md)
and the [frozen v1 contract](docs/contracts/CONTRACT-v1.md).
