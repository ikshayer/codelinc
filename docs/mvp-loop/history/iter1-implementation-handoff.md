# CareWindow MVP loop: implementation handoff

Implementer: Agent 2, iteration 1 (contract 1.3.0 → 1.4.0). Date: 2026-10-04. Branch `feature/cash-vs-claim`, uncommitted (no commit made). Baseline uncommitted work preserved; changed files listed below were diffed against the pre-iteration snapshot.

## Requirements completed

| ID | Result |
|---|---|
| PLAN-001 | Proven by tests: changing any of carrier, group, plan option, jurisdiction or network in the member key, or a 2028 service date, gives `PLAN_NOT_FOUND` with no `plan_version_id` (AT-20). No code change needed. |
| PLAN-002 | Implemented. Effective tier = `provider.network.tier` only when `provider.network.network_id === resolvedPlan.key.network_id`; otherwise unknown → blocking `NETWORK_STATUS_UNKNOWN`, never priced. Evaluated per line (per service date and office). `ProviderOption.network.tier` and `VisitOption.network_tier` are nullable. |
| PLAN-003 | Implemented. `SourceRole`, `AUTHORITATIVE_SOURCE_ROLES`, `SourceDocument.document_role`, `PlanDefinition.source_precedence`. `validatePlan` adds `SOURCE_NOT_AUTHORITATIVE` and `SOURCE_PRECEDENCE_INVALID`. |
| PRICE-002 (+ FUND-003 quote validity) | Implemented. `ProcedurePrice.cash_quote_valid_through`: null → `SELF_PAY_NOT_VERIFIED`, before the service date → `PRICE_QUOTE_EXPIRED`. Price inputs older than `STALENESS_HOURS.prices` add a line `warning INPUT_STALE` (status and money unchanged). |
| §9 PriceFact | Mapped to existing fields in new CONTRACT §3.8. Benchmark and predetermination are deferred. |
| REC-006, ARCH-008, §6.5 bullets 1–2 | Documented (CONTRACT §3.2) and tested: same-day order follows `event_id`, not input order, and swapping ids swaps the order. Ranking stays stable across runs and permutations. |
| Residual review items (§10) | `ALLOWED_ORIGINS` documented in `backend/README.md` and `frontend/.env.example`. golden-check banner reads the current version. Stale commands fixed in `backend/CLAUDE.md` and `docs/workflow.md`. Version mentions updated to 1.4.0. |

## Files changed

Backend (frozen files went through UNFREEZE → `npm run freeze` → marker deleted):
- `src/domain/plan.ts`, `provider.ts`, `optimizer.ts`, `issues.ts`, `version.ts` (F)
- `src/benefits/index.ts` (`validatePlan`), `src/benefits/simulate.ts` (claim/self-pay line)
- `src/optimizer/navigator.ts` (`network_tier` from lines), `src/optimizer/shared.ts` (comment on the placeholder route)
- `src/ai/explain.ts` (`MISSING_CODES` gets the two new codes; null-tier wording instead of "out-of-network")
- `data/sources/manifest.json` (F), `data/tools/build-registry.ts`, regenerated `data/plans/nwd-ppo-standard-{2026,2027}.json` and `sources.generated.json`. The only difference is the two new keys.
- `fixtures/synthetic/providers.{previsit,postvisit}.json` (F): BrightSmile `network_id "nwd-ppo"`. Every price row has `cash_quote_valid_through` (Rivera D2392 `2027-06-30`, all others null).
- `fixtures/mock-responses/*.json` (F): regenerated. Compared with the snapshot, only `contract_version` 1.3.0 → 1.4.0 changed, in all 6 files.
- `scripts/golden-check.mjs` (F): the banner now reads `CONTRACT_VERSION`.
- `docs/contracts/CONTRACT-v1.md` (F), `golden-scenario.md` (F), `docs/acceptance.md` (F), `docs/contracts/FROZEN.sha256`, `docs/contracts/CHANGELOG.md`, `docs/decision-log.md` (D-027), `docs/workflow.md`, `docs/backend-flow.md`, `CLAUDE.md`, `README.md`
- Tests: new `tests/acceptance/at20-plan-identity-network-sources.test.ts`, extended `tests/benefits/engine.test.ts`

