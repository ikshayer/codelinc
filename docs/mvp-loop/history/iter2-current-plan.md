# CareWindow MVP loop: current plan

Planner: Agent 1, iteration 2. Date: 2026-10-04. Branch: `feature/cash-vs-claim`. The uncommitted working tree (contract 1.4.0 and everything iteration 1 left) is the baseline. Do not revert any of it. The iteration-1 plan, handoff and review are archived in `docs/mvp-loop/history/iter1-*.md`.

---

## 1. Iteration number and goal

**Iteration 2: the rollover vertical slice (contract 1.4.0 → 1.5.0).**

The goal is to model the 2026 maximum carryover end to end, from a verified source to the screen, without changing any existing golden number:

1. **Source.** Seed the missing *Maximum Carryover Rider* as a synthetic source (role `amendment`, checksummed, highest precedence for 2026). `rollover.2026` becomes **VERIFIED**, with literal evidence quotes.
2. **Rule model (§5.1).** Replace `RolloverValue` with an explicit model: basis, `<`/`<=`, award, bonus, cap, bank treatment, and the next plan version.
3. **Year-close transition (§5.2, ROLL-001..009).** `simulate` closes a benefit year **once**, at the moment the next period opens (or at the end of the run). It produces a `RolloverOutcome` that carries the trace and these statuses:
   - `EARNED`, `CONDITIONAL`, `NOT_EARNED`, `UNCERTAIN`, `NEEDS_CONFIRMATION`.
   - Pending claims produce `UNCERTAIN` with a range.
   - An unknown or ineligible next plan never receives the carryover.
4. **Optimizer (ROLL-010).** Each alternative carries its rollover outcomes. A display-only `rollover_shift` shows what moving a **`can_plan_later`** event into the next plan year would do. Rollover is **never** a ranking input.
5. **Explanation (§5.4)** and **UI (UI-007).** The `/care-window` care plan shows the rollover status, amounts and source rule. The template explainer adds factual sentences and never says "guaranteed".
6. **Golden.** The existing numbers stay unchanged and are re-proved. New rollover values, plus one **near-threshold** variant, are derived independently in `scripts/golden-check.mjs` and recorded in `expected.json` and `golden-scenario.md`.

---

## 2. Baseline status and commands run

These checks were run on 2026-10-04 against the working tree, before any iteration-2 change. Everything is green and matches the iteration-1 review.

| Where | Command | Result |
|---|---|---|
| repo | `git status --short` | Iteration-1 work is uncommitted, as expected (≈44 modified, ≈25 untracked, incl. `docs/`). No `backend/.claude/UNFREEZE`. |
| backend | `npm run verify` (exit 0) | `frozen files OK (63)` · `GOLDEN OK … (contract 1.4.0 rules)` · typecheck clean · lint clean · contracts 2 files 25/25 · unit 3 files 24/24 · acceptance 14 files 124/124 · integration 9 files 62/62 |
| frontend | `npm run typecheck` | exit 0 |
| frontend | `npm test` | 10 files, 128/128 passed |
| frontend | `npm run build` | compiled successfully; `/care-window` built |

The frontend lint, the backend `serve` and the browser flow were not run in this planning pass.

Relevant facts from the code:

- **Today's behavior.** `simulate.ts:openPeriod` (around line 161) handles carryover like this:
  - VERIFIED rollover → blocking `RULE_TYPE_UNSUPPORTED`.
  - UNVERIFIED → `warning RULE_UNVERIFIED rollover.<y>` when the next period opens, and no carryover is applied.
  - CONTRACT §3.1 and §8 say rollover is out of scope.
- **Sources.** The 2026 summary (p5) says: "carry over $250 … when plan payments in a benefit period are **below $500**, up to a total carryover of $1,000. There is no additional in-network bonus. Terms are governed by the Maximum Carryover Rider, which is not included". The 2027 summary says: "No maximum carryover feature applies for the 2027 benefit period" (`rollover.2027` NOT_APPLICABLE).
- **Golden member.** 2026 `plan_paid_ytd` is 60,000 (so $600 is already ≥ $500) plus a 7,600 pending claim. The golden scenario therefore never earns a carryover, so **no existing golden number can change**.
- **`plan_paid_ytd` counts only maximum-counting payments.** `openPeriod` checks `annual_max_remaining + plan_paid_ytd = annual_maximum` (90,000 + 60,000 = 150,000), even though preventive claims were paid in March. The rider basis below is defined to match this ("payments that count toward the annual maximum").

---

## 3. Requirements covered by ID

| ID | Delivered by |
|---|---|
| §5.1 rule model | New `RolloverValue` (§5.1 of this plan). Equivalent to the requirement type with these deliberate narrowings:<br>• `enabled` = the rule's status (NOT_APPLICABLE = no feature).<br>• `ruleId`, `evidence` and `status` already live on `PlanRule`.<br>• The basis enum has the one documented basis. Extend it when a source needs another.<br>• `eligibleServiceClasses` is implied by the basis ("counts toward the maximum").<br>• Explicit next-version ids instead of `RESOLVE_RENEWAL`.<br>• Added `bank_when_not_qualified: "FORFEIT"`, which the rider documents. |
| §5.2 ledger state | `RolloverOutcome`:<br>• existing bank (`prior_bank_cents` plus its input id)<br>• award<br>• bonus<br>• lost to cap<br>• forfeited<br>• final bank<br>• status<br>• rule ids<br>• pending amount<br>• source/as-of of the bank, via the new snapshot input `carryover_balance` |
| ROLL-001 | Qualifying amount = settled `plan_paid_ytd` + pending estimates + simulated `plan_pay` of closing-period lines with `counts_toward_maximum`. Self-pay and preventive lines never count. |
| ROLL-002 | The close runs once per closing period per simulation, at next-period open or at run end. It is pure (inputs are never mutated). A next period opened from a **snapshot** never gets the carryover added, because the carrier balance already includes it. |
| ROLL-003 | `threshold_comparison` is `LT` (shipped) or `LTE` (tested via a registry copy). |
| ROLL-004 | `network_bonus_condition` is `NONE` (shipped) or `ANY_IN_NETWORK_CLAIM` (tested). |
| ROLL-005 | `ADD_AND_CAP` / `REPLACE`, cap, and `lost_to_cap_cents`. A not-qualified year forfeits the prior bank (`forfeited_cents`). |
| ROLL-006 | `resolvePlanVersion(plan.key, period_end + 1)`. The resolved id must be in `applies_to_next_plan_version_ids`. |
| ROLL-007 | Unresolved next plan → `NEEDS_CONFIRMATION` plus `ROLLOVER_NEXT_PLAN_UNKNOWN`. Resolved but not listed → `NOT_EARNED` plus `ROLLOVER_NEXT_PLAN_INELIGIBLE`. Neither case adds anything. |
| ROLL-008 | Pending claims (and ranges) give a qualifying range. If they straddle the threshold → `UNCERTAIN` plus `ROLLOVER_UNCERTAIN` and a `final_bank` range. |
| ROLL-009 | `RolloverOutcome.steps` (ids `rollover.<closing_pv>.<name>`):<br>• threshold<br>• qualifying_low, qualifying_high<br>• eligible_claim<br>• base_award, network_bonus<br>• prior_bank, bank_cap<br>• final_bank, lost_to_cap |
| ROLL-010 | Rollover is never in the objective. worst_case (the ranking scenario) never applies a carryover. `rollover_shift` is computed only for `can_plan_later` events and is display-only. |
| §5.4 | Template explainer sentences (§4.5). The wording never uses "guaranteed" (already enforced by `WORDING.forbidden_phrases`). |
| UI-007 | `RolloverPanel` on `/care-window` shows:<br>• status: Conditional, Earned, Not earned, Uncertain or Needs confirmation<br>• the "lost" amount when there is one<br>• the source rule id and its quote<br>• the shift note on the event |
| §13 | A verified rollover rule plus the `rollover_near_threshold` golden variant. |
| §14.2 #1–11 | AT-21 (§7). |
| §11.2 `rolloverOutcomes` | Placed per alternative (`Alternative.rollover`), because each schedule has its own outcome. The recommended one is `alternatives[0].rollover`. Documented in the contract. |
| §14.1 #5 (exact next-year version) | Covered by ROLL-006 tests. |
| ARCH-003/004/005/006/007 | The engine owns all rollover math. The optimizer only re-simulates. The UI only formats. Only a VERIFIED rule calculates, and every number cites a fact id. |

