# CareWindow MVP loop: current plan

Planner: Agent 1, iteration 1. Date: 2026-10-04. Branch: `feature/cash-vs-claim`. The uncommitted working tree (contract 1.3.0, the cash-vs-claim feature, and the `/care-window` wiring) is the baseline. Do not revert any of it.

---

## 1. Iteration number and goal

**Iteration 1: baseline and contract hardening (contract 1.3.0 → 1.4.0).**

Goal: every claim line knows exactly which plan it is priced under and how far its inputs can be trusted, before later iterations build rollover, modes and locks on top. Concretely:

1. **Network tier per plan and location (PLAN-002).** A provider's network status counts only when it was verified against the plan network of the plan version that the **service date** resolves to. If the status is missing, or was checked against a different network, the line becomes a blocking `NETWORK_STATUS_UNKNOWN` and is never priced.
2. **Source roles and precedence (PLAN-003).** Every source document declares its role. Each plan declares an ordered source precedence. Educational or marketing material can never back a rule that is used in a calculation.
3. **Price-fact validity (§9 PRICE-002, plus the quote-validity part of FUND-003).** A cash quote carries a valid-through date. A self-pay line whose service date is after that date, or whose quote has no validity date, cannot be definitive. Stale price inputs emit `INPUT_STALE`.
4. **Deterministic order (REC-006, ARCH-008, §6.5 bullets 1–2).** Pin the existing tie-break and same-day order in the contract and in tests. No new behavior.
5. **Exact plan-key resolution (PLAN-001).** This is already implemented. Prove it with tests.
6. **Residual review clean-ups.** These are small items left after REVIEW pass 2 (§10).

No golden number changes. No new API route. No UI feature beyond showing a "network status needs confirmation" state.

---

## 2. Baseline status and commands run

Run on 2026-10-04 against the working tree, before any change. Everything is green.

| Where | Command | Result |
|---|---|---|
| backend | `npm run check:frozen` | `frozen files OK (62)` |
| backend | `npm run golden:check` | `GOLDEN OK … (contract 1.2.0 rules)`. The banner is stale (see §10). |
| backend | `npm run typecheck` | clean (exit 0) |
| backend | `npm run lint` | clean (exit 0) |
| backend | `npx vitest run --project unit` | 3 files, 22/22 passed |
| backend | `npx vitest run --project contracts` | 2 files, 25/25 passed |
| backend | `npx vitest run --project acceptance` | 13 files, 97/97 passed |
| backend | `npx vitest run --project integration` | 8 files, 54/54 passed |
| backend | `npx vitest run` (all) | 26 files, 198/198 passed |
| backend | `npm run build` | **no such script.** The backend is a tsx/Node service with no build step. `npm run verify` = check:frozen → golden:check → typecheck → lint → contracts → unit → acceptance → integration, and contains **no** `next build`, even though `backend/CLAUDE.md` and `docs/workflow.md` say it does. Those are stale docs (§10). |
| frontend | `npm run typecheck` (`next typegen && tsc --noEmit`) | clean |
| frontend | `npm run lint` | clean |
| frontend | `npm test` | 9 files, 126/126 passed |
| frontend | `npm run build` (`next build`) | success; routes include `/care-window` and the old `/analysis/*` |

The backend `serve` and the browser flow were not exercised in this planning pass. REVIEW pass 2 exercised them.

---

## 3. Requirements covered by ID

