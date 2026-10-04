# Golden scenario — hand arithmetic

All values in `fixtures/golden/expected.json`. They are checked by an independent brute-force enumeration, `npm run golden:check` (`scripts/golden-check.mjs`; it never imports `src/`), which asserts every golden number to the cent. **Re-run it if any fixture, rule or ranking clause changes** (it is part of `npm run verify`).

**1.4.0:** numbers unchanged, re-verified by `npm run golden:check` (every golden office is verified against `nwd-ppo`; the one cash quote is valid through 2027-06-30).

Base case counts: 840 combinations (each procedure may also be left unscheduled) → 547 dependency-feasible with no NEEDS_CONFIRMATION line (81 more use 2027 self-pay, whose claim-submission rule is UNKNOWN) of which **396 are complete schedules**. The 1.1.0 self-pay rule removes 21 partial schedules (self-pay not strictly cheaper than the same schedule with a claim); all 396 complete schedules remain. The 1.0.0 count of "396" was complete schedules only; the unscheduled option was never exercised, which hid the pass-1 bug fixed in 1.1.0 (below).

## Inputs (synthetic)

- **Member** Alex Morgan (synthetic), America/New_York. Plan key `northwind-mutual / acme-synthetic-001 / ppo-standard / VA / nwd-ppo`.
- **2026 snapshot** (observed Oct 5, CLAIM_EOB): deductible remaining $50, annual max remaining $900, plan paid YTD $600.
- **Pending claim** D2391 tooth 3, Sep 28, 2026: estimated plan pay $76, estimated deductible $50.
- **FSA 2026**: $1,200, services through Dec 31, 2026, claims by Mar 31, 2027. **Budget**: hard $300/month, preferred $200.
- **Availability**: Tue/Thu 08:00–18:00, Sat 09:00–13:00; away Nov 24–28 and Dec 21–Jan 3. **Travel** hard limit 15 miles.
- **Plans**: 2026 and 2027 PPO Standard. Deductible $50 (2026) / $75 (2027), applies to Basic and Major. Annual max $1,500, counts Basic and Major only. In-network 100/80/50%, out-of-network 80/60/40% of the OON allowance. 2026 allows paying a network dentist directly without a claim; 2027 does not address it (UNKNOWN).

| Provider | Network | Miles / min | Prices used (charge / allowed / cash) |
|---|---|---|---|
| Rivera Family Dentistry | in | 4.2 / 14 | D0140 $110/$75 · D0220 $40/$30 · D3330 $1,450/$1,000 · D2740 $1,600/$1,100 · D2392 $260/$180/cash $150 |
| BrightSmile Dental Studio | out | 2.1 / 9 | D0140 $135 · D0220 $45 · D3330 $1,300 · D2740 $1,500 · D2392 $250 |
| Lakeside Family Dental | in | 22.0 / 41 | excluded (travel) |

## Before the visit (as of Oct 5, 2026; limited exam D0140 + periapical D0220)

| Option | Slot | Plan pays | You pay | Why |
|---|---|---|---|---|
| **Rivera** — best overall, lowest cost | Thu Oct 15 16:00 | $75 + $30 = $105 (100% of allowed) | $0 | Diagnostic & Preventive: no deductible, not counted toward the maximum. Network discount $45. |
| **BrightSmile** — soonest | Thu Oct 8 09:00 | 80% × min($135, $65) = $52; 80% × min($45, $25) = $20 → $72 | $180 − $72 = $108 (includes $90 balance bill) | Out-of-network allowance. |

Tradeoff: BrightSmile is **$108 more, 7 days sooner, 2.1 miles closer, 5 minutes shorter**. Excluded: Rivera Mon Oct 12 (member unavailable), BrightSmile Tue Oct 6 19:00 (after hours), Lakeside (22 miles > 15).

## After the visit (as of Oct 15, 2026)

