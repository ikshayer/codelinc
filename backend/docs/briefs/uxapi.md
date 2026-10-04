# Brief — UX/API/AI agent

**You own:** `src/app/**`, `src/api/**`, `src/ai/**`, `src/ui/**`, `src/components/**`, `src/lib/**`, `public/**`, `tests/api/**`, `tests/ai/**`, `tests/ui/**`. Nothing else.

## Read first

1. Spec §5, §6, §9, §10, §15 (demo narrative)
2. `docs/contracts/CONTRACT-v1.md` §1, §6, §7 (normative)
3. `src/domain/ai.ts`, `api.ts`, `procedure.ts`, `policy.ts` (`WORDING`, `API_LIMITS`), `fact-ids.ts`, `ports.ts` (`AiModule`, `ApiModule`)
4. `AGENTS.md` — **Next.js 16 differs from your training data; read `node_modules/next/dist/docs/` before writing route handlers or pages.**
5. `fixtures/mock-responses/**` (build against these first), `fixtures/synthetic/**`

## Contract 1.1.0 scope cuts (do these, not more)

- **Live Bedrock: deferred.** `createAiAdapters({mode:"live"})` returns the synthetic adapters plus `AI_UNAVAILABLE`. Do not add `bedrock.server.ts` unless everything else is done.
- **Image intake: deferred.** `image` without `text` → `procedures:[]` + `AI_UNAVAILABLE`. The UI offers pasted/sample card text only. Manual and written-estimate intake: cut (the confirmation screen is the editor).
- **Transcript:** the saved extraction is optional; scanning it and showing the flagged injection line is enough.
- **Keep:** card parser, injection scanner, template explainer (care plan **and** a minimal visit-navigator template — AT-16 needs both), all seven validator rules incl. date and urgency parsing, `demo:cli` (the recorded-fallback path).
- **UI:** one page per flow with stepper sections, not separate routes. Confirmation screen shows every confirmable field with inferred fields highlighted and a "Confirm all" button; editing is optional. "Change availability" is one preset toggle ("No Tuesdays"). Render passport sections, timeline events and `steps` with generic components driven by engine fields.
- **Rules from 1.1.0:** the UI sends `DemoScenario.previsit_as_of`/`postvisit_as_of` and `planning_horizon_end` (never the wall clock); explanation text names procedures by code and tooth, never `description` (§6.3); route wrappers per §7 (byte-length 413, JSON content type, Origin check, `x-request-id` regex); `createApiHandlers()` builds dependencies lazily and parses the schema first (AT-15's 400 test must pass before the engines land); `loadDemoScenario()` reads document text with `fs` in `src/api` and maps fields explicitly (strict schema); client code may import only `@/domain` (lint-enforced).
- **Tests:** put `// @vitest-environment jsdom` at the top of every `tests/ui/**` file (the unit project defaults to node).
- **shadcn:** the Planner installs the component set in KICKOFF step 0; if `components.json` is missing, use plain Tailwind v4 — never edit `package.json`.

## Deliver

1. **AI (`src/ai/**`)** — `createAiAdapters`, `validateExplanation`, `buildExplanationInput` exactly per CONTRACT §6.
   - Synthetic mode (default, zero network): deterministic card parser, injection scanner, labeled saved extraction for the transcript, template explainer.
   - Live mode (optional, only after everything else works): Bedrock Converse in `src/ai/bedrock.server.ts` (`AWS_REGION`, `BEDROCK_MODEL_ID`, `AI_ENABLED`, `AI_MODE`); strict JSON; local validation; fallback to synthetic/template. Never imported by client code.
2. **API (`src/api/**` + `src/app/api/<route>/route.ts`)** — `createApiHandlers(deps?)` and `loadDemoScenario()` per CONTRACT §7. Strict schema parsing (400), size limits (413), same-origin POST, envelopes from `src/domain/api.ts`, recompute-on-explain, no body logging. `src/api/demo-cli.ts` prints the golden story for `npm run demo:cli` (synthetic, offline).
3. **UI (`src/ui/**`, `src/components/**`, `src/app/**`)** — calm, one decision per screen, ≤ 3 alternatives (spec §10). shadcn/ui components (the Planner runs `shadcn init` in KICKOFF step 0; add components with `npx shadcn@latest add <name>`).
   - **Benefit Passport**: reset date, what is left (with pending reservation shown separately), network rules, FSA deadline, a source label on every value (plan-verified, claim/EOB, provider, dentist, member-confirmed, estimate, needs confirmation) and timestamps.
   - **Before the visit**: intent → red-flag symptom check (safety gate shows "Contact a dentist now") → up to three options with concrete tradeoffs ("$108 more, 7 days sooner, 2.1 miles closer") and stale/missing badges.
   - **After the visit**: intake (card text/photo, consented transcript, manual) → **confirmation screen** per procedure (code/tooth, fee, urgency, earliest/target/latest, dependencies, alternatives; "Your dentist said…"; inferred fields highlighted; nothing reaches the optimizer unconfirmed) → timeline of alternatives (what, when, where, claim route, funding, plan pays / you pay, balance after, why, next action) → **See how this was calculated** (render `steps`) → **Why this plan?** (validated explanation + evidence quotes + dentist constraint) → change availability and re-optimize.
   - Format only with `formatUsd` / `formatDisplayDate`. **No arithmetic on money in the UI** — render engine fields. Use "Act now / Schedule soon / Can plan later" only from dentist urgency. Never "benefits expire": state exactly what resets and when. Show ranges when the engine returns them.
4. **Tests** in `tests/ai/**` (parser, scanner, validator cases), `tests/api/**` (status codes, strictness, envelopes), `tests/ui/**` (no money math, labels present).

## Acceptance tests you make green (after Benefits + Optimizer)

`at14-15-extraction-safety`, `at16-explanation`, `at18-e2e-synthetic`. You can run the AI-only parts of AT-14/15 immediately.

```bash
npx vitest run --project unit tests/ai tests/api tests/ui
npx vitest run tests/acceptance/at14-15-extraction-safety.test.ts tests/acceptance/at16-explanation.test.ts
npm run dev   # UI against mocks until engines land, then real API
```

## Do not

Duplicate calculation logic in prompts or UI · let AI set confirmation, urgency, dates, codes as verified, or plan rules · retain raw audio/transcripts/images · log request bodies or member identifiers · put secrets in client code or `NEXT_PUBLIC_*` · import `fixtures/mock-responses/**` from production code · edit frozen paths or other agents' files.

Finish with the handoff in `docs/workflow.md`.