| ID | Status before | What this iteration delivers |
|---|---|---|
| PLAN-001 | Present: `PlanKey` has carrier, group, option, `jurisdiction` and `network_id` (`src/domain/plan.ts:PlanKey`, `samePlanKey`), and `resolvePlanVersion` filters by service date (`src/benefits/rules.ts`). There is no test per key field. | Tests only: changing each key field, or using a date outside coverage, gives `PLAN_NOT_FOUND` and never borrows from another plan. |
| PLAN-002 | Partial: the tier is already a per-provider-location observation (`ProviderOption.network.{tier, network_id, observed_at}`, `location_id`). But `network.network_id` is **never compared** with the plan key (grep: there is no use in `src/benefits`/`src/optimizer`), and there is no UNKNOWN tier. | Tier is resolved per event against the resolved plan version's `key.network_id`. A null tier means unknown. Unknown leads to blocking `NETWORK_STATUS_UNKNOWN`, which surfaces as missing data, never as a price. |
| PLAN-003 | Missing: `SourceDocument` has no role and `PlanDefinition` has no precedence. In-source conflicts already work (`frequency_limit.crowns.2027` ↔ `crowns_note_4.2027`, both CONFLICT and each citing its own passage). | `SourceDocument.document_role` and `PlanDefinition.source_precedence` are added. `validatePlan` rejects rules backed only by educational sources and rejects an invalid precedence list. |
| PRICE-002 | Missing: benefits never emits `INPUT_STALE` (CONTRACT §1.9 marks it MAY), and quotes have no validity date. | `ProcedurePrice.cash_quote_valid_through` is added. An expired quote gives blocking `PRICE_QUOTE_EXPIRED`. A missing validity date gives `SELF_PAY_NOT_VERIFIED`. A stale price input gives a line `warning INPUT_STALE` (now required). |
| §9 PriceFact shape | Partial (see the mapping in §5.4). | The mapping is documented in the contract. `MARKET_BENCHMARK` and `PREDETERMINATION` are deferred (no such inputs exist yet). |
| PRICE-003, PRICE-004, PRICE-005 | Present: `OON_CHARGE_UNKNOWN`/`ALLOWED_AMOUNT_UNKNOWN` block; `balance_bill` is a separate line field; AT-03–05 checks that charge = plan + member + adjustment. | Re-verified by the Reviewer. No code change. |
| REC-006, ARCH-008 | Present: `tie_key` (`care-plan.ts:calculateObjective`, around line 567) is the final ranking key, and AT-06 checks byte-identical output under input permutation. | Contract text plus tests: §14.3 #2 and §14.1 #10 ("stable" branch). |
| §6.5 (bullets 1–2) | Present: simulate sorts by `(service_date, event_id)` (`simulate.ts:315`), and the optimizer assigns event ids in `(service_date, start_time, procedure_id)` order (CONTRACT §5.3). | `event_id` is documented as the explicit sequence. A test proves same-day order follows `event_id` and does not depend on the order of the input array. Bullet 3 (order-sensitivity range or warning) is deferred to iteration 3. |
| ARCH-006, ARCH-007 | Present. | Extended to network and source authority. |

---

## 4. Exact files and symbols expected to change

Frozen paths (F) follow the UNFREEZE procedure in §5.1. Owner directories follow `backend/docs/ownership.md`. Because the loop runs one Implementer, that single agent edits all of them. This plan is the approved change request.

### Backend: domain (F)

- `src/domain/plan.ts`
  - New `SourceRole = z.enum(["certificate","group_policy","state_rider","amendment","schedule_of_benefits","employer_summary","educational"])`.
  - New `AUTHORITATIVE_SOURCE_ROLES` (every role except `educational`).
  - `SourceDocument` gets the field `document_role: SourceRole`.
  - `PlanDefinition` gets the field `source_precedence: z.array(Id).min(1)`: source ids ordered highest authority first.
- `src/domain/provider.ts`, `ProviderOption.network`:
  - `tier: NetworkTier.nullable()` (null means unknown).
  - Doc comment: `network_id` is **the plan network this status was verified against**. It is required for the status to count (the type stays nullable, and null means "not verified for any plan").
  - `ProcedurePrice` gets the field `cash_quote_valid_through: IsoDate.nullable()`.
- `src/domain/optimizer.ts`: `VisitOption.network_tier` becomes `NetworkTier.nullable()` (around line 108).
- `src/domain/issues.ts`, `IssueCode`, add:
  - `NETWORK_STATUS_UNKNOWN` under Inputs
  - `PRICE_QUOTE_EXPIRED` under Inputs
  - `SOURCE_NOT_AUTHORITATIVE` under Plan registry
  - `SOURCE_PRECEDENCE_INVALID` under Plan registry
- `src/domain/version.ts`: `CONTRACT_VERSION = "1.4.0"`. Optionally bump `ENGINE_IDS.benefits` to `"benefits-dppo-2"`. If you bump it, update every literal that pins it.
- `src/domain/policy.ts`: no change. `STALENESS_HOURS.prices` already exists.

### Backend: data and registry

- `data/sources/manifest.json` (F): add `"document_role": "schedule_of_benefits"` to both sources. The `.md` bytes and sha256 stay unchanged.
- `data/tools/build-registry.ts`: carry `document_role` into `sources.generated.json`, and emit `source_precedence: [<the plan's source_id>]`. Regenerate `data/plans/nwd-ppo-standard-{2026,2027}.json` and `data/plans/sources.generated.json`. **Only those two keys may differ.** Check with `git diff --stat` and `jq`.

### Backend: benefits (`src/benefits/`)

- `rules.ts` or `index.ts`, at `validatePlan`:
  - (a) For each VERIFIED rule, at least one `EvidenceRef` must cite a source whose `document_role ∈ AUTHORITATIVE_SOURCE_ROLES`. Otherwise add `SOURCE_NOT_AUTHORITATIVE` (blocking, with `rule_id`) and set `ok=false`.
  - (b) `source_precedence` must be a permutation of `source_documents[].source_id`. Otherwise add `SOURCE_PRECEDENCE_INVALID` (blocking) and set `ok=false`.
