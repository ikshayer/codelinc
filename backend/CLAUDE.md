# Dental Payment & Scheduling Optimizer — codeLinc 11

A calm, evidence-backed assistant that helps a member choose where and when to get dental care, use coverage, and fund the rest. Two modes on one deterministic foundation: **Visit Navigator** (before the visit) and **Care Plan Optimizer** (after the visit). Synthetic data only.

**Scope source of truth:** `docs/spec/Dental_Optimizer_Algorithm_and_Claude_Agent_Spec.md`. **Behavior:** `docs/contracts/CONTRACT-v1.md` (contract **v1.7.0, FROZEN**). `CAREWINDOW_ARCHITECTURE.md` is the earlier design, kept for reference only (decision D-001).

## Roles

The **main session is the Planner/Integrator**. Implementation is delegated to project subagents in `.claude/agents/` — `dental-benefits`, `dental-optimizer`, `dental-uxapi`, `dental-reviewer` — each with a brief in `docs/briefs/`. Run them per `docs/workflow.md`; the kickoff prompt is in `docs/KICKOFF.md`.

## Ownership (full table: `docs/ownership.md`)

| Owner | Writes only |
|---|---|
| Planner | `docs/**` (not `docs/review/**`), `src/domain/**`, `fixtures/**`, `tests/acceptance/**`, `tests/contracts/**`, `scripts/**`, `data/sources/**`, root config, `.claude/**` |
| dental-benefits | `data/**` (not `data/sources/**`), `src/benefits/**`, `tests/benefits/**` |
| dental-optimizer | `src/optimizer/**`, `tests/optimizer/**` |
| dental-uxapi | `src/api/**`, `src/ai/**`, `tests/{api,ai}/**`; the UI lives in the separate `../frontend/` project (`frontend/src/**`) |
| dental-reviewer | `tests/integration/**`, `tests/e2e/**`, `docs/review/**` — never production code |

Frozen paths are guarded by a PreToolUse hook and by `npm run check:frozen`. Need a contract change? Put a change request in your handoff (`docs/workflow.md`). Only the Planner applies it (create `.claude/UNFREEZE`, edit, bump `CONTRACT_VERSION`, `npm run freeze`, delete the marker, log it in `docs/contracts/CHANGELOG.md`).

## Non-negotiable rules

- Benefit math and optimization are deterministic code. AI only extracts candidate facts and explains finished results; it never calculates, sets urgency/timing, or changes plan rules.
- Every plan rule used cites evidence (exact plan version, page, literal quote). Missing, unverified or conflicting required rules → `NEEDS_CONFIRMATION`. Never use an "industry typical" value. Unknown is never zero.
- Integer cents and basis points only. Round plan share half-up per line before caps.
- Keep service date, claim date and payment date separate; the service date picks the plan period. Keep claim route separate from funding source.
- Dentist-confirmed windows, dependencies and healing gaps are hard constraints. Never move care past the dentist's latest safe date to save money.
- Self-pay only when permitted by the plan and the office, with a verified cash quote, and cheaper over the whole known care horizon.
- AI-extracted clinical facts stay `UNVERIFIED` until the member or dentist confirms them.
- No clock reads in engines (`as_of` is an input). Identical inputs → identical outputs.
- Only DPPO is adjudicated; other plan types return `UNSUPPORTED_PLAN_TYPE`.
- Synthetic data only; no real carrier branding. Never log or keep raw audio, transcripts, images, request bodies or member identifiers. Secrets stay server-side.

## Stack and commands

Next.js 16 App Router · React 19 · TypeScript 5 strict · Zod 4 · Vitest 5 · Tailwind 4 + shadcn/ui · AWS Bedrock (optional live AI). Import shared contracts from `@/domain`.

```bash
npm install
npm run serve             # engine API on http://localhost:4000 (ALLOWED_ORIGINS defaults to http://localhost:3000)
npm run demo:cli          # prints the golden story
npm run typecheck && npm run lint
npm run test:contracts    # frozen contract/fixture checks (must always pass)
npm test                  # agents' unit tests (tests/{benefits,optimizer,api,ai,ui})
npm run test:acceptance   # spec §13 acceptance suite
npm run test:integration  # reviewer
npm run check:frozen      # frozen files unchanged
npm run golden:check      # independent golden re-derivation
npm run verify            # check:frozen → golden:check → typecheck → lint → contracts → unit → acceptance → integration (no build step; the UI is ../frontend)
```

Every agent ends with the handoff: Files changed · Interfaces consumed · Tests run and results · Assumptions · Unresolved issues · Requested shared-contract changes.
