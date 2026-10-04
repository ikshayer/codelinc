# CareWindow MVP loop: current plan

Planner: iteration 3. Date: 2026-10-04. Baseline: commit `9447c5b` (iteration 2b, contract 1.6.0), with all gates green (see `history/iter2b-*`). The deadline is tight, so this plan is short and normative. The domain contract below is **already applied** by the Planner in `backend/src/domain/{optimizer,issues,version}.ts`. Do not change it without telling the Planner.

## 1. Goal

**Iteration 3: recommendation modes that genuinely rerank, concrete deltas, solver metadata, and a same-day order warning (contract 1.6.0 → 1.7.0).**

The default (BALANCED) output must stay **identical** to today's for the golden scenario, apart from the new fields (`mode`, `solver_meta`, `difference_from_recommended`).

## 2. Baseline

`9447c5b`: backend `npm run verify` exits 0 (frozen 70, acceptance 172, integration 75). Frontend: 138/138, and the build passes.

## 3. Requirements covered

| Requirement | How it is delivered |
|---|---|
| §6.2 modes, REC-006 | §4.1 |
| §6.3 deltas, UI-011 (no scores) | §4.2 |
| §6.4 SolverMeta (bounded search) | §4.3 |
| §6.5 same-day order warning | §4.4 |
| UI-001, UI-002 priority selector, UI-011 | §4.6 |
| §14.3 #1, #2, #10 | §6 |

## 4. Behavior (normative)

### 4.1 Modes (`src/optimizer/care-plan.ts`)

`mode = request.preferences?.mode ?? "BALANCED"`. Ranking keys use the existing pieces of `rankingKey`. `prefix` = unscheduled_by_urgency, lateness_days_by_urgency, funding_shortfall. `common` = travel, visit days, wait days, expiring funds, tieKey.

| Mode | Key | Label of its winner |
|---|---|---|
| BALANCED | the existing `lowest_total_cost` key (prefix, total member cost, peak, common) | `lowest_total_cost` |
| LOWEST_TOTAL_COST | unscheduled_by_urgency, funding_shortfall, total member cost, lateness_days_by_urgency, peak, common | `lowest_member_cost` |
| EARLIEST_SAFE_COMPLETION | the existing `earliest_safe_completion` key | `earliest_safe_completion` |
| SMOOTHEST_PAYMENTS | the existing `smoothest_monthly_payments` key | `smoothest_monthly_payments` |

**Pool.** The pool is unchanged (pass 1 / pass 2 logic as today). Safety stays first in every mode.

**Alternatives.**
- Order: `[mode winner, then the existing three label winners in alternativeLabelOrder]`.
- De-duplicate by `tieKey`, merging labels. `lowest_member_cost` is only ever attached to the LOWEST_TOTAL_COST mode winner. If that winner is also another label's winner, both labels are kept.
- Cut to `max_alternatives`.
- `alt-1` is the recommended alternative.
- `result.mode = mode`.
- BALANCED must reproduce today's golden alternatives exactly: same order, labels and ids.

**Status.** Status and `BUDGET_SHORTFALL` follow the recommended alternative, as today.

**Trace.** Add one `decision_trace` entry (kind `ALTERNATIVE_SELECTED`, data `{mode}`) or extend existing data. Do not add a new trace kind unless the enum allows it.

### 4.2 Deltas (`difference_from_recommended`)

Use the `AlternativeDifference` schema exactly. All values are worst case and are computed from the two finished `Alternative` objects:
- **Cost:** `totals.member_cost.high_cents` and `totals.plan_pay.high_cents`.
- **Monthly:** `objective.peak_monthly_cash_cents`, and the union of `monthly[].month`.
- **Completion:** `objective.completion_date`.
- **Service dates:** per-procedure dates from `events`.
- **Rollover:** Σ `final_bank` low and high over `rollover`.
- **Annual maximum remaining:** the last `benefit_states` entry per `plan_version_id` (`annual_max_remaining_cents`). If a plan version appears in only one schedule, compare against that version's state taken from the other schedule's last state of the same version or, failing that, **omit** it.
- **Warnings:** issue-code sets of `alternative.issues`.

The value is `null` on alt-1. Use pure helpers; never call the benefit engine for deltas.

### 4.3 SolverMeta and bounded search

**Bounded search.** When Π(candidates + 1) > `SEARCH_LIMITS.max_schedules_evaluated`, do **not** return `INVALID_INPUT` any more:
- deterministically cap each procedure's candidate list, keeping the first *k* in the existing candidate order, with the largest common *k* such that Π(min(len, k) + 1) ≤ the limit;
- search that;
- set `status: "BOUNDED_BEST_FOUND"` and `bounds_applied: ["max_schedules_evaluated=50000: candidates per procedure capped at <k>"]`.

**Status.**
- Otherwise `OPTIMAL`.
- `NO_FEASIBLE_SOLUTION` when no schedule was feasible (`emptyResult` paths that searched). `emptyResult` before any search: `OPTIMAL` is wrong, so use `NO_FEASIBLE_SOLUTION`.

