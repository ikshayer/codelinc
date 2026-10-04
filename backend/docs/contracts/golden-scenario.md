# Golden scenario — hand arithmetic

All values in `fixtures/golden/expected.json`. They are checked by an independent brute-force enumeration, `npm run golden:check` (`scripts/golden-check.mjs`; it never imports `src/`), which asserts every golden number to the cent. **Re-run it if any fixture, rule or ranking clause changes** (it is part of `npm run verify`).

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
