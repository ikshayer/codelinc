# Backend branch integration report

Date: 2026-10-04

## Resolved branches

- `AUTHORITATIVE_BACKEND_BRANCH`: `tomisin/backend` (`ee293b5`)
- `DESTINATION_BRANCH`: `feature/cash-vs-claim` (`babdd84`, with preserved local work)
- `MERGE_BASE`: `73110b93765bd3844e0cd0cb809b973682497b41`
- `OTHER_RELEVANT_BRANCHES`: `backend-mvp`, `contract-v1`, `main`

`tomisin/backend` is the only local branch matching the requested “tomisim
backend” spelling. No branch was merged wholesale.

## Branch inventory and decisions

| Branch | Relevant commits | Data/schema changes | DB calls | API changes | Tests | Unique value | Conflicts/risks | Decision |
|---|---|---|---|---|---|---|---|---|
| `tomisin/backend` | `cde5273`, `f72aa77`, `ee293b5` | Mongo collections, deterministic expanded synthetic generator, indexes, idempotent upserts/pruning | Single pooled Mongo client; repository reads for plans/member/demo; read-only demo queries | Port 3001 Mongo demo server; `/api/calculate` scaffold | Expanded-data integrity and adapter unit tests | Database client, repository boundary, indexes, repeatable population pattern | Core API/AI are stubs; calculate always 503; Mongo plan adapter fabricates provenance and does not satisfy the newer contract; generator hardcodes benefit/claim values outside the canonical engine; no seed command for the golden dataset; parallel API surface | Port the sound Mongo client/repository/index/seed patterns. Reject the competing calculator, fabricated adapter and hardcoded expanded-data math. Adapt persistence to canonical v1.7 domain types. |
| `feature/cash-vs-claim` | `babdd84` | Verified plan-source registry, golden fixtures, rollover rider; local 2b adds Value/Enhanced work | No persistent DB | Complete strict HTTP API on port 4000 and live `/care-window` proxy | Contract, unit, acceptance, integration, golden, browser evidence | Complete deterministic benefits engine, care optimizer, extraction/explanation validation, provenance, rollover, cash-vs-claim | Current local 2b edits are incomplete; no persistent repository; legacy `/analysis` remains fixture-backed | Destination foundation. Preserve engine/contracts and finish local work; place Mongo behind API composition. |
| `main` | `9da7a4c`, `cd03fdc`, `b6da57a` | No additional canonical backend schema | None beyond work inherited by `tomisin/backend` | Frontend-focused | Frontend UI tests | Newer visual/manual-intake work | Removes `/care-window` live integration and much of completed backend when compared with destination | Do not merge. Consider UI work later as a separate frontend reconciliation. |
| `backend-mvp` | `77c0021` | Frozen v1.1 fixture/source foundation | None | Contract-era API skeleton | Contract and optimizer foundations | Clean backend/frontend split and frozen-contract workflow | Superseded by destination implementations | Retain through ancestry; no direct port needed. |
| `contract-v1` | `b339a2f` | Frozen v1.1 contracts and fixtures | None | Contract definitions only | Contract review gates | Audit baseline and safety invariants | Older than both candidate implementations | Preserve history and invariants; no direct port needed. |

## Conflict precedence

1. Product requirements and documented deterministic-domain invariants.
2. Verified plan-document facts and literal source provenance.
3. Sound persistence architecture from `tomisin/backend`.
4. Correct fixes, tests and missing capabilities from other branches.
5. Destination UI behavior that depends on the live engine.

“Authoritative backend” therefore means Mongo ownership and data-access design;
it does not permit replacing verified v1.5 calculations with the branch’s
unfinished stubs or fabricated adapter rules.

## Canonical target architecture

```text
Client (/care-window)
  -> same-origin Next rewrite (/api/engine/*)
  -> HTTP transport checks and strict Zod request validation
  -> application handler/service composition
  -> repository loads canonical plan/member/provider snapshots
  -> deterministic benefits engine and optimizer
  -> repository persists synthetic audit/result records where required
  -> versioned response envelope with evidence and calculation trace
```

MongoDB is an adapter behind repository interfaces. Domain code must not import
MongoDB, collection names, or persistence document shapes. Static synthetic
fixtures remain an explicit offline/test adapter, not a hidden fallback in a
database-configured runtime.

## Important flow traces and gaps

### Existing live engine flow

`GET /api/scenario` loads canonical synthetic inputs; the browser then calls
passport, navigator, extraction, confirmation, care-plan and explanation. Each
POST is strictly validated. Care-plan calls the deterministic benefit engine for
every candidate schedule. Explain recomputes rather than trusting client totals.

Gap: inputs and results are process/file backed, not repository backed.

### Mongo branch flow

The Mongo server reads dataset/member/provider documents through a single client
and repository. The frontend has proxy routes for member/demo data. Its
calculation endpoint validates only four top-level fields and always returns
503; its API and AI entry points are stubs. The optimizer adapter is not wired
to an engine call.

Gap: database records never complete the calculation workflow. The Mongo plan
adapter invents one-line evidence and zero checksums, collapses plan periods,
and omits newer contract fields. It must not be used for definitive benefits.

### Duplicate and stale paths

- `/api/calculate` and `/api/engine/care-plan` are competing calculation APIs;
  only the latter is complete and canonical.
