# CareWindow MVP loop: review, iteration 1 (contract 1.3.0 → 1.4.0)

Reviewer: Agent 3. Date: 2026-10-04. Diff reviewed: working tree vs `snap-iter1-pre` (excluding `docs/mvp-loop/`). All results below were reproduced independently; the handoff was not relied on.

## 1. Commands run (exact results)

| Where | Command | Result |
|---|---|---|
| backend | `npm run verify` (exit 0) | `frozen files OK (63)` · `GOLDEN OK … (contract 1.4.0 rules)` · typecheck clean · lint clean · contracts 2 files 25/25 · unit 3 files 24/24 · acceptance 14 files 124/124 · integration 8 files 54/54 |
| backend | `npx vitest run` | 27 files, 227/227 passed (before adding the review probe) |
| backend | `npx vitest run --project integration` (with review probe) | 9 files, 62/62 passed |
| backend | `npm run demo:cli` | alt-1 $1,372, alt-2 $1,426, explanation `validated: true` |
| backend | `npx tsx scripts/build-mocks.ts` then `check:frozen` | idempotent, `frozen files OK (63)`; mocks differ from snapshot only in `contract_version` |
| backend | golden `expected.json` vs snapshot | byte-identical (the `git diff` vs HEAD is pre-iteration baseline work) |
| frontend | `npm run typecheck` | exit 0 |
| frontend | `npm run lint` | clean |
| frontend | `npm test` | 10 files, 128/128 passed |
| frontend | `npm run build` | compiled successfully; `/care-window` built |
| hygiene | `grep -rn "\.only\|\.skip\|it.todo" backend/tests frontend/tests` | no matches |
| hygiene | `backend/.claude/UNFREEZE` | absent |

## 2. Requirement verification

| ID | Verdict | Evidence |
|---|---|---|
| PLAN-001 | PASS | AT-20 changes each of 5 key fields + 2028 date → `PLAN_NOT_FOUND`, no `plan_version_id`. `samePlanKey`/`resolvePlanVersion` unchanged. |
| PLAN-002 | PASS (see M-1) | `simulate.ts:effectiveNetworkTier` compares `provider.network.network_id` to `plan.key.network_id` after plan resolution; null → blocking `NETWORK_STATUS_UNKNOWN`, `NO_MONEY`. Probes: null tier + OON route + matching network id blocks with all money null; care plan with Rivera tier null never prices Rivera and reports `NETWORK_STATUS_UNKNOWN` (no `NO_SLOT_IN_WINDOW`); self-pay at an unknown office in 2026 is not chosen because the claim side is unknown. API: `/api/visit-navigator` with Rivera `network_id:"other-net"` → `NEEDS_CONFIRMATION`, `network_tier:null`, `member_cost:null`. |
| PLAN-003 | PASS | `benefits/index.ts:validatePlan` adds `SOURCE_NOT_AUTHORITATIVE` (VERIFIED + evidence + no authoritative source) and `SOURCE_PRECEDENCE_INVALID` (sorted-permutation check catches unknown/missing/duplicate). Probe: flipping the 2027 source to `educational` flags exactly the VERIFIED rules with evidence, none of the UNKNOWN/CONFLICT ones. Registry diff vs snapshot: only `source_precedence` / `document_role` added. |
| PRICE-002 / FUND-003 quote validity | PASS | Probe: `cash_quote_valid_through` == service date (2026-10-22) → OK $150; 2026-10-21 → `PRICE_QUOTE_EXPIRED`; null → `SELF_PAY_NOT_VERIFIED`. Staleness: exactly 90 days → no warning, 90 d + 1 h → one `warning INPUT_STALE`, status and all money fields identical; covers `contracted_allowed` and self-pay `cash_quote`. Golden care plan with every price stale → identical alternatives, schedule keys, totals and status. API care plan with expired quote → no `SELF_PAY_NO_CLAIM` event. |
| §9 PriceFact mapping | PASS (doc) | CONTRACT §3.8 (1.4); benchmark/predetermination deferred as planned. |
| §6.5 bullets 1–2, ARCH-008 | PASS | Probe: three same-day events in all 6 input orders → 1 distinct serialized `SimulationResult`. AT-20 shows swapping `event_id`s swaps adjudication order. |
| REC-006 | PASS | Probe: full care-plan JSON byte-identical under combined provider, procedure and slot-array permutation. |
| Residual review items | PASS | `ALLOWED_ORIGINS` in `backend/README.md` and `frontend/.env.example`; golden banner prints 1.4.0; no `npm run dev` / `test:e2e` / `next build` claims remain in `backend/CLAUDE.md`, `docs/workflow.md`; CHANGELOG 1.4.0 and D-027 present. |

### Golden reconciliation by hand (registry rules + fixtures)

