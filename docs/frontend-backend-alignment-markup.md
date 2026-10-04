# CareWindow demo frontend/backend alignment markup

**Reviewed:** 2026-10-04
**Current backend contract:** v1.7.0
**Current demo route:** `/care-window`
**Purpose:** define what the frontend must expose to represent the deterministic backend accurately, without moving benefit, date, or cost calculations into the browser.

## 1. Executive finding

The current `/care-window` page proves the core loop, but it exposes only part of what the backend can already do.

- The **benefit passport** is useful but hides freshness, plan identity detail, and some backend state.
- The **visit navigator** is the closest to contract parity. It already shows safety, up to three options, tradeoffs, exclusions, conditional scenarios, issues, evidence, and explanations.
- The **care-plan result** has the largest gap. The backend returns exact schedule locks, benefit state after each event, full adjudication lines, calculation steps, route-comparison uncertainty, monthly funding by source, and audit metadata. The UI currently renders only the basic timeline, high-level totals, funding text, rollover, and a winning cash-versus-claim sentence.
- The repository currently contains **two product flows**. `/care-window` uses the current deterministic engine, while `/analysis`, Dashboard, History, Profile, and “New analysis” use an older adapter/fixture model. The user can enter through one flow and land in another model with different numbers and persistence behavior.
- Production identity, payer lookup, real source retrieval, refresh, and corrections are **future v2 architecture**, not current demo capabilities. The UI must not imply that those features are live.

The best next frontend milestone is therefore **contract parity and member control for the synthetic MVP**, followed by explicit backend contract extensions. It is not a production identity/insurance portal yet.

## 2. Sources reviewed

- `backend/docs/backend-flow.md`
- `backend/docs/production-architecture-plan.md`
- `CAREWINDOW_MVP_REQUIREMENTS.md`
- Backend v1.7 domain schemas, API runtime, optimizer, and Mongo repository
- Frontend routes, live adapters, shell, Dashboard/History, and all `/care-window` components
- A rendered `/care-window` page with the frontend on port 3000 and the Atlas-backed backend on port 4000

## 3. Current runtime architecture

```text
Browser: /care-window
        |
        | same-origin /api/engine/*
        v
Next.js rewrite (frontend/next.config.ts)
        |
        | CAREWINDOW_ENGINE_URL, default localhost:4000
        v
Backend HTTP API
        |
        +-- deterministic benefits engine
        +-- deterministic visit/care optimizer
        +-- guarded extraction/explanation layer
        +-- Mongo repository adapter
                |
                +-- canonical plan registry (6 plan versions)
                +-- canonical synthetic scenario
                +-- immutable/idempotent care-plan result records
```

Architecture rules the frontend must preserve:

1. The browser formats results; it does not calculate money, dates, benefit balances, rankings, or comparison deltas.
2. In Mongo mode, plan/member facts and provider facts are server-owned. The runtime accepts only member budget, availability, and travel preference changes from the submitted member object.
3. Unknown request properties are rejected by strict schemas.
4. Explanations are secondary. The server recomputes the result before explaining it.
5. Synthetic data must remain visibly labeled.

## 4. Backend-to-frontend coverage matrix

Legend: **Shown** means represented accurately today; **Partial** means some output is visible; **Missing UI** means the backend supports it now but the frontend does not expose it; **Backend needed** means the UI must wait for a contract/API addition.

### 4.1 Platform and shell

