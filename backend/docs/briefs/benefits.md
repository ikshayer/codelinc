# Brief — Plan & Benefits agent

**You own:** `data/**` (except `data/sources/**`, which is immutable), `src/benefits/**`, `tests/benefits/**`. Nothing else.

## Read first

1. `docs/spec/Dental_Optimizer_Algorithm_and_Claude_Agent_Spec.md` §2–§4, §7.3, §8, §13, §16
2. `docs/contracts/CONTRACT-v1.md` §1, §2, §3 (normative for you)
3. `src/domain/plan.ts`, `member.ts`, `provider.ts`, `benefits.ts`, `issues.ts`, `money.ts`, `dates.ts`, `fact-ids.ts`, `ports.ts` (`BenefitEngine`, `BenefitsModule`)
4. `data/sources/*.md` + `manifest.json`, `fixtures/golden/registry-expectations.json`, `fixtures/golden/expected.json`, `docs/contracts/golden-scenario.md`

## Deliver

1. **Registry data** — `data/plans/nwd-ppo-standard-2026.json` and `data/plans/nwd-ppo-standard-2027.json`: one `PlanDefinition` each, normalized from the two source documents. **(1.1)** You may generate them with a script you own (e.g. `data/tools/build-plans.mjs`) from `registry-expectations.json` plus a small quote table per rule (section, locator, literal quote) — every value must still be checked against the source page; keep the expectations' array order (e.g. `allowances`). Every rule in `registry-expectations.json` — exact ids, types, statuses, `applies_when`, values, `conflicts_with` — and no others. Every non-UNKNOWN rule cites evidence on the listed page with a **literal** quote from that page. `review.status:"REVIEWED"`, `synthetic:true`.
2. **Source pages** — a small build step you own (e.g. `data/tools/build-sources.mjs` → `data/plans/sources.generated.json`) that reads `manifest.json` + the markdown and emits `SourceDocument[]` with `pages` from `splitSourcePages()`. Commit the generated JSON so `loadRegistry()` uses static imports only (works in Next server and client bundles and in Vitest).
3. **`src/benefits/index.ts`** — keep the exported names; implement `benefitEngine: BenefitEngine` and `loadRegistry()`.
   - Plan-type strategy: an `Adjudicator` interface keyed by `PlanType` with a DPPO implementation only. Other types return `UNSUPPORTED_PLAN_TYPE` (never DPPO logic). Spec §3 "Plan-type strategy".
   - Structured rule lookup (CONTRACT §2.3). Never infer a missing rule; never use an "industry typical" value.
   - Chronological adjudication, ledger, pending reservations, NOT_COVERED, self-pay, steps and fact ids exactly per CONTRACT §3.
   - **1.1.0 changes that save you time:** only 8 calc steps are required (§3.5); a VERIFIED sublimit is `RULE_TYPE_UNSUPPORTED` and `sublimits` is always `[]`; passport needs only `balances`, `rules`, `funding` with worst-case values (§3.7, NOT_APPLICABLE rules are `PLAN_VERIFIED`); `INPUT_STALE` is optional (§1.9).
   - **1.1.0 safety rules:** an input labeled `source:"NEEDS_CONFIRMATION"` is unknown (§1.6); a blocking ledger issue blocks every line of that period and `totals` is null unless OK (§3.1, §3.6); claim lines never read `claim_submission` (§3.3.1); messages never contain free text or `display_name` (§1.11).
   - **Performance (the optimizer calls `simulate` hundreds of times):** never Zod-parse inside `simulate`; never mutate inputs and don't `structuredClone` per call; index rules per plan once (e.g. `WeakMap` keyed by the plan object); `loadRegistry()` parses the JSON once and memoizes.
   - `passport()` per CONTRACT §3.7. `evidenceFor()` returns evidence for the given rule ids only, sorted by rule id.
   - Pure and deterministic: no clock, no I/O at call time, no mutation of inputs (clone before use).
4. **Unit tests** in `tests/benefits/**` (keep it small): rounding (1¢, 101¢ × 50% = 51¢), deductible larger than fee, exhausted maximum with preventive exemption, Dec 31 vs Jan 1, frequency per tooth and rolling months, exclusion, CONFLICT blocking, UNVERIFIED rollover ignored with a warning. Range scenarios are covered by AT-11.

## Acceptance tests you make green

`at00-registry-grounding`, `at01-needs-confirmation` (simulation cases), `at03-05-benefit-invariants` (simulation cases), `at10-…` (simulation cases of AT-10/12/13), `at17-unsupported-plan-types` (`only DPPO` + the three `benefits simulate` cases). Cases that call `optimize()` or `navigate()` — AT-01 care-plan/navigator, AT-03 golden, AT-10 care-plan, all of AT-11, AT-12 navigator, AT-17 care-plan — stay red (`NOT_IMPLEMENTED` from the optimizer) until integration; that is expected. Filter with `-t`, e.g. `npx vitest run tests/acceptance/at17-unsupported-plan-types.test.ts -t "benefits"`.

```bash
npx vitest run tests/acceptance/at00-registry-grounding.test.ts tests/acceptance/at01-needs-confirmation.test.ts tests/acceptance/at03-05-benefit-invariants.test.ts
npx vitest run --project unit tests/benefits
npm run typecheck && npm run lint && npm run check:frozen
```

## Do not

Edit `src/domain/**`, `fixtures/**`, `tests/acceptance/**`, `data/sources/**` or root config · import from `src/optimizer` / `src/ai` / `src/api` · use floats for money · read the clock · fall back to a similar plan · log member data.

Finish with the handoff in `docs/workflow.md`.
