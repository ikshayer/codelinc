# CareWindow MVP loop: review, iteration 2 (rollover slice, contract 1.4.0 → 1.5.0)

Reviewer: Agent 3. Date: 2026-10-04. Diff reviewed: working tree vs `snap-iter2-pre` (excluding `docs/mvp-loop/`). Everything below was reproduced independently. The handoff was read but not relied on.

## 1. Commands run (exact results)

| Where | Command | Result |
|---|---|---|
| backend | `npm run verify` (exit 0) | `frozen files OK (65)` · `GOLDEN OK … route comparisons and rollover included (contract 1.5.0 rules)` · typecheck clean · lint clean · contracts 2 files 25/25 · unit 3 files 25/25 · acceptance 15 files 147/147 · integration 9 files 62/62 |
| backend | `npx vitest run` | 29 files, 259/259 passed (before the review probe was added) |
| backend | `npx vitest run --project integration` (with the review probe) | 10 files, 73/73 passed |
| backend | `npx tsx data/tools/build-registry.ts` | 2027 plan byte-identical to the snapshot. In the 2026 plan, only `rollover.2026`, `source_documents` and `source_precedence` differ (checked with a `jq -S` diff of everything else). |
| backend | `npx tsx scripts/build-mocks.ts && npm run check:frozen` | idempotent, `frozen files OK (65)` |
| backend | `npm run demo:cli` | alt-1 $1,372 (plan $908), alt-2 $1,426, explanation `validated: true`, plus the new NOT_EARNED carryover sentence |
| backend | golden immutability: `jq -S` of the snapshot vs `del(.postvisit.variants.rollover_near_threshold, .postvisit.rollover_shift_null_for) \| del(.postvisit.base.alternatives[].rollover)` | identical |
| backend | `.claude/` | `agents hooks settings.json`, no `UNFREEZE` |
| frontend | `npm run typecheck` / `npm run lint` | exit 0 / clean |
| frontend | `npm test` | 11 files, 136/136 passed |
| frontend | `npm run build` | compiled successfully; `/care-window` built |
| hygiene | grep for `.only(`, `.skip(`, `.todo`, `TODO`, `FIXME` in backend/frontend `src` and `tests` | no matches. The only added `console.log` calls are the golden-check report lines, which is the existing pattern. |

## 2. Test integrity (the seven pre-existing tests the implementer modified)

Each test was diffed against the snapshot. **None is weakened.**

| Test | Change | Judgment |
|---|---|---|
| `at00-registry-grounding` | The cited source is `evidence_source_id` when the expectation names one, otherwise the summary. | Preserved. The expectation file is frozen, and the check is still "this rule cites page N of the exact expected source". |
| `at02-traceability` | The shipped carryover is now asserted VERIFIED/PLAN_VERIFIED with its exact `value_text`. The "never shown as fact while unverified" check moved to a registry copy with `rollover.2026` UNVERIFIED. | Preserved and slightly strengthened: the copy also asserts `value_text` is "Needs confirmation with the plan". |
| `at16-explanation` | The unverified-rule case now cites `rule:claim_submission.2027` (UNKNOWN) instead of the now-verified `rollover.2026`. | Preserved. It still expects exactly `UNVERIFIED_RULE_CITED`. A 2027 rule is in the focus version set, so the expected code cannot be masked by `WRONG_PLAN_VERSION`. |
| `at20` precedence | Precedence equals the expectations' order, plus a permutation check against `source_documents`. | Preserved. With one source this is the old assertion. With two, it pins the frozen order. |
| `at20` educational | The expected flagged set is the VERIFIED rules whose evidence comes **only** from the demoted source, `verified.length > 20`, and `rollover.2026` is not flagged. | Preserved. The rule is still "flag exactly the VERIFIED rules with no authoritative evidence". Here `rollover.2026` has amendment evidence, so leaving it unflagged is correct, and the length guard rules out a vacuous pass. |
| `tests/contracts/fixtures.test.ts` | The page list is `[1,2]` for the rider and `[1..5]` for each summary. | Preserved. Every summary still needs 5 pages, and every source's sha256 is still checked. |
| `tests/benefits/engine.test.ts` | The shipped registry now asserts one 2026 NOT_EARNED outcome, no rollover simulation issue, and a 2027 max of 150,000. The UNVERIFIED note moved to a new test on a copy (it asserts the warning, `rollover: []` and no carry-in). The edu-source test appends to the existing precedence. | Preserved and strengthened. |
| `tests/optimizer/mvp-before-after.test.ts` | The fake engine gets `rollover: []`. | Shape-only change. The assertions are unchanged. |

