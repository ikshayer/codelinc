# Contract v1.1.0 — FROZEN

**Status:** FROZEN on 2026-10-03 by the Planner/Integrator; revised to **1.1.0** after the pre-build review (`docs/contracts/CHANGELOG.md`, `docs/review/contract-review-v1.md`). **Version:** `CONTRACT_VERSION = "1.1.0"` (`src/domain/version.ts`). Clauses changed in 1.1.0 are marked **(1.1)**.

This document is the normative behavior for every module. Shapes live in `src/domain/**` (Zod schemas + types). When this document and a schema disagree on **shape**, the schema wins; on **behavior**, this document wins. Anything not specified here is an implementation choice of the owning agent, **as long as every acceptance test passes**. If something is ambiguous, file a change request (`docs/workflow.md`) — do not guess and do not edit frozen files.

Authority order: `docs/spec/Dental_Optimizer_Algorithm_and_Claude_Agent_Spec.md` → this contract → `src/domain/**` → `docs/decision-log.md`.

Contents: [1 Global rules](#1-global-rules) · [2 Plan Registry](#2-plan-registry) · [3 Benefit engine](#3-benefit-engine-dppo) · [4 Visit Navigator](#4-visit-navigator-before-the-visit) · [5 Care Plan Optimizer](#5-care-plan-optimizer-after-the-visit) · [6 AI](#6-ai-extraction-and-explanation) · [7 API](#7-api) · [8 Out of scope](#8-out-of-scope-in-v1)

---

## 1. Global rules

1. **Money** is integer cents (`Cents`, non-negative; `SignedCents` only for deltas). **Rates** are basis points (8000 = 80%). Never use floats for money or rates. Use `src/domain/money.ts`.
2. **Rounding** (D-004): plan share = `applyRateRoundHalfUp(eligible − deductible, rate_bps)` = `floor((x·bps + 5000)/10000)`, applied **per claim line before caps**, never on aggregates.
3. **Dates**: calendar dates are `YYYY-MM-DD` (no zone), compared as epoch days (`src/domain/dates.ts`). Appointment times are local wall-clock `HH:MM`. `as_of_date = localDateOf(as_of, member.time_zone)`.
4. **No clock reads.** Engines never call `Date.now()`/`new Date()` for decisions. Every request carries `as_of`.
5. **Determinism** (AT-06): identical inputs → byte-identical JSON output, regardless of the order of any input array (providers, slots, prices, procedures, history, windows, registry plans/rules). Sort every collection you emit by the keys stated here; where none is stated, sort by id ascending. No random ids, no timings, no `Map` iteration over insertion order of unsorted inputs. **(1.1)** Canonicalize at entry: procedures by `(URGENCY_RANK, procedure_id)`; providers, slots, prices, history and windows by their ids/dates; build every emitted object (including `decision_trace[].data`) with keys in a fixed order. String comparisons are plain code-unit order; `null` sorts first unless stated otherwise.
6. **Unknown ≠ zero.** A `MoneyInput` of kind `unknown`, a `null` clinical field, or a missing rule never becomes 0 or a default. It produces an issue and `NEEDS_CONFIRMATION`. **(1.1)** A sourced input whose `source` is `NEEDS_CONFIRMATION` is treated exactly like `kind:"unknown"`, whatever its value.
7. **Ranges** (`MoneyInput.range`): evaluate twice. `worst_case` resolves each range to the value that maximizes member cost, `best_case` to the value that minimizes it (`resolveMoney(input, scenario, direction)`). Directions:

   | Input | Direction |
   |---|---|
   | provider_charge, contracted_allowed, cash_quote | `higher_is_worse` |
   | accumulator `deductible_remaining` | `higher_is_worse` |
   | accumulator `annual_max_remaining` | `higher_is_better` |
   | pending `estimated_plan_pay` | `higher_is_worse` |
   | pending `estimated_deductible_applied` | `higher_is_better` |
   | funding account `balance` | `higher_is_better` |
   | `plan_paid_ytd` | consistency check only (skipped when a range) |

   Ranking, budget feasibility and shortfall use **worst_case**. Displayed `AmountRange` = numeric `[min, max]` of the two scenarios, whichever scenario produced each end.
8. **Provenance**: every input carries `input_id`, `source` (`SourceLabel`) and `observed_at`. Fact ids follow `src/domain/fact-ids.ts`.
9. **Staleness** (`STALENESS_HOURS` in `src/domain/policy.ts`): an input older than its threshold at `as_of` adds a `warning` `INPUT_STALE` (never blocking) with its `input_id`. Deduplicate per input id. **(1.1)** Benefits emits it for the accumulators, pending claims, prices and network status it reads; the optimizer for slots, travel and funding balances. No acceptance test pins staleness; it MAY be omitted if time runs out.
10. **Strict schemas**: every request schema rejects unknown keys. Plan rules are never accepted from a request (D-007).
11. **Issue placement**: request/ledger-level issues go in the result's top-level `issues`/`unresolved`; line-level issues go in `AdjudicationLine.issues`. Each issue appears once per location; **(1.1)** the dedupe key is `(code, severity, rule_id, input_id, procedure_id, provider_id, field)` and the first message in canonical order wins. Sort issues by `(severity: blocking, warning, info), code, rule_id, input_id, procedure_id, provider_id, field, message` (nulls first). No test pins issue order beyond AT-06 byte-equality. **(1.1)** Issue messages, unscheduled reasons and trace messages are fixed templates plus ids, dates and amounts — never `description`, `dentist_statements`, `display_name`, provider names or any other request free text.
12. **Wording** (`WORDING` in policy.ts): member-facing text says “Your dentist said…”, never “AI determined”, never generic “benefits expire”, never “in-system/out-of-system”, never “guaranteed”.

## 2. Plan Registry

### 2.1 Contents and loading

- `data/sources/**` — immutable synthetic source documents + `manifest.json` (Planner-seeded; nobody edits them).
- `data/plans/**` — normalized `PlanDefinition` JSON, one file per plan version (Plan & Benefits agent).
- `loadRegistry()` builds a `PlanRegistry` synchronously from static imports: `plans` from `data/plans/**`, `sources` from `manifest.json` plus `pages` produced by `splitSourcePages()` on each file's text (import the markdown as a string via a generated `data/plans/sources.generated.json` or equivalent — no runtime `fs` in code that the browser could import).
- `registry_version` = a stable string (e.g. `"synthetic-2026.10.03"`).

### 2.2 Identity and version resolution (`resolvePlanVersion`)

1. Candidates = plans with `samePlanKey(plan.key, key)` **and** `coverage_period.start ≤ service_date ≤ coverage_period.end`.
2. Zero → `{ok:false, status:"NEEDS_CONFIRMATION", issues:[PLAN_NOT_FOUND blocking]}`. More than one → `RULE_CONFLICT` blocking. Never fall back to a similar plan, year, employer or network.
3. Plan type ∉ `SUPPORTED_PLAN_TYPES` → `{ok:false, status:"UNSUPPORTED_PLAN_TYPE", issues:[PLAN_TYPE_UNSUPPORTED blocking]}`.

### 2.3 Rules

- Rule id convention: `<rule_type>[.<qualifier>...].<YYYY>` (see `fixtures/golden/registry-expectations.json`, which lists **every** required rule for both versions — no extras allowed).
- Status meaning (spec §3): `VERIFIED` = usable; `UNVERIFIED` = show for confirmation, never calculate; `UNKNOWN` = not addressed by the source (value `null`); `CONFLICT` = two passages disagree (each conflicting rule lists the other in `conflicts_with`); `NOT_APPLICABLE` = the source explicitly says it does not apply (value `null`).
- `ruleStructuralProblems(rule)` must be empty for every rule.
- Evidence: every non-`UNKNOWN` rule cites ≥1 `EvidenceRef` whose `quote` is a **literal substring** of `pages[page].text` of a source whose `plan_version_id` equals the rule's plan version. `effective_from/to` = the plan's coverage period.
- **Structured lookup only.** A rule "matches" when its `applies_when` fields are each `null` or equal to the claim's network / service class / contain the CDT code. **(1.1)** `service_class_map` rules match by `value.cdt_codes` only. Retrieval/semantic search may only display passages for rule ids already selected.

### 2.4 `validatePlan(registry, plan)`

`ok = true` iff: schema valid; every rule structurally valid; every evidence quote found on its cited page (else `RULE_EVIDENCE_MISSING` blocking with `rule_id`); every `source_documents[].sha256` equals the registry source's `sha256` (else `SOURCE_CHECKSUM_MISMATCH`); rule ids unique. `rule_counts` counts rules by status (all five keys present).

## 3. Benefit engine (DPPO)

### 3.1 Ledger (`openLedger` and inside `simulate`)

A period is opened the first time an event (or pending claim) needs it:

- **Snapshot period**: `member.accumulators` has an entry with that `plan_version_id`. Values resolved per scenario (§1.7). `source` = the snapshot's label. `opened_from:"snapshot"`.
  - Consistency (blocking `INPUT_INCONSISTENT`, simulation-level, no clamping): `annual_max_remaining ≤ annual_maximum.individual_cents`; `deductible_remaining ≤ deductible.individual_cents`; when all three are exact, `annual_max_remaining + plan_paid_ytd = annual_maximum.individual_cents`. **(1.1)** A bound whose rule is not VERIFIED is skipped here (the line then blocks at step 6 or 9).
- **Fresh period**: no snapshot **and** `period_start > as_of_date` → deductible and maximum from the VERIFIED rules of that version; `source:"PLAN_VERIFIED"`, `opened_from:"plan_rules"`. Operands cite `rule:deductible.<y>` / `rule:annual_maximum.<y>`.
- **Missing**: no snapshot and the period has started → blocking `INPUT_MISSING` (field `member.accumulators`).
- **Pending claims** with that `plan_version_id`: `pending_reserved_max = Σ estimated_plan_pay`, `pending_reserved_deductible = Σ estimated_deductible_applied` (scenario-resolved). `annual_max_available = max(0, remaining − reserved_max)`, `deductible_available = max(0, deductible_remaining − reserved_deductible)`. Pending claims also count toward frequency. Add one `info` `PENDING_CLAIMS_PRESENT` (simulation-level, `input_id` = the claim's plan-pay input id) per pending claim in a used period.
- Unused maximum never rolls over in v1. A `VERIFIED` rollover rule → `RULE_TYPE_UNSUPPORTED` blocking for the next period; an `UNVERIFIED` one → one `warning` `RULE_UNVERIFIED` (rule_id `rollover.<y>`) when the following period is opened, and is ignored (conservative).
- Secondary coverage present → blocking `SECONDARY_COVERAGE_NOT_MODELED` (simulation-level).
- **(1.1)** A blocking ledger issue (`INPUT_INCONSISTENT`, `INPUT_MISSING`, a VERIFIED rollover) makes **every line in that period** `NEEDS_CONFIRMATION` with money `null` (the issue itself stays simulation-level only). Secondary coverage blocks every line. Unverified data never reaches arithmetic.

`ledger_before`/`ledger_after`: all periods the simulation uses (fresh ones included), before the first / after the last event, sorted by `period_start`; `history` = member history + pending claims (as `claimed:true`, `source:"CLAIM_EOB"`) + simulated covered claim lines (`source:"ESTIMATE"`), sorted by `(service_date, cdt_code, tooth)`.

### 3.2 Order

Adjudicate events chronologically: `service_date` ascending, ties by `event_id` ascending. `claim_date` is informational and **never** selects a period (AT-10). Payment dates do not exist in the benefit engine.

### 3.3 One claim line (`IN_NETWORK_CLAIM` / `OUT_OF_NETWORK_CLAIM`)

Stop at the first blocking problem: the line gets `status:"NEEDS_CONFIRMATION"`, all money fields `null`, the blocking issue(s), and the state is unchanged. Missing rule issues use `code:"RULE_MISSING"`, `field:"rules.<rule_type>"`, `rule_id:null`; non-verified rules use `RULE_UNVERIFIED | RULE_UNKNOWN | RULE_CONFLICT` with the `rule_id` (one issue per conflicting rule).

1. **Provider & price**: provider must exist in the request (else `INPUT_MISSING`, `network_tier:null`); a `pricing` row for the CDT code must exist (`INPUT_MISSING`). Route must match tier (`CLAIM_ROUTE_INVALID`). **(1.1)** Claim lines never consult `claim_submission`.
2. **Plan version**: §2.2. Unsupported type → line `status:"UNSUPPORTED_PLAN_TYPE"`, money `null`, `steps:[]`, and a simulation-level `PLAN_TYPE_UNSUPPORTED`.
3. **Service class**: exactly one VERIFIED `service_class_map` containing the code. None anywhere → `RULE_MISSING rules.service_class_map`; only non-verified ones contain it → their status code; two VERIFIED → `RULE_CONFLICT`.
4. **Coverage checks** (in order):
   1. `limitations_index` must be VERIFIED (it is what lets the engine treat unlisted limits as absent).
   2. `exclusion` VERIFIED containing the code → **NOT_COVERED** (`info EXCLUDED_SERVICE`). A non-verified exclusion containing it → blocking.
   3. `waiting_period` matching the class (or `service_class:null`): `NOT_APPLICABLE` passes; VERIFIED `m` months → NOT_COVERED (`WAITING_PERIOD`) when `service_date < addMonths(member.coverage_effective_from, m)`; none → `RULE_MISSING rules.waiting_period`.
   4. `frequency_limit` rules containing the code: any non-verified → blocking (a CONFLICT blocks even if both readings would allow the claim). VERIFIED: count prior services (history + pending + earlier simulated **covered claim** lines; self-pay only if `self_pay_counts_toward_frequency`) whose code is in the rule's codes, same tooth when `per_tooth`, and inside the window (`benefit_period`: same plan period; `rolling_months m`: `service_date > addMonths(this_date, −m)`). `count ≥ max_count` → NOT_COVERED (`FREQUENCY_LIMIT`). NOT_COVERED is priced, never silently dropped (D-008).
   5. `alternate_benefit` VERIFIED for the code, `lifetime_maximum` VERIFIED for the class, **(1.1)** `sublimit` VERIFIED for the code or class, `deductible.shared_across_networks=false`, `annual_maximum.shared_across_networks=false` → `RULE_TYPE_UNSUPPORTED` blocking (not modeled in v1; `BenefitPeriodState.sublimits` is always `[]`). `NOT_APPLICABLE` passes.
5. **Charge and basis**
   - In-network: `charge = provider_charge`, `allowed = contracted_allowed` (null/unknown → `ALLOWED_AMOUNT_UNKNOWN`; unknown charge → `INPUT_MISSING`; `allowed > charge` → `INPUT_INCONSISTENT`). `patient_charge = eligible_basis = allowed`, `contractual_adjustment = charge − allowed`, `balance_bill = 0`.
   - Out-of-network: unknown charge → `OON_CHARGE_UNKNOWN`. `allowance` from the VERIFIED `oon_allowance_schedule` (rule missing or code absent → `RULE_MISSING rules.oon_allowance_schedule`). `eligible_basis = min(charge, allowance)`. If `balance_billing_permitted`: `patient_charge = charge`, `contractual_adjustment = 0`, `balance_bill = charge − eligible_basis`; else `patient_charge = eligible_basis`, `contractual_adjustment = charge − eligible_basis`, `balance_bill = 0`.
6. **Deductible**: VERIFIED `deductible` required. `deductible_applied = class ∈ applies_to_classes ? min(deductible_available, eligible_basis) : 0`.
7. **Rate**: VERIFIED `plan_share` for (network, class); `basis` must match the route (else `RULE_TYPE_UNSUPPORTED`).
8. `preliminary_plan_pay = applyRateRoundHalfUp(eligible_basis − deductible_applied, rate_bps)`.
9. **Caps**: VERIFIED `annual_maximum` required for every claim line. `counts_toward_maximum = class ∈ counts_classes`. `plan_pay = min(preliminary, counts ? annual_max_available : ∞)`. `cap_applied` = the binding cap (`none` when `plan_pay = preliminary`; on a tie, `annual_maximum`).
10. `member_responsibility = patient_charge − plan_pay`. Invariant: `modeled_charge(=charge) = plan_pay + member_responsibility + contractual_adjustment`.
11. **State update**: `deductible_remaining −= deductible_applied`, `deductible_available −= deductible_applied`; if counts: `annual_max_remaining −= plan_pay`, `annual_max_available −= plan_pay`; `simulated_plan_paid += plan_pay`. Pending reservations are unchanged. Covered lines are appended to history.
12. **NOT_COVERED lines**: **(1.1)** still run step 5's charge checks (the OON allowance is not required): in-network `patient_charge = allowed`, `contractual_adjustment = charge − allowed`; out-of-network `patient_charge = charge`, `contractual_adjustment = 0`; `balance_bill = 0`. Then `status:"NOT_COVERED"`, `eligible_basis=0`, `deductible_applied=0`, `coverage_rate_bps=0`, `preliminary=0`, `plan_pay=0`, `cap_applied:"none"`, `counts_toward_maximum:false`, `member_responsibility = patient_charge`; state unchanged.

### 3.4 Self-pay line (`SELF_PAY_NO_CLAIM`, spec §8)

Requires, for the service date's plan version: VERIFIED `claim_submission` with `member_may_decline_claim = true` (and, for an in-network office, `network_provider_must_submit = false`; **(1.1)** `self_pay_counts_toward_accumulators = true` → `RULE_TYPE_UNSUPPORTED`) — missing → `RULE_MISSING rules.claim_submission`, UNKNOWN → `RULE_UNKNOWN` with the rule id; the office's `self_pay.permitted_by_office === true` (null → `SELF_PAY_NOT_VERIFIED` with `input_id` = `provider.<id>.self_pay`; false → `CLAIM_ROUTE_INVALID`); a non-null **exact** `cash_quote` (else `SELF_PAY_NOT_VERIFIED`). Then: `modeled_charge = patient_charge = member_responsibility = cash`, `plan_pay = 0`, `contractual_adjustment = 0`, `balance_bill = 0`, `deductible_applied = 0`, `eligible_basis = coverage_rate_bps = preliminary_plan_pay = null`, `cap_applied:"none"`, `counts_toward_maximum:false`, `service_class` may be null, `state_after` deep-equals `state_before`. Applied rules include `claim_submission.<y>`.

### 3.5 Steps, rule ids, input ids

- **(1.1)** Every OK/NOT_COVERED claim line has steps with ids `<line_id>.<name>` for at least `patient_charge`, `eligible_basis`, `deductible`, `coverage_rate`, `preliminary_plan_pay`, `plan_pay`, `member_responsibility`, `contractual_adjustment`; other `CALC_STEPS` names are optional. `result_cents` of `patient_charge`, `eligible_basis`, `deductible`, `preliminary_plan_pay`, `plan_pay`, `member_responsibility`, `contractual_adjustment` equal the line fields; `coverage_rate.result_bps` = `coverage_rate_bps`. Self-pay lines need at least `patient_charge`, `plan_pay`, `member_responsibility`. Unsupported lines have `steps:[]`.
- Every operand cites a fact id: `input:` for request inputs, `rule:` for VERIFIED rules (or NOT_APPLICABLE rules, e.g. "no waiting period"), `calc:` for any step in the same result (a value carried from an earlier line cites that line's `calc:<earlier_line>.<step>` or the original `input:`/`rule:`).
- `applied_rule_ids` = VERIFIED rules used (sorted). `input_ids` = request inputs used (sorted). NOT_APPLICABLE rules consulted are not "applied".
- `line_id = event_id`.

### 3.6 Simulation result

`status`: `UNSUPPORTED_PLAN_TYPE` if any line is unsupported, else `NEEDS_CONFIRMATION` if any line needs confirmation or any blocking simulation issue exists, else `OK`. `totals` is non-null only when `status` is `OK` (sums of line fields). `applied_rule_ids` = union of lines, sorted.

### 3.7 Benefit Passport

For the member's plan version covering `as_of_date`: `next_reset_date = coverage_period.end + 1 day`; `current_period` = the opened snapshot period (worst case). Sections (in this order; **(1.1)** `balances`, `rules`, `funding` required, the two coverage sections MAY be omitted): `balances` (deductible remaining & available, annual max remaining, pending reserved, available, plan paid YTD), `coverage_in_network` and `coverage_out_of_network` (one item per class rate, `value_bps`), `rules` (benefit period/reset date, deductible amount, annual maximum, waiting periods, carryover, claim submission/self-pay), `funding` (each account's balance `value_cents` and service-through `value_date`, both citing the account's balance `input_id`; monthly budget citing `member.budget`). Rule-backed items: `source` = `PLAN_VERIFIED` when the rule is VERIFIED **or (1.1) NOT_APPLICABLE** (e.g. "No waiting periods"); UNVERIFIED/UNKNOWN/CONFLICT → `source:"NEEDS_CONFIRMATION"` with `rule_status` set (the UNVERIFIED carryover is shown for confirmation, never as a fact). Each item has exactly one non-null value field (`value_text` for NOT_APPLICABLE/UNKNOWN rules, e.g. "Not addressed in the plan document"). Worst-case values only; `value_range` MAY stay null. **(1.1)** No snapshot for the current period → `passport()` throws; the API returns 400 `INVALID_REQUEST` with one `INPUT_MISSING` issue (field `member.accumulators`). The demo never hits this.

## 4. Visit Navigator (before the visit)

The navigator optimizes **access to care**, never treatment timing. `option_id = "opt-<provider_id>"`.

1. `as_of_date` (§1.3). **Safety gate**: if any `RED_FLAG_SYMPTOMS` is true → `urgent = true`, `triggered_by` = those names in `RED_FLAG_SYMPTOMS` order, `message` tells the member to contact a dentist now and take the earliest practical appointment; `status:"URGENT_CARE_ROUTE"`; `conditional_scenarios = []`; no option may suggest delay.
2. Resolve the plan for `as_of_date`; unsupported → `status:"UNSUPPORTED_PLAN_TYPE"`, `options:[]`.
3. Per provider (sorted by id): travel `distance_miles > hard_max_miles` → `excluded` with `TRAVEL_LIMIT_EXCEEDED`. Compatible slots: `kind:"exam"`, `date > as_of_date`, inside member availability (weekly window on that weekday containing `[start_time, end_time]`, date not in an `unavailable` range). None → `excluded` with `AVAILABILITY_NO_INTERSECTION`. Candidate slot = earliest by `(date, start_time, slot_id)`.
4. Price each candidate by simulating `expected_codes` (sorted) as events on the slot date with the tier's claim route (`event_id = "<option_id>-l<n>"`, `procedure_id = "visit-<code lower>"`, `tooth:null`), in both scenarios. Any NEEDS_CONFIRMATION line → option `status:"NEEDS_CONFIRMATION"`, all money fields `null`, issues copied from the lines. `exceeds_hard_monthly_limit = member_cost.high > hard_monthly_limit` (null when unpriced). `days_until = diffDays(as_of_date, slot.date)`. **(1.1)** `deductible_applied` = Σ line `deductible_applied`; `annual_max_used` = Σ `plan_pay` of lines with `counts_toward_maximum`; both as ranges over the two scenarios (null when unpriced). `network_stale` per staleness policy.
5. **Dominance** (OK candidates only): A dominates B if `cost_high`, `days_until`, `travel_minutes` and `distance_miles` are all ≤ and one is <. Drop dominated candidates.
6. **Labels**
   - `soonest`: over all remaining candidates (OK or NEEDS_CONFIRMATION) — min `(slot.date, start_time, travel_minutes, provider_id)`.
   - `lowest_cost`: OK only — min `(cost_high, days_until, travel_minutes, provider_id)`.
   - `best_overall`: urgent → the `soonest` candidate. Otherwise OK only — with `min_cost` = lowest `cost_high` and `tol = max(2500, ceil(min_cost × 1000 / 10000))` (D-012): min `(exceeds_hard ? 1 : 0, cost_high ≤ min_cost + tol ? 0 : 1, days_until, travel_minutes, cost_high, provider_id)`.
   - NEEDS_CONFIRMATION options may carry **only** `soonest` (and `best_overall` when urgent).
   - `options` = distinct labeled candidates, ordered by their first label in `[best_overall, lowest_cost, soonest]`; each option's `labels` sorted in that order; truncate to `max_options`.
7. **Tradeoffs**: for every option, one entry versus every other option (sorted by `versus_option_id`): `cost_delta = this.high − other.high` (null if either unpriced), `days_delta`, `miles_delta = round1(this − other)`, `minutes_delta`.
8. **Status**: urgent → `URGENT_CARE_ROUTE`; else `OK` if any option is OK; `NEEDS_CONFIRMATION` if options exist but none OK; `NO_FEASIBLE_SCHEDULE` if none.
9. **Conditional scenarios** (spec §5/§8): **(1.1)** v1 returns `conditional_scenarios = []` and ignores `known_procedures` entirely (deferred; no unconfirmed procedure can reach the navigator).
10. `evidence = benefits.evidenceFor(all applied rule ids)`, sorted by rule id.

## 5. Care Plan Optimizer (after the visit)

### 5.1 Validation (in this order; first failure decides the status)

1. Schema (API layer) → `INVALID_INPUT`.
2. Domain: dependency on an unknown procedure or a cycle → `INVALID_INPUT` + `DEPENDENCY_INVALID`; `planning_horizon_end < max(non-null latest_safe_date)` → `INVALID_INPUT`; more procedures/providers/slots than `SEARCH_LIMITS` → `INVALID_INPUT`. **(1.1)** After building candidates (§5.2) and before any simulation: if Π over procedures of `(candidates + 1)` > `SEARCH_LIMITS.max_schedules_evaluated` → `INVALID_INPUT` ("too many schedule combinations; narrow providers or dates"). Never run the search and abort part-way.
3. Plan type for any needed period unsupported → `UNSUPPORTED_PLAN_TYPE` (`PLAN_TYPE_UNSUPPORTED`), `alternatives:[]`.
4. Any procedure with `confirmation.status ≠ CONFIRMED` or `confirmedProcedureProblems ≠ []` → `NEEDS_CONFIRMATION`, one `PROCEDURE_UNCONFIRMED` per procedure (with `procedure_id`), `alternatives:[]` (AT-14). Free text (`description`, `dentist_statements`) never influences any decision and never appears in the result (AT-15).
   **(1.1)** Any non-null `alternative_group_id` → `NEEDS_CONFIRMATION`, `ALTERNATIVE_NOT_APPROVED` ("Ask your dentist which option to plan"), `alternatives:[]`. Choosing between clinical alternatives is deferred (spec §7.2 is honored by never choosing).
5. Secondary coverage or blocking ledger issues → `NEEDS_CONFIRMATION`, `alternatives:[]`.

`dentist_fee` is displayed only; calculations use `ProviderOption.pricing` (D-015).

### 5.2 Candidates

For each procedure, a candidate is `(provider, slot, claim_route)` where: provider specialty ∈ `allowed_specialties`; `distance_miles ≤ hard_max_miles`; slot `kind:"treatment"`; `slot.date > as_of_date`; `earliest_safe_date ≤ slot.date ≤ min(latest_safe_date, planning_horizon_end)`; member available (as §4.3); route = the tier's claim route, plus `SELF_PAY_NO_CLAIM` when the price row has a non-null `cash_quote`. A procedure may also be **unscheduled** (penalized; §5.5). Candidates are sorted by `(date, start_time, provider_id, slot_id, claim_route)`. Decision-point reduction (spec §7.1) is allowed only if results equal full enumeration on every fixture.

### 5.3 Schedules and hard constraints

A schedule picks one candidate (or unscheduled) per required procedure and exactly one member per alternative group. Hard constraints: one procedure per `(provider_id, slot_id)`; every dependency satisfied — predecessor scheduled and `min_gap ≤ diffDays(pred, this) ≤ max_gap`. Unscheduled entries carry a reason: `NO_SLOT_IN_WINDOW` when the procedure has no candidate at all, otherwise `DEPENDENCY_INVALID` (e.g. its predecessor is unscheduled or no gap-compatible pair exists); every line adjudicates to OK or NOT_COVERED in `worst_case`. A NEEDS_CONFIRMATION line disqualifies the schedule. **(1.1) Self-pay must win on the whole horizon (spec §8):** a schedule with a `SELF_PAY_NO_CLAIM` event is eligible only if, for each such event, the same schedule with that event switched to its tier's claim route adjudicates OK and has a strictly higher worst-case `total_member_cost` (one extra simulation per self-pay event; if the claim version needs confirmation, the self-pay schedule is not eligible).

**(1.1) Missing data vs. no slot.** Let `U_all` = the lexicographically smallest `unscheduled_by_urgency` over all dependency-feasible schedules (including disqualified ones) and `U_ok` = the same over eligible schedules. If `U_ok > U_all`, missing data — not the calendar — is what leaves care unscheduled: status `NEEDS_CONFIRMATION`, `alternatives:[]`, and the disqualifying lines' issues stay `blocking` in `unresolved` (AT-01). Otherwise those issues go to `unresolved` downgraded to `warning` (e.g. "2027 self-pay was not evaluated: claim submission is not addressed"). Deduplicate per §1.11.

Use exact enumeration with backtracking/pruning (spec §7.6) over procedures in canonical order and candidates in the order above. Greedy is not acceptable. `simulate` must not Zod-parse its request (the optimizer passes already-validated objects); memoizing by canonical event list is allowed.

Event ids are assigned after selection: `<alternative_id>-e<n>`, `n` = 1-based position in chronological order `(service_date, slot.start_time, procedure_id)`; benefit simulation uses the same order. Each selected schedule is re-simulated with its final event ids (worst and best case) so line, step and `calc:` ids match. Alternatives are distinct by `tie_key`.

### 5.4 Funding allocation (v1, D-009) — after adjudication, worst case

Process events chronologically. `payment_date = service_date` (no prepayment). For member responsibility `R`:

1. **Expiring restricted funds**: FSA/HRA accounts with `eligible_service_from ≤ service_date ≤ eligible_service_through` (null = open-ended), ordered by `(eligible_service_through asc, nulls last; source_id)`: take `min(R, remaining balance)` each.
2. **CASH**: `min(R, hard_monthly_limit − CASH already allocated in that YearMonth)`; `source_id:"cash"`, `input_id:"member.budget"`.
3. **HSA**: `min(R, balance − reserve_cents − already used)`.
4. `PROVIDER_PLAN`/`FINANCING` are **not modeled in v1**: when a verified plan exists, add `info FUNDING_SOURCE_INELIGIBLE` ("not modeled in v1") and ignore it.
5. Remainder → `shortfall_cents` for the event.

Allocation ids `<event_id>-f<k>` (1-based, in step order); only positive amounts. `input_id` = the account's balance input id. `monthly`: one entry per YearMonth with any allocation, sorted; `cash_cents` = CASH total; `by_source` sorted by `FundingSourceType` enum order; `exceeds_preferred/hard` vs the budget (`exceeds_hard` is always false in v1 because CASH is capped at the hard limit). `expiring_funds_unused_cents` = Σ over FSA/HRA accounts with `eligible_service_through ≤ planning_horizon_end` of `balance − used`. `funding_gap_cents` = Σ shortfalls.

### 5.5 Objective (spec §7.5) and labels

`ObjectiveVector` (worst case): `unscheduled_by_urgency` and `lateness_days_by_urgency` are `[act_now, schedule_soon, can_plan_later]`, lateness = `Σ max(0, diffDays(target_date, service_date))`; `total_member_cost_cents` = Σ member responsibility + fees; `peak_monthly_cash_cents` = max `monthly.cash_cents` (0 if none); `travel_minutes_total` = Σ over distinct `(provider, date)` visits of `travel_minutes`; `visit_days` = distinct service dates; `wait_days_total` = Σ `diffDays(as_of_date, service_date)`; `completion_date` = max service date (null if nothing scheduled; null ranks last).

`tie_key` = for procedures ordered by `(URGENCY_RANK, procedure_id)`: their service dates (`"9999-12-31"` if unscheduled), then provider ids, then routes, then slot ids (`""` for each if unscheduled) — **(1.1)** an array compared element by element, each element as a plain string.

Ranking keys (lexicographic, lower is better):

| Label | Key |
|---|---|
| `lowest_total_cost` | unscheduled, lateness, shortfall, total_member_cost, peak_monthly_cash, travel_minutes, visit_days, wait_days, expiring_unused, tie_key |
| `earliest_safe_completion` | unscheduled, lateness, shortfall, completion_date, total_member_cost, peak_monthly_cash, travel_minutes, visit_days, wait_days, expiring_unused, tie_key |
| `smoothest_monthly_payments` | unscheduled, lateness, shortfall, peak_monthly_cash, total_member_cost, travel_minutes, visit_days, wait_days, expiring_unused, tie_key |

**Two passes** (spec §7.2) over eligible schedules. **(1.1)** Let `U*` = the lexicographically smallest `unscheduled_by_urgency` among eligible schedules. Pass 1 pool = eligible schedules with `funding_shortfall = 0` **and** `unscheduled_by_urgency = U*`; if empty, pass 2 pool = all eligible schedules (the shortfall level then finds the safest schedule and exact gap). A budget never causes care to be left unscheduled, and deadlines are never relaxed. (1.0.0 let pass 1 drop the crown to reach zero shortfall — see CHANGELOG.) For each label in table order take the best schedule in the pool; if already selected, add the label to it. `alternatives` in order of first selection, ids `alt-1…`, truncated to `max_alternatives`; `recommended_alternative_id = "alt-1"`. Benefit utilization is never an objective.

After selection, re-simulate each chosen schedule in `best_case` for `line_best`, `member_cost`/`plan_pay` ranges and `totals` ranges. With exact inputs `line_best` deep-equals `line_worst`.

### 5.6 Status

Precedence: `INVALID_INPUT` > `UNSUPPORTED_PLAN_TYPE` > `NEEDS_CONFIRMATION` (validation, or `U_ok > U_all` per §5.3 → `alternatives:[]`) > `NO_FEASIBLE_SCHEDULE` (alt-1 leaves a procedure unscheduled; `unresolved` gets `NO_SLOT_IN_WINDOW` for each procedure with no candidate, plus `DEADLINE_UNMET` for unscheduled `act_now`/`schedule_soon`) > `BUDGET_SHORTFALL` (pass 2; `unresolved` gets `BUDGET_SHORTFALL`) > `OK`. `unresolved` also carries simulation-level issues of the selected schedules (pending claims, stale inputs), deduplicated.

### 5.7 Reasons and next actions (per event)

Reasons, sorted in enum order. **Required (1.1):** `WITHIN_SAFE_WINDOW` (always); `MEETS_DENTIST_TARGET` or `AFTER_DENTIST_TARGET`; `HEALING_INTERVAL` (procedure has a dependency); `AFTER_PLAN_RESET` (plan version differs from that of the procedure's earliest candidate date); `USES_EXPIRING_FUNDS` (an FSA/HRA allocation); `SELF_PAY_LOWER_PORTFOLIO_COST` (route is self-pay — true by construction, §5.3). **Optional (MAY):** `EARLIEST_COMPATIBLE_SLOT` (date equals the procedure's earliest candidate date); `BEFORE_PLAN_RESET` (a candidate exists in a later plan period than the chosen one); `FITS_MONTHLY_BUDGET` (a CASH allocation).

Next actions, sorted in enum order: `REQUEST_APPOINTMENT` (always; provider + slot); `REQUEST_PRETREATMENT_ESTIMATE` (claim route, VERIFIED `pretreatment_estimate` of the event's plan version — looked up with `resolvePlanVersion` on the registry — and worst-case `patient_charge > recommended_above_cents`); `CONFIRM_SELF_PAY_WITH_OFFICE` (self-pay; `by_date = service_date`); `SUBMIT_FSA_CLAIM` (FSA/HRA used; `by_date = claim_deadline`).

### 5.8 Trace and evidence

`decision_trace` is deterministic (no timings): **(1.1) exactly** `INPUT_VALIDATED`, `CANDIDATES_BUILT` (counts per procedure, keys sorted), `SEARCH_PASS`, one `ALTERNATIVE_SELECTED` per alternative with its objective vector — nothing else in v1. `search_stats`: `candidates_built` = Σ candidates, `schedules_evaluated` = dependency-feasible complete assignments handed to `simulate`, `schedules_feasible` = eligible schedules, `pass`. No test pins their values; AT-06 requires only that they are order-independent. `evidence` = `evidenceFor(union of applied rule ids)`, sorted. `benefit_states` = `state_after` of each event in event order.

## 6. AI: extraction and explanation

### 6.1 Extraction (`ProcedureExtractor`)

- Output procedures are **always** `UNVERIFIED` (`confirmed_by:null`, `confirmed_at:null`); `raw_retained:false`; nothing is logged.
- **Injection scanner** runs on every input line before parsing, in every mode. A line matching any of (case-insensitive) `ignore (all |any )?(previous|prior|above) instructions`, `\bsystem( override)?\b\s*[:.]`, `\bdisregard\b`, `\byou are (now )?(an?|the)\b`, `\b(set|change|mark|make)\b.{0,60}\b(annual maximum|deductible|fees?|urgency|deadline|can plan later|act now)\b` is dropped from parsing and recorded in `ignored_instructions` (**(1.1)** `text` = the line truncated to 500 characters), with one `warning` `PROMPT_INJECTION_SUSPECTED`. Known limitation: some benign lines (e.g. "make an appointment before the deductible resets") are also dropped; the member re-enters them on the confirmation screen.
- **Synthetic mode** (default; zero network): a deterministic parser for the card format in `fixtures/synthetic/documents/card-2026-10-15.txt` (`N. Tooth #T - Description (CODE) - Fee $X`, `Dentist timing: URGENCY. Earliest M/D/Y. Target M/D/Y. No later than M/D/Y.`, `After #K. Wait at least A days and no more than B days…`, `May be performed by a general dentist or an endodontist.`). A missing code may be inferred from a small documented table (e.g. "tooth-colored, 2 surfaces" on a posterior tooth → D2392) and listed in `inferred_fields`. `procedure_id = "proc-<code lower>-<tooth|na>"` (suffix `-2`, `-3` on collision). Fee input id `proc.<procedure_id>.dentist_fee`, `source:"PROVIDER"`, `observed_at = as_of`. `allowed_specialties` from the specialty line, default `["general"]`. `dentist_statements` = the verbatim supporting lines. Transcripts in synthetic mode MAY use a labeled saved extraction keyed by `document_id` (**(1.1)** optional); unrecognized text — and **(1.1)** any request with `image` and no `text` — returns `procedures:[]` with `warning AI_UNAVAILABLE` ("enter procedures manually"). Image intake is deferred in v1.1 (the UI offers card text only).
- **Live mode — deferred in v1.1 (MAY).** Until implemented, `createAiAdapters({mode:"live"})` returns the synthetic extractor and template explainer and adds `warning AI_UNAVAILABLE`. If built later (`AI_MODE=live` and `AI_ENABLED=true`): AWS Bedrock Converse via `src/ai/*.server.ts` only (credentials from the server credential chain; `AWS_REGION`, `BEDROCK_MODEL_ID`). Strict JSON schema output, local Zod validation, quotes must be literal substrings, `API_LIMITS.ai_timeout_ms` timeout, SDK retries off, no automatic retry. Any failure → synthetic result + `AI_UNAVAILABLE`. The model never sets confirmation, never calculates.

### 6.2 Explanation input (`buildExplanationInput`)

Only: the final result; `focus_id` (default `recommended_alternative_id` / first option); `rule_catalog` (every rule of the member's plan versions: id, version, status); `evidence_passages` for the focus's applied rules; `confirmed_facts` — for each procedure, fact ids `proc:<id>.<field>` with texts starting "Your dentist said:" (urgency text contains the `URGENCY_LABEL`, dates in display format), **(1.1)** built only from structured fields (code, tooth, urgency, dates, gaps, specialties) — never from `description` or `dentist_statements`; `missing_fields` = messages of blocking/warning issues in `unresolved` (or option issues) with codes `INPUT_*`, `RULE_*`, `PROCEDURE_UNCONFIRMED`, `OON_CHARGE_UNKNOWN`, `ALLOWED_AMOUNT_UNKNOWN`, `SELF_PAY_NOT_VERIFIED`, deduplicated, in issue order.

### 6.3 Template explainer (deterministic, offline)

`summary` contains `formatUsd(focus.totals.member_cost.high_cents)` ("Estimated member cost is $1,372 …"; with a range: "between $X and $Y"). One claim per event (**(1.1)** "<cdt_code>, tooth <tooth> on <Nov 5, 2026>: plan pays $P, you pay $M." — from `line_worst`, never from free text) citing `calc:<line>.plan_pay` and `calc:<line>.member_responsibility`; a claim citing `rule:annual_maximum.<y>` when a cap binds; `rule:benefit_period.<y>` (the event's plan-version year) when `AFTER_PLAN_RESET`; the FSA account's input id when expiring funds are used; `rule:claim_submission.<y>` and the cash-quote input for self-pay. `missing_data` = `missing_fields` verbatim. For a visit-navigator result: the summary names the focus option's estimated member cost and appointment date, and one claim per option cites its lines' `calc:` steps (and `rule:oon_allowance_schedule.<y>` for out-of-network options). Uses only `formatUsd` and `formatDisplayDate`. Must pass `validateExplanation`.

### 6.4 `validateExplanation(explanation, input)` — spec §9 rejection rules

1. Schema (`Explanation`) failure → `SCHEMA_INVALID` only.
2. Every `$` amount in summary/claims (**(1.1)** regex `\$(\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{2})?(?!\d|,\d)` — "$1372" is read as $1,372, not $137) must equal some `*_cents` value anywhere in the result → else `DOLLAR_AMOUNT_NOT_IN_RESULT`.
3. Each claim's fact ids: unparseable or unknown → `UNKNOWN_FACT_ID`. `rule:` not in `rule_catalog` → `UNKNOWN_FACT_ID`; status ≠ VERIFIED → `UNVERIFIED_RULE_CITED`; plan version not used by the focus → `WRONG_PLAN_VERSION`. `input:` must appear in the result (line `input_ids`, funding `input_id`, or operand fact ids); `calc:` must be a step id in the result; `proc:` must be in `confirmed_facts`; `result:` must start with an existing alternative/option id.
4. Every `missing_fields` entry must appear verbatim in `missing_data` → else `MISSING_DATA_OMITTED`.
5. Dates written as `MMM D, YYYY` or `YYYY-MM-DD` must be dates present in the result or in `confirmed_facts` → else `DATE_NOT_IN_RESULT`.
6. A claim citing `proc:<id>.urgency` whose text contains an urgency label other than that procedure's confirmed label → `URGENCY_CHANGED`.
7. Any `WORDING.forbidden_phrases` (case-insensitive) → `FORBIDDEN_PHRASE`.

Rules 2, 5, 6 and 7 apply to `summary` and `claims[].text` only (`missing_data` is engine text). `CLAIM_WITHOUT_FACT_ID` is reserved: an empty `fact_ids` fails the schema first (`SCHEMA_INVALID`). Known limitation: a plan claim citing only `calc:` ids is not detected semantically. `ok = violations.length === 0`. Live explanations that fail validation are discarded and the template is returned (`fell_back_to_template:true`).

## 7. API

Routes (`API_ROUTES` in `src/domain/api.ts`). `src/app/api/<route>/route.ts` are thin wrappers: read the body with `await req.text()` and enforce `API_LIMITS.max_body_bytes` on its UTF-8 byte length (413 — Next.js route handlers have no built-in limit); **(1.1)** POST requires `content-type: application/json`, and a present `Origin` header whose host ≠ `Host` → 400 `INVALID_REQUEST` ("cross-origin request"; a missing Origin is allowed); parse JSON (400 on failure); call the handler from `createApiHandlers()` (dependencies built lazily, schema parsed before any engine is touched); return its status and body. Handlers:

| Route | Behavior |
|---|---|
| `GET /api/health` | `HealthData` (contract version, `ai_mode`, registry version, plan version ids sorted). |
| `GET /api/scenario` | `loadDemoScenario()` — synthetic **inputs** only (member, providers, document texts, visit defaults, **(1.1)** `planning_horizon_end`). Never precomputed results. The UI uses its `previsit_as_of`/`postvisit_as_of`, never the wall clock. |
| `POST /api/passport` | `benefits.passport(registry, member, as_of)`. |
| `POST /api/visit-navigator` | `visitNavigator.navigate(registry, body)`. |
| `POST /api/intake/extract` | `ai.extractor.extract(body)`. |
| `POST /api/intake/confirm` | For each procedure: if `confirmedProcedureProblems` (ignoring the status check) is empty → `CONFIRMED`, `confirmed_by`, `confirmed_at = as_of`; otherwise unchanged + `PROCEDURE_UNCONFIRMED` issue listing the problems. Clinical values are never altered. |
| `POST /api/care-plan` | `carePlanOptimizer.optimize(registry, body)`. |
| `POST /api/explain` | Recompute the result from `request` (never trust client totals) → `buildExplanationInput` → explainer → validate → fallback to template. |

Envelopes: `okEnvelope(data)` with `meta.generated_by:"engine"`, `meta.synthetic_data:true`; errors use `ErrorEnvelope` + `HTTP_STATUS`. Engine statuses (e.g. `NEEDS_CONFIRMATION`) are **200** responses. Schema failures → 400 `INVALID_REQUEST` with `SCHEMA_INVALID` issues (paths, not values). Log only route, status, duration and request id — never bodies, transcripts, images or member identifiers. `request_id` from an `x-request-id` header matching `^[A-Za-z0-9-]{1,64}$`, else `crypto.randomUUID()`. **(1.1)** Client code (`src/ui/**`, `src/components/**`, client components) imports only `@/domain` and calls `/api/*` (lint-enforced).

## 8. Out of scope in v1

DHMO/indemnity/discount adjudication (clear `UNSUPPORTED_PLAN_TYPE`), COB/secondary coverage, rollover/MaxRewards calculation, lifetime maxima, alternate-benefit pricing, provider payment plans and financing, live eligibility/claims/booking integrations, raw audio capture, arbitrary-document OCR beyond the synthetic card format, **(1.1)** image intake, live Bedrock (optional), clinical alternative groups, conditional "save benefits" scenarios, sublimit modeling, the generated plan comparison document (spec §3 item 6). Each returns an explicit issue rather than an approximation.
