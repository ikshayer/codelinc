# File ownership — contract v1

Every path has exactly one owner. Agents write **only** inside their own paths. Anything else is requested in the handoff under "Requested shared-contract changes" (see `docs/workflow.md`). `npm run check:frozen` fails if a frozen file changes without a Planner freeze.

| Owner | Agent definition | Exclusive write paths | Frozen? |
|---|---|---|---|
| **Planner/Integrator** (main Claude Code session) | `.claude/agents/dental-planner.md` (reference) | `docs/**` except `docs/review/**` · `src/domain/**` · `fixtures/**` · `tests/acceptance/**` · `tests/contracts/**` · `scripts/**` · `data/sources/**` · root config: `package.json`, `package-lock.json`, `tsconfig.json`, `next.config.ts`, `vitest.config.ts`, `eslint.config.mjs`, `postcss.config.mjs`, `playwright.config.ts`, `components.json`, `.mcp.json`, `.env.example`, `.gitignore`, `.nvmrc`, `CLAUDE.md`, `AGENTS.md`, `README.md`, `.claude/**` | `src/domain/**`, `fixtures/**`, `tests/acceptance/**`, `tests/contracts/**`, `data/sources/**`, `docs/contracts/CONTRACT-v1.md` |
| **Plan & Benefits** | `.claude/agents/dental-benefits.md` | `data/**` except `data/sources/**` · `src/benefits/**` · `tests/benefits/**` | — |
| **Optimizer** | `.claude/agents/dental-optimizer.md` | `src/optimizer/**` · `tests/optimizer/**` | — |
| **UX/API/AI** | `.claude/agents/dental-uxapi.md` | `src/api/**` · `src/ai/**` · `tests/api/**` · `tests/ai/**` · the UI in the separate top-level `frontend/` project (`frontend/src/**`, `frontend/public/**`, `frontend/tests/**`) | — |
| **Independent Reviewer** | `.claude/agents/dental-reviewer.md` | `tests/integration/**` · `tests/e2e/**` · `docs/review/**` | Never edits production code |

## Planner-created placeholders now owned by others

The Planner created these so the project typechecks and the acceptance suite fails loudly instead of silently. Ownership transfers to the listed agent; **the exported names and signatures are part of contract v1** (`src/domain/ports.ts`) and must not change.

| File | Transfers to | Must export |
|---|---|---|
| `src/benefits/index.ts` | Plan & Benefits | `benefitEngine`, `loadRegistry`, `benefitsModule` |
| `src/optimizer/index.ts` | Optimizer | `createVisitNavigator`, `createCarePlanOptimizer`, `optimizerModule` |
| `src/ai/index.ts` | UX/API/AI | `createAiAdapters`, `validateExplanation`, `buildExplanationInput`, `aiModule` |
| `src/api/index.ts` | UX/API/AI | `createApiHandlers`, `loadDemoScenario`, `apiModule` |

## Import rules (no cycles)

- `src/domain/**` imports nothing outside itself (only `zod`).
- `src/benefits/**` → `@/domain` only (+ its own `data/**` JSON).
- `src/optimizer/**` → `@/domain` only. It receives the `BenefitEngine` by injection; it never imports `@/benefits` internals and never re-implements adjudication.
- `src/ai/**` → `@/domain` only. Bedrock code lives in `src/ai/**/*.server.ts` and is imported only by `src/api/**`.
- `src/api/**` → `@/domain`, `@/benefits`, `@/optimizer`, `@/ai` entry points only.
- `frontend/src/**` (separate project) never imports backend code; it calls the backend over HTTP (`/api/*`) through its adapters and only displays result fields. **No calculation logic in UI or prompts.**
- Tests import modules only through their entry points (`@/benefits`, `@/optimizer`, `@/ai`, `@/api`).

## Dependencies

New npm packages are root config. Request them in your handoff with the reason and the version; the Planner installs them. Pre-installed: `next`, `react`, `zod`, `@aws-sdk/client-bedrock-runtime`, `tailwindcss`, `shadcn` (CLI), `vitest`, `@testing-library/react`, `jsdom`, `@playwright/test`, `tsx`.
