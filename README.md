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

```bash
cd backend
npm ci
npm run dev:api
npm run db:verify
```

The frontend uses `BACKEND_BASE_URL` to reach the backend (default `http://127.0.0.1:3001`).

Synthetic data only. This demo is not medical, dental, insurance, or financial advice.