**Counts.**
- `schedules_rejected` = evaluated − feasible.
- `candidates_built` = before the cap.
- `elapsed_ms: null`.
- `deterministic_tie_breaker`: "service dates, then provider ids, then claim routes, then slot ids, urgency-then-procedure-id order".

Never label a bounded run OPTIMAL.

### 4.4 Same-day order warning (§6.5)

For each final alternative whose events include ≥2 claim events on the same `service_date`:
- re-simulate (worst case) with that date's events in reverse order, by renaming event ids so the engine's documented `service_date, event_id` order flips;
- if the total `member_responsibility_cents` differs, push a warning `SAME_DAY_ORDER_AFFECTS_COST` onto `alternative.issues`, with `procedure_id` of the first event and the message "The order the plan processes same-day claims changes your cost: $A in this order, $B in the other."

The golden scenario has no same-day pair, so nothing changes there.

### 4.5 Explanation

The template is unchanged. The validator already accepts `|*_delta_cents|`.

### 4.6 Frontend (`frontend/src/features/care-window/*`, adapter)

- **Priority selector** above the care plan: Balanced / Lowest cost / Earliest safe / Smoothest payments. Changing it re-POSTs the same care-plan request with `preferences: { mode }`, shows loading, and replaces the result. Format only; no client math.
- **Per alternative ≠ recommended:** a "Compared with the recommended plan" list using `difference_from_recommended`. Signed money with + or −, "finishes N days later/earlier", date changes, carryover delta, "Plan can still pay … more/less", warnings added or removed. No scores.
- **Label text:**
  - `lowest_total_cost` = "Balanced: lowest cost on your dentist's target dates"
  - `lowest_member_cost` = "Lowest total cost"
  - `earliest_safe_completion` = "Earliest safe completion"
  - `smoothest_monthly_payments` = "Smoothest monthly payments"
- **Solver line:** "Checked all N possible schedules" (OPTIMAL), or "Best plan found within search limits" (BOUNDED_BEST_FOUND).

## 5. Contract and schema changes

The domain is already applied: `RecommendationMode`, `RecommendationPreferences`, the optional `CarePlanRequest.preferences`, the `AlternativeLabel` value `lowest_member_cost`, `AlternativeDifference`, `Alternative.difference_from_recommended`, `CarePlanResult.mode` and `.solver_meta`, `SolverMeta`, and the issue `SAME_DAY_ORDER_AFFECTS_COST`. Version 1.7.0 (minor; the only request key is optional).

The Planner runs freeze and the CHANGELOG at the end.

## 6. Tests

New `backend/tests/acceptance/at23-modes-deltas-solver.test.ts`:
1. **BALANCED.** The default equals `preferences: {mode: "BALANCED"}`. The golden alternatives (ids, labels, schedule keys, member costs) equal `expected.json`.
2. **Each mode recommends its own key's winner.** EARLIEST recommends the `earliest_safe_completion` schedule (golden $1,426). For §14.3 #1, at least two modes recommend **different** schedules on the golden input, and LOWEST_TOTAL_COST's recommended cost is ≤ every other mode's.
3. **Determinism.** Each mode gives an identical result twice.
4. **Deltas reconcile.** For every non-recommended alternative, each delta equals the field arithmetic on the two alternatives (§14.3 #9): cost, plan pay, peak, monthly, completion. Alt-1's difference is null.
5. **SolverMeta.** The golden run is OPTIMAL with the expected counts (evaluated − feasible = rejected). With a shrunken limit (a `SEARCH_LIMITS` override is not possible, so build a request with enough providers and slots to exceed 50,000; or, if that is too slow, expose nothing new and assert via a slot-rich synthetic request), the run gives BOUNDED_BEST_FOUND, never OPTIMAL, and `bounds_applied` is non-empty. If no fast way exists, report it instead of faking it.
6. **Same-day order.** Two procedures with the same slot date at the same provider, where the deductible ordering matters → warning `SAME_DAY_ORDER_AFFECTS_COST`. Without a same-day pair → no warning.
7. **API.** An unknown `preferences` key → 400. A mode reaches the engine.

Also:
- golden-check, golden-scenario and expected.json: add `postvisit.modes` = per mode `{recommended_schedule_key, member_cost_cents, labels}`, reproduced in `golden-check.mjs` with its own ranking for LOWEST_TOTAL_COST.
- `build-mocks.ts`: the new fields.
- Frontend unit tests for the selector request body and the delta rendering.

## 7. Acceptance commands

- Backend: `npm run verify`.
- Frontend: `typecheck && lint && test && build`.
- Run `demo:cli` (unchanged).
- Golden immutability: pre-existing `expected.json` paths are unchanged.

## 8. Risks and non-goals

**Risks.** BALANCED must stay byte-identical apart from the new fields. Mode reranking must never override the unscheduled-first and safe-window constraints.

**Non-goals:** locks and custom plans (4), payment plans (5), badges (6), and rollover as a ranking input.

## 9. Prior findings

R2b-L1, R2b-L2 and R2b-L3 are LOW and deferred.