Opening 2026: max 90,000 − pending 7,600 = 82,400¢; deductible 5,000 − 5,000 = 0.
- Root canal D3330 (basic, in-network 80%): allowed 100,000 → plan 80,000 (≤ 82,400), member 20,000. Max left 2,400.
- Crown D2740 (major 50%): 55,000 capped at 2,400 → plan 2,400, member 107,600. Max left 0.
- Filling D2392 2027-01-05 (new year, deductible 7,500, 80%): (18,000 − 7,500) × 0.8 = 8,400 plan, member 9,600.
- **Member 137,200 = $1,372; plan 90,800 = $908.** Charges 331,000 = 90,800 + 137,200 + network discounts 103,000 ✓.
- Alt-2: 20,000 + cash 15,000 + crown (110,000 − 2,400) = 142,600 = $1,426 ✓. API `/api/care-plan` returns 137,200 / 142,600.

### API and browser

- `npm run serve` (port 4000): health `contract_version 1.4.0`; care plan 200 with golden totals; unknown provider key → 400 `INVALID_REQUEST` (strict); cross-origin `Origin` → 400.
- Browser: Chrome extension not connected; headless Chrome over CDP (`scratchpad/review-cdp.mjs`) against `next dev -p 3000`. Path scenario → passport → navigator → extract → confirm 3 → care plan → 3 explanations. All 9 `/api/engine/*` responses 200. Zero console errors/warnings/exceptions, zero HTTP ≥ 400. Two `net::ERR_ABORTED canceled=true` for the first `/scenario` and `/passport` fetches: dev StrictMode double-mount aborting via `parts.tsx` `AbortController` cleanup, immediately re-requested and 200; not an app failure and not touched this iteration. Page shows $1,372 and $908 and "Synthetic". Servers stopped.

## 3. Findings

### M-1 · MEDIUM · Network status is scoped to network id, not to plan version/year
- **Requirement:** PLAN-002 (`ProviderNetworkFact.planVersionId`; "exact plan for each service event").
- **File/symbol:** `backend/src/benefits/simulate.ts:effectiveNetworkTier`; `ProviderOption.network` (`src/domain/provider.ts`).
- **Reproduction:** `tests/integration/review-iter1-probes.test.ts` › "2026→2027 crossing": Rivera verified once (`network_id "nwd-ppo"`, observed 2026) and events on 2026-10-22 and 2027-01-05.
- **Expected:** a status observed for one plan version should not automatically count for a later plan year unless the observation says it covers that version (or the result should flag it).
- **Actual:** both lines `in_network`, OK, priced. Because `PlanKey` includes `network_id` and both versions share `nwd-ppo`, the comparison is effectively `provider.network_id === member.plan_key.network_id`; per-event evaluation is structurally a no-op across years.
- **Evidence:** probe passes asserting `[[PV2026,"in_network","OK"],[PV2027,"in_network","OK"]]`. This matches the approved plan design (D-027), so it does not block this iteration.
- **Owning subsystem:** domain/contract (Planner) + benefits.

### L-1 · LOW · Unknown-network navigator options are hidden unless soonest
- **Requirement:** PLAN-002 ("Unknown network status blocks a definitive price comparison or produces a clearly labeled range"); EDU-004.
- **File/symbol:** `backend/src/optimizer/navigator.ts` (CONTRACT §4.6 NEEDS_CONFIRMATION-only-as-soonest rule).
- **Reproduction:** visit navigator with all providers, Rivera `network_id:"other-net"`.
- **Expected:** member is told Rivera needs network confirmation.
- **Actual:** Rivera option silently dropped (not in `options` nor `excluded`). Pre-existing rule, acknowledged in the handoff.
- **Owning subsystem:** optimizer (navigator).

### L-2 · LOW · New required request key described as a minor bump
- **Requirement:** API contract versioning (§11.3).
- **Endpoint:** `POST /api/care-plan`, `/api/visit-navigator`.
- **Reproduction:** send the golden request with `providers[0].pricing[0].cash_quote_valid_through` deleted.
- **Expected:** per semver, a newly required request field is breaking (or it should default to null).
- **Actual:** 400 `INVALID_REQUEST`. Justified in D-027 (no external clients); recorded only.
- **Owning subsystem:** domain/contract.

### L-3 · LOW · Null-tier UI state not exercised in a browser
- **Requirement:** UI-014 smoke / §14.6.
- **File/symbol:** `frontend/src/features/care-window/visit-navigator.tsx:networkTierLabel`.
- **Actual:** the demo scenario never produces `network_tier:null`; covered only by a `renderToStaticMarkup` unit test and an API probe. Acceptable for this iteration; add a browser fixture in iteration 6/7.
- **Owning subsystem:** frontend.

No BLOCKER or HIGH findings. Diff hygiene: no debug output (the only added `console.log` is the golden-check banner), no focused/skipped tests, no `UNFREEZE` marker, no unrelated changes (every changed file is in plan §4).

## 4. Review artifacts kept

- `backend/tests/integration/review-iter1-probes.test.ts` (8 tests): quote-validity boundary, staleness boundary and money invariance (line + whole care plan), 2026→2027 network crossing (documents M-1), null-tier OON route, educational-only flagging scope, 6-way same-day permutation, combined provider/procedure/slot permutation.

## 5. Verdict

Iteration-1 requirements pass with independent evidence; release requirements (rollover, modes, user control, funding gate, education/badges, `/analysis` retirement) remain.

PASS_ITERATION