| Capability | Backend/repository state | Frontend state | Gap and requirement | Priority |
|---|---|---|---|---|
| Engine health and version | `GET /api/health` returns contract, AI mode, registry version, and plan-version IDs | No adapter call or UI | Add a small demo status panel and a retryable health check. Do not call this “coverage verified”; it verifies engine readiness only. | P0 |
| Synthetic-data identity | Every API envelope says `synthetic_data: true`; passport and plans are synthetic | Page notice is shown | Keep the page notice. Also preserve the synthetic marker in any result/history view. The adapter currently discards envelope metadata. | P0 |
| Server-owned canonical facts | Mongo runtime replaces submitted member/plan facts and maps provider IDs back to canonical providers | Not explained in UI | Add concise copy: plan facts and prices come from the demo dataset; only preferences are editable. Never offer controls that appear to overwrite plan rules. | P0 |
| Persisted care-plan audit record | Mongo saves care-plan results by request ID with request/result checksums | No result ID, retrieval route, or care-plan history UI | Do not claim a plan is “saved.” Add retrieval/list API before wiring this into History. | P1, backend needed |
| Global live shell | Engine routes work | Live auth request `/api/auth/session` returned 404 during rendered review; “New analysis,” History, and Profile target the older flow | Make the demo shell capability-aware or route its primary CTA into the engine flow. No expected request should 404 on the demo path. | P0 |
| One coherent product flow | `/care-window` is the current engine-backed path | `/analysis` still uses the earlier calculation/fixture model | Move reusable intake UI onto engine contracts, or hide/retire the older flow for the demo. Do not show two calculation models as one product. | P0 |

### 4.2 Benefit passport

| Backend data/capability | Current UI | Missing or required change | Priority |
|---|---|---|---|
| Carrier, plan name, effective period, reset date | Shown | Keep. Add exact plan option/network identity when returned through a member-facing view model. | P0 |
| Deductible, annual maximum, pending reservations, funding, category/rule sections | Shown | Keep the current primary-summary plus disclosure structure. | Done |
| `PassportItem.observed_at`, source, rule IDs, input IDs, rule status | Source badge shown; timestamp and IDs hidden; nonverified statuses collapse to “Unverified” | Show “last checked” and distinguish Verified, Stale, Partial, User-entered, Needs confirmation, Unknown, and Not applicable. Put rule/source detail in a disclosure. | P0 |
| `current_period` state | Only selected values appear through passport sections | Add a “benefits available now” summary that clearly separates settled remaining, pending reservation, and available-after-pending amounts. Use returned fields only. | P0 |
| Pending claims and procedure history in canonical member snapshot | Only aggregate pending reservation and one issue line are visible; history is absent | For the production-shaped dashboard, add member-facing claim/history view fields to the passport API. Do not make the UI interpret raw scenario input as adjudicated output. | P1, backend needed |
| Six registry plan versions: Value, Standard, Enhanced for 2026/2027, including descriptive premiums | Only the member’s Standard plan is visible | Add a read-only plan-options endpoint/view model before building plan comparison. `plan_key` remains server-owned; a selector must never mutate it in a care-plan request. | P1, backend needed |
| Refresh and source correction | Not in v1 API | Do not show fake refresh/correction actions. These belong to the authenticated v2 snapshot API. | V2 |

### 4.3 Before-visit navigator

| Backend data/capability | Current UI | Missing or required change | Priority |
|---|---|---|---|
| Safety gate and trigger reasons | Shown | Explicitly suppress cost comparison content whenever `safety.urgent` is true, even if a future response includes options. | P0 |
| Up to three labeled, non-dominated options | Shown | Keep. | Done |
| Provider, slot, network tier/freshness, member/plan cost, distance/travel, route | Shown | Add source/freshness disclosure adjacent to all volatile provider facts, not only network. | P0 |
| Concrete tradeoffs | Shown | Keep; never replace with an opaque score. | Done |
| Excluded providers and reasons | Shown as one line | Convert to an accessible disclosure when the list grows; retain exact reason language. | P1 |
| Conditional full-horizon scenarios | Shown | Keep conditional language and missing-fact list. | Done |
| Evidence/issues/explanation | Shown globally | Make evidence contextual to each option while retaining the global source list. | P1 |
| Select this visit option | Backend returns options but does not persist a previsit selection into the postvisit scenario | Add “Use this option” only after the backend defines how that selection is stored or carried forward. | P1, backend needed |

