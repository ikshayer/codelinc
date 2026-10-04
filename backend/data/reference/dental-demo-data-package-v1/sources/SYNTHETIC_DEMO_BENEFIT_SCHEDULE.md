# Synthetic Demo Dental Benefit Schedule — 2026

**Source ID:** `synthetic-demo-benefit-schedule-2026-v1`  
**Status:** Authoritative for the hackathon demo only  
**Not an actual Lincoln Financial Group plan**

## Plan identity and applicability

All three options are synthetic calendar-year DPPO plans whose demo version is
effective January 1, 2026 through December 31, 2027, with accumulators resetting
on January 1, 2027. Real production calculations should use separately verified
plan versions for each benefit year rather than assuming unchanged renewal.

## Monthly employee contributions

| Enrollment tier | Value | Core | Enhanced |
|---|---:|---:|---:|
| Employee only | $12 | $26 | $45 |
| Employee + spouse | $26 | $54 | $92 |
| Employee + children | $30 | $65 | $112 |
| Family | $46 | $98 | $168 |

## Deductibles and maximums

| Benefit | Value | Core | Enhanced |
|---|---:|---:|---:|
| In-network individual deductible | $75 | $50 | $25 |
| In-network family deductible | $225 | $150 | $75 |
| Out-of-network individual deductible | $100 | $75 | $50 |
| Out-of-network family deductible | $300 | $225 | $150 |
| Annual maximum per member | $1,000 | $1,500 | $2,000 |
| Orthodontic lifetime maximum | Not covered | $1,000 | $1,500 |

The annual maximum is a combined in-network/out-of-network maximum and tracks
plan-paid amounts. Preventive care waives the deductible but counts toward the
annual maximum in this synthetic demo.

## Plan share by service class

| Option | Network | Preventive | Basic | Major | Orthodontic |
|---|---|---:|---:|---:|---:|
| Value | In-network | 100% | 70% | 40% | Not covered |
| Value | Out-of-network | 80% | 50% | 30% | Not covered |
| Core | In-network | 100% | 80% | 50% | 50% |
| Core | Out-of-network | 80% | 60% | 40% | 50% |
| Enhanced | In-network | 100% | 90% | 60% | 50% |
| Enhanced | Out-of-network | 90% | 70% | 50% | 50% |

For in-network services, the contracted amount is the patient-charge basis and
the provider cannot balance bill in this demo. For out-of-network services, the
plan calculates on its recognized allowance and the member pays the provider
charge minus the plan payment, including any balance bill.

## Demo service classification

| CDT | Service | Value | Core | Enhanced |
|---|---|---|---|---|
| D0120 | Periodic exam | Preventive | Preventive | Preventive |
| D1110 | Adult cleaning | Preventive | Preventive | Preventive |
| D0274 | Bitewings | Preventive | Preventive | Preventive |
| D2392 | Two-surface posterior composite filling | Basic | Basic | Basic |
| D3330 | Molar root canal | Basic | Basic | Basic |
| D7140 | Simple extraction | Basic | Basic | Basic |
| D4341 | Scaling/root planing, per quadrant | Basic | Basic | Basic |
| D2740 | Ceramic crown | Major | Major | Major |
| D2950 | Core buildup | Major | Major | Major |
| D6010 | Implant placement | Excluded | Major | Major |
| D8080 | Comprehensive orthodontics | Excluded | Orthodontic | Orthodontic |

## Frequency and age limits

- D0120 periodic examination: two per calendar year.
- D1110 adult cleaning: two per calendar year.
- D0274 bitewings: one per calendar year.
- D0210 full-mouth X-rays: one every 60 rolling months.
- D2740 crown replacement: one per tooth every 60 rolling months.
- D1206 fluoride: two per calendar year through age 18.
- D1351 sealant: one per tooth every 36 rolling months through age 15.

## Waiting periods

On-time enrollees have no waiting period in the synthetic demo. Late entrants
have a six-month waiting period for basic services and a twelve-month waiting
period for major and orthodontic services.

## Synthetic rollover rules

- Value: no rollover.
- Core: when eligible plan-paid claims for the year do not exceed $600, add
  $250 to the next-year bank plus a $100 network-use bonus; $1,000 bank cap.
- Enhanced: when eligible plan-paid claims for the year do not exceed $800, add
  $350 plus a $100 network-use bonus; $1,200 bank cap.

Rollover is calculated only after the plan year closes and only from settled,
eligible claims. This demo member exceeds the Core threshold, so no rollover is
added to the 2027 scenario.

## Self-pay and claim submission

Self-pay/no-claim is not a universal plan right. It may be modeled only when a
provider-specific record contains a verified cash quote, confirms the option is
permitted, and states the accumulator treatment. A no-claim demo expense does
not affect deductible, annual maximum, or procedure history unless the provider
submits a claim or the plan explicitly records it.

## Predetermination

A pre-treatment estimate is recommended for major treatment when available.
It remains an estimate and does not guarantee final claim payment.