- `simulate.ts`, the per-line function (around lines 335–460):
  - New pure helper `effectiveNetworkTier(plan, provider)`: returns `provider.network.network_id === plan.key.network_id ? provider.network.tier : null`. Export it only if the navigator needs it. Prefer reading the line's `network_tier` instead.
  - **Reorder**: resolve the plan version (current step 2) **before** the route check (current step 1, `tierRoute` around line 366).
  - Claim line: if the effective tier is null, block with `NETWORK_STATUS_UNKNOWN` (`input_id = provider.network.input_id`, `procedure_id`, `provider_id`), and set the line's `network_tier: null`. Otherwise run `CLAIM_ROUTE_INVALID` against the effective tier as today.
  - Self-pay line (around line 398): the "in-network office must submit" test uses the effective tier. If the effective tier is null and `network_provider_must_submit` is true, block with `NETWORK_STATUS_UNKNOWN`.
  - Self-pay line: after the exact-quote check:
    - `cash_quote_valid_through === null` → `SELF_PAY_NOT_VERIFIED`, `input_id = <cash_quote.input_id>`.
    - `service_date > cash_quote_valid_through` → `PRICE_QUOTE_EXPIRED` (blocking), same input id.
  - Staleness: for each price input the line reads (`provider_charge`, `contracted_allowed`, `cash_quote`), when `ageHours(observed_at, as_of) > STALENESS_HOURS.prices`, add a line `warning INPUT_STALE` with that `input_id`. This must not change status or money. Reuse the existing `ageHours` pattern from `src/optimizer/shared.ts`, or move it to `src/domain/dates.ts` if a domain helper fits better. Do not copy it.
  - Line `network_tier` field (around line 346): use the effective tier, which is null when unknown or when the provider is missing.

### Backend: optimizer (`src/optimizer/`)

- `shared.ts:providerClaimRoute`: a null observed tier maps to `"OUT_OF_NETWORK_CLAIM"` as a placeholder. Document it in a one-line comment: benefits blocks the line with `NETWORK_STATUS_UNKNOWN` before any pricing, so the placeholder can only ever surface as missing data. Do **not** drop the candidate. Dropping it would turn missing data into `NO_SLOT_IN_WINDOW` (CONTRACT §5.3 U_ok/U_all).
- `navigator.ts` around line 151: set `network_tier` from the simulated line's `network_tier` (benefits-owned, null when unknown), not from `provider.network.tier`.
- `care-plan.ts`: no logic change expected. Verify that `route_comparison.missing` picks up `PRICE_QUOTE_EXPIRED`/`NETWORK_STATUS_UNKNOWN` through the existing downgrade path.

### Backend: fixtures, scripts and docs

- `fixtures/synthetic/providers.{previsit,postvisit}.json` (F):
  - BrightSmile `network.network_id: null → "nwd-ppo"`. It is out of network for the nwd-ppo plan, which keeps the golden numbers unchanged.
  - Every `pricing[]` row gets `"cash_quote_valid_through": null`, except Rivera D2392 (cash quote $150), which gets `"2027-06-30"` (= `planning_horizon_end`). That covers every golden self-pay date (2026-10-22, 2026-12-03) and the base 2027-01-05 comparison, so `route_comparisons.missing_codes` stays `["RULE_UNKNOWN"]`.
- `fixtures/mock-responses/*.json` (F): regenerate with `npx tsx scripts/build-mocks.ts`. Only `contract_version` "1.3.0" → "1.4.0" may change (4 files contain it).
- `fixtures/golden/expected.json` (F): **no numeric change.** Update only a version label if one exists. `grep 1.3.0` finds none in the values.
- `scripts/golden-check.mjs` (F): fix the banner to print the current contract version (read it from `src/domain/version.ts` or hard-code "1.4.0"). No arithmetic change.
- `scripts/build-mocks.ts`: add the new required keys wherever it builds `ProviderOption`/`VisitOption` objects.
- `docs/contracts/CONTRACT-v1.md` (F): mark changed clauses **(1.4)**:
  - §2.1: `document_role`, `source_precedence`.
  - §2.4: the two new validation checks.
  - §3.3 step 1: rewrite as "plan version → effective network tier → route".
  - §3.4: quote validity, plus `NETWORK_STATUS_UNKNOWN` for must-submit.
  - §1.9: price staleness is **required** from benefits.
  - §3.2: `event_id` is the explicit same-day sequence. The optimizer assigns it in `(service_date, start_time, procedure_id)` order. Order-sensitivity reporting is deferred.
  - §4.4: `network_tier` comes from the line and is nullable.
  - New §3.8 "Price facts": the mapping in §5.4 of this plan, and benchmark/predetermination deferred.
- `docs/contracts/CHANGELOG.md`: add a 1.4.0 entry. `docs/decision-log.md`: add D-027, recording network-per-plan, the schedule_of_benefits role assumption, the quote validity gate, and why the bump is minor.
- `docs/contracts/golden-scenario.md` (F): one line saying "1.4.0: numbers unchanged, re-verified by golden:check".
- `docs/acceptance.md` (F): list AT-20.
- `docs/contracts/FROZEN.sha256`: regenerated by `npm run freeze`.
- `backend/CLAUDE.md`, `docs/workflow.md`: fix the stale command lines. There is no `npm run dev`, no `test:e2e`, and no `next build` in `verify`. State the real `serve` command and the real `verify` chain. Also fix the 1.3.0 → 1.4.0 mentions.
- `backend/README.md`: document `ALLOWED_ORIGINS` (default `http://localhost:3000`) next to `npm run serve`.