### 4.4 Treatment intake and confirmation

| Backend data/capability | Current UI | Missing or required change | Priority |
|---|---|---|---|
| Synthetic sample documents | Dropdown and raw-text disclosure | Keep for the deterministic demo. | Done |
| Extraction warnings and ignored instruction-like content | Shown | Keep. | Done |
| Extracted CDT, tooth, fee, urgency, clinical dates, dependencies, dentist statements | All are displayed; only the three dates are editable | Add edit controls for every confirmable extracted field before confirmation. Preserve field-level inferred/missing/source status. | P0 |
| Confirmation gate | Per-procedure checkbox and server confirm call | Keep. Rename the checkbox/action so inclusion and factual confirmation are not conflated. | P0 |
| Upload, paste, manual entry, transcript/photo | Rich intake components exist in the older `/analysis` flow, but `/care-window` only uses samples; live AI is not wired | Reuse the UI only after adapting it to `POST /api/intake/extract` and the current procedure schema. Until live AI exists, clearly state which inputs are synthetic/offline-only. | P1, backend needed for live media |

### 4.5 Care-plan optimizer result

| Backend data/capability | Current UI | Missing or required change | Priority |
|---|---|---|---|
| Recommended alternative plus up to three alternatives | Tabs shown | Add compact summary cards with concrete engine-supplied differences. Current response has no `PlanDifference`; do not subtract totals in the browser. | P1, backend needed for deltas |
| Alternative labels | First label in each tab; all labels inside selected view | Show all meaningful labels in the tab/card name and keep “recommended” distinct from labels. | P0 |
| Totals: modeled charge, adjustment, plan pay, member cost, fees | Only plan pay/member cost are shown | Add modeled charge, network discount/adjustment, fees, and funding gap in an expandable financial summary. | P0 |
| Timeline event: date, provider, route, plan/member pay | Shown | Keep. Add location/time/slot where available in the response. | P0/P1 |
| `events[].user_locked` | Not read | Show a visible “Pinned by you” state. | P0 |
| Exact `schedule_locks` in request | Backend preserves procedure + provider + slot + route | Add “Pin this appointment” on an existing event and rerun with locks. The v1 lock is an exact tuple, not separate editable fields. | P0 |
| Re-optimize with locks | Supported by the same care-plan endpoint | Add Re-optimize unlocked items, Undo last pin, and Reset to recommended. Keep lock history in UI state; every result still comes from the server. | P0 |
| Arbitrary date/provider/route/funding edits | Not supported by current contract; returned alternatives expose only some modeled combinations | Do not present arbitrary dropdowns as supported. Add candidate/custom-schedule and field-lock contracts first. | P1, backend needed |
| Budget, availability, travel preferences | Mongo runtime explicitly allows these three submitted member fields | Add a preferences drawer and rerun the server after confirmation. Clearly show hard versus preferred values. | P0 |
| HSA reserve edit | Server replaces funding accounts with canonical values | Do not add an HSA reserve editor until the server explicitly permits and validates it. | P1, backend needed |
| Event funding allocations and shortfall | Shown as one text line | Render source, payment date, amount, and fees as a list. Keep service date separate from payment date. | P0 |
| Monthly `cash_cents`, `by_source`, preferred/hard flags | Cash total and limit flags shown | Add `by_source` details so FSA/HSA/cash are not visually collapsed. | P0 |
| `benefit_states[]` after each event | Not read | Add “Benefits left after this visit” to every timeline event, using the matching returned state. | P0 |
| Full adjudication line (`line_worst`/`line_best`) | Only plan/member ranges shown | Add charge, allowed basis, adjustment, balance bill, deductible, coverage rate, cap, plan pay, member responsibility, and line issues behind a disclosure. Show best/worst reason when they differ. | P0 |
| `line_worst.steps[]` | Not rendered | Add “See how this was calculated” per event with formulas, operands, results, and linked evidence. | P0 |
| Cash-versus-claim route comparison | Only shown when there is a winner | Always render the comparison card when `route_comparison` is non-null. Show both totals; if either is unknown, show `missing[]` instead of hiding the card. | P0 |
| Rollover outcome, steps, evidence, optional shift | Well represented | Keep. It is the strongest current example of the desired trust pattern. | Done |
| Unscheduled, unresolved, alternative issues | Shown, but mostly separated from the affected event | Keep a summary and also attach each issue to the relevant procedure, event, preference, or route. | P0 |
| Reasons and next actions | Shown | Turn actionable items into a checklist; do not imply appointments are booked. | P1 |
| `decision_trace[]` and `search_stats` | Hidden | Correct for members. Add only to a development/audit drawer, never as a member-facing score. | P2/internal |
| Provider payment plans/financing | Domain type exists, but current fixtures have none and optimizer emits “not modeled in MVP v1” | Do not advertise installment planning yet. Implement allocation, seed verified plans, and test reconciliation before adding UI. | P1, backend needed |