Dentist card: root canal D3330 #30 (Act now; Oct 16 → target Oct 20 → latest Oct 30); crown D2740 #30 (Schedule soon; ≥14 and ≤60 days after the root canal; Oct 30 → Nov 15 → Dec 15); filling D2392 #14 (Can plan later; Oct 16 → Feb 28, 2027 → Mar 31, 2027).

**Opening 2026 state:** available maximum = $900 − $76 pending = **$824**; available deductible = $50 − $50 pending = **$0**.

### Alternative 1 — lowest total cost **and** smoothest payments ($1,372)

| Event | Plan math | Plan pays | You pay | Funding |
|---|---|---|---|---|
| Root canal, Tue Oct 20, Rivera | 80% × ($1,000 − $0) = $800 ≤ $824 | $800 | $200 | FSA $200 |
| Crown, Thu Nov 5, Rivera (16 days after) | 50% × $1,100 = $550, capped at $24 available | $24 | $1,076 | FSA $1,000 + cash $76 |
| Filling, Tue Jan 5, 2027, Rivera | 2027 resets: deductible $75; 80% × ($180 − $75) = $84 | $84 | $96 | cash $96 |

Totals: charges $3,310 = plan $908 + you $1,372 + network discounts $1,030. Monthly cash: Oct $0, Nov $76, Jan $96 (peak $96). FSA fully used. Objective: lateness 0, travel 42 min, 3 visits, 108 waiting days, completion Jan 5, 2027.

### Alternative 2 — earliest safe completion ($1,426)

Root canal Oct 20 ($200), filling **Thu Oct 22 paid directly at the verified $150 cash price** (no claim, so no maximum used), crown Nov 5 ($1,076). Cash $226 in November (under the $300 hard limit). Completion Nov 5. Paying cash beats submitting the claim here: a 2026 claim would pay only $24 on the filling (the rest of the maximum) and then leave $0 for the crown (total $1,456).

### Variants

| Variant | Result |
|---|---|
| Hard budget $40/month | Pass 2, status `BUDGET_SHORTFALL`, same dates as Alternative 1, gap $92 ($36 Nov + $56 Jan). Deadlines unchanged. *Contract 1.1.0:* pass 1 only admits schedules that leave no more care unscheduled than the best eligible schedule. Under 1.0.0, "root canal + crown unscheduled" had zero shortfall and won pass 1 — dropping the crown to fit the budget. |
| No Tuesday availability | Root canal Thu Oct 22 (2 days after target, inside the Oct 30 limit — the Sat Oct 17 out-of-network option would exceed the $300 hard limit), crown Nov 5, filling Thu Jan 14, 2027. Same $1,372. |
| Office has not confirmed self-pay | No self-pay anywhere. Earliest completion costs $1,456. |
| No pending claim | Root canal applies the $50 deductible: plan $760, you $240; crown plan $140, you $960; total $1,296. |
| Pending estimate is a range $60–$76 | Crown you pay $1,060–$1,076; total $1,356–$1,372; same schedule. |
| Dentist says the filling must be done in 2026 | The 2027 option disappears. Cheapest is self-pay on Thu Dec 3 ($150 cash, peak monthly cash $150); earliest completion keeps Oct 22. Total $1,426 either way. |
| Annual maximum rule removed (AT-01) | Every 2026 claim needs confirmation; only the filling could be planned (2027 claim or 2026 self-pay). Because missing data — not the calendar — is what leaves the root canal and crown unscheduled, the result is `NEEDS_CONFIRMATION` with no alternatives (1.1.0 §5.3). |
| Red-flag symptom (swelling) | `URGENT_CARE_ROUTE`; the soonest appointment (BrightSmile Oct 8) is "best overall". |

## Cash vs claim (contract 1.2.0, CONTRACT §5.9)