### Frontend (`frontend/src/`)

- `features/care-window/visit-navigator.tsx:219`: handle `network_tier === null` by showing "Network status needs confirmation". Do not default to "Out of network".
- `features/care-window/parts.tsx`, the code→label map (around line 50): add member-wording labels for `NETWORK_STATUS_UNKNOWN` ("Confirm this office is in network for your plan"), `PRICE_QUOTE_EXPIRED` ("The office's cash price has expired"), `SOURCE_NOT_AUTHORITATIVE`, and `SOURCE_PRECEDENCE_INVALID`. The last two never reach the UI in the demo, but the fallback is fine for them.
- `lib/adapters/live/engine.ts`: no code change. Its types come from `@engine/*` (`frontend/tsconfig.json`), so the typecheck will flag every place that reads the widened fields.
- `fixtures/cash-vs-claim.ts`: no change (its values are unchanged). It is a duplicated fixture, and iteration 7 removes it (§13).
- `.env.example`: one comment line saying the backend must allow this origin (`ALLOWED_ORIGINS`).

---

## 5. Contract and schema changes

### 5.1 Procedure (backend/docs/workflow.md)

From `backend/`:

1. `touch .claude/UNFREEZE`
2. Edit the frozen files listed in §4.
3. Set `CONTRACT_VERSION = "1.4.0"`.
4. Regenerate the registry and mocks.
5. Run `npm run freeze`.
6. `rm .claude/UNFREEZE`
7. Write the CHANGELOG and decision-log entries.

`npm run check:frozen` must pass afterwards. The marker file must **not** remain.

### 5.2 Version: 1.3.0 → 1.4.0 (minor)

Justification: every request-side shape change widens a type (`tier` nullable). The new required keys (`document_role`, `source_precedence`, `cash_quote_valid_through`) live on server-owned registry data or on synthetic provider fixtures, and every in-repo producer migrates in the same change. There are no external clients. The response change (`VisitOption.network_tier` nullable) widens a type. The new issue codes add enum members. The precedent is that 1.1.0, 1.2.0 and 1.3.0 were all minor bumps. The decision log must record this reasoning (D-027).

### 5.3 Behavioral changes

1. **Effective network tier**: equals `provider.network.tier` only when `provider.network.network_id === resolvedPlan.key.network_id`. Otherwise it is unknown, which gives blocking `NETWORK_STATUS_UNKNOWN`. It is evaluated per event, per service date.
2. **Self-pay gate**: requires a non-null `cash_quote_valid_through` that is on or after `service_date`.
3. **Price staleness warning**: required (previously MAY).
4. **Registry validation**: adds the authority and precedence checks.

### 5.4 PriceFact mapping (documented, not a new type)

| §9 `amountType` | Existing field |
|---|---|
| `PROVIDER_CHARGE` | `ProcedurePrice.provider_charge` |
| `CONTRACTED_ALLOWED` | `ProcedurePrice.contracted_allowed` |
| `OUT_OF_NETWORK_ALLOWANCE` | registry rule `oon_allowance_schedule.<y>` (plan-derived, evidence-backed) |
| `VERIFIED_CASH_QUOTE` | `ProcedurePrice.cash_quote` + `cash_quote_valid_through` |
| `PREDETERMINATION`, `MARKET_BENCHMARK` | not modeled in 1.4; deferred to iteration 6 (no fixture uses them) |

`factId`/`source`/`observedAt` = the `SourcedMoney` `input_id`/`source`/`observed_at`. `providerId`/`locationId` = the enclosing `ProviderOption`. `planVersionId` = the line's resolved plan version. `lowerCents`/`upperCents` = `MoneyInput.range`. Ponytail: no parallel `PriceFact` type. Add one only if benchmarks or predeterminations need fields that the existing shape cannot hold.

### 5.5 Golden numbers

**Unchanged.** All golden providers are verified against `nwd-ppo`, and the one cash quote is valid through the horizon. `npm run golden:check` must print GOLDEN OK. `tests/acceptance/golden-scenario.test.ts` and AT-19 must pass unmodified.

---

## 6. Migration and caller list

Search each one after the change: `grep -rn "network\.tier\|network_tier\|cash_quote\|SourceDocument\|source_documents\|document_role\|CONTRACT_VERSION\|1\.3\.0"` in `backend/` and `frontend/src`.

**Backend**

