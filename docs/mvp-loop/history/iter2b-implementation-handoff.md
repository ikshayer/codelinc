# CareWindow MVP loop: implementation handoff

Implementer: iteration 2b (contract 1.5.0 → 1.6.0). Date: 2026-10-04. Branch `feature/cash-vs-claim`, uncommitted on top of `babdd84`.

## Requirements completed

- **PLAN-004:** PPO Value and PPO Enhanced 2026 load with premiums, deductibles, maximums, shares, exclusions, an orthodontic limit and rollover rules. They are adjudicated by the same engine.
- **PLAN-001:** each option resolves only through its own key.
- **PLAN-003:** first `employer_summary` source.
- **Data exposure:** `POST /api/plan-options`. The comparison screen is deferred.
- **Findings fixed:** R2-M1, R2-L1, R2-L2. Windows portability W-1 (frozen checksums on CRLF checkouts) and W-2 (`spawn npx`). Also W-3: an explicit timeout on AT-20's five-optimization test.

## Files changed

**Sources (new):**
- `data/sources/northwind-ppo-value-2026-benefit-summary.md`
- `data/sources/northwind-ppo-enhanced-2026-benefit-summary.md`
- `data/sources/acme-2026-dental-enrollment-guide.md`
- plus `manifest.json`

**Domain:** `plan.ts`, `benefits.ts`, `ports.ts`, `api.ts`, `version.ts`

**Benefits, AI, API:**
- `src/benefits/index.ts`: `planOptions`, shared item builders, per-class waiting items
- `rules.ts`: export `cmp`
- `simulate.ts`: `closeYear` R2-M1; the scenario parameter is removed
- `src/ai/explain.ts`
- `src/api/index.ts`

**Data:** `data/tools/build-registry.ts`; regenerated `data/plans/*` (two new files)

**Fixtures:** `registry-expectations.json`, `expected.json` (adds `plan_options`), mocks (adds `plan-options.json`)

**Scripts:** `golden-check.mjs`, `build-mocks.ts`, `frozen-files.mjs`, `check-frozen.mjs`, `freeze.mjs`

**Tests:**
- new: `tests/acceptance/at22-plan-options.test.ts` (22)
- edited: AT-00, AT-18, AT-20, AT-21 (+3), `fixtures.test.ts`, `mvp-before-after.test.ts`
- integration (portability and fixed-finding probes): `server-origin-check.test.ts`, `review-iter2-probes.test.ts`

**Frontend:** `care-plan.tsx`, `tests/unit/care-window-rollover.test.ts`

**Docs:** CONTRACT (§2.1, §2.3, §2.4, §3.7, §3.9, new §3.10, §6.3, §6.4, §7), CHANGELOG 1.6.0, D-029, `acceptance.md`, `golden-scenario.md`, `backend-flow.md`, version mentions

**Root:** `.gitattributes`: `* text=auto eol=lf`

## Behavior implemented

See CONTRACT §3.10 and CHANGELOG 1.6.0. The Standard demo is unchanged ($1,372 / $908 / $1,426). The Standard passport mock differs only in `contract_version`.

## Tests added

- AT-22 (22 tests).
- AT-21 +3: ranged settled amount, ranged carryover balance, negative delta.
- Frontend +2: ranged settled render, UNCERTAIN shift note.
- Probes M-1 and L-1 are converted to assert the fixed behavior (the before state is quoted in comments).

## Commands run and exact results

| Where | Command | Result |
|---|---|---|
| backend | `npm run verify` | exit 0: frozen 70 · GOLDEN OK (plan options included, 1.6.0) · typecheck · lint · contracts 25/25 · unit 25/25 · acceptance 172/172 · integration 75/75 |
| backend | `scratchpad/immut.mjs . babdd84` | Standard 2026/2027 changed only by the premium rule and the appended source. `expected.json` pre-existing values are identical after the 4 `settled_plan_paid` key migrations. |
| backend | `npm run demo:cli` | $1,372 / $1,426; explanation validated |
| backend | live `:4000` and Next proxy `:3000/api/engine` | `plan-options` 200, 1.6.0, premiums 3160/1825/980; `/care-window` page 200 |
| frontend | typecheck / lint / `npm test` / build | clean / clean / 138/138 / compiled |
| backend | W-1 proof | The new checker on a pristine LF export of `babdd84` flags only the 2 swapped scripts. On this CRLF tree, the 42 untouched frozen files verify. |

## Browser path verified

**Not run.** There was no full click-through or console capture this iteration, because of the deadline. Covered instead by render unit tests, the production build, and HTTP smoke tests of the page and proxy.

## Assumptions and deviations from the plan

1. **Golden key migration.** `expected.json` had 4 `settled_plan_paid_cents: X` entries; they are now `settled_plan_paid: {X,X}` (R2-M1 reshape). The numbers are unchanged, and the migration is proven exact by script.
2. **Separate adjudicator.** golden-check uses a separate hand-transcribed `optionRun` instead of parameterizing the existing adjudicator, so the existing checker path stays untouched.
3. **Passport stability** is pinned by the item list and texts in AT-22, not by comparison with the hand-built passport mock (the mock is not engine output).
4. **Carryover text.** The Enhanced passport and plan-option rollover text adds "(+$150 in-network bonus)". Standard's text is unchanged.
5. **`closeYear` signature.** The scenario parameter is dropped: the outcome no longer depends on it.

## Known limitations

- **LOW (review):** the validator accepts `$X` equal to any `|delta|` without checking the stated direction. This only matters for an LLM explainer.
- **LOW (review):** options with no version effective on the as-of date are omitted without an issue.
- The two new options have no 2027 successors (by design).

## Anything not completed and why

The browser click-through, because of the deadline. Everything else in scope is done.
