# Contract review: v1.0.0 → v1.1.0 (pre-build)

Author: dental-reviewer (independent). Date: 2026-10-03. Branch `contract-v1`. This file is the only file the reviewer wrote.

## 1. Scope and method

**Reviews.** Four read-only reviews were run against frozen contract 1.0.0 before any feature code was written:

- dental-benefits (B)
- dental-optimizer (O)
- dental-uxapi (U)
- this reviewer (R)

The Planner's brute-force checker (P) re-derived every golden number. It now lives at `scripts/golden-check.mjs` (`npm run golden:check`, also part of `verify`) and asserts every value in `fixtures/golden/expected.json`.

**What R covered:** spec §2–§10 and §13, CONTRACT, `src/domain/**`, `fixtures/**`, `data/sources/**`, `tests/acceptance/**`, `tests/contracts/**`, `scripts/**`, `.claude/**`, and the root config.

**What R ran.** To avoid writing into the repo, everything ran in a scratch copy with symlinked `node_modules`.

1.0.0 baseline:

- `test:contracts` 25/25 passed.
- `tsc` was clean.
- `check:frozen` was OK (53 files).
- `test:acceptance`: 76 failed and 10 skipped. Every failure was `NOT_IMPLEMENTED`.
- A schedule counter written independently of the Planner's checker.
- Crafted-stdin runs of the guard hook.

**How R verified 1.1.0** (Section 5 holds the residual issues):

- **Contract text.** I read `docs/contracts/CHANGELOG.md` and every CONTRACT clause marked (1.1).
- **Tests and fixtures diff.** I diffed `tests/acceptance`, `fixtures` and `src/domain` against my 1.0.0 snapshot. There is no git diff because nothing is committed (see R-11).
- **Hook.** I re-ran the hook tests.
- **Fresh 1.1.0 copy:**
  - `check:frozen` OK (60 files)
  - `golden:check` reports "GOLDEN OK"
  - `test:contracts` 25/25 passed
  - `tsc` exit 0
  - `test:acceptance` 80 failed and 10 skipped, all `NOT_IMPLEMENTED`

## 2. Reviewer findings (as reported on 1.0.0)

Columns: severity · location · problem · evidence · fix · owner · effort. "Planner" means a frozen file.

**R-1 · P0** — `CONTRACT-v1.md:164,168,198` (§5.2, §5.3, §5.5)

- **Problem:** Leaving a procedure "unscheduled" is allowed at any time, and pass 1 is "shortfall = 0". The $40-budget variant therefore reaches zero shortfall by leaving the crown unscheduled. The result is `NO_FEASIBLE_SCHEDULE`, but golden expects `BUDGET_SHORTFALL`, pass 2.
- **Problem (second case):** With `annual_maximum.2026` missing, an all-unscheduled schedule has no lines, so it escapes `NEEDS_CONFIRMATION` and AT-01 fails.
- **Tests broken:** `at07-09…:88-110` and `at01…:105-112`.
- **Evidence:**
  - The crown needs at least $76 cash in its month, which is above the $40 limit.
  - The schedule "root canal Oct 20 (FSA) + nothing else" has a shortfall of 0.
  - My counter finds 396 complete eligible schedules plus 151 partial ones. Golden's "396" therefore excluded the unscheduled option.
- **Fix:** Unscheduled is allowed only at the minimum achievable level U*. Pool₀ = U* schedules with no NEEDS_CONFIRMATION line. If pool₀ is empty → `NEEDS_CONFIRMATION`. Pass 1 = pool₀ with zero shortfall, else pass 2.
- **Owner / effort:** Planner + Optimizer, 20 min.

**R-2 · P1** — `.claude/hooks/guard-frozen.mjs`, `scripts/frozen-files.mjs`, `.claude/settings.json`

- **Problem:** The freeze guard can be bypassed and fails open.
- **Evidence from running the hook:**
  - A Write to `.claude/UNFREEZE` exited 0.
  - An edit to `scripts/frozen-files.mjs` exited 0.
  - `SRC/Domain/plan.ts` exited 0, even though APFS is case-insensitive and that path is the frozen file.
  - Malformed stdin exited 0.
  - A missing import exited 1, which Claude Code treats as non-blocking.
  - Bash wasn't matched.
  - `Bash(npm run *)` auto-allowed `npm run freeze`.
  - The hook, `settings.json` and `scripts/*` were not in `FROZEN.sha256`.
