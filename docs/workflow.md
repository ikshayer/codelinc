# Workflow, handoffs and change requests

Spec §11–§14. The main Claude Code session is the **Planner/Integrator**. Subagents are defined in `.claude/agents/`. If parallel subagents are unavailable, run the same roles sequentially, keep ownership, and keep an independent reviewer pass.

## Phases

| Phase | Hours | Who | Exit gate |
|---|---|---|---|
| 0. Contract v1 frozen | done | Planner | `npm run check:frozen && npm run typecheck && npm run test:contracts` green; acceptance suite red with `NOT_IMPLEMENTED`. |
| 1. Contract review | ≤ 0.5 | Benefits, Optimizer, UX/API/AI (read-only) | Each returns **only** blocking change requests. Planner resolves → re-freezes. **Done: 1.1.0** (`docs/review/contract-review-v1.md`); agents start from 1.1.0. |
| 2. Parallel implementation | 1.5–6 | Benefits, Optimizer, UX/API/AI | Each agent's slice of the acceptance suite green (see `docs/acceptance.md`); own unit tests green; handoff returned. UX starts on `fixtures/mock-responses/**`. |
| 3. Integration | 6–9 | Planner | `npm run test:acceptance` fully green; UI wired to real API; `npm run demo:cli` prints the golden story. |
| 4. Independent review | 9–12 | Reviewer | `docs/review/REVIEW.md` with defects (severity, repro, expected, owner); new tests in `tests/integration/**`, `tests/e2e/**`. |
| 5. Repair + feature freeze | 12–14 | Owning agents | All P0/P1 defects fixed; reviewer re-runs. |
| 6. Ship | 14–15 | Planner | `npm run verify` green; synthetic demo rehearsed; recorded fallback. |

## Handoff (required from every agent, verbatim headings)

```text
Files changed
Interfaces consumed
Tests run and results
Assumptions
Unresolved issues
Requested shared-contract changes
```

Under "Tests run and results" paste the exact commands and pass/fail counts (`npx vitest run tests/acceptance/at01-needs-confirmation.test.ts` etc.).

## Contract change request (CR)

Agents never edit frozen paths. Put each request in the handoff:

```text
CR-<agent>-<n>
File/schema: src/domain/<file>.ts → <symbol>
Problem: <what blocks you, with the failing test or spec section>
Proposal: <exact change>
Impact: <who else must change>
```

The Planner accepts or rejects each CR, records it in `docs/contracts/CHANGELOG.md`, bumps `CONTRACT_VERSION` (minor for additive, major for breaking), edits the frozen files, runs `npm run freeze`, and tells every affected agent. Golden numbers change only if the brute-force check is re-run and recorded in `docs/contracts/golden-scenario.md`.

## Definition of done (spec §13 + §12 step 9)

`npm run verify` = `check:frozen` → `typecheck` → `lint` → `test:contracts` → `test` (unit) → `test:acceptance` → `test:integration` → `build`, all green, plus the synthetic demo working offline.