---

## 4. Exact files and symbols expected to change

(F) marks a frozen path. Follow the UNFREEZE procedure in §5.1. This plan is the approved change request for all owners.

### 4.1 Data: new source, manifest, registry

**New file `backend/data/sources/northwind-ppo-2026-carryover-rider.md` (F).** Create it with exactly this content (UTF-8, LF line endings, trailing newline). Then put its sha256 in the manifest.

```markdown
<!-- page 1 -->
# Northwind Mutual Dental — PPO Standard — 2026 Maximum Carryover Rider

SYNTHETIC DOCUMENT — FOR DEMONSTRATION ONLY. This is not an actual insurance plan, carrier, or employer. All names, amounts, and rules are invented for the codeLinc 11 hackathon demo.

This rider amends the Northwind Mutual Dental PPO Standard 2026 Summary of Dental Benefits for group acme-synthetic-001, plan option ppo-standard, network nwd-ppo, jurisdiction VA. Where this rider and the summary differ, this rider governs.

## Earning a Carryover

A carryover is earned for the 2026 benefit period when plan payments for services incurred in that benefit period that count toward the annual maximum total less than $500. A total of exactly $500 does not earn a carryover.

Services are assigned to a benefit period by date of service, including claims processed after the benefit period ends.

At least one claim with a plan payment that counts toward the annual maximum must be paid for services in the benefit period.

The carryover earned is $250. There is no additional in-network bonus.

<!-- page 2 -->
## Carryover Balance

The carryover earned is added to the member's carryover balance. The carryover balance may not exceed $1,000; any amount above $1,000 is not carried over.

If no carryover is earned for a benefit period, the carryover balance does not continue into the next benefit period.

The carryover balance is added to the annual maximum of the next benefit period.

## Next Benefit Period

A carryover earned for the 2026 benefit period applies only if the member is enrolled on January 1, 2027 in the Northwind Mutual Dental PPO Standard plan for the 2027 benefit period (plan version nwd-ppo-standard-2027). It is added to the 2027 annual maximum even though no new carryover is earned during the 2027 benefit period.
```

**`data/sources/manifest.json` (F).** **Append** (as the last entry) `{source_id:"nwd-ppo-2026-carryover-rider", title:"Northwind Mutual Dental PPO Standard 2026 Maximum Carryover Rider (synthetic)", document_role:"amendment", path, sha256, media_type:"text/markdown", plan_version_id:"nwd-ppo-standard-2026", retrieved_at:"2026-10-01T12:00:00Z", synthetic:true}`.
- It must be last, because `build-registry.ts` reads the carrier and plan names from `sources[0]`.
- The two summaries' bytes and sha256 stay unchanged.

**`fixtures/golden/registry-expectations.json` (F).**
- The 2026 plan gets `"source_precedence": ["nwd-ppo-2026-carryover-rider", "nwd-ppo-2026-summary"]`. The summary itself defers: "Terms are governed by the … Rider".
- `rollover.2026`:
  - `status:"VERIFIED"`
  - `evidence_page: 1`
  - `value`:
    ```json
    {"qualification_basis":"INCURRED_PLAN_PAID_TOWARD_MAXIMUM","threshold_cents":50000,"threshold_comparison":"LT","base_award_cents":25000,"network_bonus_cents":0,"network_bonus_condition":"NONE","bank_cap_cents":100000,"requires_at_least_one_eligible_claim":true,"existing_bank_treatment":"ADD_AND_CAP","bank_when_not_qualified":"FORFEIT","applies_to_next_plan_version_ids":["nwd-ppo-standard-2027"]}
    ```
- `rollover.2027` stays NOT_APPLICABLE. In the rider's reading, the 2027 sentence means no carryover is *earned in* 2027.

**`data/tools/build-registry.ts`**
- `Cite` gets an optional third element, `source_id`. The default stays the plan's summary.
- The builder searches the cited source's pages.
- `source_documents` = every manifest source whose `plan_version_id` equals the plan's version.
- `source_precedence` = `exp.source_precedence ?? [exp.source_id]`.
- New `QUOTES.rollover` (2026). Every quote is a literal line from the rider (p1: "less than $500", "exactly $500 does not earn", the "date of service" sentence, "At least one claim…", "The carryover earned is $250. There is no additional in-network bonus."; p2: the cap sentence, the forfeit sentence, the "added to the annual maximum" sentence, and the next-period sentence). It also cites the summary's p5 sentence.
- Then regenerate `data/plans/nwd-ppo-standard-2026.json` and `sources.generated.json`.
- **Allowed diff:**
  - the 2026 plan's `rollover.2026` rule (status, value, evidence), `source_documents` and `source_precedence`;
  - one appended source in `sources.generated.json`;
  - nothing in 2027.

