# Brief — Optimizer agent

**You own:** `src/optimizer/**`, `tests/optimizer/**`. Nothing else.

## Read first

1. Spec §5, §7 (all), §8, §13
2. `docs/contracts/CONTRACT-v1.md` §1, §4, §5 (normative), §3 for what the engine returns
3. `src/domain/optimizer.ts`, `benefits.ts`, `member.ts`, `provider.ts`, `procedure.ts`, `policy.ts`, `ports.ts` (`VisitNavigator`, `CarePlanOptimizer`, `OptimizerModule`)
4. `fixtures/golden/expected.json` and `docs/contracts/golden-scenario.md` — the exact answers your search must reproduce

## Contract 1.1.0 — read this first

The golden numbers did not change, but the rules that produce them did (CONTRACT §5, marked **(1.1)**): pass 1 may not leave more care unscheduled than the best eligible schedule (`U*`); if missing data — not the calendar — leaves care unscheduled (`U_ok > U_all`) the result is `NEEDS_CONFIRMATION`; a self-pay event is eligible only when strictly cheaper than the same schedule with a claim; the combination count is checked **before** searching (`SEARCH_LIMITS.max_schedules_evaluated = 50_000`); canonical procedure/candidate order; `decision_trace` has exactly four kinds. Cut from v1: alternative groups (→ `NEEDS_CONFIRMATION`), conditional scenarios (`[]`), the optional reason codes. **If code for 1.0.0 already exists in `src/optimizer/**`, reconcile it with these clauses before handing off.** The Planner's independent brute-force check of every golden number under 1.1.0 is described in `docs/contracts/golden-scenario.md`.

## Deliver

`src/optimizer/index.ts` keeps its exports: `createVisitNavigator(benefits)` and `createCarePlanOptimizer(benefits)`.

1. **Visit Navigator** (CONTRACT §4): safety gate first; travel/availability exclusions; earliest compatible exam slot per provider; pricing **only** through `benefits.simulate` in both scenarios; dominance filter; `best_overall` / `lowest_cost` / `soonest` labels; at most three options; concrete tradeoffs; never recommends delay before diagnosis.
2. **Care Plan Optimizer** (CONTRACT §5): validation order; candidate generation; **exact enumeration with backtracking** (prune on slot exclusivity and dependency gaps as you go); simulate every complete schedule through the injected `BenefitEngine` (memoize by canonical event list if needed); funding allocation v1 after adjudication; objective vectors and the three label orderings; two passes (hard budget, then safest schedule + exact gap); best-case re-simulation for ranges; reasons, next actions, `benefit_states`, deterministic trace and `search_stats`.
3. Suggested internal layout: `availability.ts`, `candidates.ts`, `search.ts`, `funding.ts`, `objective.ts`, `select.ts`, `reasons.ts`, `navigator.ts`, `care-plan.ts`. Greedy is allowed only as a labeled benchmark in tests — never as the result.
4. **Unit tests** in `tests/optimizer/**` on your pure helpers (no fake `BenefitEngine` required — it costs ~1 h): availability incl. time of day, dependency gaps, slot exclusivity, funding order and monthly limits, FSA expiry, tie_key/label ranking, the `U*` pass rule. End-to-end behavior is covered by the golden and AT-06/07/08/09 suites once Benefits lands.

## Acceptance tests you make green (after Benefits lands)

`at06-determinism`, `at07-09-clinical-constraints`, `at10-…` (care-plan parts of AT-10/11/13), `at01` (care-plan and navigator cases), `at02-traceability`, `at17` (optimizer and navigator cases), `golden-scenario`.

```bash
npx vitest run --project unit tests/optimizer
npx vitest run tests/acceptance/golden-scenario.test.ts tests/acceptance/at07-09-clinical-constraints.test.ts tests/acceptance/at06-determinism.test.ts
```

Performance target: the golden care plan in < 2 s on a laptop (Π(candidates+1) = 936; ~630 simulations). `SEARCH_LIMITS` is enforced up front, never mid-search.

## Do not

Re-implement any benefit arithmetic (every dollar comes from `simulate`) · maximize benefit use · move care past `latest_safe_date` · choose between clinical alternatives unless every member of the group is CONFIRMED · read the clock · let free text (`description`, `dentist_statements`) influence decisions · edit frozen paths or other agents' files.

Finish with the handoff in `docs/workflow.md`.