## 5. Proposed demo information architecture

Keep one engine-backed route for the MVP. The sections can remain on one page, but add a sticky progress/anchor bar so the long workflow behaves like a guided journey.

```text
+--------------------------------------------------------------------------------+
| CareWindow | Benefits | Find a visit | Treatment | My care plan       [Demo]   |
+--------------------------------------------------------------------------------+
| SYNTHETIC DEMO · Alex Morgan · Engine ready · Rules v… · as of …               |
| No real member, insurance plan, dentist, appointment, or claim.                |
+--------------------------------------------------------------------------------+
| 1 Benefits        2 Before visit        3 Confirm care        4 Build plan      |
+--------------------------------------------------------------------------------+
| Active plan                                                                     |
| Northwind PPO Standard · network … · Jan 1–Dec 31, 2026 · last checked …       |
| [Deductible] [Annual max] [Pending claims] [FSA/HSA] [Data quality]             |
| [Coverage and rules] [Sources]                                                  |
+--------------------------------------------------------------------------------+
| Before the visit                                                               |
| Reason + safety questions                                                       |
| [Best overall] [Lowest cost] [Soonest]                                          |
| Each card: date/time · network/freshness · cost · travel · tradeoff · issues    |
+--------------------------------------------------------------------------------+
| Treatment                                                                       |
| [Sample / future upload] -> extracted procedure cards -> confirm each fact      |
+--------------------------------------------------------------------------------+
| Plan preferences                                                               |
| Hard monthly limit | Preferred target | Availability | Travel limit             |
| [Build/rebuild my plan]                                                         |
+--------------------------------------------------------------------------------+
| Care-plan alternatives                                                         |
| [Recommended] [Lowest total] [Earliest] [Smoothest]                             |
| Totals · completion · monthly peak · funding gap · concrete differences         |
+--------------------------------------------------------------------------------+
| Selected timeline                                                              |
| DATE  Procedure · provider · route                            [Pin appointment]  |
|       You pay / plan pays · funding/payment dates · warnings                    |
|       Benefits left after visit                                                 |
|       [Cost breakdown] [Calculation + sources]                                  |
|                                                                                |
| [Undo] [Reset recommended] [Re-optimize unlocked items]                         |
+--------------------------------------------------------------------------------+
| Needs your attention | Next actions | Sources                                   |
+--------------------------------------------------------------------------------+
```

### 5.1 Result state after a pin

Once the member pins any event, the selected result must stop presenting itself as the untouched recommendation.

```text
YOUR PLAN · 1 appointment pinned

Pinned: Crown · Jan 12 · Friendly Dental · In-network claim
[Unpin]

Recommended plan                         Your plan
server-returned totals                   server-returned totals
server-returned timeline                 server-returned timeline

[Undo last change] [Reset to recommended] [Re-optimize unlocked items]
```

