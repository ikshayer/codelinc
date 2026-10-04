# Dental Insurance Data Model and Synthetic Demo Dataset

This package is a ready-to-build dataset for the dental benefits optimizer.

> **Important:** Every dollar amount, percentage, premium, plan name, network,
> provider, member, appointment, and clinical recommendation in this package is
> synthetic. Nothing here should be presented as an actual Lincoln Financial
> Group plan or member benefit. Replace demo rules only with authorized plan
> documents and retain evidence for every replacement.

## 1. Keep the four data domains separate

| Domain | Owner/source | Examples | Changes how often? |
|---|---|---|---|
| Plan definition | Carrier/employer plan documents | Deductible, annual maximum, coverage rate, frequency rules | Usually each plan year |
| Member benefit state | Eligibility, claims, EOBs, member confirmation | Deductible remaining, plan-paid YTD, pending claims | After claims/adjudication |
| Provider and price state | Directory, fee schedule, dentist office | Network status, allowed amount, cash quote, appointment slots | Frequently |
| Clinical recommendation | Dentist card, estimate, confirmed transcript | Procedure, urgency, safe dates, dependencies | Per treatment plan |

The plan document must not contain member availability, dentist urgency, or
appointment slots. The optimizer joins the four domains at runtime and retains
the source and timestamp of every fact.

## 2. Do not confuse the four meanings of “tier”

| Term | Values in this demo | Meaning |
|---|---|---|
| Plan option tier | Value, Core, Enhanced | Which benefit package the employee selected |
| Enrollment tier | Employee only, employee + spouse, employee + children, family | Who is covered and the payroll contribution/family deductible |
| Network tier | In-network, out-of-network | Which fee and coverage rules apply to the provider location |
| Service class | Preventive, basic, major, orthodontic | How the exact plan classifies a procedure |

## 3. Data required inside every insurance plan version

### A. Identity, validity, and evidence — always required

| Field | Purpose |
|---|---|
| `plan_id` and `plan_version_id` | Select the exact plan and preserve history |
| Carrier, employer/group, option name, jurisdiction | Prevent rules from another group/state being used |
| `plan_type` | Select DPPO, DHMO, indemnity, or discount adjudicator |
| Effective start/end | Apply the correct rules for the service date |
| Plan-year/reset rule | Determine deductible and annual-maximum reset |
| Source ID/checksum/version | Prove which document supplied the rules |
| Rule-level evidence reference | Document page/section/row supporting each benefit |
| Verification status | `VERIFIED`, `UNKNOWN`, `UNVERIFIED`, `CONFLICT`, or `NOT_APPLICABLE` |

### B. Premiums — required only for comparing plan options

- Employee payroll contribution by enrollment tier
- Pay frequency or monthly equivalent
- Employer contribution, if total plan cost is displayed
- Tobacco/spousal surcharges when applicable

Premiums should not be mixed into the cost of one dental claim. Include them
only when comparing total annual cost between Value/Core/Enhanced plans.

### C. Deductibles

- Individual and family amount
- In-network and out-of-network amount
- Whether one combined deductible or separate network deductibles apply
- Which service classes waive the deductible
- Family embedded versus aggregate behavior
- Accumulator reset date

### D. Maximums and sublimits

- Annual maximum per member
- Whether in/out-of-network maximums are combined or separate
- Whether the accumulator tracks plan-paid amount
- Orthodontic lifetime maximum
- Procedure-specific or category sublimits
- Rollover/MaxRewards threshold, award, network bonus, bank cap, and claim conditions

### E. Coverage table

For every service class and network tier store:

- Plan share in basis points (`10000` = 100%, `8000` = 80%)
- Whether deductible applies
- Reimbursement basis: contracted allowed amount, UCR/plan allowance, or copay
- Whether balance billing is possible
- Evidence reference

### F. Procedure-level rules

- Exact CDT-to-service-class mapping for this plan
- Plan-specific overrides
- Frequency limits and whether they are calendar-year or rolling-month rules
- Age/dependent limits
- Waiting periods and late-entrant rules
- Replacement periods
- Alternate-benefit/downgrade rules
- Exclusions and missing-tooth rules
- Predetermination/prior-authorization requirements
- Implant and orthodontic rules
- Coordination-of-benefits method when supported

Do not globally assume that a CDT code is always preventive, basic, or major.
The plan-specific mapping controls.

### G. Claim and self-pay rules

- Claim-submission deadline
- Whether in-network providers must submit claims
- Whether an insured member may choose a no-claim cash price
- Whether a self-paid service receives network pricing
- Whether self-pay is credited to deductible/maximum/frequency history

If any self-pay field is unknown, show a scenario requiring confirmation rather
than declaring self-pay best.

## 4. Data that is not part of the static insurance plan

### Member snapshot

- Plan version and enrollment tier
- Coverage effective dates
- Deductible remaining by network
- Annual maximum remaining and plan-paid YTD
- Pending claims
- Relevant completed-procedure dates
- Rollover bank
- FSA/HRA/HSA balances and deadlines
- Hard and preferred monthly budget
- Member availability and travel limit

### Provider snapshot

- Location-specific network status by exact plan
- Network verification timestamp
- Specialty and supported procedures
- Appointment slots and observation timestamp
- Contracted/estimated allowed amounts
- Provider charges and verified cash quotes
- Payment-plan terms
- Travel time/distance

### Dentist procedure card

