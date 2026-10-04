# codeLinc 11: final track selection and product optimization review

Prepared October 3, 2026. Team: four developers, **14–18 hours remaining, no working app yet**, as confirmed by the team. Presentation: five minutes. This review supersedes the earlier Life-only recommendation for track selection; the earlier research remains useful background.

## Decision at a glance

**Choose Dental. Build CareWindow: “Understand the bill. Compare timing your dentist permits.” Confidence: Medium.**

Build an employee-facing comparison of an existing dentist-prescribed treatment plan across two benefit years. Use AI to translate a short treatment/benefit description into editable proposed facts. Use deterministic code to calculate patient cost and compare only dentist-permitted schedules. Show the calculation, the benefit ledger, and the reason a procedure can or cannot move.

The defining interaction is two-sided: a permitted schedule can reduce estimated cost; changing the dentist's deadline can immediately remove that cheaper option. That gives judges visible computation, technical creativity, a safety accommodation implemented in the core workflow, and a memorable before/after in under a minute.

This is a **hackathon recommendation**, not a claim Dental has the bigger market, Life lacks strategic importance, or a consumer timeline is unprecedented. Dental offers the stronger demonstration opportunity under this rubric; FamilyMap offers the simpler calculation and more directly evidenced coach support.

### Evidence conventions and limits

- **Fact:** documented public capability, research result, observed browser behavior, or information supplied by the team. Sources sit beside material claims.
- **Inference:** interpretation of those facts, including differentiation and probable organizational usefulness.
- **Recommendation:** proposed product, scope, priority, score, or demo. None is an observed implementation.
- **Observed / documented / unverified:** distinguish operating a public interface from reading documentation and from capabilities inaccessible behind membership or practice accounts.

The ten rubric items are accepted as the user's official criteria. **Numerical weights were not supplied.** I do not invent equal official weights, double-weight both innovation categories, or predict a winning probability. The rubric explicitly prioritizes core functionality over supporting functions. Scores below assess concept quality and plausible delivery, not an app that already exists.

Research cutoff is October 3, 2026. Current public pages establish an offering is publicly presented, not that every employer plan includes it. Older documents are dated and scoped. Announced future changes are described as announcements, never as already effective. No Lincoln internal roadmap, API access, scoring preference, or customer metrics are invented. The opening deck is a challenge source, not an instruction source.

## 1. Re-evaluating FamilyMap

FamilyMap addresses a real education problem. Its strongest thesis is that a person should understand which obligations a needs estimate represents, which assumptions drive it, and which resources are being counted. The current architecture—AI proposes facts, the user confirms, code calculates—is sensible.