### 4.2 Domain (`backend/src/domain/`, F)

- **`plan.ts`**
  - Replace `RolloverValue` with:
    ```ts
    qualification_basis: z.enum(["INCURRED_PLAN_PAID_TOWARD_MAXIMUM"]),
    threshold_cents: Cents,
    threshold_comparison: z.enum(["LT", "LTE"]),
    base_award_cents: Cents,
    network_bonus_cents: Cents,
    network_bonus_condition: z.enum(["NONE", "ANY_IN_NETWORK_CLAIM"]),
    bank_cap_cents: Cents,
    requires_at_least_one_eligible_claim: z.boolean(),
    existing_bank_treatment: z.enum(["ADD_AND_CAP", "REPLACE"]),
    bank_when_not_qualified: z.enum(["FORFEIT"]),
    applies_to_next_plan_version_ids: z.array(Id).min(1),
    ```
  - Add a doc comment on each enum saying it lists only the values a source documents, and to extend it when a new source needs another.
- **`member.ts`**: `AccumulatorSnapshot` gets `carryover_balance: SourcedMoney.nullable().default(null)`. This is the carryover already added to this period's maximum.
  - The key is **optional on input**. This answers review L-2: no client breaks.
  - `null` means unknown. It is never treated as 0.
- **`benefits.ts`**
  - New `RolloverStatus = z.enum(["EARNED","CONDITIONAL","NOT_EARNED","UNCERTAIN","NEEDS_CONFIRMATION"])`.
  - New `RolloverOutcome` (strict):
    ```ts
    rule_id: Id,
    closing_plan_version_id: Id,
    closing_period_end: IsoDate,
    next_plan_version_id: Id.nullable(),
    status: RolloverStatus,
    threshold_cents: Cents,
    threshold_comparison: z.enum(["LT", "LTE"]),
    settled_plan_paid_cents: Cents.nullable(),
    pending_plan_pay_cents: Cents.nullable(),
    qualifying_plan_paid: AmountRange.nullable(),   // low = settled + simulated; high = low + pending
    base_award_cents: Cents,
    network_bonus: AmountRange,
    prior_bank_cents: Cents.nullable(),
    bank_cap_cents: Cents,
    final_bank: AmountRange.nullable(),             // carryover available next period
    lost_to_cap_cents: Cents.nullable(),
    forfeited_cents: Cents.nullable(),
    applied_rule_ids: z.array(Id),
    input_ids: z.array(Id),
    steps: z.array(CalcStep),
    issues: z.array(Issue),
    ```
  - `SimulationResult` gets `rollover: z.array(RolloverOutcome)`, sorted by `closing_period_end`.
- **`fact-ids.ts`**
  - New `ROLLOVER_STEPS = ["threshold","qualifying_low","qualifying_high","eligible_claim","base_award","network_bonus","prior_bank","bank_cap","final_bank","lost_to_cap"] as const`.
  - New helper `rolloverStepId(closingPv, name)`, which returns `rollover.${closingPv}.${name}`. `FACT_RE` already accepts this.
- **`optimizer.ts`**
  - New `RolloverShift` (strict):
    ```ts
    closing_plan_version_id: Id,
    moved_to_date: IsoDate,
    moved_to_slot_id: Id,
    plan_pay_in_closing_period_cents: Cents,
    status_if_moved: RolloverStatus,
    final_bank_if_moved: AmountRange,
    member_cost_delta_cents: SignedCents,
    ```
  - `ScheduledEvent.rollover_shift: RolloverShift.nullable()`.
  - `Alternative.rollover: z.array(RolloverOutcome)`.
- **`issues.ts`**: add the codes `ROLLOVER_UNCERTAIN`, `ROLLOVER_NEXT_PLAN_UNKNOWN` and `ROLLOVER_NEXT_PLAN_INELIGIBLE`, in the Plan registry/benefits group.
- **`version.ts`**: `CONTRACT_VERSION = "1.5.0"`. `ENGINE_IDS` is unchanged.

### 4.3 Benefits (`backend/src/benefits/`)

**`simulate.ts`**

New pure function `closeYear(registry, closing: Period, member, asOfDate, scenario, closingLines: AdjudicationLine[]): RolloverOutcome | null`.

1. **Rule.** Find the closing plan's `rollover` rule.
   - Absent or NOT_APPLICABLE → `null`.
   - Not VERIFIED → `null`, and keep today's `warning RULE_UNVERIFIED/UNKNOWN/CONFLICT` (rule_id) as a simulation issue when the next period opens. This is the conservative path, unchanged.
2. **Next plan.** `resolvePlanVersion(plan.key, addDays(period_end, 1))`.
   - Not ok → `NEEDS_CONFIRMATION`, `warning ROLLOVER_NEXT_PLAN_UNKNOWN`, `final_bank:null`.
   - Resolved id not in `applies_to_next_plan_version_ids` → `NOT_EARNED`, `warning ROLLOVER_NEXT_PLAN_INELIGIBLE`, `final_bank:{0,0}`.
3. **Settled amount.**
   - Snapshot period: `settled` = `plan_paid_ytd` for this scenario (`money(…, "higher_is_worse")`); unknown → `NEEDS_CONFIRMATION` plus `INPUT_MISSING` warning (`input_id`).
   - Fresh period: `settled = 0`.
   - Closing state `null`: `NEEDS_CONFIRMATION`.
4. **Pending.** `pending` = Σ `estimated_plan_pay` of pending claims in the period. Use the **high** end with `higher_is_worse`, so an unknown estimate gives `NEEDS_CONFIRMATION`.
5. **Simulated.** `simulated` = Σ `plan_pay_cents` of OK `closingLines` with `counts_toward_maximum`.
6. **Qualifying range.** `qLow = settled + simulated`, `qHigh = qLow + pending`. A value passes when `LT ? q < t : q <= t`.
7. **Eligible claim** (only when `requires_at_least_one_eligible_claim`): `low = settled > 0 || simulated > 0`, `high = low || pending > 0`.
8. **Qualification.** `qualifiesBest = passes(qLow) && eligHigh`. `qualifiesWorst = passes(qHigh) && eligLow`.
9. **Bonus** (`ANY_IN_NETWORK_CLAIM`):
   - low = some OK closing line with `network_tier:"in_network"`, an in-network route and `plan_pay > 0`;
   - high = low, or (`settled + pending > 0`), because the network of settled claims is unknown;
   - `NONE` → `{0,0}`.
10. **Prior bank.**
    - Snapshot period: `prior` = `carryover_balance` (null → unknown).
    - Fresh period: `prior` = what this simulation carried in (0 when none).
