# Handover: CareWindow MVP loop (to Codex)

Date: 2026-10-04 · From: Claude Code session (session limit reached) · Status:
**iteration 2 of the MVP loop finished with `PASS_ITERATION`; next is iteration 2b.**

Read this first, then the files in "Required reading". Everything you need is in
the repo; nothing important lives only in the previous chat.

---

## 1. What this project is

CareWindow is a dental-benefits decision assistant (hackathon MVP, synthetic data
only). A deterministic TypeScript engine calculates benefits from verified,
evidence-quoted plan rules and recommends when and where to get dental care:

- **Before the visit:** the Visit Navigator ranks providers and appointments.
- **After the visit:** the Care Plan Optimizer schedules dentist-confirmed
  procedures across plan years, allocates funding and explains the result.

AI only extracts candidate facts and explains finished results. It never
calculates money, sets clinical urgency or changes plan rules.

Monorepo:

| Path | What |
|---|---|
| `backend/` | Engine + `node:http` API server (TypeScript, Zod 4, Vitest). Domain contracts are **frozen** (contract **v1.5.0**). |
| `frontend/` | Next.js 16 / React 19 app. The engine-backed page is `/care-window`. The older `/analysis` flow runs on its own fixtures and is scheduled for retirement in iteration 7. |
| `CAREWINDOW_MVP_REQUIREMENTS.md` | **The governing requirements and loop process.** |
| `CLAUDE.md` (root) | Global engineering rules. They apply to you too. |
| `docs/mvp-loop/` | Loop state: the current plan, handoff, review, and a history of each iteration. |

---

## 2. Required reading (in order)

1. `CLAUDE.md`: engineering rules (no destructive git, no commits unless asked,
   verify before you claim success, never weaken tests).
2. `CAREWINDOW_MVP_REQUIREMENTS.md`: requirements §3–§14, the role definitions
   in §15, the loop in §16 and the Definition of Done in §17.
3. `backend/docs/backend-flow.md`: architecture, request flow, outputs and how
   the frontend consumes them.
4. `backend/CLAUDE.md` and `backend/docs/workflow.md`: backend rules and the
   **frozen-contract change procedure**.
5. `docs/mvp-loop/review.md`: the latest verdict (iteration 2) and its open findings.
6. `docs/mvp-loop/current-plan.md`, **"Release roadmap" section**: the gap
   table and the order of the remaining iterations.
7. Skim `docs/mvp-loop/history/iter{1,2}-*.md` for the decisions already made.

---

## 3. The loop process (CAREWINDOW_MVP_REQUIREMENTS.md §15–§16)

Three roles run **sequentially**, never editing the tree concurrently. If you
can't spawn separate agents, play each role yourself in turn, keep its
restrictions, and write its output file before moving to the next role.

| Role | May | Must not | Writes |
|---|---|---|---|
| Planner | Read everything, run the baseline, pick **one** vertical slice | Implement production code | `docs/mvp-loop/current-plan.md` (the 10 sections in §15, plus an updated "Release roadmap") |
| Implementer | Implement exactly the plan, tests, fixtures, callers and docs | Weaken or skip tests, change existing golden values, silence type errors | `docs/mvp-loop/implementation-handoff.md` (the 9 sections in §15) |
| Reviewer | Run everything, probe edge cases, add review-only tests in `backend/tests/integration/` | Edit production code (`backend/src`, `backend/data`, `frontend/src`, fixtures, scripts) | `docs/mvp-loop/review.md`, with findings and a verdict of `BLOCKED`, `PASS_ITERATION` or `RELEASE_READY` |

**Housekeeping used so far:**

- **Before each iteration:**
  - Snapshot the tree so the Reviewer can diff exactly that iteration:
    `rsync -a --exclude node_modules --exclude .next --exclude .git --exclude '*.tsbuildinfo' ./ <somewhere>/snap-iterN-pre/`
  - The Reviewer then runs
    `diff -ru --exclude=node_modules --exclude=.next --exclude=.git --exclude='*.tsbuildinfo' <snap> .`
  - Earlier snapshots were in a temp directory that may no longer exist; take a new one.
- **After each review:** copy the three loop files to
  `docs/mvp-loop/history/iterN-{current-plan,implementation-handoff,review}.md`.
- **Stopping rule:** stop only at `RELEASE_READY` or a genuine external blocker.

---

## 4. Where things stand

### Completed