Frontend:
- `src/features/care-window/visit-navigator.tsx`: `networkTierLabel()` (null → "Network status needs confirmation"); `OptionCard` is now exported so it can be tested.
- `tests/unit/care-window-network.test.ts` (new), `.env.example` (one comment line)

Root: `README.md` (version mention).

## Behavior implemented

- **simulate (CONTRACT §3.3 step 2):** the order is now provider and price → plan version → effective tier → route check. A claim line with an unknown tier is `NEEDS_CONFIRMATION` with `NETWORK_STATUS_UNKNOWN` (`input_id` = the provider network input), `network_tier:null` and all money fields null. A line's `network_tier` is the effective tier, and it is null before a plan resolves.
- **Self-pay (§3.4):**
  - The must-submit test uses the effective tier.
  - An unknown tier with `network_provider_must_submit=true` gives `NETWORK_STATUS_UNKNOWN`.
  - The quote must have a validity date, and the service date must be on or before it.
  - The 2026 plan has `network_provider_must_submit=false`, so self-pay at an unknown-tier office still prices in 2026.
- **Staleness (§1.9):** this is now required for prices. It covers `provider_charge`, in-network `contracted_allowed`, and the self-pay `cash_quote`.
- **Optimizer:**
  - A null tier maps to the `OUT_OF_NETWORK_CLAIM` placeholder. The candidate is kept, and benefits always blocks it.
  - In a care plan where Rivera is unverified, Rivera is never priced. `unresolved` lists `NETWORK_STATUS_UNKNOWN` as a warning (BrightSmile alternatives remain).
  - With only Rivera, the result is `NEEDS_CONFIRMATION` with blocking `NETWORK_STATUS_UNKNOWN` and no `NO_SLOT_IN_WINDOW`.
- **UI:** a navigator option with `network_tier:null` shows "Network status needs confirmation". Issue text is the engine's member-worded message ("Confirm this office is in network for your plan.", "The office's cash price has expired; ask for a new quote.").
- **Golden numbers:** unchanged.

## Tests added

- **AT-20** (27 tests):
  - PLAN-001: 5 key fields plus an out-of-range date.
  - PLAN-002 lines: other network, null network, null tier.
  - Self-pay must-submit, with and without the rule.
  - Known tier with the wrong route still gives `CLAIM_ROUTE_INVALID`.
  - Per-event, per-office resolution across 2026 and 2027.
  - Care plan: mixed case and the Rivera-only case.
  - Navigator unknown tier.
  - PLAN-003: shipped registry is valid; educational-only rules are flagged; precedence with an unknown, missing or duplicated id is rejected.
  - PRICE-002: valid, expired and undated quotes; the care plan never picks an expired quote and `route_comparison.missing` lists `PRICE_QUOTE_EXPIRED`; staleness warning without any money change.
  - §6.5 same-day order by `event_id`.
  - REC-006: ranking stable over 3 runs and 2 permutations.
- **tests/benefits/engine.test.ts** (+2):
  - Mixed educational and authoritative evidence is valid; educational evidence alone is flagged on that rule only.
  - `PLAN_NOT_FOUND` now wins over a route mismatch (the reorder).
- **frontend tests/unit/care-window-network.test.ts** (+2): label function, and `OptionCard` rendered with `renderToStaticMarkup` for a null tier.

## Commands run and exact results