- `src/benefits/simulate.ts`: lines 346 and 366 (network tier, route), line 398 (self-pay must-submit), and the self-pay quote branch.
- `src/benefits/index.ts` / `rules.ts`: `validatePlan`, and `loadRegistry` (parses the new keys).
- `src/optimizer/shared.ts:providerClaimRoute` (line 67).
- `src/optimizer/navigator.ts:151`.
- `src/optimizer/care-plan.ts`: candidate routes through `providerClaimRoute`, and the route_comparison `missing` path. Verify only.
- `src/api/index.ts`: schemas come from the domain. Verify that the strict parse accepts the new provider keys and rejects unknown ones.
- `src/ai/explain.ts`: `missing_fields` code filter (CONTRACT §6.2). Add `NETWORK_STATUS_UNKNOWN` and `PRICE_QUOTE_EXPIRED` to the codes listed, so the explanation names them. Update the §6.2 text to match.
- `src/api/demo-cli.ts`: verify that it still prints the golden story.
- `data/tools/build-registry.ts`, `data/plans/*.json`, `data/plans/sources.generated.json`.
- `scripts/build-mocks.ts`, `scripts/golden-check.mjs`.
- `fixtures/synthetic/providers.{previsit,postvisit}.json`, `fixtures/mock-responses/*.json`, `fixtures/golden/expected.json` (verify only).
- Tests that read the tier or quote:
  - `tests/acceptance/at07-09-clinical-constraints.test.ts`
  - `tests/acceptance/at10-13-periods-pending-oon-selfpay.test.ts`
  - `tests/acceptance/at19-cash-vs-claim.test.ts`
  - `tests/integration/pass2-variants.test.ts`
  - `tests/optimizer/mvp-before-after.test.ts`
  - `tests/acceptance/helpers.ts` (parses the fixtures)
  - `tests/contracts/fixtures.test.ts`

  Any test that builds a provider or price literal must add the new keys. Do **not** change expected values.

**Frontend**

- `src/lib/adapters/live/engine.ts`: type pass-through, verify only.
- `src/features/care-window/visit-navigator.tsx:219`: null tier.
- `src/features/care-window/parts.tsx`: issue labels.
- `src/features/care-window/care-plan.tsx`, `care-window-screen.tsx`, `passport-summary.tsx`: verify that they compile against the widened types.
- `src/features/analysis/compare/cash-vs-claim-card.tsx` and `src/fixtures/cash-vs-claim.ts`: no change (they use local types).
- `.env.example`: comment only.

---

## 7. Tests to write first or alongside

Write them red first. Each test cites its requirement ID in its `describe` name.

**`backend/tests/acceptance/at20-plan-identity-network-sources.test.ts`** (new, frozen after freeze):

1. **PLAN-001**: for each of `carrier_id`, `group_id`, `plan_option_id`, `jurisdiction`, `network_id`, changing the member key gives `PLAN_NOT_FOUND`, and no line carries a `plan_version_id`. A service date of 2028-01-03 also gives `PLAN_NOT_FOUND`.
2. **PLAN-002, case a**: Rivera with `network.network_id = "other-net"` gives an in-network claim line `NEEDS_CONFIRMATION` with `NETWORK_STATUS_UNKNOWN`, `network_tier:null` and money null.
3. **PLAN-002, case b**: `tier:null` gives the same result.
4. **PLAN-002, case c**: the care plan with Rivera unknown never returns a priced Rivera event. Status and `unresolved` name `NETWORK_STATUS_UNKNOWN`, and nothing is reported as `NO_SLOT_IN_WINDOW` for that reason.
5. **PLAN-002, case d**: the navigator option for an unknown-tier provider is `NEEDS_CONFIRMATION` with `network_tier:null`.
6. **PLAN-002, case e**: per-event resolution. Within one simulation, run a 2026 event and a 2027 event at Rivera (`network_id "nwd-ppo"`). Both lines are OK, and each line's `plan_version_id` is that event's own version. Then run a case-a provider in the same request: only its lines block. This proves the tier is evaluated per line and per office, not once per member.
7. **PLAN-003**: a registry copy whose source is `document_role:"educational"` makes `validatePlan` give `ok:false` with `SOURCE_NOT_AUTHORITATIVE` for every VERIFIED rule citing it. `source_precedence` naming an unknown or missing id gives `SOURCE_PRECEDENCE_INVALID`. The shipped registry stays `ok:true`.
8. **PRICE-002 / quote validity**: Rivera D2392 self-pay with `cash_quote_valid_through = "2026-10-21"` and service 2026-10-22 gives `PRICE_QUOTE_EXPIRED`. With `null` it gives `SELF_PAY_NOT_VERIFIED`. The `filling_this_year_only`-style care plan then does not choose self-pay, and `route_comparison.missing` lists the code as a warning.
9. **PRICE-002 staleness**: a price `observed_at` 91 days before `as_of` gives a line `warning INPUT_STALE` with that input id. Status and money are identical to the fresh run.
10. **§6.5 / §14.1 #10**: two same-day claim events (for example D2392 and D0220 at Rivera on one date). Shuffling the `events` array gives byte-identical output. Swapping their `event_id`s swaps the adjudication order, which shows up in `state_before`, so the sequence is explicit.
11. **REC-006 / §14.3 #2**: the golden care plan run 3 times plus 2 input permutations gives an identical `alternatives[].tie_key`/`schedule_key` order. Reuse the AT-06 helpers and do not duplicate them.

