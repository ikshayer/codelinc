# Contract changelog

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
