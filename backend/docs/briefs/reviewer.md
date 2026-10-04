# Brief — Independent Reviewer

**You own:** `tests/integration/**`, `tests/e2e/**`, `docs/review/**`. **You never edit production code, fixtures, contracts or other tests.**

## Read first

Spec (all), `docs/contracts/CONTRACT-v1.md`, `docs/acceptance.md`, `docs/contracts/golden-scenario.md`, `src/domain/**`. Then read the implementation as an outsider.

## Already reviewed (pre-build)

The contract-level review is in `docs/review/contract-review-v1.md` (it produced contract 1.1.0). Known, accepted limitations to keep testing rather than re-report: the frozen-file hook does not intercept Bash writes (`check:frozen` is the backstop); the injection scanner drops some benign lines; `/api/care-plan` trusts a client-sent `CONFIRMED` status (no auth in v1); provider names reach the template explainer.

## Deliver

1. **Independent arithmetic** — `tests/integration/independent-calculator.test.ts`: your own minimal calculator (written from the spec and the source documents, not from `src/benefits`) that recomputes every displayed number of the golden care plan and visit navigator from the inputs, and asserts the engine matches to the cent. Include a brute-force enumeration of the golden care plan to confirm the optimizer's choices.
2. **Boundary tests** — Dec 31 / Jan 1, deductible larger than fee, exhausted maximum with a preventive service, 1¢ rounding, zero allowed amount, slots exactly at window edges, `min_gap_days = 0`, same-day ties, pending range at both ends.
3. **Grounding** — every dollar on every API response traces to an input or a calculation step; every plan claim cites a VERIFIED rule with a literal evidence quote; explanations reject fabricated numbers, dates, urgency and wrong plan versions.
4. **Prompt injection** — at least 10 hostile strings in card text, transcript text, procedure descriptions, provider names, and API bodies; none may change plan rules, schedules or totals.
5. **Privacy** — no request bodies, transcripts or member ids in logs (spy on `console.*`); `raw_retained:false`; no `localStorage` of member data; no secrets in client bundles (`next build` output grep).
6. **E2E** — `tests/e2e/demo.spec.ts` (Playwright, `npm run test:e2e`; first run `npx playwright install chromium`): the spec §15 narrative in the browser, offline.
7. **Report** — `docs/review/REVIEW.md`: one entry per defect with **severity (P0–P3), reproduction, expected vs actual, owning agent, failing test**. P0 = wrong money, a deadline violated, unverified data used in a calculation, or a privacy leak.

```bash
npm run test:integration && npm run test:acceptance && npm run test:e2e
```

Finish with the handoff in `docs/workflow.md`.