- **Fix:**
  - Fail closed (exit 2) on any error.
  - Match paths in lower case.
  - Never let Write/Edit create UNFREEZE.
  - Freeze the hook, settings and scripts.
  - Put `ask` on freeze.
  - Add a Bash matcher.
  - Diff against a git tag.
- **Owner / effort:** Planner, 45 min.

**R-3 · P1** — `docs/briefs/uxapi.md`

- **Problem:** The UX/API/AI scope is about 9 hours for one agent. It is the critical path.
- **Evidence:**
  - The brief covers a parser, scanner, template, a 7-rule validator, 8 handlers, 8 route wrappers, a 7-screen UI, live Bedrock and demo-cli.
  - A 256 KiB body limit makes the 7 MB image field unusable.
- **Fix:** Defer live Bedrock and image intake, drop `PlanRuleExtractionResult`, and build the UI as one page. Keep the validator's date and urgency checks, because AT-16 asserts them.
- **Owner / effort:** Planner, 15 min (saves about 3 hours).

**R-4 · P1** — `CONTRACT-v1.md:208` (§5.7)

- **Problem:** The contract claims self-pay is chosen "only when strictly cheaper … because tie_key prefers claim routes". That is false: the smoothest and earliest labels rank peak cash and completion date before cost. This violates spec §8.
- **Evidence:** The ranking-key tables in §5.5. The fixtures happen to be safe ($1,426 < $1,456 and $150 < $180).
- **Fix:** A self-pay event is eligible only if the claim version of the same schedule costs strictly more.
- **Owner / effort:** Planner + Optimizer, 40 min.

**R-5 · P1** — `CONTRACT-v1.md:227,231` (§6.2, §6.3)

- **Problem:** §6.3 requires `<description>`, but `ExplanationInput` has no description. §6.2 doesn't forbid building `confirmed_facts` from `description` or `dentist_statements`, which are injection channels to a live model.
- **Evidence:** `ai.ts:75-90`. AT-15 checks only the optimizer.
- **Fix:** Facts come from structured fields only. Claims name procedures by code and tooth.
- **Owner / effort:** Planner, 10 min.

**R-6 · P1** — `CONTRACT-v1.md:19,37,214` (§1.5, §1.11, §5.8)

- **Problem:** AT-06 byte-equality is at risk from four sources:
  - key insertion order in `decision_trace.data`
  - `search_stats` that depend on enumeration order
  - no issue dedupe key
  - `tie_key` compared as a concatenated string
- **Evidence:** `at06…:29-46` permutes every input array.
- **Fix:** Canonicalize inputs at entry, use sorted keys, define a dedupe key that excludes the message, and compare `tie_key` element-wise.
- **Owner / effort:** Planner, 10 min.

**R-7 · P1** — repository

- **Problem:** The contract isn't committed, so there is no baseline for agents' diffs.
- **Evidence:** `git status` shows every contract file untracked.
- **Fix:** Commit and tag.
- **Owner / effort:** Planner, 5 min.

**R-8 · P2** — `CONTRACT:33`, `primitives.ts:58-60`

- **Problem:** The note "for plan pay the worst case is the low end" is wrong for charge ranges.
- **Evidence:** A higher allowed amount raises both plan pay and member cost.
- **Fix:** Delete the parenthetical.
- **Owner / effort:** Planner, 5 min.

**R-9 · P2** — `issues.ts:109` vs `ai.ts:89,102`

- **Problem:** `Issue.message` allows 500 characters, but `missing_fields`/`missing_data` allow 200.
- **Evidence:** `ExplanationInput.parse` throws on a long message.
- **Fix:** Align the limits.
- **Owner / effort:** Planner, 5 min.

**R-10 · P2** — `CONTRACT:155`

- **Problem:** Unconfirmed alternative groups return `INVALID_INPUT` before the unconfirmed check can run. No test covers groups.
- **Fix:** Cut groups from v1.
- **Owner / effort:** Planner, 5 min.

**R-11 · P2** — `CONTRACT:117,128,147,206-210`

- **Problem:** Several requirements go beyond what any test needs:
  - all 13 calculation steps on every line
  - 5 passport sections
  - optional conditional scenarios
  - 10 reason codes and 4 next actions