## 3. Rollover correctness, reconciled from the rider

**Source.**
- The rider file matches the plan §4.1 text byte for byte.
- Its sha256 is `0c947e68…c02ea2`, the same as the manifest.
- It has role `amendment`, is appended last in the manifest, and is first in the 2026 `source_precedence`.
- All 11 evidence quotes were checked by script as literal substrings of the cited page: 10 from the rider (pp. 1 and 2) and 1 from the summary (p. 5).

**Rule value vs the rider text.**

| Rider text | Rule value |
|---|---|
| "count toward the annual maximum total less than $500"; "exactly $500 does not earn" | `INCURRED_PLAN_PAID_TOWARD_MAXIMUM`, `threshold_cents` 50000, `LT` |
| "carryover earned is $250. There is no additional in-network bonus." | `base_award_cents` 25000, `network_bonus_cents` 0, `NONE` |
| "may not exceed $1,000" | `bank_cap_cents` 100000 |
| "added to the member's carryover balance" | `ADD_AND_CAP` |
| "does not continue" | `FORFEIT` |
| "At least one claim…" | `requires_at_least_one_eligible_claim` true |
| "(plan version nwd-ppo-standard-2027)" | `applies_to_next_plan_version_ids` = `["nwd-ppo-standard-2027"]` |

All match.

**Hand reconciliation.**

| Case | Arithmetic | Result |
|---|---|---|
| Golden alt-1 | 60,000 settled + 80,000 (D3330) + 2,400 (crown, capped) = 142,400; + 7,600 pending = 150,000 | ≥ 50,000 → NOT_EARNED, bank {0,0}. Matches. |
| Near-threshold alt-1 (Rivera) | 2026 plan pay 14,400, member 3,600. Qualifying 42,000 + 14,400 = 56,400 | NOT_EARNED |
| Near-threshold alt-1, shift to 2027-01-05 | (18,000 − 7,500) × 80% = 8,400 plan, member 9,600 | delta +6,000; 2026 at 42,000 → CONDITIONAL $250 |
| Near-threshold alt-2 (BrightSmile, out of network) | 15,000 × 60% = 9,000, member 16,000; 42,000 + 9,000 = 51,000 | NOT_EARNED |
| Near-threshold alt-2, shift to 2027 | (15,000 − 7,500) × 60% = 4,500 | delta +4,500 |

These were confirmed through the live API (`POST :4000/api/care-plan`) as well as `golden:check`. `golden-check.mjs` does not import `src/`.

**§14.2 probes** (AT-21 cases plus `tests/integration/review-iter2-probes.test.ts`):

| # | Probe | Result |
|---|---|---|
| 1/3 | 49,999 / 50,000 / 50,001 | CONDITIONAL $250 / NOT_EARNED / NOT_EARNED. Strict `<` is correct. |
| 2 | LTE on a registry copy at exactly 50,000 | CONDITIONAL (AT-21) |
| 4 | Bonus variant | in-network 2026 claim → $350; out-of-network only → $250; unknown-network settled claims → UNCERTAIN $250–$350 (AT-21) |
| 5/6 | Bank $500 → $750. Bank $800 → $1,000, lost $50. Bank $1,000 → $1,000, lost $250. Not qualifying with $900 → forfeited $900 | correct. Best_case 2027 max = 150,000 + final bank, worst_case 150,000. |
| 7 | No 2026 paid claim | NOT_EARNED; with the flag false → CONDITIONAL |
| 8 | Pending $100 over $420 settled | UNCERTAIN, qualifying {42,000, 52,000}, bank {0, 25,000}, `ROLLOVER_UNCERTAIN`; worst 2027 max unchanged |
| — | Unknown pending estimate | NEEDS_CONFIRMATION, `final_bank` null |
| — | Unknown carryover balance | NEEDS_CONFIRMATION in both scenarios, no carry-in |
| 9 | 2027 plan removed | NEEDS_CONFIRMATION + `ROLLOVER_NEXT_PLAN_UNKNOWN` |
| 9 | Unlisted next plan | NOT_EARNED + `ROLLOVER_NEXT_PLAN_INELIGIBLE`; nothing carried in either scenario |
| 10 | Two 2027 events in best_case | 175,000 once; repeated runs deep-equal; a 2027 snapshot adds nothing |
| 11 | Urgent root canal spanning the year boundary | schedules identical to a NOT_APPLICABLE run; urgent event never later; `rollover_shift` null on non-`can_plan_later` events. The review probe also shows that near-threshold schedules and dates are identical with and without the rule. |

