# Contract changelog

## 1.8.0 — 2026-10-04 — FROZEN (exact appointment pins and passport identity)

Frontend alignment change request authorized by the task's exact-pin acceptance criteria. The attachment asserted existing locks, but this checkout lacked them; this additive extension supplies the required backend behavior. No existing golden values change.

- Add strict `ScheduleLock`, optional `CarePlanRequest.schedule_locks`, and `ScheduledEvent.user_locked`.
- Branch integration preserves the 1.8 exact-pin limit of eight, combines the registry and persistence additions, and adopts early `INVALID_INPUT` validation when two locks claim the same provider appointment. AT-24 and integration assertions use that shared behavior.
- Filter exact pin tuples before bounded search, forbid unscheduling pins, preserve clinical/dependency/slot constraints, and explicitly reject invalid or impossible pins.
- Add registry-derived `BenefitPassport.plan_option_id` and `.network_id`; export `HealthData` type.
- Regenerate schema-valid mocks and frozen manifest. AT-24 covers preservation, mode changes, reset, validation, incompatible pins, all-event pins, bounded-search preservation, and API strictness.
- Existing alternative differences remain relative to the current run's recommendation. Cross-request before/after differences, arbitrary field locks, custom schedules, payment plans, persistence, and production identity remain separate work.

## 1.7.0 — 2026-10-04 — FROZEN (recommendation modes, deltas, solver metadata)

CR 1.7.0 (MVP loop iteration 3; decision D-030). **No existing golden number changed**: with the default `BALANCED` mode the alternatives are identical to 1.6. Clauses marked **(1.7)**.

| # | Where | Change | Why |
|---|---|---|---|
| 1 | `optimizer.ts` `CarePlanRequest`, CONTRACT §5.5 | Optional `preferences: { mode }` (`RecommendationMode`); `CarePlanResult.mode`. | §6.2 modes that rerank; older requests still parse. |
| 2 | `AlternativeLabel` | New `lowest_member_cost` (winner of the LOWEST_TOTAL_COST key; only when that mode is selected). | `lowest_total_cost` is the BALANCED (§6.1) winner; cost-first needs its own key. |
| 3 | `Alternative.difference_from_recommended` (`AlternativeDifference`) | Concrete this − recommended differences. | §6.3, UI-011 (no scores). |
| 4 | `CarePlanResult.solver_meta` (`SolverMeta`); §5.1 limit | Bounded search returns `BOUNDED_BEST_FOUND` instead of `INVALID_INPUT`; `elapsed_ms` always null. | §6.4, §14.3 #10; determinism. |
| 5 | `issues.ts` | `SAME_DAY_ORDER_AFFECTS_COST` warning. | §6.5. |

## 1.6.0 — 2026-10-04 — FROZEN (plan options, premiums, rollover review fixes)

CR 1.6.0 (MVP loop iteration 2b, `docs/mvp-loop/current-plan.md`; decision D-029). **No existing golden number changed**; the only edit to a pre-existing golden path is the mechanical key migration in #6 (same numbers). New plan-option values are additions. Clauses changed in CONTRACT-v1.md are marked **(1.6)**.

