# Dental Payment & Scheduling Optimizer (codeLinc 11)

Evidence-backed help for dental members: **where and when to get care, how coverage applies, and how to fund the rest** — with every dollar traced to a verified plan clause or a labeled input. Synthetic data only.

> AI can extract and explain, but only verified plan rules calculate. Every recommendation traces to the exact plan, clause, effective date, and dentist-confirmed constraint.

## Status

**Contract v1.1.0 is frozen** (Planner phase and pre-build review complete). The engines and UI are not implemented yet: the acceptance suite is intentionally red with `NOT_IMPLEMENTED` until each agent's module lands.

- Spec: [`docs/spec/`](docs/spec/Dental_Optimizer_Algorithm_and_Claude_Agent_Spec.md)
- Contract: [`docs/contracts/CONTRACT-v1.md`](docs/contracts/CONTRACT-v1.md) · schemas in [`src/domain/`](src/domain)
- Demo story with all numbers: [`docs/contracts/golden-scenario.md`](docs/contracts/golden-scenario.md)
- How to run the multi-agent build in Claude Code: [`docs/KICKOFF.md`](docs/KICKOFF.md)

## Quick start

```bash
npm install
npm run test:contracts   # green
npm run test:acceptance  # red until implemented
npm run dev              # placeholder page until the UI lands
```

Requires Node ≥ 20.9 (see `.nvmrc`). Live AI is optional (`.env.example`); the default synthetic mode makes no network calls.

## Layout

```text
docs/            spec, contract, ownership, workflow, briefs, decisions
src/domain/      frozen shared contracts (Zod schemas + types + money/date helpers)
src/benefits/    Plan Registry + deterministic DPPO adjudication     (dental-benefits)
src/optimizer/   Visit Navigator + Care Plan Optimizer              (dental-optimizer)
src/ai/          extraction, injection scanner, explanation guardrails (dental-uxapi)
src/api/         framework-agnostic API handlers                     (dental-uxapi)
src/app/, src/ui/  Next.js app and screens                           (dental-uxapi)
data/sources/    immutable synthetic plan documents
data/plans/      normalized, evidence-backed plan versions            (dental-benefits)
fixtures/        synthetic member/providers/procedures, golden answers, mock API responses
tests/           contracts · acceptance · per-module unit · integration · e2e
```