For v1.7, the frontend may label the rerun “Your plan” because it knows a lock was submitted. Exact numerical difference rows require a backend `PlanDifference`; they must not be calculated client-side.

### 5.2 Event cost disclosure

```text
See how this was calculated

Office charge                         $…
Contracted adjustment                -$…
Eligible basis                        $…
Deductible applied                    $…
Plan share / cap                      $…
Balance bill                          $…
You pay                               $…

Calculation steps
1. <returned step label>     <returned formula/result>
2. ...

Sources
[Plan document · page/section] [Dentist quote · observed date]
```

The labels and formatting belong to the frontend; every amount, formula operand, status, issue, and source reference comes from the backend result.

## 6. Requirements traceability

### 6.1 MVP UI requirements

| Requirement | Current status | Closure |
|---|---|---|
| UI-001 recommended + up to three alternatives | Met | Improve summary/difference presentation. |
| UI-002 priority selector | Missing | Requires recommendation preference contract and reranking. Do not add a cosmetic selector. |
| UI-003 edit/pin supported choices | Missing in UI; exact tuple lock exists | Ship exact event pin first; broader edits require backend extension. |
| UI-004 visible “Your plan” | Missing | Label any locked rerun as member-modified. |
| UI-005 before/after difference | Missing | Add backend `PlanDifference`, then render it. |
| UI-006 Undo, Reset, Re-optimize unlocked | Missing | Implement for exact locks with reruns; no client calculations. |
| UI-007 rollover state and source | Met | Preserve current panel. |
| UI-008 monthly payments separate from service dates | Partial | Dates are separate, but monthly `by_source` is hidden. |
| UI-009 adjacent and summary warnings | Partial | Summary exists; attach issues to affected items. |
| UI-010 calculation and evidence disclosure | Partial | Rollover has it; event adjudication does not. |
| UI-011 no more than three alternatives/no opaque score | Met | Preserve. |
| UI-012 synthetic mode clearly labeled | Met on `/care-window` | Propagate label to saved/history views and envelope handling. |
| UI-013 usable without generated explanation | Met | Preserve. |
| UI-014 no browser errors across demo | Not met as a full-flow/network gate | Current live shell requested missing `/api/auth/session` and received 404. Add a browser test that also fails on unexpected 4xx/5xx requests. |

### 6.2 Production architecture requirements

These are deliberately not part of the current synthetic-MVP claim:

| Production capability | Status |
|---|---|
| Session-bound member lookup and identity verification | Not implemented |
| Payer OAuth/OTP and consent/revocation | Not implemented |
| Source retrieval progress | Not implemented |
| Authorized member snapshots and refresh | Proposed v2 only |
| Real claim, directory, price, and rule connectors | Not implemented |
| Source correction workflow | Proposed v2 only |
| Session expiry and sensitive-state clearing | Partial frontend scaffolding; no complete backend auth/session |
| Real report/photo/transcript AI extraction | Not implemented in current demo |

The current interface should say “synthetic demo dataset,” not “connected to your insurer,” “verified member,” or “saved to your account.”

## 7. Recommended implementation sequence

### Phase A — frontend parity on the existing v1.7 contract (P0)

1. Add `engine.health()` and an honest engine/demo status strip.
2. Make the shell coherent: route the primary CTA to the engine flow and eliminate expected 404s on `/care-window`.
3. Add passport freshness/status distinctions.
4. Add editable budget, availability, and travel preferences—the only member fields currently accepted by Mongo runtime.
5. Add exact event pin/unpin using `schedule_locks`, plus locked badges, undo, reset, and server rerun.
6. Render currently omitted outputs: full totals, funding dates/fees, monthly `by_source`, benefit states, line details/steps, route-comparison missing facts, and contextual issues/evidence.
7. Add complete-path browser coverage with failed-request and console-error assertions.

