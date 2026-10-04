# Independent review — contract 1.2.0 build (2026-10-04)

Scope: `src/benefits/**`, `data/plans/**`, `src/ai/**`, `src/api/**`, plus the clinical-safety paths in `src/optimizer/**`. Every defect below was reproduced by running code. Each one has a failing test in `tests/integration/`. No production code was edited.

Baseline: `npm run test:acceptance` passes 13 files and 97/97 tests. `npm run test:integration` has 9 passing and 29 failing tests; every failure is one of the defects below.

## Verified correct (independent hand arithmetic, `independent-calculator.test.ts`, green)

- Golden alt-1 line by line: $800/$200, $24/$1,076 (annual-max cap), and the 2027 reset at $84/$96. Totals reconcile: charges $3,310 = plan $908 + member $1,372 + discounts $1,030.
- Plan-year boundary: a Dec 31 service uses the 2026 snapshot. A Jan 1 service opens a fresh 2027 period with the $75 deductible: 80% × $925 = $740.
- Out of network: eligible amount = min(charge, allowance), with balance billing. The cap binds on the second line: $540, then $284.
- With no pending claim, the $50 deductible applies first and then the cap leaves $140. The pending range $60–$76 gives $40 left for the crown in the best case.
- Rounding is half-up per line before caps (50% of $1.01 = 51¢).
- The evaluation frequency limit counts history. The over-limit line is priced as NOT_COVERED.
- Care plan: in the base, $40 budget and pending-range variants, funding plus shortfall equals member cost for every event, and every event satisfies charge = plan + member + adjustment.
- Server: a body over 256 KB returns 413. Error bodies never echo submitted values. Log lines hold only route, status, ms and request_id.

## Defects

### P1-1 — Silent NEEDS_CONFIRMATION when a fresh period's deductible or maximum rule is unusable
- **Owner:** dental-benefits — `src/benefits/simulate.ts:122-124`, `:178`
- **Repro:** set `deductible.2027` to UNVERIFIED (or remove `annual_maximum.2027`), then simulate a 2027 claim with `as_of` in 2026.
- **Actual:** the line is `NEEDS_CONFIRMATION` with `issues: []`, and there is no blocking issue at simulation level either. The care plan returns `OK` at $1,426. Every 2027 option has disappeared, and `unresolved` gives no reason.
- **Expected:** a blocking `RULE_UNVERIFIED`/`RULE_MISSING` with the rule id (CONTRACT §1.6, §3.3), downgraded to a warning in `unresolved` (§5.3).
- **Test:** `fresh-period-silent-confirmation.test.ts`

### P1-2 — OON allowance amounts have no supporting evidence
- **Owner:** dental-benefits — `data/plans/nwd-ppo-standard-{2026,2027}.json`, rule `oon_allowance_schedule.<y>`
- **Repro:** the only quote is the table header `| Procedure code | Out-of-Network Allowance |`. None of $40/$65/…/$950 appears in any quote, yet those numbers price every BrightSmile option ($52 + $20 plan pay).
- **Expected:** quote each row used, for example `| D0140 | $65 |`.
- **Test:** `evidence-supports-values.test.ts`

### P1-3 — Red-flag route still offers a later option to save money
- **Owner:** dental-optimizer — `src/optimizer/navigator.ts` (label picks, around line 280)
- **Repro:** set swelling = true. The options are BrightSmile Oct 8 `[best_overall, soonest]` **and Rivera Oct 15 `[lowest_cost]`**, which is $108 less and 7 days later.
- **Expected:** spec §5 says "Do not recommend delay to save benefits" and CONTRACT §4.1 says "no option may suggest delay". Under urgency, drop later lowest_cost options. The contract's label table permits it today, so the Planner should clarify it.
- **Test:** `urgent-route-no-delay.test.ts`

### P2-1 — Red flag combined with an unresolvable plan returns NEEDS_CONFIRMATION and 0 options
- **Owner:** dental-optimizer — `navigator.ts` (around lines 189-198)
- **Detail:** `safety.urgent` is true, but the status is not `URGENT_CARE_ROUTE` (§4.8) and no appointment is shown.
- **Test:** `urgent-route-no-delay.test.ts`

### P2-2 — Explanation validator accepts fabricated amounts, dates and forbidden phrases in other formats
- **Owner:** dental-uxapi — `src/ai/explain.ts:192-201`, `:243`
- **Amounts not caught:** "1,999 dollars", "$ 1,999", "USD 1999", "＄1999", "$1,99", "$1,372.999" (read as $1,372), "$1,372 and 50 cents".
- **Dates not caught:** "November 6, 2026", "Nov 6 2026", "11/06/2026", "Nov. 6, 2026".
- **Forbidden phrases not caught:** "guar​anteed", "benefits␣␣expire".
- **Impact:** this is latent until a live explainer exists, because the template explainer is safe.
- **Test:** `explanation-validator-bypass.test.ts`

### P2-3 — Injection scanner bypassed by whitespace and Unicode variants
- **Owner:** dental-uxapi — `src/ai/index.ts:26-38`
- **Not caught:** NBSP, tab, double space, ZWSP, full-width letters and soft hyphen in "ignore previous instructions", "disregard" and "set the annual maximum".
- **Fix:** normalize the text (NFKC, strip `\p{Cf}`, collapse `\s+`) before matching.
- **Impact:** in synthetic mode the parser ignores free text, so this is latent for live mode.
- **Test:** `injection-scanner-bypass.test.ts`