| Where | Command | Result |
|---|---|---|
| backend | `npx vitest run tests/acceptance/at20-…` | 27/27 passed |
| backend | `npx vitest run tests/benefits` | 6/6 passed |
| backend | `npm run verify` (exit 0) | `frozen files OK (63)` · `GOLDEN OK … (contract 1.4.0 rules)` · typecheck clean · lint clean · contracts 2 files 25/25 · unit 3 files 24/24 · acceptance 14 files 124/124 · integration 8 files 54/54 |
| backend | `npx vitest run` | 27 files, 227/227 passed (baseline 198; +27 AT-20, +2 benefits) |
| backend | `npx tsx scripts/build-mocks.ts`, then diff against the snapshot | Only `contract_version` lines differ (6 files). Re-running it is idempotent: `check:frozen` OK. |
| backend | `npm run demo:cli` | Golden story unchanged: alt-1 $1,372 (plan pays $800 + $24 + $84 = $908), alt-2 $1,426, explanation `validated: true` |
| backend | `npx tsx data/tools/build-registry.ts`, raw diff | Only `source_precedence` (plans) and `document_role` (sources) were added |
| backend | `npm run check:frozen` (final) | `frozen files OK (63)`. `.claude/UNFREEZE` is absent. |
| frontend | `npm run typecheck` | exit 0 |
| frontend | `npm run lint` | clean |
| frontend | `npm test` | 10 files, 128/128 passed (baseline 126 + 2) |
| frontend | `npm run build` | success; `/care-window` built |

`fixtures/golden/expected.json` was not touched.

## Browser path verified

The Chrome extension was not connected, so I drove headless Chrome over CDP with a script in the scratchpad. Servers were `npm run serve` (port 4000) and `npx next dev -p 3000`.

- **Full path on `/care-window`:** scenario → passport → "Find visit options" → "Read the plan" → tick 3 procedures → "Confirm 3 and plan my care" → explain buttons.
- **Network:** every `/api/engine/*` call returned 200: scenario, passport, visit-navigator, intake/extract, intake/confirm, care-plan, and explain ×3.
- **Errors:** no console errors or warnings, no runtime exceptions, no failed requests.
- **Golden values on the page:** $1,372 and $908 both appear.
- **Unknown-tier response via the Next proxy:** a curl POST to `/api/engine/visit-navigator` with Rivera only and `network_id:"other-net"` returned contract 1.4.0, `NEEDS_CONFIRMATION`, the option with `network_tier:null`, `member_cost:null`, and `NETWORK_STATUS_UNKNOWN`. That UI state is covered by the frontend render test, not by a browser screenshot, because the demo scenario never produces it.
- Both servers were stopped afterwards.

## Assumptions

- **Source role:** both synthetic sources are classed `schedule_of_benefits` (recorded in D-027). `employer_summary` would behave the same.
- **Engine id not bumped:** `ENGINE_IDS.benefits` stays `benefits-dppo-1`. The plan made the bump optional, and keeping it avoids churn in pinned literals.
- **No issue-label map in the frontend:** the plan expected a code→label map in `parts.tsx`, but none exists. `IssueList` renders the engine's `message`, so the new member wording lives in the engine messages.
- **Mixed evidence:** `SOURCE_NOT_AUTHORITATIVE` fires only when a VERIFIED rule has evidence and none of it is authoritative. VERIFIED rules with no evidence are already rejected by `ruleStructuralProblems`.
- **Staleness scope:** staleness warnings go on priced lines (OK, NOT_COVERED or self-pay) only. Blocked lines carry only their blocking issue, as before.

## Known limitations

- **Navigator hides unknown-network options that are not the soonest.** This is existing CONTRACT §4.6 behavior for any NEEDS_CONFIRMATION option. It is not listed in `excluded` either. AT-20 tests the navigator case with Rivera as the only provider.
- **Duplicate notices per visit:** a navigator option with several expected codes carries one `NETWORK_STATUS_UNKNOWN` per line (they differ by `procedure_id`), so the UI repeats the same sentence. Other per-line issues already behave this way.
- **Golden checker ignores quote validity:** `scripts/golden-check.mjs` does not model `cash_quote_valid_through` (the plan said no arithmetic change). The golden quote is valid through the horizon, so no golden number depends on it.
- **Explanation wording:** for an unknown tier the explanation reads "The option on <date> (network status unconfirmed)".

## Anything not completed and why

- Nothing in this iteration's scope.
- Deferred by the plan:
  - Same-day order-sensitivity warning or range (iteration 3).
  - `MARKET_BENCHMARK`/`PREDETERMINATION` price facts (iteration 6).
  - Removing the duplicated frontend fixture (iteration 7).
- No browser screenshot of the null-tier UI state, because the Chrome extension was not connected and the demo data never produces that state. It is covered by a server-render unit test and an API check through the proxy.
