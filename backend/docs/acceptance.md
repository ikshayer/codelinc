# Acceptance suite — spec §13 mapped to executable tests

All files are in `tests/acceptance/**` (Planner-owned, frozen). Run one file with `npx vitest run <file>`; all with `npm run test:acceptance`. At freeze time every test fails with `NOT_IMPLEMENTED` — that is the expected red state.

"Turns green when" lists the module(s) whose implementation the test needs. Agents should drive their slice to green before handoff.

| AT | Requirement (spec §13) | Test file | Turns green when |
|---|---|---|---|
| 00 | Registry matches the immutable sources; every rule evidence-backed (supports 1, 2, 17) | `at00-registry-grounding.test.ts` | Benefits |
| 01 | Missing annual max, coverage rate or OON rule → `NEEDS_CONFIRMATION`; CONFLICT blocks | `at01-needs-confirmation.test.ts` | Benefits (+ Optimizer for the care-plan and navigator cases) |
| 02 | Every number and plan claim has evidence or a labeled input | `at02-traceability.test.ts` | Benefits + Optimizer |
| 03 | Plan payments never exceed remaining max/sublimit | `at03-05-benefit-invariants.test.ts` | Benefits (+ Optimizer for the golden case) |
| 04 | Balances never negative; impossible snapshots block | `at03-05-benefit-invariants.test.ts` | Benefits |
| 05 | member + plan + adjustment = modeled charge | `at03-05-benefit-invariants.test.ts` | Benefits |
| 06 | Identical inputs → identical ranked outputs | `at06-determinism.test.ts` | Benefits + Optimizer |
| 07 | Never delayed past the dentist deadline to save money | `at07-09-clinical-constraints.test.ts` | Optimizer |
| 08 | Dependencies and healing intervals respected | `at07-09-clinical-constraints.test.ts` | Optimizer |
| 09 | Provider and member availability intersect | `at07-09-clinical-constraints.test.ts` | Optimizer |
| 10 | Period chosen by service date, not claim/payment date | `at10-13-periods-pending-oon-selfpay.test.ts` | Benefits (+ Optimizer for funding dates) |
| 11 | Pending claims represented, not settled | `at10-13-periods-pending-oon-selfpay.test.ts` | Benefits + Optimizer |
| 12 | OON balance billing included or marked unknown | `at10-13-periods-pending-oon-selfpay.test.ts` | Benefits (+ Optimizer for the navigator lines) |
| 13 | Self-pay compares the whole known portfolio | `at10-13-periods-pending-oon-selfpay.test.ts` | Benefits + Optimizer |
| 14 | Unconfirmed extraction cannot become a clinical constraint | `at14-15-extraction-safety.test.ts` | UX/API/AI + Optimizer |
| 15 | Prompt injection cannot modify rules or optimizer behavior | `at14-15-extraction-safety.test.ts` | UX/API/AI + Optimizer + Benefits |
| 16 | Explanation matches the trace to the cent | `at16-explanation.test.ts` | UX/API/AI (needs Optimizer + Benefits results) |
| 17 | Unsupported plan types fail clearly | `at17-unsupported-plan-types.test.ts` | Benefits (`benefits simulate` cases) + Optimizer (`care plan and visit navigator` cases) |
| 18 | End-to-end demo works with synthetic data, no external APIs | `at18-e2e-synthetic.test.ts` | All |
| 19 | **(1.2)** Cash vs claim: each cash-quoted event compares the whole schedule (worst case) as claim vs self-pay; unknown stays null with `missing` warnings (spec §8, CONTRACT §5.9) | `at19-cash-vs-claim.test.ts` | Benefits + Optimizer |
| 20 | **(1.4)** Exact plan identity per key field and date (PLAN-001); network tier verified per plan version and office, unknown → `NETWORK_STATUS_UNKNOWN`, never priced (PLAN-002); educational sources never back a rule and precedence is a permutation (PLAN-003); expired/undated cash quote never definitive, stale prices warn (PRICE-002); same-day order = `event_id`, stable ranking (§6.5, REC-006) | `at20-plan-identity-network-sources.test.ts` | Benefits + Optimizer |
| 21 | **(1.5)** Year-close carryover: qualifying basis, `<`/`<=` boundary, network bonus, bank and cap, eligible claim, pending range, exact next plan, applied once, urgent care never delayed, trace, unverified path, near-threshold golden variant, explanation, optional `carryover_balance` (requirements §14.2 #1–11, CONTRACT §3.9, §5.10) | `at21-rollover.test.ts` | Benefits + Optimizer + AI |
| — | Golden scenario: exact cents, schedule, funding, deadline-change demo | `golden-scenario.test.ts` | Benefits + Optimizer |
| — | Golden numbers re-derived independently (no `src/` imports) | `scripts/golden-check.mjs` (`npm run golden:check`) | Always green |

**Added in 1.5.0:** AT-21 (year-close carryover; golden values in `fixtures/golden/expected.json` → `postvisit.base.alternatives[].rollover`, `postvisit.rollover_shift_null_for`, `postvisit.variants.rollover_near_threshold`). No existing golden number changed. AT-00 reads an optional `evidence_source_id` (the rider); AT-02 checks the VERIFIED carryover passport item and keeps the unverified case on a registry copy; AT-16 cites the UNKNOWN `claim_submission.2027` for its unverified-rule case; AT-20 compares precedence with the expectations and flags only rules backed solely by the educational source.

**Added in 1.4.0:** AT-20 (plan identity, network per plan, source authority, quote validity and staleness, explicit order). No golden number changed.

**Added in 1.2.0:** AT-19 (cash vs claim route comparison, golden values in `fixtures/golden/expected.json` → `postvisit.route_comparisons`). No existing golden number changed.

**Changed in 1.1.0:** AT-01 adds a plan-identity case (a changed group id → `PLAN_NOT_FOUND`, never a similar plan); AT-02 accepts NOT_APPLICABLE rules as plan-verified passport items; AT-07/08 opens the crown window so the Oct 29 check really tests the 14-day healing gap; AT-15 asserts injected free text never appears in engine output; AT-16's dollar regex reads "$1372" as $1,372; AT-17 splits benefits from optimizer cases. No golden number changed.

## Test doubles while you build

- **Benefits** can make AT-00/01/03/04/05/10/12 and the benefit parts of 11/13/17 green alone.
- **Optimizer** needs a working `BenefitEngine`. Until Benefits lands, unit-test your pure helpers in `tests/optimizer/**` (a fake engine is optional), and run the acceptance files once Benefits merges. Never copy adjudication math into the optimizer.
- **UX/API/AI** builds screens against `fixtures/mock-responses/**` (schema-valid, `meta.generated_by:"mock"`) and unit-tests extraction/validation in `tests/ai/**`. Production code must never import mocks.

## Reviewer additions (Phase 4)

The Reviewer adds, without editing production code: an independent calculator for every golden number (`tests/integration/**`), boundary cases (Dec 31 / Jan 1, deductible larger than fee, zero maximum, rounding of 1¢), more prompt-injection strings, privacy checks (no body logging, no persisted raw text), and a Playwright run of the demo narrative (`tests/e2e/**`).
