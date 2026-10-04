# CareWindow MVP loop: current plan

Planner: Agent 1, iteration 2b. Date: 2026-10-04. Branch: `feature/cash-vs-claim`. The baseline is commit `babdd84` (iterations 1–2, contract 1.5.0) with a clean tree, so the Reviewer diffs against `git diff babdd84` instead of a snapshot directory. The iteration-2 plan, handoff and review are archived in `docs/mvp-loop/history/iter2-*.md`.

---

## 1. Iteration number and goal

**Iteration 2b: Value and Enhanced plan options in the registry (PLAN-004), plus the iteration-2 rollover findings (contract 1.5.0 → 1.6.0).**

1. **Two new synthetic 2026 DPPO options.** Each is a seeded, checksummed source with its own rules, run by the same benefit engine:
   - **PPO Value** (`nwd-ppo-value-2026`): higher deductible, lower maximum, lower shares, a 12-month Major waiting period, an implant exclusion and no carryover.
   - **PPO Enhanced** (`nwd-ppo-enhanced-2026`): lower cost sharing, orthodontic coverage with a lifetime maximum, and its own carryover rule (`LTE`, an in-network bonus, a different cap, and a 2027 successor that is not seeded).
2. **Premiums.** A new employer enrollment guide (role `employer_summary`) lists the monthly employee contribution per coverage tier for all three 2026 options. It becomes a VERIFIED `premium` rule on each.
3. **Registry identity.** Rule ids become unique across the whole registry (new options use `<stem>.<option>.<year>`). A source document may belong to several plan versions of the same group.
4. **Data exposure (the screen is deferred).** A read-only `POST /api/plan-options` returns the member's group's options effective on `as_of`, with formatted-ready rule items (rule ids, status, evidence). It does no comparison math.
5. **Findings R2-M1, R2-L1, R2-L2**, plus two Windows portability defects found while taking this baseline (W-1, W-2).

The main demo stays on PPO Standard. **No existing golden number changes.**

---

## 2. Baseline status and commands run

Run on 2026-10-04 on Windows 11 (Git Bash) against `babdd84`, clean tree. `node_modules` was absent in both projects, so `npm ci` was run first.

| Where | Command | Result |
|---|---|---|
| repo | `git status --short` | clean; HEAD `babdd84` |
| backend | `npm run verify` | **exit 1 at `check:frozen`**: every frozen path listed as both "removed" and "added" (W-1) |
| backend | `npm run golden:check` | `GOLDEN OK … (contract 1.5.0 rules)` |
| backend | `npm run typecheck` / `npm run lint` | clean / clean |
| backend | `npx vitest run` | 30 files, **267 passed, 3 failed**. All 3 are in `tests/integration/server-origin-check.test.ts`: `spawn npx ENOENT` (W-2) |
| frontend | `npm run typecheck` / `npm run lint` | clean / clean |
| frontend | `npm test` | 11 files, 136/136 |
| frontend | `npm run build` | compiled; `/care-window` built |

**W-1 (root cause).** `core.autocrlf=true` checked every text file out with CRLF (`git ls-files --eol`: 310 files `i/lf w/crlf`). `FROZEN.sha256` was hashed from LF bytes, and `check-frozen.mjs` splits the manifest on `\n`, so each path keeps a trailing `\r`. The content is unchanged (`git status` is clean). Only `data/sources/**` is `-text`, so the checksummed sources are still LF.

**W-2.** `spawn("npx", …)` has no shell, so it cannot run `npx.cmd` on Windows. Earlier iterations evidently ran on a POSIX host.

Facts used by this plan (code read):

- `build-registry.ts` hard-codes Standard specifics:
  - every plan's `key` is `member.plan_key`;
  - `carrier_name`/`plan_name` come from `sources[0]`;
  - `${DED}` is `year === "2026" ? "50" : "75"`;
  - the quote table is Standard's text.
- `evidenceFor(registry, ruleIds)` matches `rule_id` across **every** plan. A second plan with `deductible.2026` would leak its evidence into Standard results, so rule ids must be registry-unique.
- `validatePlan` accepts evidence only from a source whose `plan_version_id` equals the plan's (the wrong-plan guard). AT-00:76 asserts the same.
- `passport` shows one waiting-period item from `first("waiting_period")`. For a plan with per-class waiting rules, it would show "No waiting periods" while Major waits 12 months. Generalized in §4.4.
- The engine resolves the service class **before** exclusions (`simulate.ts` step 3). An excluded code must therefore also be classified, or it blocks with `RULE_MISSING`.
- A VERIFIED `lifetime_maximum` for the line's class → blocking `RULE_TYPE_UNSUPPORTED` (CONTRACT §3.3 step 5). Orthodontic adjudication stays a non-goal (§2), so Enhanced orthodontic lines block honestly.
- `closeYear` (`simulate.ts:266`) collapses a ranged `plan_paid_ytd` to one end per scenario (R2-M1). `prior` does the same for a ranged `carryover_balance`.

---

## 3. Requirements covered by ID