| # | Where | Change | Why |
|---|---|---|---|
| 1 | `data/sources/` (3 new), `manifest.json`, CONTRACT §2.1 | PPO Value 2026 and PPO Enhanced 2026 summaries; Acme 2026 enrollment guide (`employer_summary`, premiums for all three options). Appended after the existing sources; existing bytes unchanged. | PLAN-004, §13. |
| 2 | `src/domain/plan.ts` | `SourceDocument.plan_version_id` → `plan_version_ids` (one group's packet); `PremiumValue` + `premium` rule type; `registryRuleIdProblems`. | A shared employer document; rule ids must be registry-unique because `evidenceFor` and `rule:` fact ids look up by id. |
| 3 | `registry-expectations.json`, `build-registry.ts`, CONTRACT §2.3 | Two new plans (ids `<stem>.<option>.<year>`); `premium.2026` VERIFIED, `premium.2027` UNKNOWN on Standard; per-plan keys, names and quote overrides; premium row must name its own option. Standard rule values unchanged. | PLAN-001/004. |
| 4 | `src/domain/benefits.ts`, `ports.ts`, `api.ts`, CONTRACT §3.10, §7 | `PlanOptionSummary`, `PlanOptionsResult`, `BenefitEngine.planOptions`, `POST /api/plan-options` (body `{as_of, member}`). | Expose option data; the comparison screen is deferred. |
| 5 | CONTRACT §3.7 | Per-class waiting-period passport items; bonus text on the carryover item. Standard passport output unchanged. | A 12-month Major wait must not read "No waiting periods". |
| 6 | `benefits.ts` `RolloverOutcome`, CONTRACT §3.9 | `settled_plan_paid_cents` → `settled_plan_paid` (range), scenario-independent; a ranged carryover balance needs confirmation. **Response reshape** (technically breaking for `RolloverOutcome` readers; kept minor because 1.5.0 introduced it in this unreleased train and the only consumer, `/care-window`, is migrated in the same change). `expected.json`: 4 entries migrated `X` → `{X, X}`. | Review R2-M1. |
| 7 | `src/ai/explain.ts`, CONTRACT §6.3/§6.4 | Shift sentence states its direction; the validator also accepts `|*_delta_cents|`. AT-21 wording updated. | Review R2-L1. |
| 8 | `scripts/frozen-files.mjs`, `check-frozen.mjs`, `freeze.mjs`, root `.gitattributes` | Text files hashed with CRLF normalized to LF (sources stay byte-exact); manifest parsed with `?
`; `* text=auto eol=lf`. | W-1: `core.autocrlf=true` checkouts failed every frozen check. |

## 1.5.0 — 2026-10-04 — FROZEN (year-close maximum carryover)

CR 1.5.0 (MVP loop iteration 2, `docs/mvp-loop/current-plan.md`; decision D-028). **No existing golden number changed** (`npm run golden:check`); new rollover values are additions. Clauses changed in CONTRACT-v1.md are marked **(1.5)**.

| # | Where | Change | Why |
|---|---|---|---|
| 1 | `data/sources/northwind-ppo-2026-carryover-rider.md`, `manifest.json`, CONTRACT §2.1 | New synthetic source, role `amendment`, appended last; 2026 `source_precedence` = rider, summary. | The summary defers to a rider that was missing; `rollover.2026` becomes VERIFIED with literal quotes. |
| 2 | `src/domain/plan.ts` | `RolloverValue` replaced by the explicit model (basis, `LT`/`LTE`, award, bonus and condition, cap, eligible-claim flag, bank treatment, forfeit, next plan version ids). | Requirements §5.1. |
| 3 | `src/domain/member.ts`, CONTRACT §3.1 | `AccumulatorSnapshot.carryover_balance` (optional, default null = unknown); the maximum consistency checks include an exact balance. | §5.2 ledger state; old requests still parse (review L-2). |
| 4 | `src/domain/benefits.ts`, `fact-ids.ts`, `issues.ts`, CONTRACT §3.6, §3.9 | `RolloverStatus`, `RolloverOutcome`, `SimulationResult.rollover`; `ROLLOVER_STEPS`, `rolloverStepId`; codes `ROLLOVER_UNCERTAIN`, `ROLLOVER_NEXT_PLAN_UNKNOWN`, `ROLLOVER_NEXT_PLAN_INELIGIBLE`. A VERIFIED rollover no longer blocks (`RULE_TYPE_UNSUPPORTED` removed); it is closed once per period, carried into a fresh next period in `best_case` only. | ROLL-001..009. |
| 5 | `src/domain/optimizer.ts`, CONTRACT §5.5, §5.10 | `Alternative.rollover`, `ScheduledEvent.rollover_shift` (`RolloverShift`, display only); `line_best` may differ from `line_worst` where a conditional carryover is applied. | ROLL-010, UI-007, §11.2 (per alternative). |
| 6 | CONTRACT §3.7, §6.3, §6.4, §8 | Passport carryover text; template carryover sentences; closing plan versions count as used by the focus; rollover removed from out-of-scope. | §5.4. |
| 7 | `fixtures/golden/registry-expectations.json`, `expected.json`, `golden-scenario.md`, `scripts/golden-check.mjs` | VERIFIED `rollover.2026` (with `evidence_source_id`); additions `postvisit.base.alternatives[].rollover`, `postvisit.rollover_shift_null_for`, `postvisit.variants.rollover_near_threshold`, derived independently by the checker. | §13. |
| 8 | `fixtures/synthetic/member.json`, `fixtures/mock-responses/**` | 2026 `carryover_balance` $0; mocks carry `rollover`, `rollover_shift: null` and the VERIFIED passport item; the `RULE_UNVERIFIED rollover.2026` warning is gone. | |
| 9 | `tests/acceptance/at21-rollover.test.ts`, AT-00/02/16/20, `tests/contracts/fixtures.test.ts`, `docs/acceptance.md` | New AT-21; tests that assumed one five-page source per plan or an UNVERIFIED carryover were corrected (see `docs/acceptance.md`). | |
| 10 | `src/domain/version.ts` | `CONTRACT_VERSION = "1.5.0"`; `ENGINE_IDS` unchanged. | Minor: response fields and issue codes are additive; the new request key is optional; `RolloverValue` is server-owned registry data regenerated in the same change. |

### Change requests

| CR | From | Summary | Decision | Version |
|---|---|---|---|---|
| CR 1.5.0 | Planner (MVP loop iteration 2) | Year-close carryover model, outcome, shift, rider source | Accepted | 1.5.0 |

## 1.4.0 — 2026-10-04 — FROZEN (plan identity, network per plan, source authority, price validity)

CR 1.4.0 (MVP loop iteration 1, `docs/mvp-loop/current-plan.md`; decision D-027). **No golden number changed** (`npm run golden:check`). Clauses changed in CONTRACT-v1.md are marked **(1.4)**.

| # | Where | Change | Why |
|---|---|---|---|
| 1 | `src/domain/provider.ts`, CONTRACT §3.3 step 2, §3.4 | `ProviderOption.network.tier` nullable; `network.network_id` = the plan network the status was verified against. Effective tier = tier only when `network_id` equals the resolved version's `key.network_id`; else blocking `NETWORK_STATUS_UNKNOWN`. Plan version resolves **before** the route check. | PLAN-002: tier is per plan, office and service date, never assumed. |
| 2 | `src/domain/optimizer.ts`, CONTRACT §4 step 4 | `VisitOption.network_tier` nullable, taken from the simulated lines. | Same. |
| 3 | `src/domain/plan.ts`, CONTRACT §2.1, §2.4 | `SourceRole`, `AUTHORITATIVE_SOURCE_ROLES`, `SourceDocument.document_role`, `PlanDefinition.source_precedence`; `validatePlan` adds `SOURCE_NOT_AUTHORITATIVE` and `SOURCE_PRECEDENCE_INVALID`. | PLAN-003: educational material never backs a calculation rule. |
| 4 | `src/domain/provider.ts`, CONTRACT §3.4, §3.8 | `ProcedurePrice.cash_quote_valid_through`; null → `SELF_PAY_NOT_VERIFIED`, past the service date → `PRICE_QUOTE_EXPIRED`. §3.8 maps spec §9 `PriceFact` to existing fields. | PRICE-002 / FUND-003 quote validity. |
| 5 | CONTRACT §1.9 | Price staleness (`INPUT_STALE` warning on the line) is required from benefits. | PRICE-002. |
| 6 | CONTRACT §3.2 | `event_id` is the explicit same-day sequence (documented; behavior unchanged). | §6.5, REC-006 (AT-20). |
| 7 | `src/domain/issues.ts`, CONTRACT §6.2 | New codes `NETWORK_STATUS_UNKNOWN`, `PRICE_QUOTE_EXPIRED`, `SOURCE_NOT_AUTHORITATIVE`, `SOURCE_PRECEDENCE_INVALID`; the first two feed `missing_fields`. | |
| 8 | `data/sources/manifest.json`, `fixtures/synthetic/providers.*.json` | Both sources `document_role: "schedule_of_benefits"`; BrightSmile `network_id: "nwd-ppo"`; every price row has `cash_quote_valid_through` (Rivera D2392 `2027-06-30`, others null). | Keeps every golden number. |
| 9 | `src/domain/version.ts`, `fixtures/mock-responses/**`, `scripts/golden-check.mjs` | `CONTRACT_VERSION = "1.4.0"`; mocks regenerated (version string only); checker banner reads the current version. | |
| 10 | `tests/acceptance/at20-plan-identity-network-sources.test.ts`, `docs/acceptance.md` | New AT-20 (27 tests). | |

### Change requests

| CR | From | Summary | Decision | Version |
|---|---|---|---|---|
| CR 1.4.0 | Planner (MVP loop iteration 1) | Network per plan, source roles/precedence, quote validity, price staleness, explicit order | Accepted | 1.4.0 |

## 1.3.0 — 2026-10-04 — FROZEN (repair gate: independent review fixes)

CR 1.3.0 (Planner, from `docs/review/REVIEW.md`). **No golden number changed** (`npm run golden:check`). Clauses changed in CONTRACT-v1.md are marked **(1.3)**.

| # | Where | Change | Why |
|---|---|---|---|
| 1 | CONTRACT §3.1 fresh period | A deductible/annual_maximum rule that is not exactly one VERIFIED rule puts the blocking `RULE_*` issue on every line of that period; the care plan surfaces it in `unresolved`. | Review P1-1: 2027 options vanished silently. |
| 2 | CONTRACT §4 step 2 | Urgent + unresolvable/unsupported plan → `URGENT_CARE_ROUTE`, `options:[]`, plan issues kept. | Review P2-1. |
| 3 | CONTRACT §4 step 6 | Urgent → `lowest_cost`/`best_overall` only among candidates on the soonest date. | Review P1-3: spec §5 "do not recommend delay to save benefits". |
| 4 | CONTRACT §6.4 | Normalize text (NFKC, strip format chars, collapse whitespace) before rules 2/5/7 and the §6.1 scanner; wider money and date grammars; malformed money rejected. | Review P2-2, P2-3. |
| 5 | `src/domain/version.ts`, `fixtures/mock-responses/**` | `CONTRACT_VERSION = "1.3.0"`; mocks regenerated. | |

Also fixed without contract change: OON allowance rows quoted literally in `data/plans/**` (P1-2); server Origin check compares with `Host` only (P2-4).

### Change requests

| CR | From | Summary | Decision | Version |
|---|---|---|---|---|
| CR 1.3.0 | Reviewer → Planner | Urgent label rule, fresh-period rule issues, §6.4 normalization | Accepted | 1.3.0 |

## 1.2.0 — 2026-10-04 — FROZEN (additive: cash vs claim)

CR 1.2.0 (Planner). **No existing golden number changed**; new golden values only. Clauses added in CONTRACT-v1.md are marked **(1.2)**.

| # | Where | Change | Why |
|---|---|---|---|
| 1 | `src/domain/optimizer.ts` | New `RouteComparison` (`claim_route`, `claim_total_cents`, `cash_total_cents`, `difference_cents`, `winner_claim_route`, `missing`); `ScheduledEvent.route_comparison: RouteComparison \| null`. `CONTRACT_VERSION = "1.2.0"`. | Spec §8: show the cash-vs-claim tradeoff over the whole horizon, not just the chosen route. |
| 2 | CONTRACT §5.9 | Definition: re-simulate the whole schedule (worst case) with the event as claim vs self-pay; null + `missing` warnings when not evaluable; tie → claim; not a ranking input; no new trace kind. | Knock-on effects (annual maximum left for the crown) are the whole point. |
| 3 | `fixtures/golden/expected.json` | `postvisit.route_comparisons`: base earliest (Oct 22: $1,456 claim vs $1,426 cash, $30, cash wins), base lowest (Jan 5, 2027: $1,372 claim, cash unknown — `RULE_UNKNOWN`), filling-this-year (Dec 3 and Oct 22: cash wins by $30), office self-pay unknown (Oct 22: $1,456 claim, cash unknown — `SELF_PAY_NOT_VERIFIED`); root canal and crown `null`. | |
| 4 | `scripts/golden-check.mjs` | Re-derives every route comparison by flipping the route and re-adjudicating with its own `adjudicate()` (still no `src/` imports); asserts to the cent. | Independent check of the new numbers. |
| 5 | `tests/acceptance/at19-cash-vs-claim.test.ts`, `docs/acceptance.md` | AT-19 (+7 tests). | |
| 6 | `scripts/build-mocks.ts` → `fixtures/mock-responses/**` | Mocks regenerated with `route_comparison` and contract 1.2.0. | UX builds the cash-vs-claim card on mocks. |

**Tooling/docs** — root README: run backend Claude Code sessions from `backend/`; D-024 and `docs/ownership.md` corrected for the `frontend/` + `backend/` layout.

### Change requests

| CR | From | Summary | Decision | Version |
|---|---|---|---|---|
| CR 1.2.0 | Planner | Cash vs claim route comparison per event | Accepted | 1.2.0 |

## 1.1.0 — 2026-10-03 — FROZEN (pre-build review)

Independent review by the four agents in read-only mode (`docs/review/contract-review-v1.md`) plus a Planner brute-force re-derivation of every golden number (`scripts/golden-check.mjs`). **No golden number changed.** Clauses changed in CONTRACT-v1.md are marked **(1.1)**.

**Behavior (CONTRACT)**

| # | Clause | Change | Why |
|---|---|---|---|
| 1 | §5.5 | Pass 1 = zero shortfall **and** `unscheduled = U*` (best eligible). | P0: 1.0.0 let the $40-budget variant reach zero shortfall by leaving the crown unscheduled (golden expects pass 2, gap $92). |
| 2 | §5.3, §5.6 | `U_ok > U_all` → `NEEDS_CONFIRMATION`, `alternatives:[]`, blocking issues; else downgrade to warnings. | P0: with `annual_maximum.2026` missing, 1.0.0 returned `NO_FEASIBLE_SCHEDULE` with a filling-only plan; AT-01 and spec §13.1 require `NEEDS_CONFIRMATION`. |
| 3 | §5.3 | Self-pay event eligible only if strictly cheaper than the same schedule with a claim. | Spec §8: 1.0.0's tie_key argument did not hold for the smoothest/earliest labels. |
| 4 | §5.1, policy | Combination count checked before searching; `max_schedules_evaluated` 2,000,000 → 50,000. | 2M simulations ≈ 10–30 min before failing. |
| 5 | §1.5, §1.11, §5.2, §5.5, §5.8 | Canonical input/candidate order; issue dedupe key; element-wise `tie_key` (`""` when unscheduled); null ordering; trace = exactly 4 kinds; `search_stats` defined. | AT-06 byte-equality. |
| 6 | §1.11, §6.2, §6.3 | Messages and explanation text never contain free text; template names procedures by code + tooth. | Prompt-injection path to the explainer; §6.3 referenced a field `ExplanationInput` lacks. |
| 7 | §1.6, §3.1, §3.6 | `source:NEEDS_CONFIRMATION` = unknown; blocking ledger issue blocks every line in its period; `totals` null unless OK. | Unverified data could reach arithmetic. |
| 8 | §3.3–§3.5, §3.7 | 8 required calc steps (others optional); VERIFIED sublimit → `RULE_TYPE_UNSUPPORTED`; NOT_COVERED pricing defined; claim lines never read `claim_submission`; passport: NOT_APPLICABLE = plan-verified, coverage sections optional. | Scope cuts / under-specification. |
| 9 | §4.4, §4.6, §4.9, §5.1, §5.7 | VisitOption `deductible_applied`/`annual_max_used` defined; urgent best_overall exception; conditional scenarios `[]` and `known_procedures` ignored; alternative groups → `NEEDS_CONFIRMATION`; only 6 reason codes required. | Undefined fields / contradictions / cuts. |
| 10 | §6.1, §6.4, §7, §8 | Live Bedrock and image intake deferred; transcript saved extraction optional; injection text truncated to 500; dollar regex fixed; validator scope; Next 16 route wrapper rules (byte limit, JSON content type, Origin check, request-id regex, lazy deps). | UX brief was ~6–9 h; Next 16 route handlers have no built-in body limit or origin check. |

**Schemas (`src/domain/**`)** — `MemberState.time_zone` must be a valid IANA zone; `DemoScenario.planning_horizon_end` added; `AdjudicationLine.network_tier` nullable (provider missing); `ExplanationInput.missing_fields` / `Explanation.missing_data` max 500 (= `Issue.message`); `SEARCH_LIMITS.max_schedules_evaluated = 50_000`; ports comment fixed. Additive or tightening only — no field removed or renamed.

**Tests** — AT-01 plan-identity case (+1 test); AT-02 passport NOT_APPLICABLE; AT-07/08 Oct 29 check now exercises the healing gap; AT-15 asserts injected text never appears in output; AT-16 dollar regex; AT-17 split (+3 tests). **Mocks** regenerated: §4.4/§6.1 ids, sorted rule ids, passport `rules` section, implied warnings.

**Tooling** — guard hook fails closed (exit 2), is case-insensitive, never lets Write/Edit create `.claude/UNFREEZE`; the hook, `.claude/settings.json`, `scripts/{frozen-files,check-frozen,freeze}.mjs`, `golden-scenario.md` and `acceptance.md` are now in the freeze manifest; `npm run freeze` requires approval (`ask`); `npm run golden:check` added to `verify`; ESLint blocks engine/AI/mock imports from client code; `.gitattributes` keeps source checksums stable; `.mcp.json` pins shadcn 4.21.1.

### Change requests

| CR | From | Summary | Decision | Version |
|---|---|---|---|---|
| R-OPT-1, R-REV-P0 | optimizer, reviewer, Planner checker | Pass-1 unscheduled floor | Accepted | 1.1.0 |
| R-OPT-2 | optimizer | Missing data vs. no slot (`U_ok`/`U_all`) | Accepted | 1.1.0 |
| R-REV-P1-3 | reviewer | Self-pay whole-horizon dominance | Accepted | 1.1.0 |
| (see `docs/review/contract-review-v1.md` for all 60+ findings and the deferred list) | | | | |

## 1.0.0 — 2026-10-03 — FROZEN

Initial contract by the Planner/Integrator.

- Schemas: `src/domain/**` (primitives, money, dates, issues, plan, member, provider, procedure, benefits, optimizer, ai, api, fact-ids, policy, ports).
- Behavior: `docs/contracts/CONTRACT-v1.md`.
- Fixtures: `fixtures/synthetic/**`, `fixtures/golden/**`, `fixtures/mock-responses/**`; immutable sources in `data/sources/**`.
- Acceptance suite: `tests/acceptance/**` (AT-00…AT-18 + golden); contract tests: `tests/contracts/**`.
- Freeze manifest: `docs/contracts/FROZEN.sha256` (`npm run check:frozen`).

### Change requests

| CR | From | Summary | Decision | Version |
|---|---|---|---|---|
| — | — | Initial freeze | — | 1.0.0 |
