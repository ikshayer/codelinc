# codeLinc 11: choose Dental; build CareWindow

October 3, 2026. Four developers; **14–18 build hours remain; no working app yet**. Five-minute demo. This replaces the previous Life-only track recommendation.

**Recommended track: Dental. Confidence: Medium.**

Build **CareWindow — “Understand the bill. Compare timing your dentist permits.”** An employee brings an existing dentist-prescribed treatment plan. AI proposes editable facts from treatment/benefit text; the employee confirms. Deterministic code calculates estimated patient cost and compares only schedules explicitly permitted by the dentist. A deadline change immediately removes a cheaper, disallowed option.

## Why choose it

1. One working task covers the challenge's intake, coverage explanation and sequencing requirements, with maximum tracking built into its ledger.
2. A timeline and bill change provide a stronger five-minute before/after than another coverage estimate. The refusal of a cheaper but disallowed schedule makes technical creativity visible.
3. Four procedure events across two years create meaningful, manageable computation without live claims, pricing or carrier APIs.
4. No working Life app needs to be abandoned. The team has enough time for this limited scope if the engine is verified early.

The tradeoff is real: **Life has stronger reported coach support, easier calculation and more polish margin.** Dental adds plan-rule verification and clinical-timing boundaries. A general-purpose dental optimizer is outside tonight's scope.

Competition is substantial. Carriers already provide estimates, and [CareStack documents treatment phases and insurance breakdowns](https://carestack.zendesk.com/hc/en-us/articles/25880123845780-Create-a-Treatment-Plan-Add-Treatments). Differentiate through the complete transparent comparison and constraint behavior, not a claim that timelines or estimates are new.

Target people with substantial prescribed care, not all employees. [NADP's 2026 summary of 2024 data](https://www.nadp.org/dental-benefits-respond-to-affordability-challenges-takeaways-from-nadps-state-of-the-market-report/) reports fewer than 5% of members reaching their annual maximum. Do not pitch year-end benefit consumption as a universal need.

## Exactly what to build

Three screens: **Describe → Confirm → Compare**.

**P0:** one person, one supported simple PPO, four events, two benefit years; text intake; editable confirmed rules/fees; dentist-supplied windows/dependencies; chronological deductible/maximum ledger; real permitted-schedule comparison; patient totals and per-year meters; clickable arithmetic trace; instant edits; manual fallback; synthetic data and server-side secrets. Unknown permission blocks movement. Unsupported plans/rules are flagged rather than silently approximated.

**P1:** separately supplied in-network/out-of-network comparison, then a printable discussion summary, only after P0 works.

**P2 / cut:** login, claims ingestion, live prices, broad carrier support, arbitrary PDF/OCR, calendar/email reminders, booking, clinical advice, orthodontics, secondary insurance, family accumulators and rollover.

## Demo fixture and defining behavior

Use clearly labeled **synthetic plan/fees**, not Lincoln's actual plan. Maximum $1,500; $400 remains this year; current $50 deductible already met; next-year deductible resets to $50. Basic insurer share 80%, major 50%. Preventive cleaning is exempt from deductible/maximum in this sample. Eligibility is confirmed; next-year plan and fees are assumed unchanged.

Prescribed care: cleaning $150; two fillings $200 each; crown $1,500. Cleaning/fillings stay this year; the fictional dentist permits either year for the crown.

- **All this year:** patient $1,500; insurer $550.
- **Crown in next permitted year:** patient $855; insurer $1,195.
- **Conditional difference:** $645. Next-year crown payment includes the renewed deductible: 50% × ($1,500 − $50) = $725.
- **Wow:** change the dentist's crown deadline to this year. The later option disappears and savings become $0.
- **Counterexample to test:** with $1,500 remaining this year, all-now patient cost is $830 versus $855 later. The engine must choose all-now.

An annual maximum limits insurer payments, not patient spending. Leave the sample's unused $80 alone; do not encourage unnecessary treatment to consume benefits. No promised payment or app-selected delay.

## Four-person delivery plan

| Owner | Deliverable |
|---|---|
| Developer 1 | Ledger, permitted-schedule enumerator, independent expected totals and edge cases. |
| Developer 2 | Confirmation cards, compared timelines, meters, edits and arithmetic trace. |
| Developer 3 | AI extraction/explanation through a validated contract; manual fallback. |
| Developer 4 | Early integration, security boundaries, user walkthroughs, pitch and polish. |

First 30 minutes: coach answers, storyboard and shared contract. By hour 3: verified math plus deadline constraint. By hour 6: integrated manual flow. By hour 9–10: all P0 behavior works. **Freeze at least four hours before presenting.** Rehearse on the presentation machine and record the working path as backup.

Switch to optimized FamilyMap if the hour-3 engine/constraint gate fails, if live inaccessible Lincoln data is mandatory, if the proposed clinical-permission workflow is unacceptable, or if coaches establish a much stronger Life adoption case while confirming this Dental task is already solved internally. General Life preference alone does not establish judging weights.

## Five-minute demonstration

| Time | Show |
|---|---|
| 0:00–0:30 | Existing prescribed care plus confusing benefits: what will the employee owe? |
| 0:30–1:30 | AI proposes facts; user confirms rules, fees and dentist-permitted windows. |
| 1:30–2:30 | All-current-year $1,500 patient result and crown payment trace. |
| 2:30–3:30 | $855 permitted comparison, then deadline edit removes it. |
| 3:30–4:10 | Confirmed/assumed facts and a useful dentist/insurer discussion summary. |
| 4:10–4:40 | Interpretation → confirmation → ledger → permitted schedules → explanation; synthetic data and security boundaries. |
| 4:40–5:00 | Return to timelines: financial clarity within the dentist's care requirements. |

## Exactly five coach questions

1. Between Life education and Dental treatment planning, which has a named internal owner who would review a successful prototype after this event, and what specific unresolved customer task would that owner want it to address?
2. Inside Lincoln's current DentalConnect experience, can members already compare the same prescribed treatment across benefit years with deductible resets and dentist-permitted timing, and where does that workflow still fail?
3. Would Lincoln consider a dental comparison acceptable when all movable dates must be explicitly allowed by the dentist, or is there an operational/compliance constraint that would rule out that product behavior?
4. What approved sample plan, fee estimate or utilization data can you provide now, and is a prototype using clearly labeled synthetic, confirmed inputs sufficient, or must it demonstrate live Lincoln data?
5. For the people judging this event, is there any track-specific expectation or unstated core requirement that would disadvantage either bounded concept, and what concrete weakness caused otherwise polished insurance projects to score poorly in past events?

The companion final track review contains all ten rubric assessments, dental competitor/customer research, 25 comparison dimensions, both demo scripts, failure modes and the full buildability audit. The earlier Life research remains background, not the current track decision.