### P2-4 — Origin check trusts a client-supplied X-Forwarded-Host
- **Owner:** dental-uxapi — `src/api/server.ts:27`
- **Repro:** send `Origin: https://evil.example` together with `X-Forwarded-Host: evil.example`. The request passes the cross-origin check.
- **Mitigation:** browsers send a preflight here, and it gets no CORS headers.
- **Expected:** compare against `Host` (§7), or against X-Forwarded-Host only behind a trusted proxy.
- **Test:** `server-origin-check.test.ts`

## Handoff

```text
Files changed
  tests/integration/{independent-calculator,fresh-period-silent-confirmation,evidence-supports-values,
  urgent-route-no-delay,explanation-validator-bypass,injection-scanner-bypass,server-origin-check}.test.ts
  docs/review/REVIEW.md
Interfaces consumed
  @/benefits benefitEngine (simulate, loadRegistry), @/optimizer navigator/optimizer, @/ai public API, tests/acceptance/helpers
Tests run and results
  npm run test:acceptance  -> 13 files, 97/97 passed
  npm run test:integration -> 7 files, 9 passed / 29 failed (all failures = defects above)
Assumptions
  Live AI is not built, so the validator and scanner defects are P2 (latent).
Unresolved issues
  P1-1, P1-2, P1-3 need fixes before the repair gate. P1-3 also needs a Planner ruling on the §4.6 labels under urgency.
Requested shared-contract changes
  §4.6: under URGENT, allow only options with the soonest date (or no lowest_cost label).
  §6.4: widen the amount and date grammars and normalize text before the forbidden-phrase check.
```

---

# Pass 2: contract 1.3.0 fixes, end-to-end API and the care-window page (2026-10-04)

Results: backend `npx vitest run` passed 25 files and 182/182 tests before the pass-2 probes were added. `check:frozen` passed with 62 files. `golden:check` passed, though its banner still says "contract 1.2.0 rules". `typecheck` and `lint` are clean. On the frontend, `typecheck` and `lint` are clean and `npm test` passed 9 files and 126/126 tests. `test:integration` now passes 49 tests and fails 5 across 8 files. All 5 failures are P2-5.

## Pass-1 fixes re-verified at the root

- **P1-1:** fixed. The fresh-period branch now raises a blocking rule issue. These variants all block and appear in `unresolved`: `annual_maximum.2027` UNVERIFIED, `annual_maximum.2027` CONFLICT, `deductible.2027` removed, and `plan_share.in_network.basic.2027` UNVERIFIED.
- **P1-2:** fixed. Each OON row is quoted, for example `| D0120 | $40 |`.
- **P1-3 and P2-1:** fixed in `navigator.ts`. Under a red flag only options on the soonest date are offered, and an unresolvable plan still returns `URGENT_CARE_ROUTE`. The variant with only out-of-network providers stays urgent and offers nothing later.
- **P2-2, P2-3 and P2-4:** fixed. Text is normalized before the checks, and the origin check now compares against `Host`.

## End-to-end evidence chain (live server, flow: extract, confirm, care-plan)

The recommended plan is `alt-1`: member pays $1,372, plan pays $908.

- Every operand cites `input:`, `rule:` or `calc:`.
- The 2027 line uses `rule:deductible.2027` ($75) and `rule:annual_maximum.2027` ($1,500). Both quotes are literal ("Individual deductible: $75…", "Annual maximum: $1,500…").
- All events in both alternatives fall inside the dentist's windows. The crown comes 16 days after the root canal, within the 14–60 day gap.
- Each service date picks the matching plan year: 2026 dates use 2026 rules and the Jan 5, 2027 date uses 2027 rules.
- When the swelling red flag is set, the result has one option, on the soonest date, with the urgent message.

## Defects

### P1-4: Every POST from the /care-window page through the Next rewrite is rejected as cross-origin
- **Owner:** dental-uxapi. Location: `src/api/server.ts:20-29`, with `frontend/next.config.ts` and `frontend/.env.example`.
- **Repro:** run `CAREWINDOW_ENGINE_URL=http://localhost:4011 next dev -p 3011`, then `curl -X POST localhost:3011/api/engine/visit-navigator -H 'Origin: http://localhost:3011' …`.
- **Result:** HTTP 400 "cross-origin request". The Next proxy uses `changeOrigin: true`, so `Host` becomes the backend host while `Origin` stays the page origin, and browsers always send `Origin` on POST.
- **Effect:** the scenario loads, but the passport, navigator, extraction, care plan and explanation all fail. `ALLOWED_ORIGINS` is documented only in a comment in `server.ts`.
- **Expected:** the page works with the documented setup. Either document and default `ALLOWED_ORIGINS=http://localhost:3000` in both the README and `.env.example`, or strip `Origin` in the rewrite.

### P2-5: The explanation validator still misses symbol-after and day-first formats
- **Owner:** dental-uxapi. Location: `src/ai/explain.ts:198`, `:214-215`.
- **Not caught:** "1999$", "1.999,00 $", "6 November 2026", "11/6/26" and "2026/11/06". This stays latent until live AI exists. Spelled-out numbers are out of scope.
- **Test:** `tests/integration/pass2-variants.test.ts`.

There is no other P0 or P1.
