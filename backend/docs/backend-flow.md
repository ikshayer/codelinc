# CareWindow backend flow

How the backend turns member data, plan documents and dentist instructions into
evidence-backed timing and cost recommendations, and how the frontend consumes
the result. Reflects contract **v1.6.0**.

## 1. The big picture

A deterministic engine with a thin HTTP layer on top. AI sits only at the edges:
it reads documents in and explains results out. All money and timing math is
plain TypeScript that gives the same output for the same input.

```
                    ┌──────────────── backend (node, port 4000) ─────────────────┐
 Browser            │  src/api/server.ts   HTTP checks: origin, size, JSON        │
 /care-window       │        │                                                    │
   │                │  src/api/index.ts    Zod-validate body → call engine →     │
   │  /api/engine/* │        │             wrap response {ok, data, meta}         │
   └──Next proxy───►│        ├─► src/ai          extract card → UNVERIFIED procs   │
                    │        │                   explain result → validated text  │
                    │        ├─► src/optimizer   navigator.ts  (before visit)     │
                    │        │                   care-plan.ts  (after visit)      │
                    │        │        │ calls hundreds of times                   │
                    │        │        ▼                                           │
                    │        └─► src/benefits    DPPO adjudication, ledger,       │
                    │                 │          passport, evidence lookup        │
                    │                 ▼                                           │
                    │          data/plans/*.json  verified rules + literal quotes │
                    │          data/sources/*.md  the plan documents themselves   │
                    └─────────────────────────────────────────────────────────────┘
```

Modules don't import each other directly. Each exposes the interface in
[`src/domain/ports.ts`](../src/domain/ports.ts) and the API layer wires them
together, so tests can swap in a fake benefit engine.

## 2. The layers, bottom up

### Layer 0: Plan Registry (source of truth)

- [`data/sources/`](../data/sources/) holds the plan documents (Northwind PPO
  2026 and 2027 benefit summaries, plus the 2026 Maximum Carryover Rider, which
  governs the 2026 carryover), each checksummed in `manifest.json`.
- [`data/tools/build-registry.ts`](../data/tools/build-registry.ts) turns them
  into [`data/plans/nwd-ppo-standard-2026.json`](../data/plans/) and the 2027
  file: 27–28 rules per year covering deductible, annual maximum, coverage share
  by service class and network, frequency limits, waiting periods, the
  out-of-network allowance table, claim-submission rules and rollover.
- Every rule has:
  - a `status` (`VERIFIED`, `UNVERIFIED`, `UNKNOWN`, `CONFLICT`,
    `NOT_APPLICABLE`); only `VERIFIED` rules are used in calculations;
  - `evidence[]` with source, page, section and a **literal quote**. The build
    fails if the quote isn't actually on that page.
- `loadRegistry()` loads the plans once and validates them against the schema.

### Layer 1: Benefit engine ([`src/benefits/`](../src/benefits/))

Pure, deterministic insurance math.

| Function | What it does |
|---|---|
| `resolvePlanVersion(key, serviceDate)` | Matches carrier + group + plan option + network + **service date** to exactly one plan version. Never borrows from a similar plan. Non-DPPO → `UNSUPPORTED_PLAN_TYPE`. |
| `openLedger(member, as_of)` | Starting benefit state from the member snapshot: deductible and annual max remaining, pending claims, history. |
| `simulate(events)` | Adjudicates claim events in date order (below). |
| `passport(member, as_of)` | The Benefit Passport: balances, reset dates, key rules, FSA deadline; each item cites a rule or an input. |
| `evidenceFor(ruleIds)` | Quotes for rules that were already used. |

`simulate` ([`simulate.ts`](../src/benefits/simulate.ts)), per event:

1. Pick the plan year from the **service date** (not the payment date); a new
   year opens a fresh period.
2. Price by claim route: in-network → contracted allowed amount;
   out-of-network → plan allowance plus balance bill; self-pay → verified cash
   quote.
3. Look up the coverage rate for the procedure's service class and network.
4. Apply the deductible, then the coverage rate (rounded half-up per line), then
   cap at the remaining annual max or sublimit.
5. Member cost = charge − plan pay − contractual adjustment; must reconcile to
   the cent.
6. Update the ledger so the next event sees reduced balances.

Every number is a `CalcStep` whose operands cite a fact id —
`rule:coverage.major.in.2026`, `input:member.deductible_remaining`,
`calc:<line>.plan_pay`. A missing or unverified required rule makes the line
`NEEDS_CONFIRMATION` with a blocking issue naming the rule. Pending claims
produce **ranges** (worst/best case), never a settled number.

**Year close (carryover, CONTRACT §3.9).** When a plan year has a VERIFIED
rollover rule, `simulate` closes it once, when the next year opens or at the end
of the run, and returns a `rollover` outcome: status (`EARNED`, `CONDITIONAL`,
`NOT_EARNED`, `UNCERTAIN`, `NEEDS_CONFIRMATION`), the qualifying range (settled +
simulated, + pending), the final bank and the ten `rollover.<pv>.*` steps. The
carryover is added to a fresh next year in `best_case` only, never in
`worst_case` (ranking), and never to a year opened from a snapshot.