Moved candidates come from `allCandidates`, which are already limited to `[earliest_safe_date, latest_safe_date]`, so "stays within your dentist's window" is true.

**ROLL-009.**
- All 10 `rollover.<pv>.<name>` steps are present, covering threshold, qualifying low and high, eligible claim, base award, network bonus, prior bank, cap, final bank and lost to cap.
- Each operand is one of: a VERIFIED rule, a member input, a line `calc:` step, or an earlier step of the same outcome (AT-21 trace test; code read in `simulate.ts:closeYear`).

**Design decision "carry-in only in best_case".**
- Ranking uses worst_case, and the displayed outcome is `worst.rollover`.
- The UI labels CONDITIONAL "Conditional: may be added" and UNCERTAIN "Uncertain", and shows ranges.
- No rollover text says "guarantee". In the browser, the only "guarantee" is the existing fee disclaimer "not a guarantee of payment".
- No false certainty was found for exact inputs. See R2-M1 for ranged inputs.

## 4. API and browser

- `npm run serve` (:4000): health reports contract 1.5.0.
- Golden care plan: both alternatives NOT_EARNED with {142,400, 150,000}.
- Near-threshold body: both shifts as above.
- Body without `carryover_balance`:
  - golden → 200, NOT_EARNED;
  - near-threshold → 200, NOT_EARNED with shift `null`. Moving would give NEEDS_CONFIRMATION, so no shift is offered, which is the conservative result.
- Unknown key in `accumulators[0]` → 400 `INVALID_REQUEST`.
- Browser: the Chrome extension was not used. Headless Chrome over CDP (`scratchpad/review-cdp2.mjs`) ran against `next dev -p 3000`.
  - Path: passport → Find visit options → Read the plan → tick 3 → Confirm 3 and plan → Why + 2 explain buttons.
  - All 9 `/api/engine/*` responses returned 200. There were zero console errors, warnings, exceptions or HTTP ≥ 400 responses.
  - The only network events were two `ERR_ABORTED canceled=true` on the first `/scenario` and `/passport`. This is the same dev StrictMode abort seen in iteration 1, and both were immediately re-requested with 200.
  - The page shows:
    - $1,372 and $908
    - "Unused maximum carryover", "Not earned", "Plan year ending…"
    - "$1,424 to $1,500", "Carryover to next year: $0"
    - `rollover.2026`, the rider quote "A total of exactly $500 does not earn a carryover." with `nwd-ppo-2026-carryover-rider`
    - the passport item "Up to $250 next year if plan payments stay below $500; balance capped at $1,000"
    - the explanation sentence "…are not below the $500 carryover threshold…"
    - no "failed validation"
- Servers stopped (ports 3000 and 4000 confirmed down).

## 5. Findings

### R2-M1 · MEDIUM · A ranged settled amount gives a definitive outcome instead of a range
- **Requirement:** ROLL-008 (in spirit) and EDU-004 ("Rollover is conditional until finalized"; ranges shown for uncertain inputs); §5.2 "Pending claims that could change qualification".
- **File/symbol:** `backend/src/benefits/simulate.ts:closeYear` (`settled = money(snap.plan_paid_ytd, scenario, "higher_is_worse")`) and CONTRACT §3.9 step 3. `scripts/golden-check.mjs` mirrors the same resolution.
- **Reproduction:** `tests/integration/review-iter2-probes.test.ts` › "FINDING M-1". Use the near-threshold member with `plan_paid_ytd = {range 45,000–55,000}` and a 2027 filling.
- **Expected:** qualifying {45,000, 55,000} straddles $500 → `UNCERTAIN` with a `final_bank` range (0–$250) and `ROLLOVER_UNCERTAIN`, as for a pending claim.
- **Actual:**
  - Each scenario collapses the range to one end.
  - worst_case (the outcome shown in `Alternative.rollover` and the UI) reports a definitive `NOT_EARNED` with qualifying {55,000, 55,000} and no issue.
  - best_case reports `CONDITIONAL` and carries $250 into the 2027 maximum.
  - So the panel says "Not earned" while the best-case cost may assume the carryover.