- The older `/analysis` flow uses frontend fixtures and is intentionally queued
  for retirement; it must not become the database integration target.
- Mongo’s `optimization_results` collection stores imported expected output but
  no live route writes or reads newly computed results.
- Mongo seed code is idempotent for the expanded dataset, but the branch lacks a
  package script that actually seeds it and assumes a pre-imported golden dataset.
- Mongo member/provider/plan shapes are not the frozen engine shapes and require
  explicit validated mapping.

## Integration plan

1. Repair and verify the preserved local plan-option/contract work before
   layering persistence onto it.
2. Port the Mongo dependency, one global client, collection constants, index
   creation and idempotent seed pattern. Do not port the expanded generator's
   duplicate benefit/claim math.
3. Define repository interfaces in the application boundary and validated Mongo
   document schemas/mappers. Keep domain and optimizer persistence-agnostic.
4. Seed canonical synthetic registry/scenario inputs from the existing verified
   sources and fixtures; never generate plan facts or evidence in the adapter.
5. Compose repository-loaded data into the existing strict API handlers. Keep
   one API server and one calculation path.
6. Persist only explicitly modeled synthetic audit/result records, with stable
   IDs and idempotency, after deterministic calculation succeeds.
7. Add repository, seed-idempotency, API-to-database and calculation regression
   tests; run against a local MongoDB instance only.
8. Re-run backend verification, frontend type/lint/test/build and browser smoke.

## Review checklist

- No Mongo import below the application/repository boundary.
- One client pool, one collection map and one seed/index strategy.
- No real member data, credentials or request bodies in fixtures/logs.
- Exact plan version and provenance survive persistence round trips.
- Service, claim-submission, adjudication and payment dates remain distinct.
- Claim route remains distinct from funding source.
- Unknown/range values remain unknown/ranges.
- No frontend insurance arithmetic.
- No second calculator or stale mock on the canonical `/care-window` path.

This report is updated after each implementation/review loop. Passing status is
not claimed until the full verification and local-database flow succeed.

## Implemented integration

- Added one process-wide Mongo client and a forward-only migration/index runner.
- Added a repository boundary with schema and checksum validation for the
  canonical registry and demo scenario.
- Added idempotent `db:seed` and `db:verify` commands with stable synthetic IDs.
- Added API runtime composition: database inputs feed the existing deterministic
  handlers; server-owned member facts and canonical provider records replace
  submitted copies before computation.
- Added insert-only care-plan audit records with request/result hashes and the
  registry version. Exact request-ID replay is idempotent; collision and stored
  integrity mismatch fail closed instead of overwriting a result.
- Kept fixture mode explicit when `MONGODB_URI` is absent; database mode fails
  closed on connection, seed, schema or checksum errors.
- Added repeated-migration, seed-idempotency, canonical-overlay, provider mapping,
  request-ID and persistence-failure coverage plus a real Mongo API-to-database
  verification path.
- Added contract v1.7 schedule locks so a selected provider/date/claim route is
  held through recalculation while all unlocked procedures re-optimize.

## Final verification (2026-10-04)

| Gate | Result |
|---|---|
| Backend `npm run verify` | PASS after final reviewer repairs: frozen 69; golden unchanged at contract 1.7.0; typecheck/lint clean; contracts 25/25; unit 25/25; acceptance 147/147; integration 85/85. The initial unprivileged run reached the integration suite but localhost connections were sandbox-blocked; the authorized localhost runs passed. |
| Real MongoDB 8.3.1 `npm run db:verify` | PASS on a disposable localhost database: migrations and seed each ran twice; six plan versions and one scenario round-tripped; a care plan ran through the runtime handler; identical replay remained idempotent; request-ID collision was rejected; one insert-only result retained request/result hashes and registry version. The disposable database was shut down and removed afterward. |
| Frontend lint/type/test | PASS: lint clean, type generation/typecheck clean, 136/136 tests. |
| Frontend production build | PASS with `next build --webpack`; the default Turbopack build cannot bind its CSS worker port in this sandbox. |
| Live production smoke | PASS in Mongo mode: backend `/api/health` and `/api/scenario` returned 200; production `/care-window` returned 200; `/api/engine/health` proxied to the live backend and returned contract 1.7.0, registry `synthetic-1.6.0`, and all six plan version IDs. All temporary processes were stopped. |
| Worktree/history safety | No merge, commit, push, reset, rebase or history rewrite performed; pre-existing uncommitted edits remain in place. |

Sol High's final independent read-only review found no P0/P1 or release-blocking
issues. Its actionable P2 findings were repaired: conflicting appointment locks
now fail with an explicit issue, environment-template wording matches actual
loading behavior, and this report no longer overstates migration-race coverage.

## Residual production work

- Authentication and session-to-member authorization are still required before
  the enforced server-owned snapshot boundary can serve non-synthetic data.
- Encryption, access controls, retention policy, backups and production Mongo
  deployment/monitoring are intentionally outside this synthetic MVP slice.
- The legacy frontend `/analysis` flow still has its own fixture model and should
  be retired or migrated separately; `/care-window` is the canonical live path.
- The backend contract and optimizer now support first-class schedule locks,
  but `/care-window` does not yet expose lock/pin/undo controls.