- **Evidence:** AT-02 checks 8 steps. Tests assert 4 reasons and 3 actions. The mock already omits `EARLIEST_COMPATIBLE_SLOT` on the crown.
- **Fix:** Require only what the tests use; make the rest MAY. Conditional scenarios return `[]`.
- **Owner / effort:** Planner, 10 min (saves about 2 hours across agents).

**R-12 · P2** — `fixtures/mock-responses/*`

- **Problem:** The mocks contradict the contract:
  - passport has 2 sections, with `rollover` placed in `balances`
  - navigator line ids are `visit-rivera-l1`
  - extraction ids are `proc-rc-30` (the contract says `proc-d3330-30`)
  - the warnings §5.3 implies are missing
  - rule ids are unsorted
- **Fix:** Regenerate the mocks.
- **Owner / effort:** Planner, 30 min.

**R-13 · P2** — `vitest.config.ts:20-23`

- **Problem:** UI tests run in the `node` environment.
- **Evidence:** React Testing Library needs a DOM.
- **Fix:** Tell UX in its brief to use the `// @vitest-environment jsdom` docblock.
- **Owner / effort:** Planner, 2 min.

**R-14 · P2** — `member.ts:131`

- **Problem:** `time_zone` isn't validated.
- **Evidence:** `Intl` throws a RangeError, which surfaces as a 500.
- **Fix:** Add an `Intl` refine to the schema.
- **Owner / effort:** Planner, 5 min.

**R-15 · P2** — `policy.ts:16-23`

- **Problem:** A limit of 2M schedules × `simulate` takes minutes.
- **Evidence:** The demo needs about 1k schedules; vitest's timeout is 5 s.
- **Fix:** Set the limit to 50k and precheck the product of candidate counts before searching.
- **Owner / effort:** Planner, 5 min.

**R-16 · P2** — CONTRACT §3.6

- **Problem:** It's unspecified what happens to lines when the ledger has a blocking issue.
- **Evidence:** An `INPUT_INCONSISTENT` snapshot.
- **Fix:** Every line in that period becomes NEEDS_CONFIRMATION.
- **Owner / effort:** Planner, 5 min.

**R-17 · P2** — uxapi brief

- **Problem:** Today (Oct 3) is earlier than the scenario's `as_of` dates.
- **Evidence:** If the UI sends the wall clock as `as_of`, the demo diverges from golden.
- **Fix:** The UI uses the scenario's `as_of`.
- **Owner / effort:** Planner, 2 min.

**R-18 · P2** — KICKOFF:24, `.mcp.json`

- **Problem:** `shadcn@latest` is unpinned, and init writes UX-owned files.
- **Fix:** Pin the version and run it in step 0.
- **Owner / effort:** Planner, 10 min.

**R-19 · P2** — spec §3

- **Problem:** Nothing tests plan identity.
- **Evidence:** Changing `group_id` should not resolve to a similar plan.
- **Fix:** Add an AT-01 case.
- **Owner / effort:** Planner, 10 min.

**R-20 · P3** — various nits

- AT-01 §-ref.
- `build-mocks` comment.
- `CLAIM_WITHOUT_FACT_ID` is unreachable.
- Fee-unknown blocks confirmation.
- Null sort order unspecified.
- `-l10` ordering.
- AT-18 shared state.
- The fetch spy misses the AWS SDK.
- `cat .env`.
- Client-asserted CONFIRMED.
- `npm run dev` runs in the foreground.
- **Owner / effort:** Planner, 20 min.

Already correct in 1.0.0:

- All golden cents, dates and labels, re-derived by hand.
- Fixtures contain no realistic personal data and no real carrier branding: names are labeled "(synthetic)", and grep finds no real carriers.
- The transcript injection line is caught by the scanner regexes.
- Results and `ExplanationInput` carry no `member_id` or `display_name`.

## 3. Combined triage (Planner decisions, verbatim)

Sources: B = dental-benefits, O = dental-optimizer, U = dental-uxapi, R = dental-reviewer, P = Planner brute-force checker (`scripts/golden-check.mjs`).

### Accepted — fixed in 1.1.0 (frozen files)