- **Evidence:** the probe passes asserting worst `NOT_EARNED`, qualifying {55,000, 55,000}, best `CONDITIONAL`, and no `ROLLOVER_UNCERTAIN`.
- **Impact:** not reachable with the demo fixtures (all accumulators are exact), so it does not block this iteration. It must be fixed before any non-exact accumulator input, such as intake-confirmed EOB ranges, reaches the engine.
- **Owning subsystem:** benefits (`closeYear`) and contract §3.9 (Planner): use the low end for `qLow` and the high end for `qHigh` regardless of scenario.

### R2-L1 · LOW · The shift sentence gives no direction, and a negative delta fails the template's own validation
- **Requirement:** §5.4 / EDU-003 (factual, plain language); §6.4 explanation validation.
- **File/symbol:** `backend/src/ai/explain.ts:rolloverClaim` (NOT_EARNED with a shift: `formatUsd(Math.abs(sh.member_cost_delta_cents))`).
- **Reproduction:** `review-iter2-probes.test.ts` › "FINDING L-1". Use a test-only registry with 2027 deductible 0 and basic in-network 85%, the near-threshold member, and focus on the alternative whose shift delta is −$9.
- **Expected:** the sentence states whether the cost goes up or down, and every template explanation passes `validateExplanation`.
- **Actual:**
  - The text says "changes your estimated cost by $9" (a saving), the same wording as "+$60" in the golden variant (a cost increase).
  - With a negative delta, validation fails with `DOLLAR_AMOUNT_NOT_IN_RESULT` because 900 is not in the result.
  - The handoff says this "falls back to the template", but the template *is* the fallback (`api/index.ts`: `fellBack` only when the explainer is not the template). The API therefore returns `validation.ok: false`, and the UI prints "failed validation".
  - The failure is labeled honestly and nothing incorrect is presented as validated, but the member loses the explanation. With −$18, validation passed only because 1,800 happened to appear elsewhere in the result.
- **Evidence:** the probe passes asserting `delta = -900`, the text contains "changes your estimated cost by $9", `ok === false`, and the violation `DOLLAR_AMOUNT_NOT_IN_RESULT`.
- **Impact:** not reachable with the shipped registry, where 2027 is never cheaper for the same service. The UI `RolloverShiftNote` shows the sign correctly (`+$60`).
- **Owning subsystem:** ai (template wording: "increases/lowers your estimated cost by"), plus a validator allowance for signed deltas (Planner, §6.4).

### R2-L2 · LOW · The UI shift note claims "keeps … below $500" even when the moved status is UNCERTAIN
- **Requirement:** EDU-004.
- **File/symbol:** `frontend/src/features/care-window/care-plan.tsx:RolloverShiftNote`. The engine allows `status_if_moved: "UNCERTAIN"` (`care-plan.ts:rolloverShift`).
- **Reproduction:** code read. Use a near-threshold member plus a pending claim large enough that the moved schedule is UNCERTAIN.
- **Expected:** when `status_if_moved` is UNCERTAIN, the note should not assert that the total stays below the threshold.
- **Actual:** the note always says "keeps this year's plan payments below $500". It does append "carryover if moved: uncertain, $0 to $250", so the status itself is visible.
- **Owning subsystem:** frontend.

### Carried from iteration 1 (deferred by plan §10, unchanged)
- **M-1:** network status per plan year → iteration 3a.
- **L-1:** navigator hides unknown-network offices → iteration 3a.
- **L-3:** null-tier browser fixture → iteration 7.

No BLOCKER or HIGH findings.

**Diff hygiene:**
- Every changed file is in plan §4.
- The rider bytes match the plan.
- No `.only`, `.skip` or `.todo`.
- No UNFREEZE marker.
- No debug output.
- The pre-existing golden values are unchanged.

## 6. Review artifacts kept

`backend/tests/integration/review-iter2-probes.test.ts` (11 tests) covers:
- the $499.99, $500 and $500.01 boundary;
- the qualifying basis (in-network adds, self-pay does not);
- the cap at $800 and $1,000 prior balances;
- best/worst carry-in;
- the ranged settled amount (R2-M1);
- an unknown balance;
- an unknown pending estimate;
- schedule invariance with and without the rule;
- the negative-delta explanation (R2-L1).

## 7. Verdict

The rollover slice meets the iteration-2 requirements (§5.1–5.4, ROLL-001..010, §14.2 #1–11, UI-007), backed by independent arithmetic and browser evidence. The test changes keep their asserted properties. Release requirements are still open: modes, user control, funding gate, education/badges, and retiring `/analysis`.

PASS_ITERATION
