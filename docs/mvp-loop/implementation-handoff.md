# CareWindow MVP loop: implementation handoff

Implementer: Agent 2, iteration 2: the rollover slice, contract 1.4.0 → 1.5.0. Date: 2026-10-04. Branch `feature/cash-vs-claim`. Nothing is committed. The baseline uncommitted work is preserved; the final tree was diffed against `scratchpad/snap-iter2-pre`.

## Requirements completed

| ID | Result |
|---|---|
| §5.1 rule model | `RolloverValue` is replaced by the explicit model exactly as in plan §4.2. Each enum is documented as "documented values only". |
| §5.2 ledger state | `RolloverOutcome` carries the prior bank, award, bonus range, lost-to-cap, forfeited, final bank, status, rule ids, pending amount and input ids. The new optional input `AccumulatorSnapshot.carryover_balance` (default `null` = unknown) holds the existing bank. |
| ROLL-001 | Qualifying amount = settled `plan_paid_ytd` + simulated `plan_pay` of OK lines with `counts_toward_maximum` (+ pending). Preventive and self-pay lines never count (AT-21 #1). |
| ROLL-002 | Each period closes once per simulation, either when the next period opens or at the end of the run. A snapshot-opened next period never gets a carry-in. Repeated runs give identical results. |
| ROLL-003 | `LT` is shipped. `LTE` is tested on a registry copy. |
| ROLL-004 | `NONE` is shipped. `ANY_IN_NETWORK_CLAIM` is tested, including the uncertain case where settled claims have an unknown network. |
| ROLL-005 | `ADD_AND_CAP`/`REPLACE`, `lost_to_cap_cents`, and the prior bank is forfeited when the year does not qualify. |
| ROLL-006/007 | The exact next version is resolved. An unknown next plan gives `NEEDS_CONFIRMATION` + `ROLLOVER_NEXT_PLAN_UNKNOWN`. An unlisted next plan gives `NOT_EARNED` + `ROLLOVER_NEXT_PLAN_INELIGIBLE`. Nothing is carried in either case. |
| ROLL-008 | A pending claim that crosses the threshold gives `UNCERTAIN` with a qualifying range and a final-bank range, plus `ROLLOVER_UNCERTAIN`. |
| ROLL-009 | Ten steps `rollover.<pv>.<name>`. Every operand resolves to a VERIFIED rule, a member input, a line step, or an earlier step of the same outcome. |
| ROLL-010 | `worst_case` (the ranking scenario) never applies a carryover. `rollover_shift` is display-only and only for `can_plan_later` events. Selected schedules are identical to a NOT_APPLICABLE run (AT-21 #11). |
| §5.4 / §6.3 | Template sentences for each status, including the shift sentence. They never say "guaranteed". The validator counts `focus.rollover[].closing_plan_version_id` as used. |
| UI-007 | `RolloverPanel` on `/care-window` shows:<ul><li>status label</li><li>qualifying amount vs threshold</li><li>final bank</li><li>lost to cap</li><li>balance lost</li><li>issues</li><li>a "How this was calculated" disclosure with steps, the rule id and the rider quotes</li></ul>`RolloverShiftNote` appears on events. |
| §13 / §14.2 #1–11 | The rider is seeded and `rollover.2026` is VERIFIED. The golden variant `rollover_near_threshold` is added. AT-21 has 23 tests. |
| §11.2 | Outcomes are per alternative (`Alternative.rollover`), as the plan specifies. |

## Files changed

**Backend.** Frozen files went through the full freeze cycle: UNFREEZE → edit → `npm run freeze` (65 files) → marker deleted.

- **New:**
  - `data/sources/northwind-ppo-2026-carryover-rider.md` (exact plan text; sha256 `0c947e68…c02ea2`)
  - `tests/acceptance/at21-rollover.test.ts`
- **Data and registry:**
  - `data/sources/manifest.json`: rider appended last
  - `data/tools/build-registry.ts`: optional per-cite `source_id`; `source_documents`/`source_precedence` from the manifest and expectations; rider quotes; `evidence_source_id` check
  - regenerated `data/plans/nwd-ppo-standard-2026.json` and `sources.generated.json`. The 2027 plan is byte-identical.
- **Domain:**
  - `src/domain/plan.ts`, `member.ts`, `benefits.ts`, `fact-ids.ts`, `optimizer.ts`, `issues.ts`
  - `version.ts` → `1.5.0`
- **Engine, optimizer, AI:**
  - `src/benefits/simulate.ts`: `closeYear`, close/carry-in wiring, carryover-aware consistency check, `RULE_TYPE_UNSUPPORTED` branch removed
  - `src/benefits/index.ts`: passport text
  - `src/optimizer/care-plan.ts`: `rolloverShift`, `Alternative.rollover`, rule ids
  - `src/ai/explain.ts`: `rolloverClaim`, version set
- **Fixtures:**
  - `fixtures/synthetic/member.json`: `carryover_balance` $0
  - `fixtures/golden/registry-expectations.json`: VERIFIED rule, precedence, `evidence_source_id`
  - `fixtures/golden/expected.json`: additions only
  - `fixtures/mock-responses/*.json`: regenerated
- **Scripts:**
  - `scripts/golden-check.mjs`: independent `ROLLOVER_2026`, `carryover2026`, `rolloverShift`, assertions
  - `scripts/build-mocks.ts`
- **Docs:**
  - `docs/contracts/CONTRACT-v1.md`: §2.1, §3.1, §3.6, §3.7, new §3.9, §5.5, new §5.10, §6.3, §6.4, §8
  - `golden-scenario.md`, `CHANGELOG.md` (1.5.0), `FROZEN.sha256`
  - `docs/decision-log.md` (D-028), `docs/acceptance.md`, `docs/backend-flow.md`
  - `CLAUDE.md`, `README.md`
- **Tests corrected because the source changed.** These are not weakenings; each still asserts the same property.
  - `tests/contracts/fixtures.test.ts`: page list is `[1,2]` for the rider, `[1..5]` for the summaries.
  - `at00`: the cited source is the rule's `evidence_source_id` (otherwise the summary).
  - `at02`: the passport item is now VERIFIED/PLAN_VERIFIED. The UNVERIFIED → NEEDS_CONFIRMATION check moved to a registry copy.
  - `at16`: the unverified-rule case cites UNKNOWN `claim_submission.2027`; it still expects `UNVERIFIED_RULE_CITED`.
  - `at20`: precedence is compared with the expectations plus a permutation check. The educational-source case expects exactly the rules backed only by that source, and asserts `rollover.2026` (also backed by the rider) is not flagged.
  - `tests/benefits/engine.test.ts`: the shipped registry gives a 2026 outcome; the unverified note moved to a new test on a copy; the edu-source test appends to the existing precedence.
  - `tests/optimizer/mvp-before-after.test.ts`: the fake engine gets `rollover: []`.

**Frontend.**
- `src/features/care-window/care-plan.tsx`: exported `RolloverPanel`, `RolloverShiftNote`, `rolloverStatusLabel`; evidence passed to `AlternativeView`.
- New `tests/unit/care-window-rollover.test.ts`.
- `lib/adapters/live/engine.ts` needed no change.

**Root:** `README.md` version mention.

## Behavior implemented

- **Year close (§3.9).** This follows plan §4.3 step by step.
  - The previous period is reused, or opened privately: its issues stay out of the simulation, and a null state gives NEEDS_CONFIRMATION.
  - Rollover issues stay inside the outcome. `SimulationResult.rollover` is sorted by `closing_period_end`.
- **Carry-in.**
  - It happens only for a fresh next period, in `best_case`, and only when `final_bank.high > 0`.
  - It adds the bank to the 2027 maximum (remaining and available). The maximum operand then cites `rule:rollover.2026`, and the rule is added to counted lines' `applied_rule_ids`.
- **Golden.** The golden 2026 close is NOT_EARNED in both alternatives, with qualifying {142400, 150000}, final bank {0, 0} and every shift `null`.
  - The demo still prints $1,372 / $908.
  - It adds one sentence: "Plan payments this year ($1,500) are not below the $500 carryover threshold, so no carryover is earned."
  - The `RULE_UNVERIFIED rollover.2026` warning is gone from `unresolved`.
- **Near-threshold variant.** It matches the Planner's hand targets exactly. The checker independently reproduced every target with no disagreement:
  - **alt-1:** Rivera Oct 20; qualifying 56400; NOT_EARNED; shift → 2027-01-05 `prov-rivera-t-20270105-1000`, CONDITIONAL {25000, 25000}, +6000.
  - **alt-2:** BrightSmile Oct 17; 51000; shift → 2027-01-09, +4500.

## Tests added

- **AT-21:** 23 tests covering §14.2 #1–11, ROLL-009 trace, the unverified path, the golden variant, the §5.4 explanation, and the L-2 API case. Optional key → 200 and NOT_EARNED; unknown accumulator key → 400.
  - **Mutation check:** making the threshold `<=` fails 1 test; allowing a worst-case carry-in fails 2. Both were restored.
- `tests/benefits/engine.test.ts`: +1 (UNVERIFIED carryover noted at the next open, never applied).
- Frontend `care-window-rollover.test.ts`: 8 tests (5 statuses, lost-to-cap, empty, shift note; no "guarantee").

## Commands run and exact results

| Where | Command | Result |
|---|---|---|
| backend | `npx vitest run tests/acceptance/at21-rollover.test.ts` | 23/23 passed |
| backend | `npm run golden:check` | `GOLDEN OK — … route comparisons and rollover included (contract 1.5.0 rules)` |
| backend | expected.json immutability: `jq -S` of the pre copy vs `del(rollover_near_threshold, rollover_shift_null_for) \| del(base.alternatives[].rollover)` | identical. The text diff only adds two commas. |
| backend | `npm run verify` (exit 0) | `frozen files OK (65)` · GOLDEN OK · typecheck clean · lint clean · contracts 2 files 25/25 · unit 3 files 25/25 · acceptance 15 files 147/147 · integration 9 files 62/62 |
| backend | `npx vitest run` | 29 files, 259/259 passed |
| backend | `npx tsx data/tools/build-registry.ts` | Only the 2026 plan (rule, `source_documents`, precedence) and one appended source changed. The 2027 plan is identical. |
| backend | `npx tsx scripts/build-mocks.ts && npm run check:frozen` (rerun after freeze) | `frozen files OK (65)`, so it is idempotent. Non-care-plan mocks differ only in `contract_version`; the passport mock also has the VERIFIED carryover item. |
| backend | `npm run demo:cli` | alt-1 $1,372, alt-2 $1,426; explanation `validated: true` |
| backend | `ls .claude` | `agents hooks settings.json` (no UNFREEZE) |
| frontend | `npm run typecheck` / `npm run lint` | exit 0 / clean |
| frontend | `npm test` | 11 files, 136/136 passed (was 128) |
| frontend | `npm run build` | compiled successfully; `/care-window` built |

## Browser path verified

The Chrome extension was not connected (`list_connected_browsers` → `[]`), so I used headless Chrome over CDP (`scratchpad/cdp3.mjs`, `cdp5.mjs`). Servers: `npm run serve` (:4000) and `npx next dev -p 3000`. Both were stopped afterwards.

- **Path:** passport → Find visit options → Read the plan → tick 3 → Confirm 3 and plan my care → explain ×3.
- **Requests:** all `/api/engine/*` calls returned 200 (scenario, passport, visit-navigator, intake/extract, intake/confirm, care-plan, explain ×3). Zero console errors, exceptions or failed requests.
- **On the page:**
  - $1,372 and $908
  - "Unused maximum carryover", "Not earned", "Plan year ending Dec 31, 2026"
  - "$1,424 to $1,500", "Carryover to next year: $0"
  - `rollover.2026` with rider quotes, e.g. "A total of exactly $500 does not earn a carryover."
  - the "How this was calculated" steps
  - the carryover explanation sentence
  - the passport item "Up to $250 next year if plan payments stay below $500; balance capped at $1,000" (in "Coverage and plan rules")
- **The word "guarantee" on the page** comes only from the existing fee disclaimer ("not a guarantee of payment"). No rollover text uses it.
- **Near-threshold body POSTed through the Next proxy:** 200, contract 1.5.0, OK. Both alternatives NOT_EARNED (56400 / 51000), with the shifts exactly as golden (2027-01-05 +$60; 2027-01-09 +$45, CONDITIONAL $250). The demo UI has no scenario switcher, so the shift line itself is covered by the render test, not a browser screenshot.

## Assumptions

- **No carry-in of $0.** A carry-in happens only when `final_bank.high > 0`. Otherwise the golden best-case lines would change their maximum operand to `rule:rollover.2026` for no amount. Recorded in D-028 (8).
- **Status mapping:**
  - The ineligible-next-plan case is treated as not qualifying, so `forfeited` = prior.
  - `lost_to_cap` and `forfeited` are `null` whenever the status is NEEDS_CONFIRMATION (not guessed).
  - A prior balance is required only for `ADD_AND_CAP`.
- **`ROLLOVER_UNCERTAIN` wording:** when the uncertainty comes from the network bonus rather than a pending claim, the message says so instead of naming a pending claim.
- **Explainer:** NOT_EARNED gets two extra sentences not spelled out in the plan: ineligible next plan, and no paid claim. The rule-id "how calculated" disclosure lives inside `RolloverPanel` (a `<details>`, the existing pattern).
- **Step operands may cite earlier steps of the same outcome** (e.g. `final_bank` cites `calc:rollover.<pv>.prior_bank`). AT-21 accepts these alongside line steps; CONTRACT §3.9 states it.
- **Expectations key:** `evidence_source_id` was added to the `rollover.2026` expectation so AT-00 and the builder keep checking the exact cited source.

## Known limitations

- The explainer's shift sentence uses `|member_cost_delta_cents|`. A negative delta would not appear as-is among the result's cents, so validation would fall back to the template. All golden deltas are positive.
- In a fresh closing period, `prior` is only what this simulation carried in. Worst case never carries in, so a fresh 2027 close would see prior 0. That has no effect today because `rollover.2027` is NOT_APPLICABLE.
- `scripts/golden-check.mjs` models only the shipped rule shape (LT, no bonus, ADD_AND_CAP, the 2027 next plan). The variants (LTE, bonus, REPLACE) are covered by AT-21 on registry copies.
- The rider quote list includes "The carryover earned is added to the member's carryover balance." in addition to the plan's list (it backs `ADD_AND_CAP`).

## Anything not completed and why

- Nothing in scope was cut. The optional cut in risk §9.8 (shift line or explanation shift sentence) was not needed.
- Deferred by the plan: M-1, L-1, L-3, Value/Enhanced options, rollover in ranking, and a near-threshold scenario switcher in the UI.
- `docs/mvp-loop/current-plan.md` differs from the snapshot because of the Planner's iteration-2 rewrite. I did not edit it.
