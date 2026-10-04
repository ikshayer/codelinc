# Dental Payment & Scheduling Optimizer (codeLinc 11)

Evidence-backed help for dental members: **where and when to get care, how coverage applies, and how to fund the rest** — with every dollar traced to a verified plan clause or a labeled input. Synthetic data only.

> AI can extract and explain, but only verified plan rules calculate. Every recommendation traces to the exact plan, clause, effective date, and dentist-confirmed constraint.

## Status

The repository is split into a Next.js frontend scaffold at the root and a
self-contained backend in [`backend/`](backend/README.md). Contract v1.1.0 is
frozen; runtime modules and the UI are still incomplete, so acceptance remains
red until the missing modules land.

- Backend: [`backend/`](backend/README.md)
- Contract: [`backend/docs/contracts/CONTRACT-v1.md`](backend/docs/contracts/CONTRACT-v1.md)
- Production insurance-ID architecture: [`backend/docs/production-architecture-plan.md`](backend/docs/production-architecture-plan.md)
- Synthetic demo story: [`backend/docs/contracts/golden-scenario.md`](backend/docs/contracts/golden-scenario.md)

## Quick start

```bash
npm install
npm --prefix backend install
npm run test:contracts   # green
npm run test:acceptance  # red until implemented
npm run dev              # placeholder page until the UI lands
```

Requires Node ≥ 20.9 (see `.nvmrc`). Live AI is optional
(`backend/.env.example`); the default synthetic mode makes no network calls.

## Layout

```text
src/app/          Next.js frontend scaffold
backend/src/      domain, benefits, optimizer, API, and AI modules
backend/data/     plan sources and quarantined reference data
backend/fixtures/ synthetic inputs, golden answers, mock responses
backend/tests/    contracts, optimizer, acceptance, integration
backend/docs/     production architecture, contract, and workflow
```