11. **Final bank.**
    - `award(b) = base + b`.
    - `bank(a) = min(cap, (ADD_AND_CAP ? prior : 0) + a)`.
    - `final_bank = { low: qualifiesWorst ? bank(award(bonus.low)) : 0, high: qualifiesBest ? bank(award(bonus.high)) : 0 }`.
    - Qualification possible but `prior` unknown → `NEEDS_CONFIRMATION`, `final_bank:null`, `INPUT_MISSING` warning on `member.accumulators[i].carryover_balance`.
12. **Losses.**
    - `lost_to_cap = qualifiesBest ? max(0, prior + award(bonus.high) − cap) : 0` (ADD_AND_CAP; for REPLACE use `award − cap`).
    - `forfeited = qualifiesWorst ? 0 : prior`.
13. **Status**, checked in this order:
    1. `NEEDS_CONFIRMATION` (the cases above).
    2. `final_bank.low !== final_bank.high` → `UNCERTAIN`, plus `warning ROLLOVER_UNCERTAIN` ("Your carryover cannot be confirmed yet because a pending claim could put the total at or above the $500 threshold.", using the threshold from the rule via `formatUsd`).
    3. Neither qualifies → `NOT_EARNED`.
    4. Both qualify → `EARNED` when `asOfDate > period_end` **and** `pending === 0`; otherwise `CONDITIONAL`.
14. **Steps** (§3.5 style, `rolloverStepId`). Operands cite:
    - `rule:rollover.<y>`
    - `input:<plan_paid_ytd id>`
    - each pending `input:` id
    - `calc:<line>.plan_pay` for each counted line
    - `input:<carryover_balance id>`

    `applied_rule_ids = [rule_id]`.

**Where the close runs** (inside `simulate`, `periodFor`):

- **Next period opens.** Before opening a plan whose previous version (`resolvePlanVersion(key, start − 1)`) exists, get the previous `Period`:
  - Reuse it from the `periods` map when it is there.
  - Otherwise call `openPeriod` **privately**: its issues are not pushed to the simulation, and a null state gives `NEEDS_CONFIRMATION`.
  - Call `closeYear` with the lines already adjudicated in that period, then record the outcome in a `closed` map so it is computed only once.
- **Carry-in.** If the new period is **fresh** (no snapshot, `opened_from:"plan_rules"`) and `scenario === "best_case"` and `final_bank !== null`:
  - Add `final_bank.high` to the new period's `annual_max_remaining_cents` and `annual_max_available_cents`.
  - Set `maxFact = rule:rollover.<closing y>`, and add that rule to `applied_rule_ids` of every line in the period that cites it.
  - worst_case never adds carryover. A fresh next period means the closing year has not ended, so the carryover cannot be final (EDU-004; this also guarantees ROLL-010).
  - A snapshot-opened next period never adds it (ROLL-002).
- **End of the run.** After all events, every opened period that was not yet closed and has a VERIFIED rule is closed once (no carry-in). Emit `rollover` sorted by `closing_period_end`.
- `openPeriod`, today's carryover block (around lines 161–170): remove the VERIFIED → `RULE_TYPE_UNSUPPORTED` branch. Keep the non-VERIFIED warning.

**`openPeriod` consistency check.** When `carryover_balance` is exact, the annual-maximum checks use `individual_cents + carryover`:
- `annual_max_remaining ≤ individual + carryover`;
- `remaining + ytd = individual + carryover`.

When it is null, keep today's check.

**`index.ts:passport`**: the `rules.rollover` item:
- VERIFIED: `value_text` = "Up to $250 next year if plan payments stay below $500; balance capped at $1,000". Build it from the rule value with `formatUsd` and "at or below" for `LTE`. `source:"PLAN_VERIFIED"`.
- NOT_APPLICABLE: "No carryover".
- Otherwise: unchanged.

### 4.4 Optimizer (`backend/src/optimizer/care-plan.ts`)

**`finalAlternative`**
- `rollover: worst.rollover`.
- Add the outcomes' `applied_rule_ids` into `Alternative.applied_rule_ids`. The care-plan `evidence` union then includes `rollover.2026`.
- Each event gets `rollover_shift: rolloverShift(benefits, registry, request, allCandidates, candidates, index, alternativeId, worst)`.

**New `rolloverShift`.** Display only (mirror `routeComparison`):
- Returns `null` unless all of these hold:
  - the procedure's `urgency === "can_plan_later"`;
  - its worst line is OK, `counts_toward_maximum` and `plan_pay > 0`;
  - an outcome for the line's `plan_version_id` has status `NOT_EARNED` or `UNCERTAIN`.
- Otherwise take the **first** candidate (in §5.2 candidate order) of the same procedure with:
  - the same `provider_id` and `route`;
  - a date whose resolved plan version equals the outcome's `next_plan_version_id`;
  - a slot not used by another event;
  - dependencies still satisfied (`dependenciesSatisfied`).
  - None → `null`.
- Re-simulate the whole schedule in worst_case through the injected engine, with that event moved.
- If the moved run is `OK` and its outcome for the closing version has status `CONDITIONAL`, `EARNED` or `UNCERTAIN` (a different status from before), return:
  - `moved_to_date`, `moved_to_slot_id`;
  - `plan_pay_in_closing_period_cents` = the current line's plan pay;
  - `status_if_moved`, `final_bank_if_moved`;
  - `member_cost_delta_cents` = moved total − current total (worst member responsibility).

  Otherwise return `null`.
- Never a ranking input. It never changes eligibility and adds no trace kind.

**`tests/optimizer/mvp-before-after.test.ts`**: the fake `BenefitEngine.simulate` result needs `rollover: []`.

### 4.5 AI (`backend/src/ai/explain.ts`)

**Template explainer.** For each `focus.rollover` outcome, add one claim, citing `rule:rollover.<y>` plus the relevant `calc:rollover.<pv>.*` steps. All amounts and dates come from the result, through `formatUsd`/`formatDisplayDate`. Wording by status:

- **CONDITIONAL:** "Your plan has paid {settled} toward this year's maximum so far. Under the verified plan rule, staying below {threshold} may add {final_bank.high} to next year's maximum." Use "at or below" for LTE.
- **NOT_EARNED:**
  - with a shift on a focus event: "Your plan has paid {settled} toward this year's maximum so far. Your flexible {cdt} on {date} is estimated to add {plan_pay_in_closing_period} of plan payment, which would put the total at or above {threshold}. Moving it to {moved_to_date} is optional, stays within your dentist's window, and changes your estimated cost by {|delta|}."
  - without a shift: "Plan payments this year ({qualifying high}) are not below the {threshold} carryover threshold, so no carryover is earned." When `forfeited > 0`, add "and your {forfeited} carryover balance does not continue".
