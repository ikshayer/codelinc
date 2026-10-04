# CareWindow MVP loop: implementation handoff, iteration 3 (contract 1.6.0 → 1.7.0)

Planner/Integrator: main session. The contract, plan and docs were done there. The implementers were two Sonnet agents with disjoint file ownership (backend optimizer and tests; frontend).

## Requirements completed

- §6.2 modes (BALANCED / LOWEST_TOTAL_COST / EARLIEST_SAFE_COMPLETION / SMOOTHEST_PAYMENTS), which genuinely rerank.
- §6.3 concrete deltas (`difference_from_recommended`).
- §6.4 `solver_meta` with a bounded search (BOUNDED_BEST_FOUND instead of INVALID_INPUT).
- §6.5 same-day order warning.
- UI-001, UI-002 and UI-011: a priority selector, a "Compared with the recommended plan" list and no scores.
- §14.3 #1, #2, #9 and #10.

## Files changed

**Backend**
- domain: `optimizer.ts`, `issues.ts`, `policy.ts` (comment), `version.ts`
- `src/optimizer/care-plan.ts`
- new `tests/acceptance/at23-modes-deltas-solver.test.ts` (22 tests)
- `tests/optimizer/mvp-before-after.test.ts`: the old "INVALID_INPUT cap" test is replaced by a bounded-search test, as required by the plan §4.3 behavior change
- `scripts/golden-check.mjs`, `scripts/build-mocks.ts`
- `expected.json`: adds `postvisit.modes` (additions only)
- regenerated mocks
- docs: CONTRACT §5.5, CHANGELOG 1.7.0, D-030, `acceptance.md`, `golden-scenario.md`, version mentions

**Frontend**
- new `src/features/care-window/plan-modes.tsx`
- `care-plan.tsx`, `parts.tsx`
- new `tests/unit/care-window-modes.test.ts` (7 tests)

## Behavior

The golden scenario on each mode:

| Mode | Recommended plan | Alternative |
|---|---|---|
| BALANCED | $1,372 | earliest-safe $1,426 (+$54) |
| LOWEST_TOTAL_COST | $1,372 (also the Balanced winner on this data) | — |
| SMOOTHEST_PAYMENTS | $1,372 | — |
| EARLIEST_SAFE_COMPLETION | $1,426 | $1,372 (−$54) |

AT-23 adds a target-date case where LOWEST_TOTAL_COST and BALANCED pick different schedules. Searches over the limit are capped deterministically and labelled BOUNDED_BEST_FOUND.

## Commands run and exact results

| Where | Command | Result |
|---|---|---|
| backend | `npm run verify` | exit 0: frozen 71 · golden OK (modes included) · contracts 25 · unit 25 · acceptance 194 · integration 75 |
| backend | `demo:cli` | $1,372 / $1,426 (unchanged) |
| backend | `expected.json` check vs `9447c5b` | every pre-existing path is unchanged |
| frontend | typecheck / lint / test / build | clean / clean / 145/145 / compiled |
| live | backend + `next dev -p 3100` | all 4 modes return 200 via `/api/engine/care-plan` with the results above; an unknown `preferences` key → 400; `/care-window` → 200 |

## Browser path verified

No click-through: port 3000 is used by another local project (`D:\Work\codelinc`), so the dev server ran on 3100. The selector and deltas are covered by render unit tests and the proxy smoke test.

## Assumptions and deviations

- **Solver status with unscheduled care:** when the recommended plan leaves care unscheduled and the run is not bounded, `solver_meta.status` is NO_FEASIBLE_SOLUTION.
- **Label order:** `lowest_member_cost` is listed first among an alternative's labels when it applies.
- **Trace:** `mode` is added to the existing `ALTERNATIVE_SELECTED` trace data. A new trace entry broke an exact trace-kind test.

## Known limitations

- The annual-maximum delta shows the raw plan version id.
- Pre-search INVALID_INPUT paths report NO_FEASIBLE_SOLUTION.
