# Backend wiring repairs and remaining setup

October 4, 2026

The repository-side startup and HTTP wiring defects are fixed. Real database connectivity and the unfinished pricing engine remain separate blockers.

## What is fixed

- Standard backend commands load `backend/.env.local`. Existing process settings take precedence, followed by backend `.env.local`, backend `.env`, then frontend/root files as legacy fallbacks.
- All frontend proxies use one URL-normalizing helper. The existing trailing slash in `BACKEND_BASE_URL` no longer produces `//api` routing failures.
- Frontend health and provider-data proxies now exist.
- Backend HTTP routing has a testable server factory. Calculation methods, invalid input, oversized payloads, and unknown routes return the appropriate statuses.
- Member review keeps source notes and labels imported facts as Database. Pending claims, rollover, missing dependency references, differing per-dependency gaps, and maximum intervals block comparison when the current model cannot represent them.
- Multiple procedure dependencies with the same minimum interval are retained.
- The existing MongoDB optimizer adapter test is discovered by the default backend unit suite. The integration project now has actual HTTP tests.

No environment values, Atlas settings, database records, frozen backend contracts, or golden answers were changed. Calculation continues to report unavailable; these repairs do not implement the pricing engine.

## 1. Restore Atlas connectivity

Standard `npm run db:verify` now loads the configuration, but still fails with a server-selection timeout. The earlier diagnostic found TLS connection establishment timing out for all three discovered servers. This is not proof of bad credentials or missing seed data.

In the Atlas project used by `backend/.env.local`:

1. Open **Network Access** and ensure the public outbound IP of the computer/server running the backend is in the project's IP access list. The backend binds to `127.0.0.1` locally; that loopback address is not its public outbound address.
2. Check the firewall/VPN/network path permits outbound access to the cluster on port **27017**.
3. Confirm the cluster is running and the URI points to it. Confirm the database user credentials; encode special characters in URI passwords if applicable.

These checks follow [MongoDB's Atlas connection troubleshooting documentation](https://www.mongodb.com/docs/atlas/troubleshoot-connection/). The exact network cause is still unresolved; no Atlas access-list change was made from this session.

From the repository root:

```powershell
cd backend
npm run db:verify
```

The desired result is the verifier reporting the golden and expanded datasets complete. If connectivity succeeds but the verifier reports incomplete data, inspect the existing dataset manifests/counts before running a seed operation.

## 2. Start both services normally

In one terminal, from the repository root:

```powershell
cd backend
npm run dev:api
```

In another terminal, from the repository root:

```powershell
cd frontend
npm run dev
```

The frontend setting can stay `BACKEND_BASE_URL=http://127.0.0.1:3001/`; the helper normalizes it. The example uses the simpler spelling without the trailing slash. After changing environment values, restart the corresponding service.

Check `http://localhost:3000/api/demo/health`. Once connected and seeded, expect HTTP 200, `ok: true`, and both dataset statuses `ready`. Then test member selection at `/dashboard`. During this repair pass, those database-dependent requests still returned 503 because Atlas connectivity remained unavailable.

## 3. Finish the real calculation path

`src/api/calculate.ts` is still an unavailable scaffold. `src/benefits/index.ts` and `src/api/index.ts` still contain unfinished engine entry points. Restarting services cannot produce real comparison prices until these are implemented.

Use the existing frozen backend engine contract as the canonical source of pricing behavior:

1. Implement the benefits engine against the registry and acceptance tests.
2. Implement the frozen API handlers and connect them to the existing optimizer.
3. Add an explicit frontend/backend translation. The frontend currently expects raw camelCase `ScenarioComparison` at `/api/calculate`; the frozen backend defines `/api/care-plan` and versioned response envelopes. Preserve member/plan identity, CDT identifiers, provenance, and supported dentist constraints when translating. The current generic frontend plan ID is not sufficient for server-side registry lookup.
4. Keep plan rules owned by the backend registry. Align error envelopes and revision/request matching.
5. Enable priced live comparisons only when contract and acceptance tests pass. The new blockers deliberately prevent unsupported member data from being treated as absent.

Report extraction, voice sessions, account authentication, and persistent history also need serving endpoints. They remain separate unfinished features.

## 4. Repair the frozen-file portability gate through the existing workflow

The unchanged frozen-file checker misreads CRLF manifest paths and compares checkout-dependent raw hashes. The original audit found all 61 files and hashes matching after LF normalization. This repair pass left protected files and the manifest untouched.

Requested shared-contract changes:

```text
CR-integrator-portability-1
File/schema: scripts/check-frozen.mjs, scripts/freeze.mjs, docs/contracts/FROZEN.sha256
Problem: Windows CRLF checkout causes false removed/added paths and hash differences.
Proposal: parse CRLF/LF consistently and define canonical LF hashing for frozen text files in both writer and checker; document the convention and regenerate through the Planner workflow.
Impact: freeze/check scripts and manifest only; no engine contract or golden-number changes.
```

Also extend the unit project's include patterns to cover `tests/unit/**` when updating protected configuration. Until then, the added `tests/api/mongo-optimizer-adapter.test.ts` imports the existing adapter test so the default unit project runs it.

## Files changed

Backend: environment loader/helper, API server/factory, calculation request handling, database configuration error text, README, and tests under `tests/api` and `tests/integration`.

Frontend: shared server proxy helper, API proxy routes including health/providers, member import and source metadata, reducer note preservation, scenario validation, review warnings/source labels, setup disclosure, and regression tests.

## Interfaces consumed

Existing demo GET payloads, calculation request metadata/unavailable response, frontend `IntakeEvidence` and `ConfirmedScenario`, backend data-reader result shape. The HTTP tests use an injected synthetic data reader, not Atlas.

## Tests run and results

| Command | Result |
| --- | --- |
| `cd frontend` then `npm test` | 137 passed across 9 files |
| `cd backend` then `npm test` | 3 generated-data tests and 14 unit tests passed |
| `cd backend` then `npm run test:integration` | 12 HTTP integration tests passed |
| `npm run typecheck` in both projects | Passed |
| `npm run lint` in both projects | Passed |
| `cd backend` then `npm run db:verify` | Failed: server selection timed out after 15 seconds |

Live HTTP checks with unchanged environment files confirmed matching frontend/backend 422 validation and 503 scaffold responses; the double-slash 405 defect is gone. See [repaired HTTP evidence](../../../integration-audit/repaired-http.json).

Playwright tested a controlled synthetic member payload: pending-claim and rollover warnings appeared, source notes survived, and imported fields showed Database badges. After filling every editable required value and affirming both confirmations, comparison remained blocked with **zero calculation requests**. Test intercepts were removed. See [browser evidence](../../../integration-audit/repaired-member-blocked.png).

## Assumptions

The current frontend comparison supports only its documented simple in-network model. Unsupported financial/clinical inputs are blocked rather than transformed into a different plan or constraint. Existing engine and frozen-contract semantics remain authoritative.

## Unresolved issues

Atlas connectivity, real benefits/API implementation, public calculation-contract translation and identity mapping, live report/voice/auth/history endpoints, and frozen-file gate portability. The prior acceptance audit had 80 failures and 10 skipped tests due to unfinished modules; those modules were not implemented here, so full backend readiness is not claimed.