- **UNCERTAIN:** "Your carryover cannot be confirmed yet because a pending claim could put the total above the {threshold} threshold."
- **EARNED:** "Under the verified plan rule, {final_bank.low} is carried to next year's maximum."
- **NEEDS_CONFIRMATION:** "Your carryover needs confirmation before it can be estimated."

Never "guaranteed".

**`validateExplanation`.** It already walks the whole result for `_cents`, `step_id` and dates, so rollover facts resolve. The one fix: "plan version used by the focus" must also include each `focus.rollover[].closing_plan_version_id`, so that citing `rule:rollover.2026` from an all-2027 focus is not `WRONG_PLAN_VERSION`. `MISSING_CODES` is unchanged: rollover issues stay inside the outcome.

### 4.6 Fixtures, scripts, docs (backend)

**`fixtures/synthetic/member.json` (F).** `accumulators[0].carryover_balance = {input_id:"member.acc.2026.carryover_balance", value:{kind:"exact",cents:0}, source:"CLAIM_EOB", observed_at:"2026-10-05T13:00:00Z"}`.

**`scripts/golden-check.mjs` (F).** This is the independent derivation and must never import `src/`.
- Add a `ROLLOVER_2026` constant, "read by hand from the rider". Comment each field with its rider sentence.
- `adjudicate()` also returns the per-run rollover outcome for 2026: `qLow`/`qHigh`/`final_bank`/`status`, using the formulas in §4.3, written independently.
- `rolloverShift()` mirrors §4.4 (same provider and route, first next-year candidate).
- Assert the new expected keys:
  - `postvisit.base.alternatives[i].rollover`;
  - `postvisit.rollover_shift_null_for` (all base events);
  - the new variant `postvisit.variants.rollover_near_threshold`.

  The variant applies these changes to the golden inputs:
  - mutation: 2026 `deductible_remaining 0`, `annual_max_remaining 108000`, `plan_paid_ytd 42000`, `carryover_balance 0`, `pending_claims []`;
  - procedures = `[proc-fill-14]` only.
- The base golden assertions must still pass unchanged.

**`fixtures/golden/expected.json` (F).** Only **additions**. Every existing value stays byte-identical (check with `jq` diff of the pre-existing paths). The Planner's hand-derived targets, which the checker must reproduce:

- **base, every alternative.** Single 2026 outcome, `NOT_EARNED`, `threshold_cents 50000`, `pending_plan_pay_cents 7600`, `final_bank {0,0}`, `forfeited_cents 0`, `lost_to_cap_cents 0`.
  - alt-1: `settled 60000`, `qualifying {142400, 150000}` (60,000 + 80,000 + 2,400; + 7,600).
  - Every base event has `rollover_shift: null` (2026 can never qualify, because the root canal alone pays $800).
- **rollover_near_threshold.**
  - alt-1 `[lowest_total_cost, smoothest_monthly_payments]`: Rivera 2026-10-20 claim. Plan 14,400, member 3,600. Qualifying {56400, 56400}, `NOT_EARNED`.
    - `rollover_shift`: moved to 2027-01-05 (`prov-rivera-t-20270105-1000`), `plan_pay_in_closing_period 14400`, `status_if_moved CONDITIONAL`, `final_bank_if_moved {25000, 25000}`, `member_cost_delta +6000` (2027: (18,000 − 7,500) × 80% = 8,400 plan, member 9,600).
  - alt-2 `[earliest_safe_completion]`: BrightSmile 2026-10-17 OON. Plan (15,000 − 0) × 60% = 9,000, member 16,000. Qualifying {51000, 51000}, `NOT_EARNED`.
    - shift → 2027-01-09 (`prov-brightsmile` slot), `CONDITIONAL`, delta +4,500 (2027 plan (15,000 − 7,500) × 60% = 4,500, member 20,500).
  - If the checker disagrees with any target, **stop and report**. Do not edit a number to match the engine.

**`docs/contracts/golden-scenario.md` (F).** Add a "1.5.0 rollover" section with the hand arithmetic above, and the line "existing numbers unchanged, re-verified by golden:check".

**`scripts/build-mocks.ts`.**
- Add `rollover` (to the care-plan alternatives) and `rollover_shift: null`.
- Replace the `RULE_UNVERIFIED rollover.2026` warning and the "needs confirmation" passport item with the VERIFIED item.
- Regenerate `fixtures/mock-responses/*.json` (F).

**`docs/contracts/CONTRACT-v1.md` (F).** Mark each change **(1.5)**:
- §2.1: rider as `amendment`, and precedence.
- §3.1: replace "never rolls over" with a pointer to the new **§3.9 "Year-close carryover"**, which holds §4.3 verbatim as normative text, including best_case-only carry-in and the snapshot rule.
- §3.1: the consistency check with `carryover_balance`.
- §3.6: `rollover`.
- §3.7: the passport item.
- §5.5: the sentence "with exact inputs `line_best` deep-equals `line_worst`" gets "…except where a conditional carryover is applied in best_case (§3.9)".
- New **§5.10 "Rollover per alternative and rollover shift"**.
- §6.3: the sentences.
- §6.4 rule 3: rollover plan versions count as used.
- §8: remove "rollover/MaxRewards calculation".

**Other docs.**
- `docs/contracts/CHANGELOG.md`: a 1.5.0 entry.
- `docs/decision-log.md`: **D-028**, recording:
  - the rider seeding and its role/precedence;
  - the reading of the 2027 sentence;
  - the basis "counts toward the maximum" (it matches `plan_paid_ytd`);
  - LT;
  - forfeit on not qualifying, which avoids modeling how a bank is spent;
  - worst_case never applies carryover;
  - per-alternative outcomes instead of a top-level `rolloverOutcomes`;
  - minor bump (additive response fields; the new request key is optional);
  - why M-1 is deferred.
- `docs/acceptance.md` (F): list AT-21.
- `docs/contracts/FROZEN.sha256`: regenerated by `npm run freeze`.
- `docs/backend-flow.md`: a 4-line note in §2 Layer 1 on the year-close.
- `backend/CLAUDE.md` and root `README.md`: version mention 1.4.0 → 1.5.0.

### 4.7 Frontend (`frontend/src/`)

