# CareWindow

CareWindow is a dental-benefits planning demo with two independently installable
projects:

- [`frontend/`](frontend/README.md) — the Next.js member experience.
- [`backend/`](backend/README.md) — frozen domain contracts, deterministic
  benefits/optimization modules, API/AI boundaries, synthetic data, and tests.

> Synthetic data only. The current build is not medical, dental, insurance, or
> financial advice.

## Run the frontend

```bash
cd frontend
npm ci
npm run dev
```

## Verify the backend

```bash
cd backend
npm ci
npm run check:frozen
npm run typecheck
npm run test:contracts
npm test
```

The frontend currently uses demo adapters. Its live calculation adapter is not
yet connected to the backend. Backend contract v1.1.0 and the optimizer are in
place; the Benefits, API, and AI modules still need implementation before the
full acceptance suite can pass.

Key references:

- [Production insurance-ID architecture](backend/docs/production-architecture-plan.md)
- [Frozen backend contract](backend/docs/contracts/CONTRACT-v1.md)
- [Frontend adapter contracts](frontend/docs/adapter-contracts.md)
- [Synthetic golden scenario](backend/docs/contracts/golden-scenario.md)
