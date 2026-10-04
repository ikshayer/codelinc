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

Run Claude Code sessions for backend work from `backend/`: `backend/.claude/`
holds the frozen-file guard hook, its settings and the agent definitions, and
they only load when `backend/` is the project directory.

```bash
cd backend
npm ci
npm run check:frozen
npm run typecheck
npm run test:contracts
npm test
```

The `/care-window` page calls the live engine (run `cd backend && npm run serve`;
Next proxies `/api/engine/*` to it). Backend contract v1.6.0 and the optimizer are in
place, and the Benefits, API, and AI modules are implemented; the acceptance and
integration suites pass.

Key references:

- [Production insurance-ID architecture](backend/docs/production-architecture-plan.md)
- [Frozen backend contract](backend/docs/contracts/CONTRACT-v1.md)
- [Frontend adapter contracts](frontend/docs/adapter-contracts.md)
- [Synthetic golden scenario](backend/docs/contracts/golden-scenario.md)