| ID | Sev | Finding (sources) | Fix applied |
|---|---|---|---|
| T1 | P0 | Pass 1 can drop care to reach zero shortfall; $40-budget variant fails golden + AT-07 (O P0-1, R P0-1, P) | §5.5 pass 1 requires `unscheduled = U*` |
| T2 | P0 | Missing annual max → `NO_FEASIBLE_SCHEDULE` instead of `NEEDS_CONFIRMATION` (AT-01) (O P0-2, R P0-1) | §5.3/§5.6 `U_ok > U_all` rule |
| T3 | P1 | Self-pay can win while costing more (smoothest/earliest labels) (R P1-3, O P3) | §5.3 strict dominance vs. claim version |
| T4 | P1 | `max_schedules_evaluated` 2M ≈ 10–30 min (O P1-3, R P2-11) | 50,000 + up-front combination check |
| T5 | P1 | AT-06 byte-equality vs. trace/search_stats/dedupe/tie_key ambiguity (O P1-4, R P1-5, P3s) | §1.5, §1.11, §5.2, §5.5, §5.8 |
| T6 | P1 | Free text can reach messages/explainer; §6.3 `<description>` not in ExplanationInput (U 5, O P1-5, R P1-4, B 24) | §1.11, §6.2, §6.3; AT-15 assertion |
| T7 | P1 | Blocking ledger issue doesn't block lines; totals non-null on NEEDS_CONFIRMATION (B 2, R P2-12) | §3.1, §3.6 |
| T8 | P1 | `source:NEEDS_CONFIRMATION` inputs still calculated (B 3) | §1.6 |
| T9 | P1 | 13 required calc steps; mock has 9 (B 4, R P2-6) | §3.5: 8 required |
| T10 | P1 | Sublimit state undefined (B 5) | VERIFIED sublimit → RULE_TYPE_UNSUPPORTED |
| T11 | P1 | AT-17 bundles benefits+optimizer; brief says "simulation parts of AT-11" (B 1) | AT-17 split; brief lists `-t` filters |
| T12 | P1 | Hook fails open, UNFREEZE writable, case bypass, self not frozen, `npm run freeze` auto-allowed (R P1-1) | Fail-closed hook, case-insensitive, manifest covers hook/settings/scripts, `ask` on freeze |
| T13 | P1 | UX brief ~6–9 h; image intake impossible under 256 KiB (U 3, U 4, R P1-2) | Bedrock/image/transcript/manual deferred (§6.1, §8); brief cut list |
| T14 | P1 | shadcn can't be added under ownership/network (U 1, R P2-14) | KICKOFF step 0 pins version + component list, fallback plain Tailwind |
| T15 | P1 | `DemoScenario` lacks `planning_horizon_end` (U 2) | Schema field added |
| T16 | P1 | Contract not committed (R P1-6) | Committed on contract-v1 + local tag |
| T17 | P1 | Optimizer brief ~5–6 h (O P1-6) | Fake engine optional; cuts in brief |
| T18 | P2 | Alternative groups contradictory, untested (O P2-7, R P2-3) | Non-null group → NEEDS_CONFIRMATION |
| T19 | P2 | `known_procedures` unchecked; conditional scenarios (O P2-8, R P2-4) | `[]`, input ignored |
| T20 | P2 | Reason codes beyond tests; FITS_MONTHLY_BUDGET always true (R P2-5, O) | 6 required, rest MAY |
| T21 | P2 | Passport: NOT_APPLICABLE shown as needs-confirmation; 5 sections (B 6/7, R P2-7) | §3.7 + AT-02 |
| T22 | P2 | Mocks contradict contract (ids, sections, warnings, sort) (U 14, O P2-9, B 7, R P2-8) | Regenerated |
| T23 | P2 | `missing_fields` 200 < `Issue.message` 500 (U 7, R P2-2) | AI limits raised to 500 |
| T24 | P2 | `ignored_instructions.text` 500 vs 20 KB lines (U 8) | Truncate to 500 |
| T25 | P2 | Dollar regex reads "$1372" as $137 (U 6) | §6.4 + AT-16 regex |
| T26 | P2 | Same-origin/body limit unspecified for Next 16 route handlers (U 9, U 21) | §7 rules |
| T27 | P2 | Client bundle could import engines/registry (U 12) | ESLint `no-restricted-imports` |
| T28 | P2 | Invalid time zone → RangeError 500 (O P2-12, B 12, R P2-10) | `MemberState.time_zone` refine |
| T29 | P2 | VisitOption `annual_max_used`/`deductible_applied` undefined; urgent label clash (O P2-10/11) | §4.4, §4.6 |
| T30 | P2 | `network_tier` non-null when provider missing (B 10) | nullable |
| T31 | P2 | NOT_COVERED pricing, claim_submission on claim lines, missing-rule consistency (B 8/9/11) | §3.1, §3.3 |
| T32 | P2 | Staleness owner (B 14) | §1.9 (optional) |
| T33 | P2 | "396" ambiguous (O P2-14, R) | golden-scenario.md counts |
| T34 | P2 | Final event ids need re-simulation (O P2-13) | §5.3 |
| T35 | P2 | Range parenthetical wrong for charge ranges (R P2-1) | §1.7 |
| T36 | P2 | No plan-identity test (R P2-15) | AT-01 case |
| T37 | P2 | jsdom, demo as_of, lazy deps, fs for documents (R P2-9/13, U 10/13/23) | uxapi brief |
| T38 | P2 | Plan JSON generator, perf rules, unit-test trim (B 13/15/16) | benefits brief |
| T39 | P2 | CRLF checksums; unpinned shadcn MCP (B 22, R P2-14) | `.gitattributes`, `.mcp.json` pin |
| T40 | P3 | Nits: AT-01 §ref, ports/build-mocks comments, CLAIM_WITHOUT_FACT_ID reserved, validator scope, benefit_period year, request-id regex, class-map lookup, rollover warning, ledger_before, passport w/o snapshot, null ordering, completion null, max(latest) nulls, comparison doc out of scope, distinct by tie_key, `exceeds_hard`, Oct 29 test vacuous, KICKOFF `npm run dev` background, deny `cat .env` | Fixed |