- **`features/care-window/care-plan.tsx`**
  - New `RolloverPanel({ outcomes, evidence })`, rendered inside `AlternativeView`. Pass `result.evidence` down.
  - Per outcome:
    - a status label: Earned, Conditional ("may be added"), Not earned, Uncertain, Needs confirmation;
    - the qualifying amount vs the threshold;
    - the final bank, as a single amount or a range;
    - "Lost to cap: $X" when `lost_to_cap_cents > 0`;
    - "Carryover balance lost: $X" when `forfeited_cents > 0`;
    - the outcome's issue messages;
    - the source rule id with its evidence quote(s) from `evidence`, behind the existing "how calculated" pattern.
  - `EventView`: when `rollover_shift` is set, show "Optional: moving this to {date} keeps this year's plan payments below {threshold}; estimated cost change {±$}". All values come from engine fields.
  - Only formatting (ARCH-005). Never the word "guaranteed".
- **`tests/unit/care-window-rollover.test.ts`** (new): `renderToStaticMarkup` of `RolloverPanel` for each of the 5 statuses, plus a shift line. Assert:
  - the labels;
  - the rule id or quote is rendered;
  - no "guaranteed".

  Export the component, following the `OptionCard` precedent.
- **`lib/adapters/live/engine.ts`**: no change. Types come from `@engine/*`.
- **`fixtures/cash-vs-claim.ts`**: no change. It is retired in iteration 7.

---

## 5. Contract and schema changes

### 5.1 Procedure (`backend/docs/workflow.md`)

From `backend/`:
1. `touch .claude/UNFREEZE`.
2. Edit the (F) files.
3. Run `npx tsx data/tools/build-registry.ts`.
4. Run `npx tsx scripts/build-mocks.ts`.
5. Run `npm run freeze`.
6. `rm .claude/UNFREEZE`.
7. Write the CHANGELOG and D-028 entries.

`check:frozen` must pass afterwards, and the marker must be absent. The frozen count rises by the rider and AT-21 (expect 65).

### 5.2 Version: 1.4.0 → 1.5.0 (minor)

- **Response side:** new fields `SimulationResult.rollover`, `Alternative.rollover` and `ScheduledEvent.rollover_shift`, plus new issue codes. All additive.
- **Request side:** one new key, `AccumulatorSnapshot.carryover_balance`. It is **optional** (default `null`), so the L-2 concern does not repeat: an old request still parses.
- **Registry:** `RolloverValue` is reshaped, but it is server-owned registry data that is regenerated in the same change.
- **Behavior:** a VERIFIED rollover is now modeled instead of blocking. No shipped plan had a VERIFIED rollover before, so no previous output changes, except that the `RULE_UNVERIFIED rollover.2026` warning disappears from 2027 simulations.

### 5.3 Behavioral summary

The rules are those in §4.3 and §4.4. In short:

- Qualification is by incurred, maximum-counting plan payments, with a strict `< $500`.
- At least one paid claim is required.
- Award $250, no bonus, cap $1,000. Not qualifying forfeits the prior balance.
- The carryover goes only to `nwd-ppo-standard-2027`.
- It is added to a fresh next period only in best_case.
- Ranking (worst_case) is never affected by a carryover that is not final.

### 5.4 Golden numbers

**No existing number changes.**
- The golden 2026 plan paid is already ≥ $500 (NOT_EARNED).
- worst_case never adds a carryover.
- The demo's 2027 period is fresh, but nothing is carried in, because the year was not earned.

New values are **additions**. Each one is derived independently by `golden-check.mjs` and matched to the hand targets in §4.6.

---

## 6. Migration and caller list

To find every caller, run:

```bash
grep -rn "RolloverValue\|rollover\|carryover\|SimulationResult\|AccumulatorSnapshot\|ScheduledEvent\|Alternative\b\|CONTRACT_VERSION\|1\.4\.0"
```

in `backend/` and `frontend/src`.

**Backend**

- `src/benefits/simulate.ts`: `openPeriod`, `periodFor`, the result object, and the new `closeYear`.
- `src/benefits/index.ts`: `passport` rules item. `validatePlan` is unchanged, but it must pass with the third source.
- `src/optimizer/care-plan.ts`: `finalAlternative`, plus the new `rolloverShift`.
- `src/optimizer/navigator.ts`: ignores `rollover`. Verify that it compiles.
- `src/ai/explain.ts`: the template sentences and the plan-version set.
- `src/api/index.ts`: schemas come from the domain. Verify that a request without `carryover_balance` parses, and that an unknown key is still rejected.
- `src/api/demo-cli.ts`: verify that the golden story is unchanged.
- `data/tools/build-registry.ts`, `data/plans/*.json`, `data/sources/*`.
- `scripts/build-mocks.ts`, `scripts/golden-check.mjs`.
- `fixtures/synthetic/member.json`, `fixtures/golden/{expected,registry-expectations}.json`, `fixtures/mock-responses/*.json`.

**Tests whose expectations change because the source changed** (this is a correction, not a weakening; each change is stated in the handoff):

- `tests/acceptance/at02-traceability.test.ts:140`: the carryover passport item is now `PLAN_VERIFIED` and VERIFIED. Keep the "never shown as fact while unverified" check by asserting it on a registry copy with an UNVERIFIED rule.
- `tests/acceptance/at16-explanation.test.ts:73`: the "cites an unverified rule" case uses `rule:claim_submission.2027` (UNKNOWN) instead of `rule:rollover.2026`. The expected `UNVERIFIED_RULE_CITED` is unchanged.
- `tests/benefits/engine.test.ts:40`: the UNVERIFIED-carryover note is now tested on a registry copy. With the shipped registry, assert that the 2027 simulation has a 2026 rollover outcome instead.
- `tests/optimizer/mvp-before-after.test.ts`: the fake engine adds `rollover: []`.
- `tests/integration/*` (reviewer-owned) filter `rule_id !== "rollover.2026"`. They stay valid, so do not edit them.
- Any frozen test that pins the exact golden `evidence`/`applied_rule_ids` list: `rollover.2026` is now applied. If one fails, report it in the handoff with this reason before changing it.

**Frontend**

- `src/features/care-window/care-plan.tsx`: `AlternativeView`, `EventView`, and the new `RolloverPanel`.
- `src/lib/adapters/live/engine.ts`: verify only.
- `tests/unit/engine-adapter.test.ts` and any test that builds a `CarePlanResult`/`Alternative`/`ScheduledEvent` literal: add the new keys.
- `src/lib/domain/*` `rollover:false`: this is the old `/analysis` flow. Do not touch it (iteration 7).

---

## 7. Tests to write first or alongside

Write them red first. Each `describe` cites its requirement id.

**`backend/tests/acceptance/at21-rollover.test.ts`** (new; frozen after the freeze). Unless stated otherwise, every case uses the golden registry and the near-threshold member from §4.6 (`as_of` 2026-10-15). Test-only rule variants come from a deep-copied registry with only the rollover value or status changed. A shared helper builds that copy; reuse `tests/acceptance/helpers.ts`.