| ID | Delivered by |
|---|---|
| PLAN-004 | Value and Enhanced 2026 with premiums, deductibles, maximums, service-class shares, exclusions, orthodontic limits and rollover rules (§4.1). Loaded by `loadRegistry`. Adjudicated by the same engine (AT-22). Data exposed through `/api/plan-options`. The screen is deferred (optional per §2). |
| PLAN-001 | Each option resolves only through its own `plan_option_id`. A Value or Enhanced key in 2027 → `PLAN_NOT_FOUND`, never Standard 2027 (AT-22 #3). |
| PLAN-003 | First `employer_summary` source. It defers to each summary on coverage, so it is lowest in each option's precedence. Educational rules stay rejected (AT-20 unchanged). |
| ARCH-006/007 | `premium` is a typed, evidenced rule. Standard 2027 premium is `UNKNOWN` (no 2027 guide), shown as needs-confirmation and never as $0. |
| ARCH-005 | The plan-options items are engine values only. No UI is added. |
| §5.1 / ROLL-003/004/007 | Shipped data now exercises `LTE`, `ANY_IN_NETWORK_CLAIM` and an unseeded next plan (Enhanced). Before, these existed only on registry copies. |
| ROLL-008 / EDU-004 (R2-M1) | A ranged settled `plan_paid_ytd` gives a qualifying range in **both** scenarios: `UNCERTAIN` when it straddles the threshold. A ranged carryover balance that matters → `NEEDS_CONFIRMATION`. |
| §5.4 / EDU-003 (R2-L1) | The shift sentence states its direction ("increases"/"lowers"/"does not change"), and the validator accepts the magnitude of a signed `*_delta_cents`. |
| EDU-004 (R2-L2) | The shift note asserts "keeps … below $T" only when the moved status is `CONDITIONAL` or `EARNED`. |
| §13 | "Value and Enhanced options in the registry for schema/tier demonstration." |
| §14.1 #5, #6, #8 | Exact version per option; UNKNOWN premium is never a value; the Value waiting period gives NOT_COVERED (AT-22). |
| §17 "documented commands work" | W-1 and W-2 make `npm run verify` portable to Windows checkouts. |

---

## 4. Exact files and symbols expected to change

(F) marks a frozen path. Use the UNFREEZE cycle in §5.1. This plan is the approved change request for every owner.

### 4.1 New sources (F, `backend/data/sources/`)

UTF-8, LF, trailing newline. Write the bytes exactly as given (they are covered by `-text`), then put each sha256 in the manifest. Each summary mirrors the Standard summary's five-page layout. Where a sentence is identical to Standard's, copy it byte for byte from `northwind-ppo-2026-benefit-summary.md`, so the shared quote templates keep matching.

**`northwind-ppo-value-2026-benefit-summary.md`** (`nwd-ppo-value-2026-summary`, `schedule_of_benefits`)

```markdown
<!-- page 1 -->
# Northwind Mutual Dental — PPO Value — 2026 Summary of Dental Benefits

SYNTHETIC DOCUMENT — FOR DEMONSTRATION ONLY. This is not an actual insurance plan, carrier, or employer. All names, amounts, and rules are invented for the codeLinc 11 hackathon demo.

## Plan Identification

| Item | Value |
|---|---|
| Carrier | Northwind Mutual Dental (carrier ID: northwind-mutual) |
| Employer group | Acme Synthetic Corporation (group ID: acme-synthetic-001) |
| Plan option | PPO Value (option ID: ppo-value) |
| State | VA |
| Network | Northwind Dental PPO Network (network ID: nwd-ppo) |
| Plan type | Dental PPO (DPPO) |

## Benefit Period

The benefit period is the calendar year: January 1, 2026 through December 31, 2026.

Benefits are applied based on the date of service. The deductible and the annual maximum reset on January 1, 2027.

<!-- page 2 -->
## Deductible and Maximums

Individual deductible: $100 per member per benefit period.

The deductible applies to Basic and Major services. The deductible does not apply to Diagnostic & Preventive services.

The deductible is combined for in-network and out-of-network services.

Annual maximum: $1,000 per member per benefit period, combined for in-network and out-of-network services.

Plan payments for Basic and Major services count toward the annual maximum. Payments for Diagnostic & Preventive services do not count toward the annual maximum.

Orthodontic lifetime maximum: Not applicable. Orthodontic services are not covered under this plan.

## Coverage Levels

| Service class | In-network plan pays | Out-of-network plan pays |
|---|---|---|
| Diagnostic & Preventive | 100% | 80% |
| Basic | 70% | 50% |
| Major | 40% | 30% |
| Orthodontics | Not covered | Not covered |

In-network coinsurance is applied to the network dentist's contracted fee (allowed amount) after any deductible.

Out-of-network coinsurance is applied to the plan's Out-of-Network Allowance after any deductible.

<!-- page 3 -->
## Service Classifications

The plan assigns each procedure code to exactly one service class.

| Service class | Procedure codes |
|---|---|
| Diagnostic & Preventive | D0120, D0140, D0150, D0210, D0220, D0274, D1110 |
| Basic | D2140, D2391, D2392, D3330 |
| Major | D2740, D2750, D2950, D6010 |

Endodontic therapy (D3330) is classified as a Basic service under this plan.

## Waiting Periods

Major services have a waiting period of 12 months from the member's coverage effective date.

There are no waiting periods for Diagnostic & Preventive or Basic services.

<!-- page 4 -->
## Limitations

This section lists every frequency limitation that applies under this plan.

| Procedure codes | Limitation |
|---|---|
| D0120, D0140, D0150 (oral evaluations) | 2 per member per benefit period, combined |
| D1110 (prophylaxis) | 2 per member per benefit period |
| D0210 (full-mouth radiographs) | 1 per member per 60 months |
| D2740, D2750 (crowns) | 1 per tooth per 60 months |

## Exclusions

This section lists every exclusion that applies under this plan.

Cosmetic services, including D9972 external bleaching, are not covered.

Implants (D6010) are classified as Major services but are not covered under this plan.

## Alternate Benefits

This plan does not apply an alternate benefit to posterior composite (tooth-colored) restorations. No other alternate benefit provisions apply.

## Sublimits

No service-specific sublimits apply under this plan.

<!-- page 5 -->
## Out-of-Network Allowance Schedule

| Procedure code | Out-of-Network Allowance |
|---|---|
| D0120 | $40 |
| D0140 | $65 |
| D0150 | $75 |
| D0210 | $90 |
| D0220 | $25 |
| D1110 | $70 |
| D2392 | $150 |
| D3330 | $900 |
| D2740 | $950 |

Out-of-network dentists may bill the member for the difference between their charge and the plan's payment (balance billing).

## Claim Submission and Direct Payment

Network dentists submit claims on the member's behalf. A member may ask a network dentist not to submit a claim and pay the dentist directly.

Services paid without a claim are not recorded by the plan: they do not reduce the deductible or annual maximum and do not count toward frequency limitations.

The network fee schedule does not apply to services paid without a claim; the price is set by agreement between the member and the dentist.

## Pre-Treatment Estimates

A pre-treatment estimate is recommended when planned treatment is expected to exceed $300. A pre-treatment estimate is not a guarantee of payment.

## Maximum Carryover

No maximum carryover feature applies for the 2026 benefit period.

## Coordination of Benefits

When a member is covered by more than one dental plan, benefits are coordinated using the standard method.
```

**`northwind-ppo-enhanced-2026-benefit-summary.md`** (`nwd-ppo-enhanced-2026-summary`, `schedule_of_benefits`). It is the same as the Value file, with these differences:

- **Title line:** `# Northwind Mutual Dental — PPO Enhanced — 2026 Summary of Dental Benefits`
- **Identification row:** `| Plan option | PPO Enhanced (option ID: ppo-enhanced) |`
- **Page 2:**
  - `Individual deductible: $50 per member per benefit period.`
  - `Annual maximum: $2,500 per member per benefit period, combined for in-network and out-of-network services.`
  - The orthodontic paragraph is replaced by: `Orthodontic lifetime maximum: $1,500 per member. Plan payments for Orthodontic services count only toward the orthodontic lifetime maximum and do not count toward the annual maximum. The deductible does not apply to Orthodontic services.`
  - Coverage rows:
    - `| Diagnostic & Preventive | 100% | 100% |`
    - `| Basic | 90% | 80% |`
    - `| Major | 60% | 50% |`
    - `| Orthodontics | 50% | 50% |`
- **Page 3:**
  - Add the row `| Orthodontic | D8080 |` after Major.
  - Waiting Periods is the Standard sentence `There are no waiting periods for any service class under this plan.`
- **Page 4:** the implant exclusion sentence is removed (Standard's exclusions).
- **Page 5:** "Maximum Carryover" becomes:

```markdown
## Maximum Carryover

A carryover is earned for the 2026 benefit period when plan payments for services incurred in that benefit period that count toward the annual maximum total $700 or less.

Services are assigned to a benefit period by date of service, including claims processed after the benefit period ends.

At least one claim with a plan payment that counts toward the annual maximum must be paid for services in the benefit period.

The carryover earned is $350. An additional in-network bonus of $150 is earned when at least one claim for services in the benefit period is paid to a network dentist.

The carryover earned is added to the member's carryover balance. The carryover balance may not exceed $1,250; any amount above $1,250 is not carried over.

If no carryover is earned for a benefit period, the carryover balance does not continue into the next benefit period.

The carryover balance is added to the annual maximum of the next benefit period.

A carryover earned for the 2026 benefit period applies only if the member is enrolled on January 1, 2027 in the Northwind Mutual Dental PPO Enhanced plan for the 2027 benefit period (plan version nwd-ppo-enhanced-2027).
```

**`acme-2026-dental-enrollment-guide.md`** (`acme-2026-enrollment-guide`, `employer_summary`)

```markdown
<!-- page 1 -->
# Acme Synthetic Corporation — 2026 Dental Benefits Enrollment Guide

SYNTHETIC DOCUMENT — FOR DEMONSTRATION ONLY. This is not an actual insurance plan, carrier, or employer. All names, amounts, and rules are invented for the codeLinc 11 hackathon demo.

This guide lists the 2026 dental plan options offered to employees of Acme Synthetic Corporation (group ID: acme-synthetic-001) in VA through Northwind Mutual Dental. Coverage terms are described in each option's Summary of Dental Benefits; where this guide and a summary differ on coverage, the summary governs.

## Monthly Premiums

Amounts are the employee's monthly contribution for the 2026 plan year.

| Plan option | Employee only | Employee + spouse | Employee + child(ren) | Family |
|---|---|---|---|---|
| PPO Value | $9.80 | $19.60 | $21.10 | $31.40 |
| PPO Standard | $18.25 | $36.50 | $39.20 | $58.40 |
| PPO Enhanced | $31.60 | $63.20 | $67.90 | $101.10 |
```

**`manifest.json` (F).** Append the three entries **after** the existing three, so `sources[0]` is unchanged. Each gets `retrieved_at:"2026-10-01T12:00:00Z"` and `synthetic:true`. `plan_version_ids` (see §4.2) is:
- `["nwd-ppo-value-2026"]` for the Value summary;
- `["nwd-ppo-enhanced-2026"]` for the Enhanced summary;
- `["nwd-ppo-value-2026","nwd-ppo-standard-2026","nwd-ppo-enhanced-2026"]` for the guide.

The existing entries keep their bytes and checksums. Only `plan_version_id: X` becomes `plan_version_ids: [X]`.

### 4.2 Domain (`backend/src/domain/`, F)

**`plan.ts`**
- `SourceDocument.plan_version_id` → `plan_version_ids: z.array(Id).min(1)`. Document this as: the plan versions this document is part of (one group's packet), never a different group or option.
- New `PremiumValue`:
  ```ts
  z.strictObject({
    basis: z.enum(["EMPLOYEE_MONTHLY_CONTRIBUTION"]),
    tiers: z.array(z.strictObject({
      coverage_tier: z.enum(["EMPLOYEE_ONLY", "EMPLOYEE_SPOUSE", "EMPLOYEE_CHILDREN", "FAMILY"]),
      cents: Cents,
    })).min(1),
  })
  ```
  Each enum lists documented values only. Add `rule("premium", PremiumValue)` to `PlanRule`. The JSDoc says it is plan-derived but **never** an adjudication input.
- New helper `registryRuleIdProblems(registry): string[]`, returning duplicate rule ids across plans. Use it in the contract test and in `build-registry`.

**`benefits.ts`**: `RolloverOutcome.settled_plan_paid_cents: Cents|null` → `settled_plan_paid: AmountRange.nullable()` (R2-M1). Update the `qualifying_plan_paid` doc to "low = settled.low + simulated; high = settled.high + simulated + pending".

**New results** (in `benefits.ts`, next to `BenefitPassport`):
```ts
PlanOptionSummary = z.strictObject({
  plan_version_id, plan_id, plan_option_id: Id, plan_name, plan_type: PlanType,
  coverage_period_start: IsoDate, coverage_period_end: IsoDate,
  is_member_plan: z.boolean(),
  /** false → the engine returns UNSUPPORTED_PLAN_TYPE for it. */
  adjudication_supported: z.boolean(),
  items: z.array(PassportItem),
})
PlanOptionsResult = z.strictObject({
  contract_version, as_of: IsoDateTime, member_plan_version_id: Id.nullable(),
  options: z.array(PlanOptionSummary), issues: z.array(Issue),
})
```

**`ports.ts`**: `BenefitEngine.planOptions(registry, member, asOf): PlanOptionsResult`.

**`api.ts`**:
- `API_ROUTES.plan_options = { method: "POST", path: "/api/plan-options" }`
- `PlanOptionsRequest = PassportRequest`'s shape (`as_of`, `member`), strict
- `PlanOptionsResponse = okEnvelope(PlanOptionsResult)`

**`version.ts`**: `1.6.0`.

### 4.3 Registry data and builder

**`fixtures/golden/registry-expectations.json` (F)**
- Each plan entry gets:
  - `plan_option_id`;
  - `rule_id_suffix` (`".2026"` / `".2027"` for Standard, `".value.2026"`, `".enhanced.2026"`);
  - `source_precedence`:
    - Standard 2026: `[rider, nwd-ppo-2026-summary, acme-2026-enrollment-guide]`;
    - Standard 2027: unchanged;
    - Value: `[nwd-ppo-value-2026-summary, acme-2026-enrollment-guide]`;
    - Enhanced: `[nwd-ppo-enhanced-2026-summary, acme-2026-enrollment-guide]`.
- Standard 2026 adds `premium.2026` VERIFIED (`evidence_source_id: acme-2026-enrollment-guide`, page 1) with tiers 1825/3650/3920/5840. Standard 2027 adds `premium.2027` UNKNOWN. **No other Standard rule changes.**
- New **Value** plan (`plan_id nwd-ppo-value`, 2026 period). Rules, with every id ending in `.value.2026`:
  - **Same values as Standard 2026:** `benefit_period`, `frequency_limit.{evaluations,prophylaxis,fmx,crowns}`, `exclusion.cosmetic`, `alternate_benefit.posterior_composite` (NA), `sublimit.all` (NA), `limitations_index`, `oon_allowance_schedule`, `claim_submission`, `pretreatment_estimate`, `coordination_of_benefits`, and `service_class_map.{preventive,basic}`.
  - **Different values:**
    - `deductible` 10000
    - `annual_maximum` 100000
    - `plan_share` in-network 10000/7000/4000, out-of-network 8000/5000/3000
    - `service_class_map.major` [D2740, D2750, D2950, D6010]
    - `exclusion.implants` VERIFIED `{cdt_codes:["D6010"]}`
    - `waiting_period.major` VERIFIED `{months:12}` (class major)
    - `waiting_period.preventive` NA (class preventive), `waiting_period.basic` NA (class basic)
    - `lifetime_maximum.orthodontic` NA
    - `rollover` NA
    - `premium` VERIFIED 980/1960/2110/3140
- New **Enhanced** plan (`plan_id nwd-ppo-enhanced`), with every id ending in `.enhanced.2026`. It has Standard's set and values except:
  - `deductible` 5000 with `applies_to_classes [basic, major]`
  - `annual_maximum` 250000 with `counts_classes [basic, major]`
  - `plan_share` in-network 10000/9000/6000/**5000 orthodontic**; out-of-network 10000/8000/5000/**5000 orthodontic**
  - `service_class_map.orthodontic` [D8080]
  - `lifetime_maximum.orthodontic` VERIFIED `{individual_cents:150000, service_class:"orthodontic"}`
  - `waiting_period.all` NA
  - `rollover` VERIFIED:
    ```json
    {"qualification_basis":"INCURRED_PLAN_PAID_TOWARD_MAXIMUM","threshold_cents":70000,"threshold_comparison":"LTE","base_award_cents":35000,"network_bonus_cents":15000,"network_bonus_condition":"ANY_IN_NETWORK_CLAIM","bank_cap_cents":125000,"requires_at_least_one_eligible_claim":true,"existing_bank_treatment":"ADD_AND_CAP","bank_when_not_qualified":"FORFEIT","applies_to_next_plan_version_ids":["nwd-ppo-enhanced-2027"]}
    ```
  - `premium` VERIFIED 3160/6320/6790/10110

**`data/tools/build-registry.ts`**
- `key` = `{ ...member.plan_key, plan_option_id: exp.plan_option_id }`.
- `carrier_name`/`plan_name` come from the plan's **own** summary title line.
- The stem is `rule_id` minus `exp.rule_id_suffix`.
- Replace the `${DED}` hack with per-plan overrides: `PLAN_QUOTES[plan_id][stem]` over the shared `QUOTES`. Standard keeps today's quotes exactly, so its JSON is byte-identical apart from the allowed additions.
- Premium evidence = the option's table row plus the "Amounts are…" sentence. The builder throws unless the row starts with `| <option name> |`, where option name is the plan's own identification-table name ("PPO Value").
- `source_documents` = every manifest source whose `plan_version_ids` includes the plan.
- Throw on `registryRuleIdProblems`.

**Regenerate** `data/plans/*.json` and `sources.generated.json`. **Allowed diff:**
- Standard 2026: `premium.2026` added, the guide in `source_documents`/`source_precedence`.
- Standard 2027: `premium.2027` added.
- Two new plan files.
- `sources.generated.json`: three appended sources, plus `plan_version_id` → `plan_version_ids` on the existing three.

### 4.4 Benefits (`backend/src/benefits/`)

**`index.ts`**
- `loadRegistry` imports the two new plan JSONs. Bump `REGISTRY_VERSION` to `synthetic-2026.10.04`.
- `validatePlan`: evidence source must have `plan_version_ids.includes(plan.plan_version_id)`.
- **Waiting-period item** (shared by passport and plan options):
  - one `waiting_period` rule with `service_class: null` → today's single `rules.waiting_period` item, unchanged;
  - otherwise one item per rule, `rules.waiting_period.<class>` labelled `Waiting period: <Class label>`, value `"<m> months"` or `"No waiting period"`.
- New `planOptions(registry, member, asOf)`:
  - **Selection:** plans with the same `carrier_id`, `group_id` and `jurisdiction` as `member.plan_key` whose coverage period contains the as-of local date. Sorted by `plan_option_id`, then `plan_version_id`.
  - **Flags:** `is_member_plan = samePlanKey`; `adjudication_supported = supportsPlanType`.
  - **Items:** premium items (`premium.<tier>`, label e.g. "Monthly premium: employee only", `value_cents`), then the passport's in-network and out-of-network coverage items, then the passport's rule items, then `rules.orthodontic_lifetime_maximum`.
  - **Missing data:** UNKNOWN premium → one `premium` item with `NEEDS_CONFIRMATION` (via `ruleItem`). Never zero.
  - **Issues:** `PLAN_NOT_FOUND` info-level if the member's own plan does not resolve on that date (the list still shows).
  - **Refactor, don't duplicate:** extract the passport's coverage and rules item builders into functions taking `(plan)`. The passport's output for the golden member must stay **byte-identical** (mock diff = only `contract_version`).

**`simulate.ts:closeYear`** (R2-M1)
- **Settled range:** `settled = {low: lowest(plan_paid_ytd), high: highest(plan_paid_ytd)}`, independent of scenario. Add a `lowest` helper beside `highest`.
  - `qLow = settled.low + simulated`
  - `qHigh = settled.high + simulated + pending`
  - `eligLow` uses `settled.low > 0`; `eligHigh` uses `settled.high > 0`
  - `bonusHigh` uses `settled.high + pending > 0`
  - The `settled_plan_paid` operand cites the input with `{cents}` when exact, and `{text:"$L to $H"}` when ranged. The `qualifying_low`/`qualifying_high` steps keep exact cents.
- **Prior balance:** a ranged or unknown `carryover_balance` is only a problem when `ADD_AND_CAP` and `qualifiesBest`. Then → `missing(…)` → NEEDS_CONFIRMATION, with the message "Your carryover balance is not exact, so the <y> carryover needs confirmation." An exact balance is unchanged.
- **Result:** the outcome is identical in `best_case` and `worst_case` whenever the inputs are the same.

### 4.5 AI (`backend/src/ai/explain.ts`)

- **R2-L1:**
  - `delta > 0` → "increases your estimated cost by $D";
  - `delta < 0` → "lowers your estimated cost by $D";
  - `delta = 0` → "does not change your estimated cost".
- **Validator:** when a key ends in `_delta_cents`, also add `Math.abs(v)` to the allowed cents. Document it in CONTRACT §6.4.
- **Paid text:** with a ranged settled amount, the paid sentence is "Your plan has paid between $L and $H toward this year's maximum so far."
- **`ruleFor`:** check that `rule:<stem>…` lookups for new options work. They use the `startsWith(prefix + ".")` + version filter, which is fine.

### 4.6 API (`backend/src/api/`)

- `index.ts`: a `plan_options` handler, the same pattern as `passport`.
- `server.ts`: needs no change (routes come from `API_ROUTES`). Verify.

### 4.7 Fixtures, scripts, docs (backend)

- **`fixtures/golden/expected.json` (F):** additions only. A new top-level `plan_options` block (§4.9 targets).
- **`fixtures/mock-responses/plan-options.json` (F):** new, generated by `scripts/build-mocks.ts`. The other mocks: only `contract_version` and the `settled_plan_paid` reshape.
- **`scripts/golden-check.mjs` (F):**
  - add hand-transcribed `VALUE_2026` and `ENHANCED_2026` constants;
  - parameterize `adjudicate` by plan constants;
  - derive the §4.9 targets independently;
  - mirror R2-M1 in `carryover2026` (the settled range).
  - It still never imports `src/`.
- **`scripts/check-frozen.mjs` and `scripts/freeze.mjs` (F)** (W-1):
  - parse `FROZEN.sha256` with `/\r?\n/`;
  - hash file bytes with CRLF normalized to LF (`buf.toString("utf8").replace(/\r\n/g, "\n")`) for non-`data/sources/**` text files;
  - `data/sources/**` stays exact bytes (it is `-text` and checksummed again in the manifest).
  - Existing hashes stay valid because they were LF bytes. Also add `* text=auto eol=lf` to the root `.gitattributes` so future checkouts are LF. **Do not rewrite the existing working tree.**
- **`tests/integration/server-origin-check.test.ts`** (W-2, reviewer-owned; portability only):
  - spawn `process.execPath` with `[require.resolve("tsx/cli"), "src/api/server.ts"]` (or `node_modules/tsx/dist/cli.mjs`) instead of `npx`;
  - assertions unchanged.
- **Docs:**
  - `docs/contracts/CONTRACT-v1.md` (F):
    - §2: registry options, unique rule ids, `plan_version_ids`, the `premium` rule, `<stem>.<option>.<year>` ids;
    - §3.7: passport waiting items;
    - §3.9 step 3: settled range;
    - new §3.10 plan options;
    - §5: route;
    - §6.3/§6.4: wording and delta validator;
    - §8.
  - `CHANGELOG.md` (1.6.0).
  - `golden-scenario.md` (plan-option targets).
  - `docs/decision-log.md`: D-029.
  - `docs/acceptance.md`: AT-22.
  - `docs/backend-flow.md`: plan-options route.
  - `backend/CLAUDE.md`, `README.md`: version mentions.

### 4.8 Frontend (`frontend/src/`)

- `features/care-window/care-plan.tsx`:
  - **`RolloverShiftNote` (R2-L2):** the "keeps this year's plan payments … $T" clause appears only when `shift.status_if_moved` is `CONDITIONAL` or `EARNED`. For `UNCERTAIN`: "may keep … depending on pending claims". Otherwise it is omitted.
  - **`RolloverPanel`:** formats `settled_plan_paid` as a range.
- `tests/unit/care-window-rollover.test.ts`: add an UNCERTAIN-shift case (no "keeps" claim) and a ranged-settled render. The existing CONDITIONAL assertion at line 88 stays.
- No plan-options UI (the screen is deferred). The adapter is not required, because no caller exists.

### 4.9 Golden targets (hand-derived here; `golden-check.mjs` must reproduce them independently)

**Inputs.**
- **Fresh member per option:**
  - the golden member with `plan_key.plan_option_id` set to the option;
  - a 2026 accumulator for that option's version: deductible remaining = full, annual max remaining = full, `plan_paid_ytd` 0, `carryover_balance` exact 0;
  - no pending claims, no history.
- **Events**, in-network at `prov-rivera`, `as_of 2026-10-15T09:00:00-04:00`:
  - **E1:** D2392 tooth 19 on 2026-11-02, allowed 18,000 (charge 26,000);
  - **E2:** D2740 tooth 30 on 2026-11-16, allowed 110,000 (charge 160,000).

| Option | E1 ded / plan / member | E2 plan / member | Totals plan / member | Max remaining after | 2026 rollover |
|---|---|---|---|---|---|
| Standard | 5,000 / 10,400 / 7,600 | 55,000 / 55,000 | 65,400 / 62,600 | 84,600 | NOT_EARNED, qualifying {65,400, 65,400}, bank {0,0} |
| Value | 10,000 / 5,600 / 12,400 | 44,000 / 66,000 | 49,600 / 78,400 | 50,400 | none (NOT_APPLICABLE) |
| Value, `coverage_effective_from` 2026-06-01 | 10,000 / 5,600 / 12,400 | 0 / 110,000 NOT_COVERED `WAITING_PERIOD` | 5,600 / 122,400 | 94,400 | none |
| Enhanced | 5,000 / 11,700 / 6,300 | 66,000 / 44,000 | 77,700 / 50,300 | 172,300 | NEEDS_CONFIRMATION, `next_plan_version_id` null, `ROLLOVER_NEXT_PLAN_UNKNOWN`, `final_bank` null |

**Arithmetic.**
- Standard E1: (18,000 − 5,000) × 80% = 10,400.
- Value E1: (18,000 − 10,000) × 70% = 5,600. Value E2: 110,000 × 40% = 44,000.
- Enhanced E1: 13,000 × 90% = 11,700. Enhanced E2: 110,000 × 60% = 66,000.
- Value waiting: 2026-11-16 < 2026-06-01 + 12 months.

**Listing** (`/api/plan-options`, golden member, as of 2026-10-15): options in order `ppo-enhanced`, `ppo-standard`, `ppo-value`. `is_member_plan` is true only for Standard.

| Option | Employee-only premium | Deductible | Annual maximum | Basic in-network |
|---|---|---|---|---|
| Enhanced | 3,160 | 5,000 | 250,000 | 9,000 bps |
| Standard | 1,825 | 5,000 | 150,000 | 8,000 bps |
| Value | 980 | 10,000 | 100,000 | 7,000 bps |

The Enhanced listing also shows an orthodontic lifetime maximum of 150,000.

---

## 5. Contract and schema changes

### 5.1 Procedure (`backend/docs/workflow.md`)

From `backend/`:
1. `touch .claude/UNFREEZE`.
2. Edit the (F) files.
3. `npx tsx data/tools/build-registry.ts`.
4. `npx tsx scripts/build-mocks.ts`.
5. `npm run freeze`.
6. `rm .claude/UNFREEZE`.
7. CHANGELOG + D-029.

The frozen count rises by the three sources, `plan-options.json` and AT-22 (expect 70). Run `check:frozen` afterwards with no marker.

### 5.2 Version: 1.5.0 → 1.6.0 (minor), with the breaking parts stated

- **Additive:**
  - the `premium` rule type;
  - `PlanOptionSummary`/`PlanOptionsResult`;
  - the `plan_options` route;
  - `BenefitEngine.planOptions`;
  - per-class waiting items for plans that have per-class rules.
- **Reshaped, server-owned registry data** (regenerated in the same change, as in 1.5): `SourceDocument.plan_version_id` → `plan_version_ids`.
- **Response reshape:** `RolloverOutcome.settled_plan_paid_cents` → `settled_plan_paid` (range). This is technically breaking for `RolloverOutcome` readers. It stays a minor bump because 1.5.0 introduced the field in this same unreleased train and its only consumer (`/care-window`) is migrated in the same change. Record this explicitly in the CHANGELOG. **No request key is added or made required** (L-2 lesson).
- **Behavior:**
  - ranged settled payments → range/UNCERTAIN (R2-M1);
  - shift sentence wording (R2-L1);
  - the validator accepts `|*_delta_cents|`.

### 5.3 Golden numbers

**No existing number changes.**
- The golden member's accumulators are exact, so R2-M1 is a no-op for them.
- Premium is not an adjudication input.
- Standard rule values are unchanged.

New values are additions (§4.9), each reproduced by `golden-check.mjs`.

---

## 6. Migration and caller list

To find every caller, run:

```bash
grep -rn "plan_version_id\b" backend/src backend/data/tools backend/scripts backend/tests | grep -i "source\|manifest"
grep -rn "settled_plan_paid_cents\|changes your estimated cost\|keeps this year\|waiting_period\|loadRegistry\|API_ROUTES\|1\.5\.0" backend frontend/src frontend/tests --include=*.ts --include=*.tsx --include=*.mjs --include=*.json --include=*.md
```

**Backend**
- `src/benefits/index.ts`: `validatePlan` (sources), `passport` (waiting items), `loadRegistry`, `planOptions`, the `benefitEngine` object.
- `src/benefits/simulate.ts`: `closeYear`, `lowest`.
- `src/ai/explain.ts`: `rolloverClaim`, the validator's cents collection.
- `src/api/index.ts`: handler. `src/api/demo-cli.ts`: verify that the golden story is unchanged.
- `data/tools/build-registry.ts`, `data/plans/*`, `data/sources/*`.
- `scripts/build-mocks.ts`:
  - `plan-options.json`;
  - its `rule_id.endsWith("2027")` mock-evidence shortcut stays valid for Standard ids;
  - verify that no new-option rule reaches the mocks.
- `scripts/golden-check.mjs`, `scripts/check-frozen.mjs`, `scripts/freeze.mjs`.
- `tests/optimizer/mvp-before-after.test.ts` fake engine: add `planOptions` if `BenefitEngine` typing requires it.

**Frozen tests whose expectations change because the contract changed.** These are corrections, not weakenings; each change is stated in the handoff.
- `tests/acceptance/at00-registry-grounding.test.ts:76`:
  - "cites its own plan version" becomes `src.plan_version_ids` includes the plan;
  - also assert the source's group matches via the plan key.
- `tests/acceptance/at21-rollover.test.ts:384`: "changes your estimated cost by $60." → "increases your estimated cost by $60." (R2-L1).
- `tests/contracts/fixtures.test.ts`:
  - the manifest/page checks gain the new sources (page lists `[1..5]` for summaries, `[1]` for the guide);
  - `plan_version_ids` shape.
- Any AT that asserts `registry.plans.length` or iterates plans assuming only Standard (e.g. AT-20 precedence loops over `registryExpectations.plans`). The new plans must satisfy the same assertions. Do not exclude them.

**Reviewer-owned probes that reproduce now-fixed findings** (`tests/integration/review-iter2-probes.test.ts`, "FINDING M-1" and "FINDING L-1"): they assert the buggy behavior and will fail after the fix. The Implementer **converts them into regression assertions of the fixed behavior** and quotes the before/after in the handoff:
- M-1: UNCERTAIN, ranged qualifying, both scenarios equal.
- L-1: "lowers your estimated cost by $9", `ok === true`.

This tightens the probes; no other probe is touched.

**Frontend**
- `features/care-window/care-plan.tsx`: `RolloverPanel` (`settled_plan_paid`), `RolloverShiftNote`.
- `tests/unit/*`: any `RolloverOutcome` literal uses `settled_plan_paid`.
- `lib/adapters/live/engine.ts`: verify only.

---

## 7. Tests to write first or alongside

**`backend/tests/acceptance/at22-plan-options.test.ts`** (new; frozen after the freeze). Each `describe` cites its id.

1. **PLAN-004 load.**
   - `loadRegistry().plans` has the 5 versions.
   - `validatePlan(...).ok` for each.
   - Each 2026 option has VERIFIED `deductible`, `annual_maximum`, a `plan_share` for every classified class and network, `service_class_map`, ≥1 VERIFIED `exclusion`, `lifetime_maximum.orthodontic` (NA or VERIFIED), `rollover` (NA or VERIFIED) and VERIFIED `premium` with 4 tiers.
   - Values equal §4.3.
2. **Unique ids.** `registryRuleIdProblems(loadRegistry())` is `[]`. A registry copy with a duplicated id is reported.
3. **PLAN-001.**
   - Each option key on 2026-11-02 resolves to its own version.
   - Value and Enhanced keys on 2027-01-05 → `PLAN_NOT_FOUND`, never `nwd-ppo-standard-2027`.
   - A Standard member never receives a Value or Enhanced rule id in `applied_rule_ids` or `evidence`, for the golden care plan and the §4.9 Standard run.
4. **Premium evidence.**
   - Each premium rule cites `acme-2026-enrollment-guide` p1 with a row that starts with `| <its option name> |`.
   - `premium.2027` is UNKNOWN with no value.
   - The guide lists each 2026 plan in `plan_version_ids`, and every listed plan has the same group key.
5. **§4.9 adjudication.** Line-level ded/plan/member, totals, max remaining and rollover outcome for each row. They equal `expected.json.plan_options`.
6. **Waiting period (§14.1 #8).** The Value crown with effective date 2026-06-01 → NOT_COVERED, `WAITING_PERIOD` citing `waiting_period.major.value.2026`. With 2025-06-01 → covered.
7. **Exclusion.** Value D6010 (allowed taken from a test-only price) → NOT_COVERED `EXCLUDED_SERVICE` citing `exclusion.implants.value.2026`.
8. **Orthodontics.** Enhanced D8080 → blocking `RULE_TYPE_UNSUPPORTED` with `rule_id` `lifetime_maximum.orthodontic.enhanced.2026`. No plan payment is produced.
9. **Enhanced rollover** (ROLL-003/004/007 on shipped data).
   - Shipped: NEEDS_CONFIRMATION + `ROLLOVER_NEXT_PLAN_UNKNOWN`, nothing carried.
   - On a registry copy that adds an `nwd-ppo-enhanced-2027` clone (same key, 2027 period):
     - E1 only, `plan_paid_ytd` 0 → CONDITIONAL `{50000,50000}` (350 + 150 bonus);
     - `plan_paid_ytd` 58,300 + E1 = 70,000 exactly → CONDITIONAL (`LTE`); 58,301 → NOT_EARNED;
     - prior 100,000 → `final_bank {125000,125000}`, `lost_to_cap 25000`;
     - an E1 at out-of-network `prov-brightsmile` only → `{35000,35000}`.
10. **Value rollover NA.** No outcome and no `RULE_UNVERIFIED` warning.
11. **Plan-options API.**
    - `POST /api/plan-options` with the golden member → 200 and the §4.9 listing.
    - Items cite rule ids and are `PLAN_VERIFIED`.
    - The Standard deductible, maximum and coverage items deep-equal the passport's.
    - The Value listing shows `rules.waiting_period.major` "12 months".
    - An unknown key → 400.
    - `as_of` 2027-02-01 → only `ppo-standard` 2027, with a premium item `NEEDS_CONFIRMATION` and `value_cents: null`.
    - A member whose own plan does not resolve → info `PLAN_NOT_FOUND` and the list still returned.
12. **Passport stability.** The golden passport deep-equals the regenerated `passport.json` mock, and that mock differs from `babdd84` only in `contract_version`.

**AT-21 additions (R2-M1, R2-L1).**
- `plan_paid_ytd` range 45,000–55,000 plus a 2027 filling → UNCERTAIN, qualifying {45,000, 55,000}, `final_bank {0,25000}`, `ROLLOVER_UNCERTAIN`, best and worst outcomes deep-equal.
- `carryover_balance` range while qualifying → NEEDS_CONFIRMATION.
- The near-threshold explanation says "increases your estimated cost by $60."
- The negative-delta registry copy (from the reviewer probe) → "lowers your estimated cost by $9" and `validateExplanation(...).ok`.

**Contract test.** `tests/contracts/fixtures.test.ts` covers the new manifest entries, sha256 and pages.

**Frontend.** See §4.8.

---

## 8. Acceptance commands

All must pass. Paste the exact counts into `implementation-handoff.md`.

```bash
cd backend
npx vitest run tests/acceptance/at22-plan-options.test.ts tests/acceptance/at21-rollover.test.ts
npm run check:frozen          # count updated; .claude/UNFREEZE absent; passes on this CRLF checkout
npm run golden:check          # GOLDEN OK … plan options included (contract 1.6.0 rules)
npm run typecheck && npm run lint
npx vitest run                # all projects green, including server-origin-check on Windows
npm run verify                # exit 0
npx tsx data/tools/build-registry.ts && git diff --stat data/plans   # only the allowed diff (§4.3)
npx tsx scripts/build-mocks.ts && npm run check:frozen              # idempotent
npm run demo:cli              # golden story unchanged ($1,372 / $908)

cd ../frontend
npm run typecheck && npm run lint && npm test && npm run build
```

**Golden immutability.** `git show babdd84:backend/fixtures/golden/expected.json | jq -S .` must equal `jq -S 'del(.plan_options)' backend/fixtures/golden/expected.json`.

**Standard registry immutability.** Run this on both Standard plans:
```bash
jq -S 'del(.rules[] | select(.rule_type=="premium")) | del(.source_documents, .source_precedence)'
```
The result must equal the same filter on `babdd84`'s file.

**Browser** (UI-014 smoke):
1. Start `npm run serve` and `next dev`.
2. On `/care-window`, run the full path. It shows $1,372 / $908, "Not earned", and zero console errors or failed `/api/engine/*` requests.
3. POST `/api/engine/plan-options` through the Next proxy → 200 with three options.

Use the `playwright-cli` skill if available, otherwise headless CDP as before.

---

## 9. Risks and explicit non-goals

**Risks**

1. **Standard bytes drift.** The builder generalization must reproduce Standard's JSON exactly (apart from the allowed additions). The immutability `jq` check above catches this.
2. **Rule-id uniqueness vs existing consumers.** `rule_catalog`, `ruleFor`, mocks and the frontend evidence lists assume `<stem>.<y>`. New ids only add a segment, and the version filter stays. Run AT-16 (wrong-plan evidence) unchanged.
3. **Multi-plan source.** It loosens the wrong-plan guard from "same version" to "listed version of the same group". Mitigations: the builder's row-name guard, AT-22 #4, and AT-00's group check.
4. **Passport refactor.** Byte-identical output is required. The mock diff proves it.
5. **R2-M1 changes trace operand text** for ranged inputs only. The golden traces are exact, so nothing changes there.
6. **W-1 must not hide real edits.** Normalizing CRLF only removes `\r` before `\n`. Any other byte change still fails. Add a contract test: a copied frozen file with one changed character fails `check-frozen` in a temp root.
7. **Slice size.** If time runs short, cut **only** the `/api/plan-options` route and its handler (keep `planOptions` in the engine with AT-22 #11 run directly against it). Record the cut.

**Explicit non-goals for 2b**

- A plan-comparison screen, total-cost-of-ownership math, and premium × months comparisons (deferred; optional per §2).
- 2027 successors for Value and Enhanced. The Enhanced 2026 carryover therefore honestly resolves to `ROLLOVER_NEXT_PLAN_UNKNOWN`.
- Orthodontic adjudication, lifetime-maximum tracking and age limits (§2 non-goals). They stay `RULE_TYPE_UNSUPPORTED`.
- Changing which option the demo member has, or any existing golden number.
- M-1 and L-1 (→ 3a), L-3 (→ 7), recommendation modes (→ 3).
- Rewriting the existing working tree's line endings (not authorized; W-1 is solved in the checker instead).

---

## 10. Prior-review findings being addressed

| Finding | Decision this iteration |
|---|---|
| R2-M1 · ranged settled amount gives a definitive outcome | **Fixed** (§4.4): the range is independent of scenario, and a ranged bank → NEEDS_CONFIRMATION. Regression in AT-21. The probe is converted. |
| R2-L1 · direction-less shift sentence; a negative delta fails validation | **Fixed** (§4.5): directional wording plus the `|delta|` validator allowance. AT-21:384 wording updated. The probe is converted. |
| R2-L2 · UI "keeps … below" with an UNCERTAIN moved status | **Fixed** (§4.8). New unit case. |
| M-1, L-1 (iter 1) | Deferred to 3a (unchanged). |
| L-2 (iter 1) | Lesson applied: no new required request key. |
| L-3 (iter 1) | Deferred to 7. |
| W-1, W-2 (new, found in this baseline) | **Fixed** (§4.7). |

---

## Release roadmap (updated gap table)

Legend: **P** = present, **Pa** = partial, **M** = missing.

| Group / ID | State after iter 2 | Evidence / note | Iter |
|---|---|---|---|
| ARCH-001..004, 006..010 | P | iter-1/2 reviews | — |
| ARCH-005 frontend only formats | Pa | old `/analysis` has its own formulas and fixtures | 7 |
| PLAN-001, PLAN-003 | P | AT-20; 2b adds a multi-option and an employer source | 2b (exercised) |
| PLAN-002 tier per event/location | Pa | M-1, L-1 | **3a** |
| PLAN-004 Value/Core/Enhanced | M | this plan | **2b** |
| §5 rollover, UI-007 | P (R2-M1/L1/L2 open) | AT-21 | **2b** (findings) |
| REC-001..007, §6.2 modes, §6.3 deltas, §6.4 SolverMeta, §6.5 order warning | Pa/M | fixed labels, `search_stats` only | 3 |
| §7 user control, UI-002..006 | M | | 4 |
| FUND-002/003, §14.4 #4–7 | Pa/M | | 5 |
| PRICE-001, EDU-001..005, UI-009/010 | Pa/M | | 6 |
| §13 demo data | Pa | Value/Enhanced in **2b**; payment plan 5; one canonical fixture 7 | 2b, 5, 7 |
| §14.3 | M (except #2) | | 3–4 |
| §14.5 | P | | — |
| §14.6 browser/e2e, UI-014, L-3 | Pa | no committed e2e | 7 |
| §17 portable commands | Pa → P in 2b | W-1, W-2 | **2b** |

Iteration sequence:

- **2b**: this plan.
- **3a**: M-1 and L-1.
- **3**: modes, SolverMeta, deltas (including rollover difference), order warning.
- **4**: locks, custom plan, re-optimize, undo/reset, conditional rollover acceptance.
- **5**: payment plans, full self-pay gate.
- **6**: education, badges, questions, PRICE-001.
- **7**: retire `/analysis`, one canonical fixture, committed e2e, final review.