### Layer 2: Optimizer ([`src/optimizer/`](../src/optimizer/))

Decides when and where. Prices everything through `simulate`; never re-does the
insurance math.

**Visit Navigator** ([`navigator.ts`](../src/optimizer/navigator.ts)) — before the visit

- Input: member, providers with slots, visit intent, expected codes, symptoms.
- **Safety gate first:** any red-flag symptom (severe pain, swelling, trauma,
  bleeding, fever) → `URGENT_CARE_ROUTE`. Only soonest-date options are returned
  and nothing frames waiting as a saving.
- Otherwise, for each provider × slot: check network status, travel limit and
  member availability; price the expected visit through `simulate`; drop options
  beaten on every measure; label up to 3 as `best_overall`, `lowest_cost`,
  `soonest`.
- Each option carries concrete tradeoffs (dollars, days, miles, minutes) and a
  stale-network flag.

**Care Plan Optimizer** ([`care-plan.ts`](../src/optimizer/care-plan.ts)) — after the visit

- Input: member, providers, **confirmed** procedures, planning horizon.
  Unconfirmed procedures → `NEEDS_CONFIRMATION`.
- `buildCandidates`: (provider, date, claim route) per procedure, limited to
  dates that matter — earliest available, dentist target/latest, last slot
  before and first slot after the plan reset, before the FSA deadline, first
  affordable slot.
- Backtracking search in dependency order, rejecting schedules that break the
  dentist's safe window, a dependency or healing gap (e.g. crown 14–60 days after
  root canal), availability, specialty, or frequency/waiting-period rules.
- For each feasible schedule:
  - `simulate` the whole schedule chronologically — spending on one procedure
    reduces the annual max for the next, so this can't be greedy;
  - `allocateFunding` covers member cost from sources (expiring FSA first where
    eligible, monthly cash budget, HSA above its reserve, provider plans) and
    records shortfall and month-by-month cash needs.
- Ranking is a strict priority order, not a weighted score:
  1. clinical lateness and unscheduled care
  2. funding shortfall
  3. total member cost
  4. fees
  5. peak monthly cash
  6. travel and visits
  7. unused expiring funds
- Affordability runs in two passes: first with the hard monthly budget enforced;
  if nothing fits, return the safest schedule plus the exact funding gap. Care is
  never moved past the dentist's deadline to save money.
- Output: up to 3 alternatives (`lowest_total_cost`,
  `earliest_safe_completion`, `smoothest_monthly_payments`), one recommended.
  `route_comparison` compares cash vs. claim across the whole plan where a
  verified cash quote exists.

### Layer 3: AI ([`src/ai/`](../src/ai/))

- **Extraction:** card or estimate text → editable procedure cards (code, tooth,
  fee, urgency, earliest/target/latest safe dates, dependencies). Everything
  starts **UNVERIFIED**; guessed codes are marked
  `inferred_fields: ["cdt_code"]`. Lines that look like injected instructions are
  dropped and listed in `ignored_instructions`.
- **Explanation:** `buildExplanationInput` gives the explainer only the finished
  result, the rules used, their quotes and the confirmed facts. The explainer is
  currently deterministic templates. `validateExplanation` rejects any
  explanation with an amount or date not in the result, a claim without a fact
  id, a citation of an unverified rule, the wrong plan version, changed urgency,
  or dropped missing data.
- Synthetic mode makes **zero network calls**.

### Layer 4: API ([`src/api/index.ts`](../src/api/index.ts), [`server.ts`](../src/api/server.ts))

- `server.ts`: Origin must match `Host` or be in `ALLOWED_ORIGINS` (default
  `http://localhost:3000`); POST bodies must be JSON and under the size limit;
  logs contain route, status, ms and request id only — never bodies.
- `index.ts`: strict Zod validation before any engine runs. Unknown keys are
  rejected, so a request **cannot smuggle in plan rules**. Validation errors list
  field paths, never values.
- Every response:
  `{contract_version, ok, data | error, meta: {request_id, generated_by: "engine", synthetic_data: true}}`.

## 3. Where the user data comes from

The core input is `MemberState` ([`src/domain/member.ts`](../src/domain/member.ts)):

- plan key (carrier, group, option, network);
- accumulator snapshots per plan year (deductible remaining, annual max
  remaining, plan-paid YTD), each a `SourcedMoney` with source label and
  timestamp;
- pending claims, kept as ranges;
- procedure history (for frequency limits);
- FSA/HRA/HSA accounts with balances, eligibility dates and claim deadlines;
- monthly budget (hard and preferred limits);
- weekly availability and blackout dates;
- travel limit.

