# CareWindow

CareWindow is a dental-benefits planning demo with two independently installable projects:

- [`frontend/`](frontend/README.md) — the Next.js member experience.
- [`backend/`](backend/README.md) — MongoDB access, domain contracts, benefits, and optimization.

MongoDB Atlas is the database. Raw demo seed files are not checked into the repository.

## Run the frontend

```bash
cd frontend
npm ci
npm run dev
```

## Run the backend

Run Claude Code sessions for backend work from `backend/`: `backend/.claude/`
holds the frozen-file guard hook, its settings and the agent definitions, and
they only load when `backend/` is the project directory.

```bash
cd backend
npm ci
npm run dev:api
npm run db:verify
```

The `/care-window` page calls the live engine (run `cd backend && npm run serve`;
Next proxies `/api/engine/*` to it). Backend contract v1.7.0 and the optimizer are in
place, and the Benefits, API, and AI modules are implemented; the acceptance and
integration suites pass.
The frontend uses `BACKEND_BASE_URL` to reach the backend (default `http://127.0.0.1:3001`).

Synthetic data only. This demo is not medical, dental, insurance, or financial advice.