| Step | Scope | Contract | Verdict |
|---|---|---|---|
| Pre-loop | Implemented the benefits, AI and API modules. Added `backend/src/api/server.ts`. Wired `/care-window` through a Next rewrite. Fixed review passes 1 and 2 (`backend/docs/review/REVIEW.md`). | 1.3.0 | all P0/P1 fixed |
| Iter 1 | Network tier checked against the resolved plan network (`NETWORK_STATUS_UNKNOWN`, PLAN-002); source `document_role` and `source_precedence` (PLAN-003); `cash_quote_valid_through` and `PRICE_QUOTE_EXPIRED` (PRICE-002); stale-price `INPUT_STALE`; same-day order and tie-break written into the contract (AT-20) | 1.4.0 | PASS_ITERATION |
| Iter 2 | Rollover: synthetic Maximum Carryover Rider as a verified `amendment` source; `closeYear` year-close transition (once per year, 5 statuses, 10-step trace); carryover applied to `best_case` only, never to ranking; flexible-care shift note; RolloverPanel UI; AT-21 (23 tests); new golden values derived independently | 1.5.0 | PASS_ITERATION |

### Verified health at the end of iteration 2 (run by the Reviewer)

- **Backend:** `npm run verify` exits 0. That covers frozen files (65), the
  golden check, typecheck, lint, contracts 25/25, unit 25/25, acceptance
  147/147 and integration 62/62. `npx vitest run` passes 259/259; with the
  review probes, integration is 73/73.
- **Frontend:** typecheck and lint clean, `npm test` 136/136, `npm run build` passes.
- **Browser:** headless Chrome over CDP ran the full `/care-window` path, with
  all 9 engine calls returning 200 and no console errors.
- **Demo totals:** the golden demo plan comes to member **$1,372**, plan
  **$908**; the second alternative comes to $1,426.

### Open findings to fold into the next plan

| ID | Severity | Summary |
|---|---|---|
| R2-M1 | MEDIUM | When plan-paid-to-date is a range, rollover shows a definite "Not earned" in worst case while best case adds $250. It should be `UNCERTAIN` with a range (ROLL-008, EDU-004). Not triggered by demo data. |
| R2-L1 | LOW | The shift sentence "changes your cost by $X" has no direction. When the cost goes down, the template's own explanation fails validation and the UI shows "failed validation". |
| R2-L2 | LOW | The UI shift note says "keeps … below $500" even when the post-shift outcome is `UNCERTAIN`. |
| M-1 (iter 1) | MEDIUM | A provider's network observation is keyed by network id, not by plan version or year. Scheduled for 3a. |
| L-1 (iter 1) | LOW | The navigator silently drops an unknown-network office unless it is the soonest. Scheduled for 3a. |
| L-2 (iter 1) | LOW | `cash_quote_valid_through` became required under a "minor" version bump. Noted, not reverted. |
| L-3 (iter 1) | LOW | The null-tier UI state is only covered by a unit test. Committed e2e is planned for 7. |

### Remaining iterations (from the roadmap)

- **2b**: Value and Enhanced synthetic DPPO options in the registry (PLAN-004).
  Planner-seeded sources with a premium field, each with its own rollover rule
  using the iteration 2 model. Also fold in R2-M1, R2-L1 and R2-L2.
- **3a**: M-1 and L-1; network observation per plan version.
- **3**: Recommendation modes (BALANCED, LOWEST_TOTAL_COST,
  EARLIEST_SAFE_COMPLETION, SMOOTHEST_PAYMENTS) that genuinely rerank, plus
  `SolverMeta`, concrete deltas between alternatives (including the rollover
  difference) and a same-day order warning (§6).
- **4**: Member control (§7): locks, custom schedule evaluation,
  `USER_MODIFIED` and warning statuses, re-optimize unlocked items,
  undo/reset/compare, acknowledgements, and accepting a conditional rollover
  strategy (UI-002..006).
- **5**: Funding (§8): verified zero-interest payment plan (FUND-002), full
  self-pay gate (FUND-003), full-horizon comparison, and §14.4 #4–7.
- **6**: Education (§10): evidence badges, the deterministic questions
  generator, the "See how this was calculated" trace, and PRICE-001.
- **7**: Release: retire or disable `/analysis` and the duplicate frontend
  fixtures (ARCH-005, §13 one canonical fixture), a committed browser e2e
  (§14.6, L-3), README accuracy, and the final §17 review.

**Your next action:** act as the Planner for **iteration 2b**.

---

## 5. Commands

```bash
# backend
cd backend
npm ci
npm run serve            # engine API on :4000 (PORT env). ALLOWED_ORIGINS defaults to http://localhost:3000
npm run demo:cli         # prints the golden story
npm run verify           # check:frozen → golden:check → typecheck → lint → contracts → unit → acceptance → integration
npx vitest run           # every test project
npx tsx scripts/build-mocks.ts          # regenerate fixtures/mock-responses (no npm script)
npx tsx data/tools/build-registry.ts    # regenerate data/plans/*.json from data/sources + quote tables

# frontend
cd frontend
npm ci
npm run dev              # :3000. /care-window calls /api/engine/* → CAREWINDOW_ENGINE_URL (default http://localhost:4000)
npm run typecheck && npm run lint && npm test && npm run build
```