**Benefits unit tests**, in `backend/tests/benefits/` (owner benefits): `validatePlan` authority/precedence edge cases, and the reordered `CLAIM_ROUTE_INVALID` still firing when the effective tier is known but the route mismatches.

**Frontend**: a component or unit test that the navigator option renders "Network status needs confirmation" for `network_tier:null`. Use the existing vitest setup and add it beside the current care-window tests if any exist; otherwise add one minimal test.

---

## 8. Acceptance commands

All must pass. Paste the exact counts into `docs/mvp-loop/implementation-handoff.md`.

```bash
cd backend
npm run check:frozen          # passes, with the count updated for at20; .claude/UNFREEZE absent
npm run golden:check          # GOLDEN OK, banner shows 1.4.0
npm run typecheck && npm run lint
npx vitest run                # all projects green; report per-project counts (baseline 22/25/97/54 = 198) plus new tests
npm run verify                # full chain green
npx tsx scripts/build-mocks.ts && git diff --stat fixtures/mock-responses   # only version strings changed
npm run demo:cli              # golden story unchanged ($1,372 / $908)

cd ../frontend
npm run typecheck && npm run lint && npm test && npm run build
```

Browser check (UI-014 smoke):

1. Run `cd backend && npm run serve` and `cd frontend && npm run dev`.
2. Open `/care-window` and run the whole path: passport → navigator → extract → confirm → care plan → explanation.
3. Confirm zero console errors and no failed `/api/engine/*` requests.
4. Confirm the golden totals still show.

`git diff -- backend/fixtures/golden/expected.json` must show no numeric change.

---

## 9. Risks and explicit non-goals

**Risks**

1. **Route-check reorder** in `simulate.ts`. Resolving the plan before the route check changes which blocking issue wins when both fail. Example: an unknown provider price plus a wrong route. AT-01 and AT-10–13 may pin the first issue. Run them before and after. If a pinned order changes, stop and report it. Do not rewrite expectations.
2. **Placeholder route for an unknown tier.** If any path prices the placeholder `OUT_OF_NETWORK_CLAIM` before benefits blocks it, an unknown office would silently be shown as out of network. Test case 4 must assert there are no money fields.
3. **Missing data vs no slot.** An unknown-network candidate must reach simulation, so it counts in `U_all` (CONTRACT §5.3). Dropping it at candidate build would hide the missing fact.
4. **Frozen-file churn.** About 16 frozen files change. Forgetting `npm run freeze`, or leaving `.claude/UNFREEZE` behind, breaks `check:frozen`. The guard hook only loads for sessions started in `backend/`. When working from the repository root, rely on `check:frozen` and git.
5. **Registry regeneration** could reorder or re-quote rules. Only the two new keys may differ in `data/plans/*.json`.
6. **The `schedule_of_benefits` role is an assumption.** The synthetic docs are titled "Summary of Dental Benefits". Record it in D-027. If they were classed `employer_summary`, that is still authoritative, so behavior is the same.
7. **Staleness warnings** could appear in the golden run if any price `observed_at` is more than 90 days before `as_of`. Today they are 14 days old, so none should. If golden `unresolved` changes, stop and report it.

**Explicit non-goals for iteration 1**

- Rollover (iteration 2): `rollover.2026` stays UNVERIFIED.
- Value/Enhanced options (iteration 2b).
- Modes and SolverMeta (iteration 3).
- Same-day order-sensitivity range or warning (iteration 3).
- Locks and custom plans (iteration 4).
- Payment plans and the full FUND-003 gate (iteration 5).
- MARKET_BENCHMARK/PREDETERMINATION inputs and evidence badges (iteration 6).
- Retiring `/analysis` and removing the duplicated frontend golden fixture (iteration 7).
- No live availability, Whisper/audio/transcription, or live OCR (requirements §2).
- No new API route.
- No golden number change.

---

## 10. Prior-review findings being addressed

`backend/docs/review/REVIEW.md`:

| Finding | State at baseline | Action this iteration |
|---|---|---|
| P1-1 fresh-period silent confirmation | Fixed. Pass-2 re-verified, integration green. | None |
| P1-2 OON allowance evidence | Fixed (row quotes). | None |
| P1-3 / P2-1 urgent route offers delay | Fixed (CONTRACT §4.6 1.3). | None |
| P2-2 / P2-5 validator grammar | Fixed. `pass2-variants.test.ts` green (54/54 integration). | None |
| P2-3 injection scanner normalization | Fixed. | None |
| P2-4 X-Forwarded-Host origin | Fixed (compares with `Host`). | None |
| P1-4 Next proxy rejected as cross-origin | Fixed in code: `server.ts` defaults `ALLOWED_ORIGINS=http://localhost:3000`. **Residual:** it is documented only in a `server.ts` comment, not in `backend/README.md` or `frontend/.env.example`, which the review asked for. | Document it (§4). |
| Pass-2 note: golden-check banner says "contract 1.2.0 rules" | Residual. | Fix the banner (§4). |
| (Planner) stale `backend/CLAUDE.md`/`workflow.md` commands (`npm run dev`, `test:e2e`, "verify … plus next build") | Residual doc drift. | Fix it (§4). |