### Phase B — backend contract additions required by the MVP requirements (P1)

1. Recommendation preferences/modes with real reranking.
2. Field-level locks and modeled candidate choices.
3. Evaluated custom schedules and warning acknowledgements.
4. Server-produced before/after `PlanDifference` and member-plan status.
5. Verified provider payment-plan allocation and fixture coverage.
6. Read-only plan catalogue/plan-option comparison endpoint.
7. Care-plan retrieval/list endpoint tied to an appropriate demo/session identity.
8. Member-facing pending-claim/history view fields.

### Phase C — production-shaped v2 (separate API and threat review)

1. Identity, authorization, consent, and source progress.
2. Authorized member snapshots with refresh and provenance.
3. Real intake connectors and correction workflow.
4. Account-owned care plans/history and secure lifecycle controls.

## 8. Component-level change map

| File/area | Required work |
|---|---|
| `frontend/src/lib/adapters/live/engine.ts` | Add health call; preserve useful envelope metadata; later add only reviewed contract endpoints. |
| `frontend/src/features/care-window/care-window-screen.tsx` | Add workflow navigation, engine/demo status, and preference/result state ownership. |
| `frontend/src/features/care-window/passport-summary.tsx` | Add freshness, exact statuses, data quality, and source detail. |
| `frontend/src/features/care-window/visit-navigator.tsx` | Harden urgent suppression; contextualize provider fact freshness/evidence. |
| `frontend/src/features/care-window/care-plan.tsx` | Add exact locks/reruns, “Your plan,” controls, omitted backend fields, contextual issues, and calculation disclosures. Split this file as the workspace grows. |
| `frontend/src/features/care-window/parts.tsx` | Expand status/provenance vocabulary and reusable calculation/source disclosures. |
| `frontend/src/components/shell/site-header.tsx` | Remove the mixed-flow CTA/navigation for the engine demo or make routes capability-aware. |
| Dashboard/History `/analysis` areas | Do not merge old fixture results with current engine results. Migrate deliberately or hide them in the engine demo. |
| Backend API/domain | Add only Phase B capabilities that cannot be represented honestly from v1.7. |

Suggested new components:

- `care-window-progress.tsx`
- `engine-status.tsx`
- `preference-editor.tsx`
- `alternative-summary.tsx`
- `plan-controls.tsx`
- `event-cost-breakdown.tsx`
- `benefits-after-event.tsx`
- `route-comparison-card.tsx`
- `contextual-issues.tsx`

## 9. Acceptance criteria for the aligned demo

The frontend alignment work is complete when:

1. A user can load the synthetic passport, compare visit options, confirm treatment, and receive a care plan without entering the older `/analysis` calculation model.
2. Every backend member-facing output listed as P0 is either rendered or deliberately documented as internal-only.
3. A user can pin one returned appointment, rerun, see the pin preserved through `event.user_locked`, undo it, and reset to the original recommendation.
4. The UI labels a locked rerun “Your plan,” not “Recommended.”
5. Event benefit state, full pricing breakdown, calculation steps, route uncertainty, funding schedule, and source evidence are inspectable.
6. Budget/availability/travel edits rerun the server; no money/date result is computed in React.
7. Synthetic status remains visible throughout the journey.
8. Unsupported production features and unmodeled payment plans are not advertised as available.
9. Desktop and mobile keyboard journeys meet the same functional path, with meaningful loading, empty, partial, error, and retry states.
10. The browser has no console errors and no unexpected failed requests throughout the complete demo path.

## 10. Decision summary

Build the next frontend iteration around **truthful exposure of the existing v1.7 engine**, especially locks, benefit state, calculation trace, funding detail, and uncertainty. Treat priority modes, arbitrary custom plans, server-produced diffs, payment plans, plan shopping, history retrieval, and production identity as backend contract work—not frontend-only features. Consolidate the navigation around `/care-window` so the demo presents one architecture and one set of numbers.