Each event with a cash quote (only Rivera's filling, D2392 $150) compares the **whole** schedule, worst case, with that event as an in-network claim vs paid cash, everything else unchanged. Re-derived by `npm run golden:check`.

| Case | Event | Claim total | Cash total | Difference | Winner |
|---|---|---|---|---|---|
| Base, earliest completion (chosen: cash) | Filling Thu Oct 22, 2026 | $1,456 | $1,426 | $30 | Cash |
| Base, lowest cost (chosen: claim) | Filling Tue Jan 5, 2027 | $1,372 | unknown — `RULE_UNKNOWN claim_submission.2027` | — | — |
| Filling this year, lowest cost (cash) | Filling Thu Dec 3, 2026 | $1,456 | $1,426 | $30 | Cash |
| Filling this year, earliest (cash) | Filling Thu Oct 22, 2026 | $1,456 | $1,426 | $30 | Cash |
| Office self-pay unknown, earliest (claim) | Filling Thu Oct 22, 2026 | $1,456 | unknown — `SELF_PAY_NOT_VERIFIED` (`provider.prov-rivera.self_pay`) | — | — |

Oct 22 claim: root canal $200 + filling $156 (the plan pays the last $24 of the maximum) + crown $1,100 (the maximum is gone, plan pays $0) = $1,456. Cash: $200 + $150 + $1,076 (the crown gets the $24) = $1,426. Root canal and crown have no cash quote → no comparison.

## Maximum carryover (contract 1.5.0, CONTRACT §3.9 and §5.10)

Rule (2026 Maximum Carryover Rider, read by hand): a carryover of $250 is earned when 2026 plan payments that count toward the annual maximum total **less than** $500 (exactly $500 does not earn); at least one such paid claim; no in-network bonus; balance capped at $1,000; not qualifying ends the balance; it applies only to `nwd-ppo-standard-2027`. Worst case (the ranking scenario) never adds a carryover. Re-derived by `npm run golden:check` (`scripts/golden-check.mjs` computes the outcome and the shift itself; it never imports `src/`).

**Existing numbers unchanged, re-verified by golden:check.**

### Base scenario — not earned in every alternative

| Alternative | Settled (plan paid YTD) | + simulated 2026 plan pay toward the maximum | + pending | Qualifying | Status | Final bank |
|---|---|---|---|---|---|---|
| 1 (lowest cost) | $600 | $800 root canal + $24 crown = $824 | $76 | $1,424 – $1,500 | NOT_EARNED | $0 |
| 2 (earliest) | $600 | $800 + $24 (the cash filling never counts) = $824 | $76 | $1,424 – $1,500 | NOT_EARNED | $0 |

`lost_to_cap` $0, `forfeited` $0 (balance $0). Every base event has `rollover_shift: null`: the root canal and crown are not `can_plan_later`, the 2027 filling is in a year with no carryover feature, and the Oct 22 cash filling has no plan payment. The root canal alone pays $800, so 2026 can never qualify.

### Variant `rollover_near_threshold`

Inputs: 2026 deductible remaining $0, annual maximum remaining $1,080, plan paid YTD $420, carryover balance $0, no pending claims; procedures = the flexible filling only (D2392 tooth 14, Oct 16, 2026 – Mar 31, 2027, `can_plan_later`).

| Alternative | Event | Plan pays | You pay | Qualifying | Status |
|---|---|---|---|---|---|
| 1 [lowest cost, smoothest] | Rivera Tue Oct 20, 2026, in network: ($180 − $0) × 80% | $144 | $36 | $420 + $144 = $564 | NOT_EARNED |
| 2 [earliest] | BrightSmile Sat Oct 17, 2026, out of network: min($250, $150 allowance) × 60% | $90 | $160 | $420 + $90 = $510 | NOT_EARNED |

Rollover shift (display only), first 2027 candidate at the same office and route:

| Alternative | Moved to | 2027 plan pays | 2027 you pay | Status if moved | Final bank if moved | Cost change |
|---|---|---|---|---|---|---|
| 1 | Tue Jan 5, 2027 (`prov-rivera-t-20270105-1000`) | ($180 − $75 deductible) × 80% = $84 | $96 | CONDITIONAL ($420 < $500) | $250 | +$60 |
| 2 | Sat Jan 9, 2027 (`prov-brightsmile-t-20270109-0900`) | ($150 − $75) × 60% = $45 | $205 | CONDITIONAL | $250 | +$45 |

## Plan options (contract 1.6.0, CONTRACT §3.10)

`fixtures/golden/expected.json` → `plan_options`, re-derived by `scripts/golden-check.mjs` from its own hand transcription (`OPTIONS_2026`). Fresh 2026 member per option (full deductible and maximum, nothing paid, carryover $0); events in network at Rivera: E1 D2392 tooth 19 on 2026-11-02 (allowed $180), E2 D2740 tooth 30 on 2026-11-16 (allowed $1,100).

| Case | E1 deductible / plan / member | E2 plan / member | Plan / member total | Max left | 2026 carryover |
|---|---|---|---|---|---|
| Standard | $50 / (180 − 50) × 80% = $104 / $76 | 1,100 × 50% = $550 / $550 | $654 / $626 | $846 | NOT_EARNED ($654 ≥ $500) |
| Value | $100 / (180 − 100) × 70% = $56 / $124 | 1,100 × 40% = $440 / $660 | $496 / $784 | $504 | none (no feature) |
| Value, effective 2026-06-01 | $100 / $56 / $124 | NOT_COVERED (12-month Major wait) / $1,100 | $56 / $1,224 | $944 | none |
| Enhanced | $50 / 130 × 90% = $117 / $63 | 1,100 × 60% = $660 / $440 | $777 / $503 | $1,723 | NEEDS_CONFIRMATION (`nwd-ppo-enhanced-2027` not seeded) |

Listing on 2026-10-15 (order by option id): Enhanced $31.60/month, $50 deductible, $2,500 maximum, Basic 90%, orthodontic lifetime $1,500; Standard $18.25, $50, $1,500, 80%; Value $9.80, $100, $1,000, 70%.

The 1.6 R2-M1 change reshapes `settled_plan_paid_cents: X` to `settled_plan_paid: {X, X}` in the four existing rollover entries; no number changed.

## Modes (1.7)

`CarePlanRequest.preferences.mode` (default `BALANCED`) picks which ranking key's winner is recommended (`alt-1`). The pool and the safety rules are unchanged in every mode; the label order inside one alternative is `lowest_member_cost`, `lowest_total_cost`, `earliest_safe_completion`, `smoothest_monthly_payments`. Expected values live in `expected.json` -> `postvisit.modes` and are re-derived independently by `scripts/golden-check.mjs`.

| Mode | Key (after unscheduled care, and shortfall) | alt-1 on the base scenario | Member cost | alt-1 labels |
|---|---|---|---|---|
| BALANCED | lateness vs dentist targets, then total cost, then peak | crown 2026-11-05, filling 2027-01-05 (claim), root canal 2026-10-20 | $1,372 | `lowest_total_cost`, `smoothest_monthly_payments` |
| LOWEST_TOTAL_COST | total cost first, then lateness, then peak | same schedule (the cheapest one is already on target dates) | $1,372 | `lowest_member_cost`, `lowest_total_cost`, `smoothest_monthly_payments` |
| EARLIEST_SAFE_COMPLETION | completion date, then cost | crown 2026-11-05, filling 2026-10-22 (self-pay), root canal 2026-10-20 | $1,426 | `earliest_safe_completion` |
| SMOOTHEST_PAYMENTS | peak monthly cash, then cost | same as BALANCED | $1,372 | `lowest_total_cost`, `smoothest_monthly_payments` |

The balanced alternatives are exactly the 1.6 golden alternatives (same order, labels and ids). Every non-recommended alternative carries `difference_from_recommended` (this minus alt-1, worst case); on the base scenario alt-2 is +$54.00 member cost, -$84.00 plan pay, +$130.00 peak monthly cash, finishes 61 days earlier, and moves only the filling (2027-01-05 to 2026-10-22, 75 days earlier). `solver_meta` for the base scenario: `OPTIMAL`, 35 candidates, 628 schedules evaluated, 102 rejected, `elapsed_ms: null`.