---

## Release roadmap (gap analysis, requirements §3–§14 vs current code)

Legend: **P** = present, **Pa** = partial, **M** = missing. "Iter" is the iteration that closes it (numbering follows requirements §16).

| Group / ID | State | Evidence (file:symbol) | Iter |
|---|---|---|---|
| ARCH-001 integer cents | P | `src/domain/money.ts`, `Cents`; D-004 rounding | — |
| ARCH-002 service/claim/payment dates separate | P | CONTRACT §3.2; `funding` has `payment_date = service_date` | 5 (payment-plan dates) |
| ARCH-003/004 engine is the only calculator; optimizer calls the engine | P | `care-plan.ts` uses the injected `BenefitEngine.simulate`; route_comparison re-simulates (§5.9) | — |
| ARCH-005 frontend only formats | Pa | `/care-window` renders engine fields; old `/analysis` uses `src/fixtures/calculation-fixtures.ts` + `lib/adapters/mock/calculation.ts` (stale numbers; live adapter calls a nonexistent `/api/calculate`) | 7 |
| ARCH-006 only VERIFIED rules | P | CONTRACT §2.3/§3.3; AT-01 | — |
| ARCH-007 rule ids + evidence; facts carry source/time | P | `CalcStep` operands, `EvidenceRef` literal quotes, `SourcedMoney` | 1 (network/source authority) |
| ARCH-008 determinism | P | AT-06; `tie_key` | 1 (tests) |
| ARCH-009 synthetic labeled, no network | P | `meta.synthetic_data`; care-window mentions synthetic; AI synthetic mode | 7 (browser check) |
| ARCH-010 ports preserved | P | `src/domain/ports.ts` | — |
| PLAN-001 exact resolution | P (untested per field) | `PlanKey` incl. `jurisdiction`, `network_id`; `samePlanKey`; `resolvePlanVersion` | **1** |
| PLAN-002 tier per event/location | Pa | `ProviderOption.network` per location, but `network_id` is never checked against the plan; no UNKNOWN | **1** |
| PLAN-003 source roles/precedence | M (in-source CONFLICT present) | `SourceDocument` has no role; `frequency_limit.crowns*.2027` CONFLICT pair | **1** |
| PLAN-004 Value/Core/Enhanced options | M | `loadRegistry` statically imports 2 files of one option (`ppo-standard`); no premium field; no Value/Enhanced sources; `registry-expectations.json` lists only the 2 versions | 2b (needs new Planner-seeded sources + premium in schema) |
| §5.1 RolloverRule model | M | `RolloverValue` has only threshold/award/bonus/cap; no basis, `LT/LTE`, bonus condition, bank treatment, next-plan resolution | 2 |
| §5.2 rollover member state | M | `MemberState` has no rollover bank | 2 |
| ROLL-001..010 | M | CONTRACT §3.1: VERIFIED rollover → `RULE_TYPE_UNSUPPORTED`; `rollover.2026` **UNVERIFIED** because the 2026 source says "Terms are governed by the Maximum Carryover Rider, which is not included". Source terms: $250 award when plan payments are "**below** $500" (→ `LT`), cap $1,000, no in-network bonus; 2027 says "No maximum carryover feature applies for the 2027 benefit period" (`rollover.2027` NOT_APPLICABLE, which is ambiguous for a 2026→2027 award). The requirements' $600 example does **not** match the sources. Iteration 2 needs a Planner-seeded synthetic Carryover Rider (role `state_rider`/`amendment`, using the 1.4 precedence) and a 2027 statement on honoring prior-year banks. | 2 |
| REC-001..005 | Pa | Exact backtracking + Pareto-like lexicographic labels (`care-plan.ts`); no utilization objective | 3 |
| REC-006 tie-break | P | `tie_key` last in every ranking key (CONTRACT §5.5) | 1 (tests) |
| REC-007 reasons for selection/rejection | Pa | per-event `reasons[]`; no "why other candidates were rejected" | 3 |
| §6.2 modes | M | no `preferences.mode`; the three labels are fixed outputs, not a request input | 3 |
| §6.3 alternatives with concrete deltas | Pa | ≤3 alternatives with labels, no opaque score; no per-alternative diff object | 3 |
| §6.4 SolverMeta/bounds | Pa | `SEARCH_LIMITS` pre-check → `INVALID_INPUT`; `search_stats` exists; no status `OPTIMAL/BOUNDED_BEST_FOUND/NO_FEASIBLE_SOLUTION`, no time bound, no `boundsApplied` | 3 |
| §6.5 same-day ordering | Pa | stable `(service_date, event_id)` order; no order-sensitivity warning/range | 1 (doc+test), 3 (warning) |
| §7 user control (locks, custom plan, statuses, undo/reset) | M | no `locks`/`customSchedule` on `CarePlanRequest`; `ResultStatus` lacks `USER_MODIFIED`, `OUTSIDE_DENTIST_WINDOW`, etc. | 4 |
| FUND-001 route vs funding separate | P | CONTRACT §5.4 runs after adjudication | — |
| FUND-002 payment plans | M | `ProviderPaymentPlan` exists, but §5.4 step 4 gives "not modeled" → `FUNDING_SOURCE_INELIGIBLE` | 5 |
| FUND-003 self-pay gate | Pa | permission, claim_submission, exact quote checked (§3.4); route_comparison (§5.9); quote validity added in **1**; network-discount retained / frequency impact not surfaced as gate items | 1 (validity), 5 |
| FUND-004 full-horizon comparison | P | §5.3 whole-schedule self-pay eligibility + §5.9 | 5 (verify with payment plans) |
| FUND-005 affordability two-pass | P | CONTRACT §5.5 two passes, `funding_gap_cents` | — |
| PRICE-001 benchmark as estimate | M | no benchmark input type | 6 |
| PRICE-002 stale/expired quote | M | benefits never emits `INPUT_STALE`; no validity date | **1** |
| PRICE-003/004/005 | P | `OON_CHARGE_UNKNOWN`; `balance_bill`; AT-03–05 invariant | — |
| EDU-001 explanation structure | Pa | template explainer (`src/ai/explain.ts`) + validator; no "what changes if you edit" | 6 |
| EDU-002 evidence badges | Pa | `SourceLabel`, `source` on passport items; no badge for "Member selected"/"Dentist confirmed" in UI | 6 |
| EDU-003/004 plain language, no false certainty | Pa | `WORDING.forbidden_phrases`; ranges for pending | 6 |
| EDU-005 questions generator | M | none | 6 |
| §11 API additions (preferences, locks, rolloverOutcomes, solverMeta, acknowledgements) | M | `CarePlanRequest`/`CarePlanResult` as in 1.3 | 2–4 |
| §11.3 integrity (explain reruns engine, strict schemas) | P | `src/api/index.ts`; CONTRACT §7 | — |
| UI-001 recommended + ≤3 alternatives | P | `features/care-window/care-plan.tsx` | — |
| UI-002 priority selector | M | — | 3 |
| UI-003..006 edit/pin, "Your plan", diff, undo/reset/re-optimize | M | — | 4 |
| UI-007 rollover display | M | — | 2 |
| UI-008 monthly payments separate | P | `monthly[]` strip | — |
| UI-009/010 warnings adjacent; "how calculated" | Pa | `parts.tsx` issue lists; trace sheet exists in `/analysis` only | 6 |
| UI-011/012/013 | P | no scores; synthetic label; explanation optional | — |
| UI-014 no console errors | unverified this pass | REVIEW pass 2 ran the flow | each iteration |
| §13 demo data | Pa | Core 2026/2027, accumulators, urgent/major/flexible procedures, IN/OON prices, one cash quote, FSA/HSA/budget present; **missing**: verified rollover + near-threshold scenario, Value/Enhanced, zero-interest payment plan modeled, single canonical fixture (frontend `src/fixtures/cash-vs-claim.ts` and `calculation-fixtures.ts` duplicate or diverge from backend golden) | 2, 2b, 5, 7 |
| §14.1 benefit-engine tests | Pa | AT-01/03–05/10–13 cover 1–4, 6–9; #5 next-year exact version partial; #10 in **1** | 1–2 |
| §14.2 rollover tests | M | — | 2 |
| §14.3 recommendation/override tests | M (except #2) | — | 3–4 |
| §14.4 self-pay/funding tests | Pa | #1–3 via AT-13/AT-19; #4–5 partial in optimizer tests; #6–7 missing | 5 |
| §14.5 grounding/security | P | AT-14–16, integration injection/validator/server-origin tests; #5 wrong-plan evidence (`WRONG_PLAN_VERSION`) | — |
| §14.6 integration/browser | Pa | AT-18 e2e at API level; no Playwright in either package (`test:e2e` not present) | 7 (each UI iteration adds its path) |

Iteration sequence after 1:

- **2**: rollover vertical slice. This needs the Planner to seed a synthetic Carryover Rider source.
- **2b**: Value/Enhanced registry options. These can merge into 2 if small.
- **3**: modes, SolverMeta, alternative deltas, same-day order warning.
- **4**: locks, custom plan, re-optimize, undo/reset.
- **5**: payment plans and the full self-pay gate.
- **6**: education, badges, the questions generator, PRICE-001.
- **7**: retire `/analysis` and the duplicated fixtures, add a browser e2e, final review.