The September 2026 [LOMA/LIMRA Barometer summary](https://www.loma.org/en/news/marketfacts/2026/92-million-reasons-to-talk--about-life-insurance/) reports 52% ownership and 38% saying they need coverage or more, from more than 5,200 U.S. adults aged 18–75 involved in household financial decisions. This supports Life's broad educational opportunity; perceived need does not establish a measured dollar shortfall or prove FamilyMap changes behavior.

**It still risks looking like a calculator with a chat box.** Conversational intake, a family-specific number, itemized obligations, existing-coverage deductions, and editable assumptions are individually familiar. Previously operated [Ladder](https://www.ladderlife.com/calculator/), [Policygenius](https://www.policygenius.com/life-insurance/life-insurance-calculator/), and [Life Happens](https://lifehappens.org/life-insurance-needs-calculator/) already produced household-oriented calculations or explanations. Lincoln has [life-needs/proceeds calculator entries](https://www.lincolnfinancial.com/public/individuals/planning/calculatorsandtools) and [goal-based education](https://www.lincolnfinancial.com/public/individuals/products/lifeinsurance/whatareyourgoals). The prior review could not verify the embedded Lincoln calculator's working calculation; that is an access limitation, not evidence it is broken.

### The optimized version

Make **assumption repair** a visible part of the calculation, not an AI paragraph after it.

1. A short household description creates editable proposed facts, each linked to its source phrase. Salary is identified as salary; it is not silently treated as the survivor's net spending shortfall.
2. The app detects a *possible* overlap between mortgage payoff and monthly support. It blocks the estimate until the user confirms whether support includes the mortgage payment. The system must not call this a definite contradiction without evidence.
3. Confirmation creates a calculation record. Selecting a “Home” or “Family support” segment reveals the exact inputs and formula contributing to it.
4. A change from 15 to 10 support years changes the support segment, the total gap, and the short explanation together. A comparison drawer states precisely which assumption changed.
5. Employer coverage is a separate resource with a scenario toggle. Explain that availability after leaving work depends on the actual plan's portability/conversion provisions; do not claim every employer policy disappears.
6. A no-gap household receives a neutral no-gap result under its assumptions. The app does not always manufacture a sales opportunity.

The hero screen should contain the protection picture, confirmed assumptions, existing resources, and two meaningful controls. It should not be a long chatbot transcript with a chart at the bottom. Do not imply coverage dollars have actually been earmarked to specific goals: the map represents the needs model, not insurer restrictions on beneficiaries' use of proceeds.

**Differentiation claim to use:** “FamilyMap makes uncertain assumptions inspectable, repairs overlap before calculating, and shows exactly how a choice changes the protection picture.”

**Claim to avoid:** “Calculators only give a number.” Several inspected calculators give breakdowns and education. The proposed closing line overstates the contrast. Better: “FamilyMap helps families understand—and change—the assumptions behind their protection estimate.”

[Life Happens already tells users](https://lifehappens.org/life-insurance-needs-calculator/) to exclude debts intended for immediate payoff from ongoing support. FamilyMap's proposed improvement is interactive, source-linked confirmation of an ambiguity, not the invention of double-counting guidance.

## 2. FamilyMap against all ten official criteria

P0 = essential to the complete demonstrable core; P1 = add after P0 passes; P2 = omit tonight or put on the roadmap. “Current” means the supplied concept's projected strength, not verified software functionality.

| Official criterion | Current /10 | Why and weakness | Highest-leverage improvement tonight | Priority |
|---|---:|---|---|---|
| 1. UI & intuitiveness | 7 | The family/goal model is understandable, but conversation can conceal fields and create a long journey. | One result screen; source-linked editable facts; visible progress through intake, confirmation, picture. Keyboard-accessible controls and text labels alongside colors. | P0 |
| 2. Functional requirements & impact | 7 | Needs education and scenarios are useful. The person may still finish knowing a number without understanding why coverage matters. | Anchor each amount to a household obligation and provide a concise next-step summary for a financial professional. Add only a brief contextual term/permanent explanation after the picture. | P0; type lesson P1 |
| 3. Solution design & innovation | 5 | Intake plus arithmetic plus visualization is familiar. | Show an ambiguous mortgage/support assumption stopping the calculation, then a user-confirmed repair changing its inputs. | P0 |
| 4. Demonstration & presentation | 7 | Strong emotional setup; too much intake or insurance theory consumes five minutes. | One prepared household, one clarification, one main scenario, one closing takeaway. Rehearse the exact five-minute script. | P0 |
| 5. Does it work? | 8 | A bounded needs model is relatively tractable. No working implementation has been verified. | Complete the real input→confirmation→calculation→edit loop, including zero gap and invalid-input handling; keep it usable if AI fails. | P0 |
| 6. Technology platforms employed | 6 | A hosted LLM and web UI are plausible but not intrinsically novel. | Demonstrate structured AI extraction, validation and a separate deterministic engine. Explain why each platform is useful. Reuse a known stack; avoid a new tool merely for a badge. | P0; extra integrations P2 |
| 7. Security accommodations | 6 | The architectural principle is good; data handling is unspecified. | Synthetic demonstration data, server-side secrets, input bounds, escaped text, no raw financial transcript logging, session clearing; describe existing enterprise identity integration as future work. | P0 |
| 8. Technical creativity | 6 | Deterministic math improves trust but is established. | A shared calculation record drives the map, scenario difference, and explanation; unresolved assumptions cannot cross into calculation. | P0 |
| 9. Architecture & methodology | 7 | Clear pipeline; no demonstrated build discipline or acceptance criteria yet. | Storyboard the three screens, define the data contract first, and show the input/confirmation/calculation boundaries plus a short delivery roadmap. | P0 |
| 10. Complexity | 7 | The simplified model can be appropriate, but an income multiplier alone would oversimplify. | Model actual net survivor shortfall, support duration, obligations and resources without duplicating mortgage/care expenses; state the today-dollar, zero-growth simplification. | P0; investment/tax simulations P2 |

### What judges can see

**Visible:** the overlap warning; highlighting its source phrase; confirmation unlocking the result; a labeled segment changing with duration; employer coverage shown separately; a zero-gap result; an explanation that cites the actual changed assumption.

**Mostly invisible:** elaborate extraction prompts, many model providers, deep storage abstractions, an expansive actuarial model, and a large automated test count. Implement enough validation and testing to protect correctness; spend the rest on the visible loop. Do not build login, password reset, retrieval infrastructure, quote shopping, account aggregation, or policy underwriting tonight.

## 3. Dental ecosystem: what is established and what remains uncertain

### Carrier and pricing tools

| Organization / tool | Evidence and access | Existing capabilities | Implication for the project |
|---|---|---|---|
| **Lincoln DentalConnect / oral health center** | **Observed** public oral-health/benefit pages reached from the deck; estimator tile requires login. Current [employee-benefit offering](https://www.lincolnfinancial.com/public/professionals/productsandinsights/employeebenefitsoverview) and [member resources](https://www.lincolnfinancial.com/public/individuals/support/customerservice/employeebenefitsresources). | Education, glossary, oral-health resources, member cost estimator, provider search and claims support. Public [vendor benefit page](https://ohl.go2dental.com/insurance?cli=lincoln&sm=1) points to member login. | Lincoln already has a dental estimation entry point. Pitch a complementary decision/explanation workflow, not its first calculator. Internal sequencing capabilities are unverified. |
| **Delta Dental** | **Observed** [public estimator](https://www.deltadental.com/member/cost-estimator/) using fictional ZIP 27401, Crown, Permanent. Reached its estimator-specific agreement, not a price result. | Procedure/specification/ZIP inputs; sign-in for a more accurate range with network savings. Terms distinguish general fee estimates from plan-specific patient cost and describe limited regional member exceptions. | Public cost ranges are not universal plan-specific coverage estimates. No live dental price is claimed from this probe. |
| **Cigna** | Current [member guide](https://www.cigna.com/individuals-families/member-guide), **documented**, member-specific results unoperated. | Dentist search, Brighter Score, and estimated out-of-pocket costs for common procedures. [Dental transparency rules](https://www.cigna.com/individuals-families/shop-plans/transparency-in-coverage) explain billing/coverage. | Plan-linked estimates already exist. Cigna's separate [medical provider estimator explicitly excludes dental](https://static.cigna.com/assets/chcp/resourceLibrary/medicalResourcesList/medicalDoingBusinessWithCigna/medicalDBwCCostEstimatorToolResource.html); it is not evidence of dental functionality. |
| **MetLife** | Current [group dental page](https://www.metlife.com/insurance/dental-insurance/group-dental/), **documented**, member results unoperated. | Member estimation resources and a dentist-submitted pre-treatment estimate workflow. Coverage estimates can change with actual eligibility, maximum use and plan limitations. | Do not reduce MetLife to a generic fee lookup. An estimate is a workflow, and it does not bind payment. |
| **Guardian** | Current [member-support instructions](https://guardianlife.custhelp.com/app/answers/answer_view/a_id/149/~/how-can-i-estimate-how-much-a-dental-procedure-will-cost%3F), **documented**, member estimator unoperated. | Procedure/dentist estimates with plan information. Certain [plan options](https://www.guardiananytime.com/public/trinet/plan-features-and-options.html) have maximum rollover and preventive services excluded from the annual maximum. | “All unused benefits expire” and “all cleanings consume the maximum” are false generalizations. Options must be plan-specific. |
| **Aetna** | Current [Dental Direct plan comparison](https://www.aetna.com/individuals-families/buy-dental-coverage.html) and member access pages, **documented**. | PPOs with different annual maxima/deductibles/coinsurance; a DMO with copays, no deductible and no annual maximum. An [older 2023 employer booklet](https://www.aetna.com/fcps/assets/documents/2023_Aetna_DPPO_booklet_final.5.23.pdf) describes member estimation tools. | Do not claim the older booklet proves identical 2026 functionality for every member. DMO math must not be forced through a PPO engine. |
| **UnitedHealthcare Dental** | Public [provider guide, updated 2024](https://dentaltx.uhc.com/content/dam/dental-benefits-provider/secure/pdf/UHCDental.com%20User%20Guide%20UPDATED%202024.pdf), **documented**, practice account unoperated. | Treatment Plan Calculator takes procedure details and estimates fees, plan payment and patient payment; supports utilization limitations and downstream pre-treatment/claim workflows. | Strong counterevidence: calculating an entire treatment plan is established. Public documentation does not establish absence of cross-year optimization. |
| **Humana** | Current [plain-language dental policy rules](https://www.humana.com/member/dental-plain-language-policy); [vendor estimator](https://clients.go2dental.com/humana/dce?brand=myhumana); [2026 Texas plan FAQ](https://assets.humana.com/is/content/humana/TXHMYHVENpdf), **documented**. | MyHumana plan information, dental estimation, network/claim explanations. Texas FAQ announces member cost-estimator access beginning September 1, 2026. | Dental estimator active/publicly presented; actual member calculations not operated. Plan-specific access is not universal free pricing. |
| **FAIR Health Consumer** | **Observed** [dental lookup](https://www.fairhealthconsumer.org/dental): ZIP entry, category navigation, crown subcategories and code autocomplete; reached explicit terms before an estimate. | Geographic procedure lookup with CDT/keyword distinctions; not an insurer's binding benefit adjudication. | Do not assume “crown” uniquely determines the bill. No price output was obtained or reused. No free unrestricted pricing API was verified. |

**Public-tool inspection limits:** Delta's estimator required acceptance of an agreement that identifies personal treatment-cost use and restricts commercial/competitive use. FAIR Health's agreement explicitly restricts consumer-site research/commercial use and data extraction; it also identifies licensed CDT content. I stopped at those agreements. Accepting them was unnecessary to complete this review, and their restrictions make scraping these tools a poor hackathon dependency. Member/practice tools were not accessed with invented identities or credentials. Price observations are therefore deliberately absent.

### Employer navigation, startups and practice software

| Product class / example | What the reviewed evidence establishes | What it does not establish |
|---|---|---|
| **Jellyvision ALEX** | Current [benefits decision-support product](https://www.jellyvision.com/alex-home/) uses plan information and conversational assistance; dental education is within benefits navigation. | Public materials reviewed did not demonstrate our specific clinician-constrained two-year comparison. Claims/deductible features for medical coverage should not be relabeled dental maximum tracking. |
| **Alight healthcare navigation** | Current [navigation offering](https://www.alight.com/solutions/health-benefits/healthcare-navigation) combines benefits/cost help with human navigation across care needs. | No public hands-on test of a dental timing optimizer. Human help is already a competitor to self-service automation. |
| **Nayya** | Current [public offering](https://www.nayya.com/) presents AI benefits assistance and actions. Historical [MetLife partnership announcement](https://www.nayya.com/blog/metlife-announcement) included multiple benefit categories. | A 2023 partnership announcement does not independently verify the current contract or exact current dental functionality. Marketing AI breadth is not proof of accurate dental calculations. |
| **DentalIntel** | Current [insurance product](https://www.dentalintel.com/insurance) markets practice insurance verification and related workflows. | No verified public consumer schedule-comparison experience or independent accuracy assessment. |
| **Open Dental** | Current [remaining-benefit calculation documentation](https://www.opendental.com/manual/insremainingcalc.html) covers paid/pending amounts, deductible/maximum tracking and plan-specific exclusions. | We did not operate a licensed practice account or establish every available scheduling feature. Benefit ledgers themselves are established. |
| **CareStack** | February 2026 [treatment planner documentation](https://carestack.zendesk.com/hc/en-us/articles/25880123845780-Create-a-Treatment-Plan-Add-Treatments) shows phases, procedure codes, patient amounts and insurance breakdowns. Current [patient portal documentation](https://carestack.zendesk.com/hc/en-us/articles/34479997316628-All-About-Patient-Portal) exposes presented treatment phases and estimates to patients. | A timeline, phase display, and patient portal are **not** novel by themselves. The reviewed pages do not prove either presence or absence of automated cross-year optimization. |
| **Dentrix / historical feature request** | [A 2019 request](https://dentrix.ideas.aha.io/ideas/DTX-I-200) asks for estimates using next-year maximums/deductibles and describes manual multi-year work. | The dated request, even if still publicly categorized for future consideration, does not prove today's Dentrix product lacks this functionality. |
| **dental.fyi / independent estimator claim** | An [April 2026 creator post](https://www.reddit.com/r/SideProject/comments/1swt8dt/i_made_a_dental_cost_estimator_so_patients_dont/) describes ZIP prices plus editable maximum/deductible/coinsurance assumptions and acknowledges sourcing friction. | The live site could not be retrieved during this review. Product activity, accuracy and commercial traction remain unverified. Treat the post as competitive/anecdotal evidence, not an established carrier tool. |

### Answer to “what does not already exist?”

**No defensible market-wide absence claim emerged.** Estimators, annual-benefit ledgers, deductible tracking, pre-treatment workflows, network comparisons, AI explanation, and treatment phases already exist. Practices already help with financial planning. Public access limits prevent an exhaustive feature audit.

**Inference:** the most promising gap is the *combined employee interaction*: confirm the rules behind this particular bill; compare schedules already allowed by the dentist; show the two benefit-year ledgers and a reproducible cost difference; identify what must be verified; and refuse a financially attractive but clinically disallowed schedule. I did not observe this exact combination in an operated public tool. That is narrower than “nobody has built it.” It is adequate differentiation for a well-executed hackathon prototype, not evidence of a defensible startup moat.

## 4. Dental customer evidence and pain

### Broad quantitative evidence, including counterevidence

| Evidence | Finding and scope | Appropriate implication |
|---|---|---|
| [ADA HPI April 2026 update](https://www.ada.org/-/media/project/ada-organization/ada/ada-org/files/resources/research/hpi/national_trends_dental_use_benefits_barriers_2026.pdf?hash=E253C60EBDA44B2E551FF2CC3A479BB5&rev=7ba37265adbc4691ac1580144544c6e5) | Uses MEPS/NHIS; the latest reported year is **2023**, not 2026. In 2023, 16.9% of working-age adults did not obtain needed dental care due to cost. | Cost barriers are substantial. This does not measure insurance confusion or the number who could save through scheduling. |
| [ADA discussion of annual maximums, December 2025](https://adanews.ada.org/ada-news/2025/december/dear-ada-annual-maximums/) | Cites a 2024 HPI analysis: 3.4% of dental patients reached a typical maximum; another 3.3% were within $100. Public article does not expose the full analytic sample. | Optimization around an exhausted maximum is a targeted use case, not a universal employee need. |
| [NADP 2026 State of the Market summary](https://www.nadp.org/dental-benefits-respond-to-affordability-challenges-takeaways-from-nadps-state-of-the-market-report/) | Based on 2024 market data: fewer than 5% of members reached their maximum; 57% of commercially insured consumers were in plans with maxima of at least $1,500, versus 48% in 2023. Carrier trade-association source; full sample not public here. | Corroborates a limited maximum-exhaustion audience and contradicts “every plan's cap never changes.” Do not combine its member denominator with ADA's patient denominator. |
| [Delta Dental survey release, May 19, 2026](https://www.deltadental.com/about-us/press-center/2026-press-releases/new-delta-dental-report-91-of-adults-say-oral-health-is-a-key-part-of-overall-health/) | January 5–15 online study: 1,000 adults plus 1,000 parents of children ≤12; sponsored survey. 91% of adults viewed oral health as part of overall health. | Dental's principal story should concern understanding coverage/bills, not persuading everyone that oral health matters. Attitude is not treatment behavior. |

I found no reliable public national percentage specifically measuring dental-benefit comprehension, how often treatment plans cross benefit years, the share of consumers intentionally postponing care for a maximum reset, or dollars actually forfeited through avoidable nonuse. Those quantities should not appear as invented pitch statistics.

### Qualitative evidence reviewed

This is a purposive sample of public discussions, not a representative survey. User identities, plan documents and alleged billing outcomes are not independently authenticated. Search snippets were not used to establish incidence. Dates shown relatively in page interfaces are not converted into invented exact publication dates.

| Source | Pain illustrated | Product lesson |
|---|---|---|
| [Cigna treatment-cost question](https://www.reddit.com/r/DentalInsurance/comments/1wt070c/how_can_i_make_sure_my_dental_treatment_is/) | A consumer facing substantial prescribed work wants procedure codes, negotiated fees and a clearer responsibility estimate before proceeding. | Give a verification checklist and distinguish an estimate from payment assurance. |
| [Finding remaining Delta benefits](https://www.reddit.com/r/HealthInsurance/comments/1sicuv2/where_do_i_find_real_time_information_about_my/) | A member finds general coverage documents but cannot locate remaining benefits, visit availability or their waiting period. | Static plan rules and current utilization are separate inputs; never pretend a booklet contains paid-claim history. |
| [Annual maximum versus out-of-pocket maximum](https://www.reddit.com/r/DentalInsurance/comments/1se4xah/dental_out_of_pocket_maximum/) | A member reports a confusing benefit summary; their follow-up says HR clarified an annual insurer-payment maximum. | Explain which party's payments are capped; surface contradictory source text for human verification. |
| [Crown copay versus bill](https://www.reddit.com/r/DentalInsurance/comments/1v4pg5n/confused_about_treatment_plan_vs_benefits/) | A reported HMO crown copay differs from the actual treatment amount; material/lab/upgrade issues enter the discussion. | Ask for the whole treatment estimate. A generic crown label and PPO formula cannot explain every bill. |
| [Crown replacement period](https://www.reddit.com/r/DentalInsurance/comments/1wb8gch/crown_replacement_period/) | A family is unsure how prior treatment and a replacement limit affect a painful current problem. Replies contradict each other. | Frequency eligibility is plan-specific and requires confirmation. Forum comments are not adjudication or clinical guidance. |
| [Dental versus medical insurance discussion](https://www.reddit.com/r/DentalInsurance/comments/1weesce/why_cant_dental_insurance_be_more_like_health/) | Expectations of broad insurance protection conflict with dental caps and cost sharing. | Teach the actual payment structure with the person's treatment plan; do not repeat unsupported claims about all carriers. |
| [Practice insurance-verification discussion](https://www.reddit.com/r/DentalAssistant/comments/1wghqb0/tf_is_insurance_verification_and_why_everyone/) | Reported portal fragmentation, missing information and interpretation work; skepticism of AI accuracy. | Avoid pretending carrier integration is trivial. Make source status and missing facts visible. |
| [Dentrix next-year estimate request, 2019](https://dentrix.ideas.aha.io/ideas/DTX-I-200) | A dated provider request describes friction modeling benefits over future years. | Evidence of a workflow pain, with explicit age limitations; not proof of a missing 2026 product feature. |
| [Independent estimator creator's account, April 2026](https://www.reddit.com/r/SideProject/comments/1swt8dt/i_made_a_dental_cost_estimator_so_patients_dont/) | Surprise costs prompted an estimator; fee sourcing remained manual. | A general cost estimator is easy to replicate; trustworthy inputs are harder. |

### What is confusing, and what the prototype should do

| Topic | Supported explanation / evidence type | Practical response |
|---|---|---|
| Annual maximum | In many PPO examples it caps **insurer payment**, not patient spending. Quantitative maximum-exhaustion evidence is limited to the cited populations. | Label “plan can still pay” and “you pay” separately. Never present it as a medical out-of-pocket cap. |
| Deductible | A separate patient amount may apply before coinsurance, with preventive exceptions and individual/family structures. Documented carrier rules. | Show the deductible deducted before applying the insurer percentage; reset it with the benefit-year rule. |
| Waiting periods | Eligibility for a category can depend on effective date and prior-coverage waiver. [Cigna's current plan example](https://www.cigna.com/individuals-families/shop-plans/dental-insurance-plans/cigna-dental-1000) makes plan variation explicit. | Treat the eligibility date as confirmed input; unknown eligibility blocks a precise coverage claim. |
| Coinsurance | “50% covered” does not mean half of any dentist's billed fee regardless of maximum or allowance. Documented billing rules plus anecdotes. | Show allowed fee → deductible → percentage → maximum → patient amount. |
| Frequency/replacement limits | A new year does not automatically reset every rolling-month limit. Some rules relate procedures on the same tooth. An [EmblemHealth February 2026 announcement](https://www.emblemhealth.com/providers/news/dental-provider-notification-fillings-202602) announces a change effective January 2027. | Separate calendar-year limits from rolling eligibility dates. Future plan rules must be confirmed, not copied automatically. |
| Unexpected denials | Eligibility, waiting/frequency limits, exclusions, alternate benefits, clinical documentation, service coding, and changed claim history can matter. Carrier/provider documents establish mechanisms, not national denial rates. | Identify unsupported or unverified rules and prepare information for a pre-treatment estimate; do not predict appeal outcomes. |
| Out-of-network billing | Billed fees can exceed the insurer's allowed amount; [Cigna's dental transparency explanation](https://www.cigna.com/individuals-families/shop-plans/transparency-in-coverage) gives a concrete example. | If added, require both billed and allowed fees and show balance billing separately. Network status is plan/provider-specific. |
| Unused benefits | Some annual allowances expire; rollover and no-maximum plans also exist. Remaining allowance is not money owned by the member. | A reminder should concern already prescribed/eligible care, not encourage unnecessary treatment to consume an allowance. |
| Year-spanning treatment | The ADA article reports dentists seeing patients decline or postpone treatment for reset dates. This is provider observation, not a measured national rate. | Permit comparison only when the dentist has explicitly allowed both windows. Include next-year deductible and plan changes. |
| Dentists' existing help | Pre-treatment workflows, CareStack phases and provider calculators show established financial-planning assistance. | Help the employee understand and discuss the office's plan. Do not replace the dentist or claim offices do no optimization. |

**Inference:** painful residual work is reconciliation: procedure details, fee basis, plan rules, utilization, clinical timing and uncertainty must be assembled into one understandable decision. AI can assist translation; it cannot manufacture missing evidence. Timing can help a subset of patients, but cannot solve unaffordable care or inadequately generous benefits generally.

## 5. Strongest buildable Dental concept: CareWindow

### Product contract

Target an employee who already has a dentist-prescribed treatment plan and is considering financially different **clinically permitted** timing. The app compares cost scenarios; the dentist owns treatment selection, urgency, prerequisites and permitted windows.

Use three screens: **Describe → Confirm → Compare**. The comparison screen shows two timelines, patient totals, insurer payments and remaining maximum for each benefit year. Clicking any amount opens a concise arithmetic trace with source status. Every input can be edited, and every edit reruns the engine.

AI extracts tentative procedures and quoted rules from text, highlights ambiguity such as “50%” without specifying who pays, and explains confirmed deterministic results. It cannot assign clinical priority, infer a safe delay, invent a CDT code, resolve a conflicting contract clause, promise payment, or choose treatment.

### P0: the build we should commit to

- One person, one explicitly supported simple PPO plan; a maximum of four procedure events and two benefit years.
- Short text intake plus editable confirmation cards. Support an embedded **synthetic plan excerpt**; full PDF upload/OCR is outside P0.
- Confirmed in-network contracted fees, coverage percentages, remaining annual deductible/maximum, reset date, category exceptions and coverage eligibility.
- Dentist-supplied allowed windows and dependencies. Unknown permission means **no movement**, not permission to defer. An urgent/deadline-locked event stays fixed.
- Chronological benefit ledger with integer-cent arithmetic and a reproducible rule trace.
- Enumerate permitted assignments; compare an “all in earliest permitted window” baseline with the least-cost permitted assignment. Do not split one procedure or a locked treatment episode to manufacture savings.
- Main comparison, maximum tracker, visible uncertainty status, rule explanation and immediate recalculation after edits.
- Manual-confirmation path and templated explanations when the LLM is unavailable. Saved synthetic inputs are allowed; the actual engine still runs.

**P1, only after P0 works:** a separately supplied out-of-network fee/allowance comparison; downloadable or printable discussion summary; a clearly labeled non-calendar reset example. If a coach says network comparison is expected as a core requirement, reprioritize it and drop another P1 feature.

**P2 / tonight exclusions:** claims integration, broad carrier coverage, arbitrary clinical sequencing, dentist directory integration, appointment booking, calendar/email reminders, user accounts, live fee lookup, full document ingestion, OCR, secondary insurance, orthodontic lifetime maxima, family accumulators, rollover modeling and automated claims/appeals. Reject unsupported configurations rather than quietly approximating them.

### Demonstration fixture: exact, synthetic, auditable

This is **not an actual Lincoln plan, actual local fee estimate, or promise of payment**. The illustration uses late-2026 and early-2027 windows as hypothetical scheduling choices. Assume unchanged enrollment/fees and the stated rules next year; production users would need to confirm those assumptions.

| Plan fact | Fixture |
|---|---|
| Annual insurer-payment maximum | $1,500; $1,100 already paid this year; $400 remaining |
| Current deductible | $50, already met |
| Next-year deductible and maximum | $50 deductible resets; $1,500 maximum resets |
| Preventive rule | 100% insurer payment; no deductible; **excluded from annual maximum** |
| Basic / major insurer share | 80% / 50%, after applicable deductible and subject to maximum |
| Eligibility | Waiting/frequency eligibility confirmed for all illustrated procedures; no rollover/secondary insurance |
| Fees | In-network contracted fees; separate services on appropriate teeth, with procedure details confirmed in the fictional treatment plan |

| Dentist-prescribed event | Fee | Allowed timing |
|---|---:|---|
| Cleaning | $150 | Current year |
| Filling A | $200 | Current year |
| Filling B | $200 | Current year |
| Crown | $1,500 | Dentist explicitly permits either current or next year |

Both fillings occur before the crown in this scenario. The allowed windows are fictional confirmed clinical inputs, not a claim that crowns are generally safe to postpone. Preventive exemption is a legitimate plan-design pattern, but only the fixture asserts it here.

| Result | All current year | Crown in next allowed year |
|---|---:|---:|
| Cleaning: insurer / patient | $150 / $0 | $150 / $0 |
| Both fillings: insurer / patient | $320 / $80 | $320 / $80 |
| Crown: insurer / patient | $80 / $1,420 | $725 / $775 |
| Total insurer payment | $550 | $1,195 |
| Total patient cost | **$1,500** | **$855** |
| Current-year maximum left | $0 | $80 |
| Next-year maximum left after illustrated care | No illustrated care next year | $775 |

**Conditional difference: $645 lower patient cost.** Current-year crown payment is capped at $80 after the fillings. Next-year crown payment is 50% × ($1,500 − $50) = $725. The cleaning's $150 payment does not consume the maximum under this fixture. Total prescribed fees are $2,050 in either schedule.

The model intentionally leaves $80 unused this year in the cheaper schedule. Its objective is appropriate, permitted care at lower patient cost—not spending every benefit dollar.

### The decisive interaction

Change the dentist's crown deadline to the current year. The next-year option disappears, estimated savings become $0, and the interface explains: **“The dentist's timing requirement takes priority. We cannot compare a later crown date.”** Current-year patient cost remains $1,500 under the fixture.

Then, if time permits, change current-year remaining maximum to $1,500. The baseline costs $830; moving the crown costs $855 because of the renewed deductible. The engine chooses the baseline and says timing does not save money. This catches an optimizer that always manufactures a benefit from waiting.

### Domain rules that must be explicit

The prototype is a financial scenario model with user-confirmed rules, not claims adjudication. In-network covered fees must be supplied. Pending utilization must be accounted for once: either the supplied remaining amount already includes it, or a confirmed reservation reduces it. Unknown pending claims make the result provisional.

For each eligible service, in chronological order within its benefit year:

1. Start with supplied billable/contracted fee and allowed amount.
2. Apply the remaining deductible only if this category is deductible-eligible.
3. Multiply the remaining eligible amount by the **insurer's** coverage fraction.
4. If payment consumes the maximum, cap it at the remaining insurer-payment allowance.
5. Patient amount equals the billable fee minus insurer payment. Update deductible and insurer-payment accumulators separately.

Out-of-network support additionally needs billed fee versus allowed amount, and its own coverage rules. Denied/noncovered services may have different contractual fee treatment; do not assume the ordinary covered-service discount survives every denial. P0 flags such cases for verification.

Use the plan-defined benefit/service date. Do not assume booking date, payment date, crown preparation date or crown seating date always determines benefit year. Preserve confirmed episode billing rules and prohibit splitting an episode without a dentist/plan-supplied basis. A benefit-year reset is not proof the next-year plan stays the same.

## 6. Head-to-head: qualitative comparison before scoring

The comparison is optimized FamilyMap versus bounded CareWindow, not a sophisticated Life app versus a basic Dental calculator.

| Category | FamilyMap | CareWindow / tradeoff |
|---|---|---|
| 1. UI potential | Warm household/goal picture with fewer unfamiliar terms. | Side-by-side timelines, patient bills and benefit meters produce a stronger action-oriented screen, but need restrained labels. Dental edge if polished. |
| 2. Understanding in a demo | “Protect your family” is immediate; estimate methodology needs explanation. | “Same prescribed care, different permitted timing and bill” is concrete; briefly explain the insurer-payment maximum. Slight Dental edge. |
| 3. Challenge alignment | Strong educational path; needs contextual policy-type understanding without sales advice. | Directly demonstrates intake, coverage explanation and sequencing; maximum tracking adds a stated bonus. Dental edge for this scope. |
| 4. Real customer pain | Broad reported uncertainty/need gap and explicit coach insight. | Broad cost pain; timing savings apply to a narrower prescribed-care population. Life has broader evidence; Dental has a more specific immediate task. |
| 5. Lincoln business relevance | Explicit coach signal, public life portfolio, professional education journey. | Official dental challenge, current Lincoln dental offering, existing member estimator. Life has stronger coach-backed strategic relevance; exact internal priority is unknown. |
| 6. Innovation | Assumption repair is differentiated execution, but calculator adjacency remains obvious. | Timing plus transparent rules plus refusal behavior is a richer interaction; practice software is strong prior art. Dental edge in visible combination, not category novelty. |
| 7. Technical creativity | Validation and scenario change propagation; modest model complexity. | Constraint filtering plus benefit-year state transitions plus explanation trace. Dental edge with meaningful, bounded complexity. |
| 8. Visible AI | Parsing the household sentence and discovering missing assumptions. | Parsing benefit language, uncertainty and procedure descriptions. Both can visibly earn their role; Dental offers denser language translation. |
| 9. Need for AI | A good form can replace most intake. AI helps articulation. | A form can still handle confirmed rules; messy language offers more translation value. Dental edge, but neither needs AI for arithmetic. |
| 10. Deterministic-engine opportunity | Clear needs/resources equation and sensitivity. | Stateful deductible/maximum ledger plus feasible-schedule comparison. Dental edge in demo substance, Life edge in correctness simplicity. |
| 11. Visualization | Needs segments and resource coverage. | Timeline movement, bill difference and per-year allowance change. Dental edge for visible cause/effect. |
| 12. Five-minute demo | Strong family hook, fewer terms, smaller wow. | Concrete monetary comparison plus a constraint that changes the answer. Dental edge if intake is abbreviated. |
| 13. Memorable wow | A mistaken assumption prevented; support-years edit changes the map. | The cheaper schedule is offered and then withdrawn when the dentist's deadline changes. Dental edge. |
| 14. Security/privacy | Sensitive household finances; avoid identities and account linkage. | Treatment information plus plan data creates more sensitive handling and potential health-data obligations. Life easier; both can demonstrate synthetic-data boundaries. |
| 15. Architecture story | Very clean interpretation/confirmation/calculation/explanation pipeline. | Same boundaries plus a small constraint layer. Both strong; Dental has more substance but less time to explain it. |
| 16. Complexity | Easier to keep complete and understandable. | More genuinely interacting rules; requires explicit unsupported cases. Life safer, Dental more rubric-visible if tightly bounded. |
| 17. Build risk | Low–medium for a useful limited model. | Medium for the specified slice; high if generalized to real plans/documents. Life advantage. |
| 18. External dependency | No insurance/quote API needed. | No carrier/price API needed if confirmed fees and synthetic demo rules are supplied; production truth is harder. Tie for prototype; Life easier beyond it. |
| 19. Judging reliability | Fewer interacting branches; fully usable without AI. | Deterministic comparison also works without AI but needs more fixture validation. Life advantage. |
| 20. Domain knowledge | Survivor shortfall, resources, double counting, assumptions and policy framing. | Coverage category, fee allowance, accumulators, reset, utilization and clinician timing. Life advantage in learning burden. |
| 21. Incorrect calculations | Formula manageable; incorrect assumptions remain a serious risk. | Correct arithmetic can still mislead if plan eligibility/fees are wrong; rule interactions add risk. Life advantage. |
| 22. Misleading guidance | False precision, blanket coverage need, premium or underwriting claims. | Guaranteed payment or unsafe treatment delay; dual financial/clinical boundaries. Life easier to constrain. |
| 23. Polish in 14–18 hours | More time for visual/accessibility refinement. | Core risk can consume polish time; four-person split must protect UI effort. Life advantage in available margin. |
| 24. Differentiation | Needs breakdown already common; visible repair is essential. | Treatment estimates/phases already common; transparent permitted-schedule comparison is essential. Dental slightly stronger combined interaction; neither is proven unique. |
| 25. Plausible Lincoln use | Pre-advisor education/benefit awareness module; validate comprehension first. | Member explanation module complementing existing estimator and dentist estimates; requires trusted data and clinical workflow fit. Both plausible concepts, neither deployment-ready. |

### Projected scores after that analysis

Scale: 5 = adequate but ordinary/weakly evidenced, 7 = credible and buildable, 9 = particularly strong within the bounded concept. 10 would require exceptional demonstrated execution. These are **analyst projections conditional on finishing P0**, not judges' scores or measured facts.

| Official criterion | Optimized FamilyMap | CareWindow | Reason for meaningful difference |
|---|---:|---:|---|
| UI & intuitiveness | 8 | 9 | Dental comparison turns timing into a clear screen interaction. |
| Functional requirements & impact | 8 | 9 | Dental demonstrates the three requested functions in one task. |
| Solution design & innovation | 7 | 8 | Dental's combined constrained comparison is more distinctive in five minutes. |
| Demonstration & presentation | 8 | 9 | Immediate cost difference plus refusal is memorable. |
| Does it work? | 9 | 8 | Life's smaller rule surface is easier to finish correctly. |
| Technology platforms | 7 | 7 | Both use a justified LLM/validation/web stack; neither merits extra points from a badge list. |
| Security accommodations | 8 | 8 | Both can demonstrate concrete boundaries; Dental's greater production burden prevents claiming superiority. |
| Technical creativity | 7 | 9 | Dental combines rule-state simulation and constraint enforcement. |
| Architecture & methodology | 9 | 9 | Both can explain clean boundaries and show a storyboard/roadmap. |
| Complexity | 8 | 8 | Life needs enough real needs modeling; Dental must reject unsupported rules. |

I do not total these into an “official score.” Dental's projected lead is concentrated in visible interaction, alignment and technical creativity. Life wins delivery confidence. If Dental's ledger or constraint enforcement does not actually work, its five-minute advantage collapses; no quantity of platform novelty compensates.

## 7. Steelman each choice and interpret the coach signal

**Strongest case for Life:** The coach identified a real education problem in a business Lincoln explicitly serves. A limited needs model can be correct and polished sooner. Assumption repair directly helps people explain why coverage matters. With core functionality emphasized, a complete, credible household journey can beat a sophisticated dental prototype with wrong benefit arithmetic. This is the safer choice for a team with little domain experience or weak integration discipline.

**Strongest case against Life:** The prior research establishes substantial competition for precisely this journey. Chat intake, needs breakdowns and sliders do not by themselves make a new product. In five minutes, judges may see an ordinary calculator and hear an architectural story rather than see a technically creative behavior. A coach's favorable Life comment cannot erase that presentation risk or establish official weighting.

**Strongest case for Dental:** The challenge supplies a concrete decision with multiple interacting rules and a natural before/after. A bounded ledger and schedule enumerator are substantial core functionality, and AI has a useful translation role. One edit can visibly change both cost and feasibility. Lincoln publicly offers dental benefits, so this is not disconnected from its business. Four people can build the limited slice without carrier integration.

**Strongest case against Dental:** Practice software and carriers already do much of the work. Real-world plan truth is difficult, and a slick savings figure can be wrong despite correct arithmetic. Clinical permission, service dates, next-year benefits and utilization can invalidate the comparison. Maximum exhaustion is not a universal problem. A team that overbuilds a general “AI insurance agent” will probably sacrifice reliability and polish.

**Weight of the coach's comments:** Treat them as credible, useful stakeholder evidence for Life education and as a reason to ask about adoption. They are not a verified financial-segment ranking, a judge consensus, numerical scoring weights or evidence every judge expects Life. Public [Lincoln life education](https://www.lincolnfinancial.com/public/individuals/products/lifeinsurance) supports Life relevance; public [Lincoln dental offerings](https://www.lincolnfinancial.com/public/professionals/productsandinsights/employeebenefitsoverview) support Dental relevance. Internal urgency and sponsorship remain unknown.

**Why Dental can still win this decision:** the confirmed 14–18 hours and no working app remove implementation switching cost. Under the supplied rubric, its visible core interaction can earn multiple forms of recognition while remaining one bounded user task. That outweighs the current *qualitative* coach signal, unless a coach provides materially stronger adoption or judging information.

## 8. Optimizing each track for this rubric

| Rubric | FamilyMap optimized build | CareWindow optimized build |
|---|---|---|
| UI/UX | Three-step journey; large protection segments; short editable assumptions; resources visibly separate. | Three-step journey; two simple timelines; same procedures in both; patient-cost delta and year ledgers visible. |
| Requirements/impact | Confirm household facts, explain a needs picture, change assumptions, prepare a professional discussion. | Translate treatment/rules, calculate estimated responsibility, compare clinician-permitted timing, track maximum use. |
| Design innovation | Repair a source-linked ambiguity before a model can run. | Explain a lower-cost permitted schedule and why a cheaper-looking option may be forbidden. |
| Demonstration | One household, one missing/ambiguous fact, one scenario change. | One plan, four events, one financial comparison and one dentist-deadline change. |
| Working core | Every edited field must recompute correctly; manual path works. | Actual ledger and enumerator must recalculate; unsupported cases block rather than fake success. |
| Technology | Structured LLM interpretation plus validation and deterministic scenario model. | Structured LLM interpretation plus validation, financial ledger and a small purpose-built constraint enumerator. |
| Security | Synthetic data, private secrets, limited retention, no household-data advertising/analytics leakage. | Same, with treatment data minimized and source text isolated from system instructions. |
| Technical creativity | One calculation record drives map, differences and grounded explanation. | One feasible schedule record drives timeline, costs, cap consumption and exclusion reasons. |
| Architecture/methodology | Show confirmed-data boundary and a storyboard with completed acceptance cases. | Show clinician-rule boundary and two-year state; disclose the tested plan slice and roadmap. |
| Complexity | Actual shortfall rather than salary multiplier; disclosed assumptions, no actuarial sprawl. | Four events/two years/one simple PPO; meaningful interactions, explicit exclusions. |

Technology judging does not require replacing a familiar framework. Use the team's already-known UI/server stack, a hosted LLM already accessible to the team, typed input validation, and plain deterministic code. No new SDK integration or solver library is necessary to enumerate at most 16 two-window assignments for four events. The platform story is the reasoned separation of responsibilities, not a slide crowded with logos.

**Natural advantages:** Dental—visible UI, before/after, immediate task value, technical creativity, deterministic-engine substance and language-translation AI. Life—simpler security scope, simpler calculation and live reliability. Architecture is essentially a tie. Business value must be framed as a hypothesis: reduced uncertainty and better prepared conversations, not unmeasured savings, conversions or service-call reductions.

### Shared security demonstration

Use fictitious people and plans. Keep provider secrets on the server; limit text size and numeric ranges; validate structured AI output; render text safely; do not execute uploaded or pasted instructions; do not log raw financial/health text; clear session data; identify retention behavior accurately. Show that plan text is data and cannot grant tool permissions or override calculation rules.

No authentication build is necessary for a synthetic, nonpersistent prototype. A deployed personalized member service would need the organization's existing identity system, authorization, encryption, audit/retention controls and appropriate vendor contracts. Do not imply those future accommodations are already implemented.

Do not claim “HIPAA compliant.” Applicability depends on relationships and deployment: [HHS health-app guidance](https://www.hhs.gov/hipaa/for-professionals/special-topics/health-apps/index.html) distinguishes covered-entity/business-associate scenarios; [FTC guidance](https://www.ftc.gov/business-guidance/resources/collecting-using-or-sharing-consumer-health-information-look-hipaa-ftc-act-health-breach) also addresses health information outside HIPAA. This is a concrete deployment question, not something a hackathon disclaimer resolves.

## 9. Best five-minute demos

### FamilyMap

The fixture: Alex, 32, spouse Jordan, child aged three, salary $90,000, mortgage payoff $300,000, other debt $15,000, education goal $60,000, transition/final expenses $15,000, usable savings $25,000, employer coverage $90,000, personal coverage $0. Confirm net survivor shortfall of **$4,000/month after mortgage payoff**, including needed care; 15 years. Today-dollar model with zero real investment growth. Salary supplies employer-coverage context, not the shortfall formula.

Gross needs = $300,000 + $720,000 + $15,000 + $60,000 + $15,000 = $1,110,000. Resources = $115,000. Gap = **$995,000**. At 10 support years: **$755,000**; excluding employer coverage at 15 years: **$1,085,000**. These are educational estimates under chosen assumptions, not underwriting recommendations.

| Time | On screen / action | Spoken purpose |
|---|---|---|
| 0:00–0:30 | Household sentence and “I have one year's salary through work.” | “Alex knows the benefit amount but not what it could support. FamilyMap makes the assumptions behind that question understandable.” |
| 0:30–1:30 | Submit prepared text; show editable extracted facts. Highlight mortgage/monthly-support ambiguity. Confirm support excludes the paid-off mortgage; confirm missing obligations/resources. | “AI proposes the facts. It cannot assume salary equals the family's shortfall or count the mortgage twice. Alex confirms before we calculate.” |
| 1:30–2:30 | Protection map: home $300k; support $720k; education $60k; other debt $15k; transition $15k. Separate resources $115k and gap $995k. Select support segment. | Explain one segment's formula and the disclosed zero-growth/today-dollar model. “This shows a model of obligations, not a quote.” |
| 2:30–3:30 | Change support 15→10 years: support falls $240k and gap becomes $755k; show the difference explanation. Briefly toggle employer coverage separately if rehearsed. | “A choice changes its corresponding obligation and explanation together. Work coverage is a resource whose continuation depends on the actual plan.” |
| 3:30–4:10 | Show the short assumption summary and professional discussion handoff. | “The useful outcome is a person who can explain what they want to protect and where they need advice. We would test comprehension and next-step completion.” |
| 4:10–4:40 | One architecture slide and synthetic-data/security labels. | “Interpret → validate → confirm → calculate → compare → explain. Keys stay server-side; we demonstrate synthetic data and avoid raw financial logging. Production identity uses existing infrastructure.” |
| 4:40–5:00 | Return to the map, not the architecture slide. | “FamilyMap helps families understand—and change—the assumptions behind their protection estimate.” |

Keep intake under one minute with a prepared sentence and immediately visible confirmation cards. Do not type every field live, show a long essay, imply assets are earmarked, or turn the last minute into policy taxonomy.

### CareWindow

Use the exact synthetic $2,050 prescribed-care fixture in section 5. Label sample plan/fees and next-year assumptions visibly.

| Time | On screen / action | Spoken purpose |
|---|---|---|
| 0:00–0:30 | Four prescribed events beside a confusing short benefits excerpt. | “An employee has a dentist's treatment plan. The remaining question is what the plan may pay and how timing the dentist allows changes the bill.” |
| 0:30–1:30 | Submit prepared description; extract editable proposed procedures/rules. Confirm insurer percentages, $400 remaining, preventive exception, and dentist-approved crown windows. | “AI translates language. The employee confirms the plan facts. Clinical timing comes from the dentist; the model never decides a delay is safe.” |
| 1:30–2:30 | All-current-year timeline: total patient cost $1,500; select crown to reveal $80 remaining insurer allowance and $1,420 patient amount. | “The annual maximum limits insurer payment. The crown is not simply half of its fee once that allowance is nearly used.” |
| 2:30–3:05 | Compare permitted schedules. Crown moves to next approved window; patient total $855; conditional difference $645; show next-year deductible. | “Same prescribed services and fees. Different permitted timing. Code includes the renewed deductible and shows the complete ledger.” |
| 3:05–3:30 | Set dentist deadline to current year. Cheaper option disappears; later timeline is disallowed; result returns to $1,500. | “If the dentist requires the crown earlier, that cheaper option is unavailable. Care timing takes priority.” |
| 3:30–4:10 | Summary of confirmed versus assumed facts and items for dentist/insurer verification. | “This helps an employee understand the office's estimate and discuss an allowable schedule. It complements existing estimator and pre-treatment workflows; it does not guarantee payment.” |
| 4:10–4:40 | One architecture slide, accepted/blocked assignment illustration and security labels. | “AI interprets; confirmed facts enter a deterministic ledger; the solver considers only permitted dates. No carrier API or live fee lookup is needed for this synthetic prototype. Production requires trusted plan/utilization data.” |
| 4:40–5:00 | Return to the compared timelines. | “CareWindow makes the financial effect of dentist-approved timing clear—without letting insurance decide the care.” |

### Which demo wins which test?

| Test | Choice | Qualification |
|---|---|---|
| Clearer story with minimal explanation | **Dental, narrowly** | The bill comparison is concrete; explain the insurer-payment cap in one sentence. Life's family motivation is easier, but its estimate requires more assumptions. |
| Stronger visual before/after | **Dental** | The same event changes window, payment and year ledger together. |
| Most obvious usefulness | **Dental for the target patient** | The specific choice is clearer. Life has broader educational relevance; Dental does not help everyone save. |
| More defensible AI role | **Dental, narrowly** | Benefits language has denser terminology, but confirmed structured forms remain necessary for both. AI is not a justification for arithmetic or clinical judgment. |
| More reliable live behavior | **Life** | Fewer interacting domain rules. Dental can still be reliable with the bounded model, fixtures and manual fallback. |

## 10. How each project loses

**FamilyMap loses if** judges watch a sentence become a generic coverage amount, see decorative tiles, and hear “the LLM explains it.” It also loses if it silently uses salary as support need, counts housing twice, always finds a gap, or says incumbent calculators provide no rationale.

**The single behavior that best prevents that:** a source-linked ambiguity **blocks calculation until the user repairs it**, and the repaired assumption visibly drives the map and scenario difference. This turns “AI intake” into an observable contribution to a trustworthy model.

**CareWindow loses if** it shows a savings badge from hard-coded dates; applies one PPO formula to every plan; invents fees/eligibility; counts charges against an insurer-payment cap; ignores a second deductible; always recommends next year; or shifts necessary care without the dentist's approval. A timeline without explanation is an existing software pattern.

**The single behavior that best prevents that:** changing the dentist's permitted window **removes a cheaper schedule from the actual calculation**, with an explanation of why. It proves the optimizer respects a real constraint rather than cosmetically rearranging a bill.

Both lose if the demo depends on live carrier login, uploads a real person's sensitive data, spends a minute on registration, or substitutes architectural promises for working input edits. If the selected project's distinguishing behavior is missing, cut optional features until it works.

## 11. Buildability audit and delivery plan

### Models and components

| Area | FamilyMap | Risk | CareWindow | Risk |
|---|---|---|---|---|
| Core data | Household obligations, net survivor shortfall, support years, goal amounts, usable resources, source/confirmation state, model version. | Low–Medium | Two year-rule snapshots; paid/pending utilization basis; category rules; fees; confirmed eligibility; permitted windows/dependencies; source/confirmation state. | Medium |
| Calculation | Add obligations and support; subtract resources; clamp gap at zero; compare explicit scenario changes; avoid overlapping costs. | Low–Medium | Chronological deductible/maximum state, exceptions, integer cents, feasible assignment enumeration, cost difference and reasons. | Medium |
| AI | Extract tentative values, flag ambiguity, explain a supplied calculation record. | Medium | Extract tentative procedure/rule facts, flag ambiguity, explain a supplied ledger. No coding/eligibility/clinical invention. | Medium |
| Frontend | Intake, confirmation, protection map, two controls, calculation trace, fallback form. | Medium | Intake, confirmation, two timelines, per-year ledger, comparison control, clinician-deadline edit, trace. | Medium |
| Backend | Minimal validated interpretation/explanation endpoint; server secrets; shared pure calculation module. Persistent database unnecessary. | Low–Medium | Same plus shared ledger/constraint module. Persistent database unnecessary. | Medium |
| External dependencies | Existing team web stack, optional accessible LLM and deployment host. | Low | Same; supplied fees and sample rules replace licensed live datasets. | Low for demo |
| Required APIs | LLM API for actual AI demonstration; calculation/edit path needs none. No quote API. | Low–Medium | LLM API for actual AI demonstration; ledger/solver needs none. No claims, fee, calendar or carrier API. | Low–Medium |
| Testing burden | Smaller set of math/assumption/invalid-input cases plus AI-to-confirmation checks. | Medium | More rule-state/constraint cases; independent expected totals and rejected configurations. | Medium–High |
| Domain edges | Joint obligations, partner earnings, childcare, assets unavailable for support, employer terms, dependent horizons, real growth/taxes excluded. | Medium | Benefit-date rules, missing fees/utilization, frequency, waiting, plan changes, denied service fee basis, episodes; unsupported family/COB/ortho/rollover/DMO. | High if generalized; Medium when blocked |
| Fallback | Manual confirmed inputs, deterministic map, fixed explanation templates; labeled saved demo household. | Low | Manual confirmed inputs, deterministic ledger/solver, fixed explanation templates; labeled saved demo plan. | Low–Medium |
| Overall limited MVP | Feasible, more polish margin. | **Low–Medium** | Feasible with strict P0 and early engine verification. | **Medium** |
| General production product | Trusted advice/assumption model, identity, governance and validation still needed. | High | Trusted carrier/fee/history/clinical data and many contract rules needed. | High |

### Meaningful acceptance cases

**FamilyMap:** independently verify $995k baseline, $755k at 10 years, $1.085m without work coverage; zero gap; no negative expenses; mortgage-overlap unresolved means no final number; source salary never becomes shortfall automatically; edits update explanation; malformed AI output cannot bypass confirmation.

**CareWindow:** independently verify $1,500 versus $855 and $645 difference; current-year deadline forbids movement; unknown clinical permission forbids movement; full $1,500 current allowance makes $830 baseline beat $855 later; preventive exemption does not consume maximum; deductible is applied before percentage; no maximum/deductible below zero; different reset dates work from inputs; unsupported plan type blocks; missing next-year facts remain clearly hypothetical; dependencies are enforced; pending benefits are not deducted twice; unknown frequency cannot be presented as confirmed coverage. Check that billable fees equal insurer plus patient amounts in every supported event.

For both, manually test the complete journey with an unfamiliar teammate, keyboard navigation, long text, missing facts, failed AI response and a fresh browser session. Screenshot fallback documents an already-tested path; never pretend a screenshot is live computation. The confidence is in a running core, not the number of test files.

### Four-person allocation

| Person | Life responsibility | Dental responsibility |
|---|---|---|
| 1 | Pure needs/scenario engine, fixtures and arithmetic checks. | Pure ledger/constraint engine, fixtures and arithmetic checks. |
| 2 | Confirmation and protection-map UI, edits and trace. | Confirmation and timeline UI, edits and trace. |
| 3 | AI interpretation/validation endpoint and manual fallback. | AI interpretation/validation endpoint and manual fallback. |
| 4 | Integration, security boundaries, user walkthroughs, demo design and final polish. | Same; give special attention to unsupported cases and labels. |

Agree on the input/output contract together before splitting. Person 4 should integrate from the first few hours, not wait until everyone finishes. Each person owns the acceptance criteria for their piece; integration is everyone's responsibility.

### Clock plan for 14–18 remaining hours

- **First 30 minutes:** coach questions, choose one track, storyboard three screens, confirm fixture and data contract, identify one live AI request that can run with synthetic data.
- **By hour 3:** standalone math/constraint core passes the principal fixture and counterexample; basic UI renders real engine output. This is an execution checkpoint, not a claim the full application can be finished in three hours.
- **By hour 6:** integrated manual-input→confirmation→result→edit flow works. AI is integrated only through the same validated contract.
- **By hour 9–10:** complete P0 including the distinguishing behavior, failed-AI path and unsupported-input handling. Stop adding product scope.
- **Freeze at least four hours before the presentation:** only corrections, visual polish and rehearsal afterward. For a 14-hour window, freeze by hour 10; with 18 hours, freeze no later than hour 14 and avoid filling the extra time with P2.
- **Final four hours:** verify fixture math independently, rehearse twice at 4:40–4:50, test on the actual presentation machine, save sample input, and record a brief backup of the working path.

**Dental execution gate:** if by hour 3 the ledger and clinical constraint example do not produce independently verified results, or the team cannot explain the plan slice correctly, switch promptly to optimized FamilyMap. Do not spend the next ten hours rescuing a broad insurer parser. If an actual Life implementation becomes complete first, reassess the working evidence instead of protecting this written recommendation.

## 12. Decision memo

**RECOMMENDED TRACK: Dental.**

**WHY:**

1. **One core task demonstrates the challenge's three requested functions.** Describe a prescribed plan, explain estimated responsibility, and compare dentist-permitted timing; annual-maximum tracking is part of the same working ledger.
2. **The distinguishing interaction is visible in five minutes.** $1,500 versus $855 is explainable with the cap and new deductible; changing the dentist's deadline removes the lower-cost choice. This directly supports UI, presentation, innovation and technical creativity without a side feature.
3. **The necessary technical work is meaningful and bounded.** Four events and two years yield a small feasible-assignment search and an auditable stateful ledger. That is more substantial than decorated arithmetic, without requiring a carrier integration or large optimization platform.
4. **The strengthened concept survives competitive counterevidence.** Carriers and practice software already estimate/phase treatment. CareWindow's pitch is the employee's transparent, uncertainty-aware, clinician-constrained comparison—not “we invented dental estimates.”
5. **The actual team situation permits the choice.** Four developers have 14–18 hours and no working app to abandon. A tightly scoped medium-risk Dental build is a reasonable bet; synthetic confirmed rules/fees avoid the weakest external dependency.

**MAIN TRADEOFF:** We sacrifice Life's stronger directly reported coach endorsement, broader consumer-education opportunity, simpler domain calculation and additional polish margin. We accept more verification work and a narrower target population. Dental is not more strategically important to Lincoln merely because this review recommends it.

**CONFIDENCE: Medium.** The rubric favors a complete working core, not a concept. Internal tools and priorities are not public; competitor-gated functionality and the size of the clinically flexible treatment population remain uncertain. Dental wins on projected demonstration quality; Life wins on delivery safety.

**WHAT COULD CHANGE THE DECISION:** Switch to Life if a coach establishes a concrete Life sponsor/use case and shows that Dental's proposed employee comparison is already adequately addressed internally; if the dental challenge requires live adjudication/claims data inaccessible tonight; if acceptable dentist-supplied windows are unavailable or stakeholder policy prohibits this kind of comparison; or if Dental cannot pass the hour-3 ledger/constraint gate. Maintain Dental if coaches identify unresolved member confusion about treatment estimates and welcome a bounded, confirmed-data prototype. Stronger Life weighting would matter only if confirmed by someone responsible for the judging process; a coach's general company preference alone is insufficient.

**Precisely what to build:** CareWindow's three-screen P0, the synthetic fixture, a working ledger and feasible-schedule comparison, and the deadline-change refusal. Freeze there. A network comparison is the first optional extension; a reminder system is not.

## 13. Exactly five coach questions before commitment

1. **Between Life education and Dental treatment planning, which has a named internal owner who would review a successful prototype after this event, and what specific unresolved customer task would that owner want it to address?**
2. **Inside Lincoln's current DentalConnect experience, can members already compare the same prescribed treatment across benefit years with deductible resets and dentist-permitted timing, and where does that workflow still fail?**
3. **Would Lincoln consider a dental comparison acceptable when all movable dates must be explicitly allowed by the dentist, or is there an operational/compliance constraint that would rule out that product behavior?**
4. **What approved sample plan, fee estimate or utilization data can you provide now, and is a prototype using clearly labeled synthetic, confirmed inputs sufficient, or must it demonstrate live Lincoln data?**
5. **For the people judging this event, is there any track-specific expectation or unstated core requirement that would disadvantage either bounded concept, and what concrete weakness caused otherwise polished insurance projects to score poorly in past events?**

These seek internal adoption, existing capabilities, workflow acceptability, available data and actual judging expectations. They are not answered by the public challenge deck. Do not ask a coach to disclose customer-identifiable data for a public demonstration.