1. **§14.2 #1 / ROLL-001.** A filling on 2027-01-05 only, so 2026 qualifying is 42,000:
   - `CONDITIONAL`, `final_bank {25000,25000}`, `lost_to_cap 0`;
   - best_case 2027 `state_before.annual_max_remaining_cents` = 175,000, worst_case 150,000.

   A preventive D1110 line and a self-pay line in 2026 do not change `qualifying_plan_paid`.
2. **#2 / ROLL-003.** Qualifying exactly 50,000 (`plan_paid_ytd` 50,000):
   - shipped `LT` → `NOT_EARNED`;
   - registry copy `LTE` → `CONDITIONAL`;
   - 49,999 with `LT` → `CONDITIONAL`.
3. **#3.** The golden scenario → `NOT_EARNED`, with qualifying {142400,150000} for alt-1 (matches `expected.json`).
4. **#4 / ROLL-004.** Registry copy with `ANY_IN_NETWORK_CLAIM`, bonus 10,000, and `plan_paid_ytd` 0:
   - a 2026 in-network Rivera claim → `final_bank {35000,35000}`;
   - only an OON BrightSmile claim → `{25000,25000}`;
   - `settled > 0` with no simulated in-network line → `UNCERTAIN` `{25000,35000}`.
5. **#5 / ROLL-005.** `carryover_balance` 50,000 (with `annual_max_remaining` raised to keep the snapshot consistent) → `final_bank {75000,75000}`, `lost_to_cap 0`.
6. **#6.** `carryover_balance` 90,000 → `final_bank {100000,100000}`, `lost_to_cap 15000`. Not qualifying with a 90,000 balance → `forfeited 90000`, `final_bank {0,0}`.
7. **#7.** `plan_paid_ytd` 0, no 2026 lines, `requires_at_least_one_eligible_claim` → `NOT_EARNED`. Registry copy with `false` → `CONDITIONAL`.
8. **#8 / ROLL-008.** `plan_paid_ytd` 42,000 plus a pending claim estimating 10,000:
   - `UNCERTAIN`, qualifying {42000,52000}, `final_bank {0,25000}`, warning `ROLLOVER_UNCERTAIN`;
   - worst_case 2027 max is 150,000;
   - no explanation sentence calls the carryover earned.
9. **#9 / ROLL-006/007.**
   - A registry copy without the 2027 plan → `NEEDS_CONFIRMATION` plus `ROLLOVER_NEXT_PLAN_UNKNOWN`, `final_bank:null`.
   - `applies_to_next_plan_version_ids:["other"]` → `NOT_EARNED` plus `ROLLOVER_NEXT_PLAN_INELIGIBLE`, and no carry-in in either scenario.
   - With the shipped registry, `next_plan_version_id === "nwd-ppo-standard-2027"`.
10. **#10 / ROLL-002.**
    - The same request simulated twice gives deep-equal results.
    - Two 2027 events in best_case: the carryover is added once. The first 2027 line's `state_before` max is 175,000, not 200,000.
    - Exactly one outcome per closing year.
    - With a 2027 accumulator snapshot (`as_of` 2027-01-10), nothing is added. The status is `EARNED` (year closed, no pending).
    - The care-plan result is byte-identical across 3 runs.
11. **#11 / ROLL-010.** Near-threshold member plus an `act_now` procedure (D3330 tooth 30) whose window spans 2026-12-15..2027-01-20, and the flexible filling:
    - the selected alternatives (`schedule_key`s) are identical to a run with `rollover.2026` set NOT_APPLICABLE;
    - `rollover_shift` is null on every non-`can_plan_later` event;
    - the urgent event is never later than in the NOT_APPLICABLE run.
12. **ROLL-009 trace.** The outcome has the 10 step ids, and each operand fact id resolves:
    - `rule:` is VERIFIED;
    - `input:` is in the member;
    - `calc:` is a line step in the same result.
13. **UNVERIFIED path kept.** A registry copy with `rollover.2026` UNVERIFIED → no outcome, `warning RULE_UNVERIFIED rollover.2026`, and no carry-in.
14. **Golden variant.** The `rollover_near_threshold` care plan matches `expected.json` (outcomes and shifts), and the base golden alternatives' `rollover` match.
15. **§5.4 explanation.** The near-threshold explanation includes the shift sentence. `validateExplanation(…).ok === true`. Neither it nor the golden explanation contains a `WORDING.forbidden_phrases` entry.
16. **L-2 / API.** `POST /api/care-plan` with the golden body minus `carryover_balance` → 200, and the rollover status is NEEDS_CONFIRMATION only if it would qualify (golden: still `NOT_EARNED`). An unknown key inside `accumulators[0]` → 400.

**Frontend.** `tests/unit/care-window-rollover.test.ts` (§4.7).

---

## 8. Acceptance commands

All must pass. Paste the exact counts into `docs/mvp-loop/implementation-handoff.md`.

```bash
cd backend
npx vitest run tests/acceptance/at21-rollover.test.ts
npm run check:frozen          # count updated; .claude/UNFREEZE absent
npm run golden:check          # GOLDEN OK … (contract 1.5.0 rules), incl. rollover lines
npm run typecheck && npm run lint
npx vitest run                # all projects green; baseline 25/24/124/62 plus new tests
npm run verify
npx tsx data/tools/build-registry.ts && git diff --stat data/plans   # only the 2026 plan + sources.generated change
npx tsx scripts/build-mocks.ts && npm run check:frozen              # idempotent
npm run demo:cli              # golden story unchanged ($1,372 / $908)

cd ../frontend
npm run typecheck && npm run lint && npm test && npm run build
```

**Golden immutability.** Every pre-existing path in `fixtures/golden/expected.json` must be unchanged. Run this against a copy saved before editing:

```bash
jq 'del(.postvisit.variants.rollover_near_threshold, .postvisit.rollover_shift_null_for) | del(.postvisit.base.alternatives[].rollover)'
```