- Procedure and CDT code
- Tooth/area
- Quoted fee
- Dentist-stated urgency
- Earliest, target, and latest safe dates
- Dependencies and healing gaps
- Dentist-approved alternatives
- Whether procedures may share a visit
- Source and confirmation status

## 5. Synthetic plan-option comparison

All premiums are synthetic monthly employee contributions. Percentages are the
plan share after any applicable deductible.

| Benefit | Value DPPO | Core DPPO | Enhanced DPPO |
|---|---:|---:|---:|
| Employee-only monthly premium | $12 | $26 | $45 |
| In-network individual deductible | $75 | $50 | $25 |
| Out-of-network individual deductible | $100 | $75 | $50 |
| Annual maximum | $1,000 | $1,500 | $2,000 |
| In-network preventive | 100% | 100% | 100% |
| In-network basic | 70% | 80% | 90% |
| In-network major | 40% | 50% | 60% |
| Out-of-network preventive | 80% | 80% | 90% |
| Out-of-network basic | 50% | 60% | 70% |
| Out-of-network major | 30% | 40% | 50% |
| Orthodontic benefit | Not covered | 50%, $1,000 lifetime max | 50%, $1,500 lifetime max |
| Implant rule | Excluded | Major-service rate | Major-service rate |
| Demo rollover | None | Up to $250 + $100 network bonus | Up to $350 + $100 network bonus |
| Demo rollover bank cap | $0 | $1,000 | $1,200 |

These differences intentionally exercise deductible, maximum, network,
orthodontic, implant, rollover, premium, and service-class logic. They are not
recommendations for how a real plan should be designed.

## 6. Shared synthetic frequency rules

| Procedure | Demo rule |
|---|---|
| Periodic exam `D0120` | Two per calendar year |
| Adult cleaning `D1110` | Two per calendar year |
| Bitewings `D0274` | One per calendar year |
| Full-mouth X-rays `D0210` | One every 60 months |
| Crown replacement `D2740` | One per tooth every 60 months |
| Fluoride `D1206` | Two per calendar year through age 18 |
| Sealant `D1351` | One per tooth every 36 months through age 15 |

## 7. Files in this package

| File | Runtime purpose |
|---|---|
| `sources/SYNTHETIC_DEMO_BENEFIT_SCHEDULE.md` | Human-readable authoritative source for this demo only |
| `schemas/plan-registry.schema.json` | JSON Schema for validating normalized plan-registry structure |
| `plan-registry/demo_plans.json` | Three normalized, evidence-backed DPPO plan versions |
| `member-snapshots/demo_member.json` | Current member accumulators, finances, and availability |
| `providers/demo_providers.json` | Networks, appointment slots, specialties, and payment plans |
| `pricing/demo_dental_prices.json` | Provider/code charges, allowed amounts, and cash quotes |
| `procedure-cards/demo_procedure_card.json` | Dentist-confirmed post-visit treatment inputs |
| `expected-output/demo_optimization_result.json` | Expected Benefit Passport, recommendation, alternatives, and trace |
| `test-fixtures/golden_scenarios.json` | Required deterministic and no-fabrication tests |

## 8. Primary demo scenario

The fictional member is enrolled in **Core DPPO** and has:

- $800 of annual maximum remaining in 2026
- No in-network deductible remaining in 2026
- $180 FSA balance expiring December 31, 2026
- $300 hard monthly payment limit
- Tuesday/Thursday afternoon availability

The dentist confirms:

- Root canal by October 25, 2026
- Crown after the root canal, safely allowed through January 31, 2027
- Flexible filling by March 31, 2027

Expected optimized result:

1. In-network root canal on October 8, 2026.
   - Allowed amount: $900
   - Plan pays: $720
   - Member pays: $180 from expiring FSA
2. In-network crown on January 5, 2027, after the benefit reset.
   - Allowed amount: $1,000
   - New deductible: $50
   - Plan pays: $475
   - Member pays: $525 over three zero-interest payments of $175
3. In-network filling on January 7, 2027.
   - Allowed amount: $165
   - Deductible already satisfied
   - Plan pays: $132
   - Member pays: $33

Total member responsibility is **$738**. The alternative that performs the
crown in November 2026 and the filling in January 2027 costs **$1,173**, so the
dentist-approved year-boundary schedule saves **$435**.

The provider and member availability fixtures intentionally include an
out-of-network root-canal appointment two days earlier. Its much higher modeled
member cost lets the pre-visit screen show an understandable speed-versus-cost
tradeoff.

## 9. Minimum output contract

Every optimizer response should contain:

```text
recommendation ID and engine version
plan/member/provider/procedure snapshot IDs
selected provider, service date, claim route, and funding schedule
dentist charge, eligible/allowed amount, deductible, plan payment, member payment
benefit state before and after every procedure
monthly payment totals
clinical and operational constraints used
applied rule IDs and source evidence
missing/conflicting/stale data
at least two understandable alternatives
rejection reason for infeasible schedules
```

The AI explanation receives this completed output. It does not recalculate it.

## 10. Recommended implementation order

1. Load and validate `demo_plans.json`.
2. Resolve the exact plan by `plan_version_id` and service date.
3. Implement chronological benefit adjudication using integer cents.
4. Join provider/member availability and build meaningful candidate dates.
5. Run bounded exact search across valid provider/date/claim combinations.
6. Allocate FSA/cash/HSA/payment-plan funding after member responsibility is known.
7. Compare output with `demo_optimization_result.json`.
8. Run every case in `golden_scenarios.json`.
9. Give only the deterministic trace and evidence excerpts to the explanation model.