### Rejected

| ID | Finding | Reason |
|---|---|---|
| X1 | Change AT-03/05 totals `.high` sum (R P2-1) | Golden inputs are exact; the assertion is valid there. |
| X2 | Lower `Issue.message` to 200 (R P2-2) | Raising the AI limits is the smaller change. |
| X3 | Loosen AT-06 to alternatives only (O P1-4 option) | Keep strict; canonical ordering makes it satisfiable. |
| X4 | Don't block on unknown `dentist_fee` (R P3) | Conservative; the card always states a fee. |
| X5 | Delete `FITS_MONTHLY_BUDGET` / `exceeds_hard` (O) | Enum churn; made optional / defined false instead. |
| X6 | AT-18 shared state across steps (U 26, R) | Deterministic (no shuffle); cascade is acceptable. |
| X7 | `-l10` id ordering (R P3) | v1 visits have ≤ 2 codes. |
| X8 | `/api/care-plan` trusts client CONFIRMED (R P3) | No auth in v1; documented for the reviewer. |
| X9 | `server-only` dependency for `.server.ts` (U 11) | Moot: live Bedrock deferred. |
| X10 | Delete `PlanRuleExtractionResult` (R P1-2) | Unused schema costs nothing; no churn. |

### Deferred

| ID | Item | Where it lives now |
|---|---|---|
| D1 | Hook Bash-command matcher; `check:frozen` diff against git tag (R P1-1 #4/#6) | `check:frozen` + commit are the backstop (D-023) |
| D2 | Injection-scanner false positives (U 19) | Known limitation, CONTRACT §6.1 |
| D3 | Semantic "plan claim without rule id" (U 25) | Known limitation, CONTRACT §6.4 |
| D4 | Running `shadcn init/add` (needs network on the dev machine) | KICKOFF step 0 |
| D5 | AT-18 fetch spy can't see AWS SDK (U 20, R) | Moot until live mode |
| D6 | Mock steps to the full 13 (U 18) | Not required in 1.1.0 |
| D7 | Provider names reaching the explainer (R P1-4) | Reviewer brief: test it |
| D8 | Staleness acceptance test (R matrix) | Optional in 1.1.0 |
| D9 | Live Bedrock, image intake, transcript saved extraction, alternative groups, conditional scenarios, sublimits | CONTRACT §8 (1.1) |

## 4. Spec coverage matrix (contract 1.1.0)

| Spec | Requirement | Schema | CONTRACT | Test | Status |
|---|---|---|---|---|---|
| §2 | Service, claim and payment dates kept separate | `ClaimEvent.claim_date`, `FundingAllocation.payment_date` | §3.2, §5.4 | AT-10 | Covered |
| §2 | Claim route separate from funding source | `ClaimRoute`, `FundingSourceType` | §3, §5.4 | golden | Covered |
| §3 | Registry, evidence, checksums | `PlanDefinition`, `SourceDocument` | §2 | AT-00 | Covered; comparison document → §8 |
| §3 | Exact identity, never borrow | `PlanKey`, `samePlanKey` | §2.2 | AT-01 (1.1, `group_id` → `PLAN_NOT_FOUND`) | Covered |
| §3 | Rule statuses, conflicts | `RuleStatus` | §2.3, §3.3 | AT-00, AT-01 | Covered |
| §3 | Plan-type strategy | `PlanType` | §2.2 | AT-17 (split 1.1) | Covered |
| §4 | Shared contracts | `src/domain/**` | §1 | `tests/contracts` | Covered |
| §5 | Safety gate | `Symptoms` | §4.1, §4.6 | golden urgent variant | Covered |
| §5 | ≤3 non-dominated options with tradeoffs; balance effect | `VisitOption` | §4.4–4.7 | golden, AT-09 | Covered (`annual_max_used` defined 1.1) |
| §5 | Stale or missing info | `network_stale`, `INPUT_STALE` | §1.9 (MAY) | — | Optional; untested |
| §5 | "Save benefits" only as a conditional scenario | `ConditionalScenario` | §4.9 → `[]` | golden urgent `[]` | Deferred, §8 |
| §6 | Intake: card text | `ExtractionRequest` | §6.1 | AT-14, AT-18 | Covered |
| §6 | Intake: photo, estimate, audio | — | §6.1, §8 | — | Deferred, §8 / D-019 |
| §6 | Confirmation screen | `CONFIRMABLE_FIELDS` | §7 confirm | AT-18 step 5 | Engine covered; UI → reviewer e2e |
| §6 | Timeline: what, when, where, route, funding, balance, why, next action | `ScheduledEvent` | §5.4–5.8 | golden | Covered (6 reasons required) |
| §7.2 | Window, dependencies, availability, travel, specialty | — | §5.2–5.3 | AT-07/08/09 | Covered |
| §7.2 | Waiting period, frequency | — | §3.3.4 (D-008) | AT-01 (2027 crown conflict) | Partial; NOT_COVERED path only in benefits unit tests |
| §7.2 | Dentist-approved alternatives | `alternative_group_id` | §5.1 → NEEDS_CONFIRMATION | — | Deferred, §8 |
| §7.2 | Two-pass affordability | — | §5.5 (1.1 U*) | AT-07, golden-check | Covered |
| §7.3 | Chronological state, caps, per-line rounding | `AdjudicationLine` | §3.3 | AT-03/04/05, golden | Covered |
| §7.4 | Funding allocation, no prepayment | `FundingAllocation` | §5.4 (D-009) | golden, AT-10 | Covered (fixed order by D-009) |
| §7.5–7.6 | Lexicographic objective, exact search | `ObjectiveVector` | §5.3, §5.5 | golden, golden-check | Covered |
| §8 | Self-pay compared over the whole horizon | `ClaimSubmissionValue` | §3.4, §5.3 (1.1) | AT-13 | Covered |
| §9 | Extraction, retrieval, explanation | `ai.ts` | §6 | AT-14/15/16 | Covered; plan-rule extraction unused (X10) |
| §9 | Explanation rejection rules | `ExplanationViolationCode` | §6.4 | AT-16 | "Plan claim without rule" only syntactically (D3) |
| §10 | Labels, timestamps, ranges, wording | `SourceLabel`, `WORDING` | §1, §3.7 | AT-02, AT-11, AT-16 | Covered; UI wording → reviewer |
| §10 | No logging of raw text or member ids | — | §7 | — | Reviewer integration tests |
| §13 | AT-1 … AT-18 | — | — | `tests/acceptance` | All mapped; AT-2 for UI-displayed numbers → reviewer e2e |

## 5. Residual risks after 1.1.0

**1. Out-of-band optimizer code.**

- **What happened:** Someone wrote `src/optimizer/{care-plan,navigator,shared,index}.ts` (~1,450 lines) and `tests/optimizer/mvp-before-after.test.ts` against 1.0.0 during the review. It was apparently a Codex session in VS Code, not one of our agents.
- **Current state, in a fresh copy:** `tsc --noEmit` exits 0, and that test passes 7/7. So it doesn't fail typecheck right now, contrary to the earlier report; the files may have been edited since.
- **Where it diverges from 1.1.0 §5, by reading the code:**
  - It aborts mid-search when `schedules_evaluated > max_schedules_evaluated` (`care-plan.ts:812`). §5.1 (1.1) requires the up-front combination check and "never abort part-way".
  - It selects with a `fullyScheduled` filter (`care-plan.ts:917`) instead of U* / `U_ok` vs `U_all`.
  - It has no self-pay dominance check (§5.3).
- **Action:** The optimizer agent must reconcile this code (or replace it) before claiming AT-01, AT-07 or the golden suite.
- **Ownership:** It writes only in optimizer-owned paths, but nobody has reviewed it.

**2. T16 is not true yet.**

- The triage says the contract was committed and tagged. On this machine, `git log` shows only `init` and `init 2`, `git tag -l` is empty, and every contract file is still untracked.
- The deferred D1 backstop ("`check:frozen` + commit") has no commit behind it.
- **Action:** commit and tag before phase 2.

**3. The freeze guard is better but still partial.** I re-ran the crafted-stdin tests.

These now exit 2:

- `src/domain/plan.ts` and `SRC/Domain/plan.ts`
- `.claude/UNFREEZE` and `.Claude/unfreeze`
- `scripts/frozen-files.mjs`
- `.claude/hooks/guard-frozen.mjs`
- a `fixtures/…ipynb` NotebookEdit
- non-JSON stdin
- a `docs/contracts/../../src/domain/…` traversal

These still exit 0:

- **Unfrozen files that matter:**
  - `docs/contracts/FROZEN.sha256` — the manifest itself
  - `package.json` — it defines which test projects `verify` runs
  - `scripts/golden-check.mjs` — the oracle for the golden numbers
  - `.claude/settings.local.json` — I believe a local settings file can set `disableAllHooks`, but haven't verified it
- **Bash commands:** no matcher exists yet (D1).
- **The `cat .env` deny is cosmetic:** `head .env` or `grep . .env` work.
- **Unconfirmed precedence:** whether `ask` beats the broader `allow: Bash(npm run *)` for `npm run freeze` should be confirmed with `/permissions`.
- **Suggested additions:**
  - freeze `package.json` and `scripts/golden-check.mjs`
  - block Write/Edit of `.claude/settings.local.json` and `FROZEN.sha256` without UNFREEZE
  - keep the git tag as the real backstop

**4. Search scale.**

- `policy.ts` says "the golden case needs ~840". My count is (5+1)(5+1)(25+1) = 936. It's harmless, but the comment should match the formula.
- More importantly, the 50,000 precheck caps v1 at demo scale. For example, 8 procedures with 4 candidates each gives 5^8 ≈ 390k combinations and returns `INVALID_INPUT`. That's acceptable for the hackathon, but the UI must show the "narrow providers or dates" message rather than a blank screen.

**5. `U_ok > U_all` can over-block.**

- **Problem:** A single missing rule that affects only one optional route (e.g. one OON provider) leaves `U_ok = U_all`, which is fine. But a missing rule affecting a period every candidate of one procedure needs still blocks the whole plan, even when the other procedures are fully priceable.
- **Assessment:** That matches spec §13.1 (no partial plans on missing rules) and is conservative.
- **Action:** Keep it; mention it in the explanation so it doesn't look like a bug.

**6. AT-15's new assertion is narrow.**

- **Problem:** `JSON.stringify(injected)` must not contain `"SYSTEM:"`, but it doesn't cover the explainer path or provider names (D7).
- **Action:** The reviewer will add integration tests:
  - injected `provider.name`, `description` and `dentist_statements` through `/api/explain`
  - assert the explanation and `confirmed_facts` contain none of them

**7. Deferred privacy checks.**

- Body and transcript logging, `localStorage` use and client-bundle secrets are untested until phase 4 (`tests/integration/**`).
- `/api/care-plan` still trusts client-sent `CONFIRMED` status (X8); the demo relies on the UI flow.

**8. Not re-verified here.** I did not re-review the contents of the briefs (benefits, optimizer, uxapi), KICKOFF step 0 or the regenerated mocks beyond schema validity. `test:contracts` passing only proves the mocks parse.