**Today (demo):** `GET /api/scenario` assembles this from
[`fixtures/synthetic/`](../fixtures/synthetic/) — member, before/after-visit
providers, card and transcript text, as-of dates. The frontend loads it once and
sends `member` and `providers` back in each POST.

**Production** (see [`production-architecture-plan.md`](production-architecture-plan.md)):
the member snapshot must be **server-owned**, assembled after identity
verification from eligibility/accumulator sources and looked up by session. The
client should send only what the member chooses (symptoms, confirmations,
availability edits). Today a client could post any member numbers — fine for
synthetic data, not for real data.

## 4. Request sequence (what `/care-window` does)

```
GET  /api/scenario          → member, providers, documents, as_of dates
POST /api/passport          {as_of, member}                       → BenefitPassport
POST /api/plan-options      {as_of, member}                       → PlanOptionsResult (1.6: group options, premiums, rule items)
POST /api/visit-navigator   {as_of, member, providers, visit:{intent, expected_codes,
                             symptoms}, known_procedures:[], max_options:3}
                                                                   → VisitNavigatorResult
POST /api/intake/extract    {as_of, document_id, kind:"card_photo", text, image:null,
                             consent}                              → UNVERIFIED procedures
        (member reviews/edits each card: "Your dentist said…", ticks to confirm)
POST /api/intake/confirm    {as_of, confirmed_by:"member", procedures}
                                                                   → CONFIRMED procedures or problems
POST /api/care-plan         {as_of, member, providers, procedures, planning_horizon_end,
                             max_alternatives:3}                   → CarePlanResult
POST /api/explain           {result_kind:"care_plan", request:<same care-plan body>,
                             focus_id:<alternative_id>}            → validated Explanation
```

All POSTs require `content-type: application/json`. `explain` does not trust a
client-supplied result: it **re-runs the engine** from the request and explains
that run, so the explanation can't drift from the numbers.

## 5. Output and how the frontend renders it

**`VisitNavigatorResult`**

| Field | Show it as |
|---|---|
| `safety` (urgent route) | Top banner "Contact a dentist now"; suppress cost comparisons |
| `options[]` (≤3) | Cards: `labels`, provider, `slot` date, `network_tier` + stale flag, `member_cost` range, `distance_miles` / `travel_minutes` |
| `options[].tradeoffs[]` | Concrete lines, e.g. "$108 less, 7 days later, 3 mi farther" |
| `excluded[]` | "Not shown: Lakeside (beyond your travel limit)" |
| `conditional_scenarios[]` | Labeled conditional ("if the crown is confirmed…"), never a recommendation |
| `evidence[]`, `issues[]` | Source badges, "needs confirmation" chips |

**`CarePlanResult`**

| Field | Show it as |
|---|---|
| `recommended_alternative_id` + `alternatives[]` (≤3) | Tabs/cards: Lowest cost / Earliest done / Smoothest payments |
| `events[]` | **Timeline:** per procedure, `service_date`, provider, `claim_route`, `plan_pay` and `member_cost`, `funding[]` split, `reasons[]` (e.g. "after plan reset", "within the dentist's window"), `next_actions[]` (request appointment / pre-treatment estimate by a date) |
| `monthly[]` | Monthly cash strip, flagged over preferred/hard budget |
| `benefit_states[]` | "Benefits left after this visit" |
| `totals`, `funding_gap_cents` | Summary header and any funding gap |
| `unscheduled[]`, `unresolved[]` | "Needs your attention", e.g. "2027 claim-submission rule unknown — confirm with the office" |
| `route_comparison` | Cash vs. claim card, only when both sides are known |
| `line_worst.steps[]` + `evidence[]` | "See how this was calculated": arithmetic plus exact plan quote and page |
| `decision_trace[]` | Audit/debug view; not for members |

**Routing today**

- The browser calls same-origin `/api/engine/*`.
- [`frontend/next.config.ts`](../../frontend/next.config.ts) rewrites it to
  `CAREWINDOW_ENGINE_URL` (default `http://localhost:4000`) at `/api/*`.
- [`frontend/src/lib/adapters/live/engine.ts`](../../frontend/src/lib/adapters/live/engine.ts)
  has one typed function per route, unwraps `{ok, data}`, maps errors to
  `AdapterResult` failures, and imports types straight from the backend domain
  (`@engine/*` path) so the two can't drift.
- The page renders engine fields and only formats cents.

**Rule:** the frontend never computes or adjusts money or dates. If the UI needs
a new number, add it to the engine output.

## 6. Not yet wired

1. **Server-owned member snapshot** (section 3) — the main production change.
2. **Live AI** — only synthetic extraction exists; transcripts and photos return
   `AI_UNAVAILABLE`. Live extraction plugs in behind the same extractor
   interface and must still pass confirmation and the validator.
3. **The older `/analysis` compare flow** runs on its own fixtures with numbers
   from an earlier model; move it onto these routes or retire it.

## Running it

```bash
cd backend && npm run serve     # engine on :4000
cd frontend && npm run dev      # app on :3000 → open /care-window
```