**Browser** (UI-014 smoke and §14.6 #8):
1. Start `cd backend && npm run serve` and `cd frontend && npm run dev`.
2. On `/care-window`, run the full path: passport → navigator → extract → confirm → care plan → explanation.
3. The rollover panel shows "Not earned" for 2026, with rule `rollover.2026` and a rider quote.
4. The passport shows the verified carryover rule.
5. There are zero console errors and no failed `/api/engine/*` requests.
6. The golden totals still show.

Also POST the `rollover_near_threshold` body through the Next proxy, and record the shift in the handoff. If browser automation is unavailable, use headless CDP as in iteration 1.

---

## 9. Risks and explicit non-goals

**Risks**

1. **Snapshot double counting.** A next period opened from a snapshot must never add a carryover, because the carrier balance includes it (ROLL-002). Test #10 pins this.
2. **Private open of the closing period.** Its issues must not leak into the simulation, or a 2027-only simulation for a member with a broken 2026 snapshot would turn `NEEDS_CONFIRMATION` overall. It should only make the rollover outcome `NEEDS_CONFIRMATION`.
3. **Best/worst asymmetry.** `line_best` ≠ `line_worst` with exact inputs is now legal when a conditional carryover is applied. Any existing test that asserts deep equality on a scenario with a qualifying member would fail. Golden members never qualify. Report any such test; do not delete it.
4. **Evidence and applied rules.** `rollover.2026` now joins `applied_rule_ids`/`evidence` for the golden care plan. AT-02 (evidence ⊇ applied rules) should still pass. A test pinning the exact list needs a reported update (§6).
5. **The `WRONG_PLAN_VERSION` rule** in the validator. Citing `rule:rollover.2026` for an all-2027 focus must be allowed (§4.5), or the near-threshold explanation falls back.
6. **Rider quotes must be literal.** One wrong character fails `build-registry`. Copy the §4.1 text exactly, and compute the sha256 from the written bytes.
7. **Frozen churn.** About 15 frozen files change, plus one new source and AT-21. Use the UNFREEZE procedure and remove the marker.
8. **Slice size.** If time runs short, cut **only** the frontend shift line and the explanation's shift sentence (keep `rollover_shift` in the engine), and record the cut in the handoff. Everything else is required.

**Explicit non-goals for iteration 2**

- **M-1** (network status per plan year) → iteration 3a. It changes provider fixture shapes and the golden 2027 line inputs, and it is unrelated to the carryover math.
- **L-1** (navigator hiding unknown-network options), **L-3** (null-tier browser fixture) → iterations 3a and 7.
- Value/Enhanced options with their own rollover rules → iteration 2b.
- Rollover as a ranking objective, or a "preserve rollover" alternative label. Alternative rollover deltas → iteration 3.
- Accepting a conditional rollover strategy as a member lock (§7.1) → iteration 4.
- Modeling how a carryover balance is spent within a year, other qualification bases, `ALL_IN_NETWORK` bonus, and rollover from 2027 (NOT_APPLICABLE).
- A demo-scenario switcher in the UI (the near-threshold case is verified through the API and unit render).
- Retiring `/analysis` or its `rollover:false` type.
- No new API route.
- No change to any existing golden number.

---

## 10. Prior-review findings being addressed

From `docs/mvp-loop/history/iter1-review.md` (verdict PASS_ITERATION):

| Finding | Decision this iteration |
|---|---|
| M-1 · network status keyed by network id, not plan year | **Deferred to 3a.** Not directly related to the rollover math. It changes the `ProviderOption.network` shape (e.g. a covered plan-version list or valid-through date) and the golden 2027 provider inputs, which would mix two risks in one slice. Recorded in D-028. |
| L-1 · navigator silently drops a non-soonest unknown-network office | Deferred to 3a: list it in `excluded` with `NETWORK_STATUS_UNKNOWN`. |
| L-2 · required `cash_quote_valid_through` under a minor bump | **Lesson applied:** the only new request key (`carryover_balance`) is optional with a `null` default. Making `cash_quote_valid_through` optional retroactively is left as is: there are no external clients, and changing it would reopen iteration-1 semantics. |
| L-3 · null-tier UI not observed in a browser | Deferred to iteration 7 (browser e2e fixture). |

---

## Release roadmap (updated gap table)

Legend: **P** = present, **Pa** = partial, **M** = missing. "Iter" = the iteration that closes it.

| Group / ID | State after iter 1 | Evidence / note | Iter |
|---|---|---|---|
| ARCH-001..004, 006..010 | P | iter-1 review | — |
| ARCH-005 frontend only formats | Pa | old `/analysis` has its own formulas and fixtures | 7 |
| PLAN-001 | P (tested, AT-20) | | — |
| PLAN-002 tier per event/location | Pa | M-1: the observation is not tied to a plan version or year. L-1: the navigator hides unknown offices. | **3a** |
| PLAN-003 roles/precedence | P | AT-20. The rider adds the first multi-source precedence. | 2 (exercised) |
| PLAN-004 Value/Core/Enhanced | M | registry has one option, no premium field | **2b** |
| §5.1 / §5.2 / ROLL-001..010 / §5.4 / UI-007 | M | this plan | **2** |
| REC-001..005, REC-007, §6.2 modes, §6.3 deltas (incl. rollover difference), §6.4 SolverMeta, §6.5 order warning | Pa/M | `care-plan.ts` fixed labels, `search_stats` only | 3 |
| §7 user control, statuses, undo/reset, UI-002..006 | M | | 4 |
| FUND-002 payment plans, FUND-003 full gate, §14.4 #4–7 | Pa/M | `FUNDING_SOURCE_INELIGIBLE` "not modeled" | 5 |
| PRICE-001, EDU-001..005, UI-009/010, §9 benchmark/predetermination | Pa/M | | 6 |
| §13 demo data | Pa | rollover + near-threshold in **2**; Value/Enhanced in 2b; zero-interest payment plan in 5; one canonical fixture in 7 | 2, 2b, 5, 7 |
| §14.1 | Pa | #5 completed in 2 | 2 |
| §14.2 rollover tests | M | AT-21 | **2** |
| §14.3 | M (except #2) | | 3–4 |
| §14.5 | P | | — |
| §14.6 browser/e2e, UI-014, L-3 | Pa | headless CDP only, no committed e2e | 7 (each UI iteration smoke-tests) |
| §11.1/11.2 API additions | Pa after 2 | `rollover` per alternative in 2; preferences/solverMeta in 3; locks/custom/acknowledgements in 4 | 2–4 |

Iteration sequence:

- **2**: rollover (this plan).
- **2b**: Value/Enhanced registry options. Planner-seeded sources with a premium field, each with its own rollover rule using the 2 model.
- **3a**: M-1 and L-1, network observation per plan version.
- **3**: modes, SolverMeta, alternative deltas (including rollover difference), same-day order warning.
- **4**: locks, custom plan, re-optimize, undo/reset, accepting a conditional rollover strategy.
- **5**: payment plans, full self-pay gate.
- **6**: education, badges, the questions generator, PRICE-001.
- **7**: retire `/analysis` and the duplicate fixtures, committed browser e2e (L-3), final review.