The backend has **no build step**. Older docs mentioned `next build`; that is gone.

---

## 6. Rules and gotchas (learned the hard way)

1. **Changing a frozen contract** (`backend/docs/workflow.md`): frozen paths
   include `backend/src/domain/**`, `fixtures/**`, `tests/acceptance/**`,
   `tests/contracts/**`, `docs/contracts/**` and `scripts/**`. To change them:
   1. Create `backend/.claude/UNFREEZE`.
   2. Make the edits and bump `CONTRACT_VERSION` in `backend/src/domain/version.ts`.
   3. Regenerate the mocks.
   4. Run `npm run freeze`.
   5. **Delete the marker**.
   6. Add entries to `docs/contracts/CHANGELOG.md` and `docs/decision-log.md`.

   `npm run check:frozen` must pass at the end. A PreToolUse hook enforces this
   for Claude; it may not exist for you, but the check script still does.
2. **Golden numbers:** never change an existing value in
   `backend/fixtures/golden/expected.json`. New values must be derived
   independently by `backend/scripts/golden-check.mjs`, which must never import
   engine code, and documented in `docs/contracts/golden-scenario.md`.
3. **Evidence quotes** in `data/plans/*.json` must be literal substrings of the
   cited page of `data/sources/*.md`; the registry build and AT-00 enforce it.
   A new source needs a `manifest.json` entry with its sha256 and a `document_role`.
4. **Money and time:** integer cents and basis points only, with half-up
   rounding per line before caps. The engines never read the clock (`as_of` is
   an input). Identical inputs must give byte-identical outputs.
5. **Frontend:** `/care-window` formats engine values and nothing more
   (ARCH-005). It imports backend types via the `@engine/*` tsconfig path
   (`frontend/tsconfig.json`).
6. **Proxy and Origin:** Next's rewrite changes `Host`, so the server
   allow-lists `http://localhost:3000` by default. Set `ALLOWED_ORIGINS=` (empty)
   to disable that.
7. **Rollover semantics** (see iteration 2 docs and D-028):
   - strict "below $500" of annual-max-counted plan payments;
   - $250 award, no network bonus, $1,000 bank cap, forfeit treatment;
   - applies only to the 2027 plan;
   - added only in `best_case`, and only when the next year has no member snapshot;
   - a $0 carry-in is skipped.
8. **Explanation validator** (`backend/src/ai/explain.ts`): it rejects any
   amount or date that isn't in the result, across many formats. Template text
   must state amounts and directions the validator can match (see R2-L1).
9. **Browser checks:** the Chrome extension was never connected, so earlier
   agents drove headless Chrome over a CDP script.
10. **Uncommitted work:** the whole tree is uncommitted on `main`. That includes
    another session's cash-vs-claim feature (contract 1.2.0, AT-19,
    `frontend/src/features/analysis/compare/cash-vs-claim-card.tsx`), which is
    part of the baseline. Don't revert anything. Don't commit unless the user
    asks; the user was advised to checkpoint-commit first.

---

## 7. Key file map

| Concern | Files |
|---|---|
| Contracts | `backend/src/domain/*.ts` (ports in `ports.ts`, API envelopes in `api.ts`, results in `optimizer.ts`), `backend/docs/contracts/CONTRACT-v1.md` |
| Registry | `backend/data/sources/*.md` and `manifest.json`, `backend/data/tools/build-registry.ts`, `backend/data/plans/*.json` |
| Benefit engine | `backend/src/benefits/{index,rules,simulate}.ts` (`closeYear` lives here) |
| Optimizer | `backend/src/optimizer/{care-plan,navigator,shared}.ts` |
| AI | `backend/src/ai/{index,explain}.ts` |
| API | `backend/src/api/{index,server,demo-cli}.ts` |
| Synthetic scenario | `backend/fixtures/synthetic/*`, `backend/fixtures/golden/*` |
| Tests | `backend/tests/{acceptance,contracts,benefits,ai,optimizer,integration}/` |
| Frontend engine path | `frontend/next.config.ts`, `frontend/src/lib/adapters/live/engine.ts`, `frontend/src/app/(workspace)/care-window/page.tsx`, `frontend/src/features/care-window/*` |
| Legacy flow (to retire) | `frontend/src/app/(workspace)/analysis/**`, `frontend/src/features/analysis/**`, `frontend/src/fixtures/*`, `frontend/src/lib/adapters/mock/*` |
