# Frontend/backend integration audit

Date: October 4, 2026

> This is the baseline audit. Subsequent startup, proxy, and member-import repairs are documented in [the repair guide](../backend/docs/review/backend-repairs.md).

> Atlas connectivity was restored after switching Wi-Fi. Actual database-backed HTTP, mapping, and browser results are documented in [the live Atlas follow-up](ATLAS-LIVE-RESULTS.md).

**The HTTP bridge exists, but the application is not working end to end with the current local configuration.** Two configuration defects prevent requests from reaching usable backend data. After isolating those defects with temporary process overrides, calculation requests reach the backend correctly, but calculation remains an explicit unavailable scaffold. The configured MongoDB connection also fails during TLS connection establishment.

This was a testing and review pass. Application source, environment files, frozen contracts, and database records were not changed. Backend dependencies were installed from the existing lockfile. Audit scripts and evidence are in this directory. Temporary URL/environment overrides were used only for diagnosis.

## Confirmed findings, in priority order

### 1. Backend URL concatenation breaks the configured frontend requests

`frontend/.env.local` configures `BACKEND_BASE_URL=http://127.0.0.1:3001/`. Frontend proxy handlers concatenate another slash, producing `//api/demo/members` and `//api/calculate`.

The backend constructs a URL from the request target; a target beginning with `//` is interpreted as a network-relative URL rather than the intended API pathname. The request therefore misses the route.

Observed HTTP results:

| Request | Direct backend | Frontend with existing URL | Frontend with temporary URL without trailing slash |
| --- | --- | --- | --- |
| POST calculation metadata and scenario | 503, explicit engine-unavailable response | 405, method-not-allowed response | 503, same engine-unavailable response |
| POST calculation with missing fields | 422, missing `requestId` | 405 | 422, same validation response |
| POST calculation with malformed JSON | 422, invalid JSON | 405 | 422, same validation response |
| GET members, after backend settings loaded | 503, database unreachable | 404, wrong route | 503, database unreachable |

Recommended change: normalize `BACKEND_BASE_URL` once in a shared server-side helper and use it in all four proxies. Removing the trailing slash from the local setting is an immediate workaround, but leaves the concatenation defect in code.

Sources: `frontend/src/app/api/calculate/route.ts:3`, `frontend/src/app/api/demo/route.ts:2`, `frontend/src/app/api/demo/members/route.ts:5`, `frontend/src/app/api/demo/members/[id]/route.ts:2`, `backend/src/api/mongo-server.ts:13`.

Evidence: [initial HTTP probes](initial-http.json), [settings-loaded HTTP probes](env-loaded-http.json), [normalized-URL HTTP probes](normalized-http.json).

### 2. Standard backend startup ignores its existing .env.local

The connection settings are in `backend/.env.local`. `npm run dev:api` imports `scripts/load-env.ts`, which searches only `backend/.env`, `frontend/.env`, and root `.env`. It does not load `.env.local`.

With standard startup, database routes returned 503 immediately. Starting the same API with `node --env-file=.env.local --import tsx src/api/mongo-server.ts` loaded the settings and made the connection attempt. No environment file was modified.

Recommended change: align the backend environment loader, README, and example-file instructions around a single documented convention, with deliberate precedence.

Source: `backend/scripts/load-env.ts:5`.

### 3. The configured MongoDB connection cannot complete from this session

With settings explicitly loaded, the read-only database verifier timed out after 15 seconds. A diagnostic connection with a five-second connection timeout reported `MongoNetworkTimeoutError`, with `Socket 'secureConnect' timed out` for all three discovered servers.

This establishes a connection/TLS-stage failure. It does not establish that the credentials, stored records, or dataset are incorrect. Network reachability, Atlas access controls, and TLS transport need investigation in the deployment environment. No database records were read successfully or changed. Installing another MCP would not itself resolve this transport failure; the project driver was sufficient to obtain the diagnostic.

Evidence: [sanitized MongoDB diagnostic](mongo-readonly.json). Script: [read-only database probe](mongo-readonly.mjs).

### 4. Member import loses information needed for live calculations

Controlled synthetic mapping probes established these differences:

| Backend information | Frontend result |
| --- | --- |
| Pending claims present | Scenario hardcodes `pendingClaims: "none"` |
| Rollover balance present | Scenario hardcodes `rollover: false` |
| Two dependencies for a procedure | Both dependency references and spacing are omitted |
| Minimum and maximum dependency spacing | Only minimum spacing is retained |
| Actual member and plan identity | Scenario has generic plan ID `demo-ppo` and no member ID |
| Database provenance | Review badges label imported facts `Manual` |

The member adapter generates a review note about pending claims and rollover, but the reducer does not preserve/display it in the member review journey. Playwright confirmed that the member panel shows pending claims and rollover, while the resulting review page has no warning about their exclusion. After supplying the required missing values in a controlled mapping probe, scenario validation succeeded with no notices despite a pending claim and rollover balance.

These are risks **before enabling live pricing**. The current backend returns unavailable and does not display an incorrect priced result.

The local deterministic generator contains 200 members: 30 with pending claims, 153 with rollover, and 85 procedure dependencies with a maximum gap. These counts describe generated source data, not verified Atlas records. Multiple-dependency loss was tested with a constructed example; it is not a claim about the current database contents.

Recommended change: preserve supported constraints and identity, and block or explicitly disclose unsupported financial/clinical inputs. Keep database evidence distinguishable from manual entry. A maximum-gap constraint needs representation or a blocking unsupported-state check.

Sources: `frontend/src/lib/adapters/live/member-data.ts:64`, `frontend/src/lib/adapters/live/member-data.ts:72`, `frontend/src/features/analysis/state.ts:205`, `frontend/src/lib/domain/scenario.ts:166`, `frontend/src/lib/domain/scenario.ts:288`.

Evidence: [mapping probes](mapping-probes.json), [controlled member review](controlled-member-review.yml).

### 5. Calculation is connected to a scaffold, and the engine contracts differ

The frontend sends `POST /api/calculate` with `{ requestId, analysisId, revision, scenario }` and expects a raw camelCase `ScenarioComparison` containing `inputRevision`.

The frozen backend engine API defines `/api/care-plan` and `/api/intake/extract`, different domain requests, and versioned `{ contract_version, ok, data, meta }` envelopes. Its error codes also differ from the frontend adapter codes. There is no implemented translation between those contracts.

`backend/src/api/calculate.ts` checks only request metadata and the presence of `scenario`, then always returns 503. It does not call the optimizer or benefits engine. The benefits module and frozen API entry points remain stubs.

Playwright exercised a real browser-to-Next-proxy-to-backend calculation using the bundled sample. With the URL corrected temporarily, it received the backend 503 and displayed “We can't calculate this comparison yet.” Confirmed values remained available. No fixture prices were substituted in live mode.

Recommended change: choose the intended external contract and implement an explicit translation if keeping the frontend model. Preserve server-loaded plan rules and provenance requirements; direct frontend-supplied percentages should not silently replace the frozen engine's registry contract.

Sources: `frontend/src/lib/adapters/live/calculation.ts:14`, `frontend/src/lib/domain/types.ts:103`, `backend/src/api/calculate.ts:6`, `backend/src/domain/api.ts:37`, `backend/src/domain/api.ts:148`, `backend/src/benefits/index.ts`.

Evidence: [browser request](browser-calculation-request.txt), [browser response](browser-calculation-response.txt), [unavailable-state screenshot](live-calculation-unavailable.png).

### 6. Several live adapters have no serving routes yet

The frontend has only four API proxies: demo overview, member list, member detail, and calculation. Live history and authentication GET requests returned 404; typed interpretation POST returned 404. Source inspection also found no frontend routes serving report analysis or voice sessions.

Backend `/api/demo/health` and `/api/demo/providers` exist but have no corresponding frontend proxies. This is a route-coverage difference, not evidence of a CORS failure: existing frontend calls use same-origin proxies.

These are unfinished features, separate from the URL/environment defects. Also, “Start over with the sample” in the unavailable comparison starts another live analysis; it does not activate fixture calculation. It therefore cannot recover from an unavailable live engine. The setup screen's static “Nothing you enter leaves this browser” statement is inconsistent with live calculation submitting scenario facts to the backend.

Sources: `frontend/src/lib/adapters/live/`, `frontend/src/app/api/`, `frontend/src/features/intake/new-analysis-screen.tsx:203`.

### 7. Verification currently gives incomplete coverage

`npm run verify` stops at the frozen-file check. The manifest parser splits on `\n` without removing CR, so Windows CRLF leaves carriage returns attached to filenames and reports every entry as removed/added. Raw file hashes also differ because of checkout line endings. Independent comparison after normalizing manifest paths and file contents to LF found all 61 files present and all hashes matching. No frozen file or manifest was regenerated.

The backend integration project has no test files and exits successfully because `passWithNoTests` is enabled. The existing `tests/unit/mongo-optimizer-adapter.test.ts` is excluded by the default unit include patterns. It passes when run through the separate audit-only configuration.

Sources: `backend/scripts/check-frozen.mjs:20`, `backend/vitest.config.ts:12`, `backend/vitest.config.ts:23`. Evidence: `mapping-probes.json`, [isolated adapter-test config](backend-adapter.vitest.config.mjs).

## Checks performed

| Check | Result |
| --- | --- |
| Frontend unit tests | 125 passed across 8 files |
| Frontend member-import tests, explicit run | 3 passed; included in the 125 above |
| Frontend typecheck / lint | Passed / passed |
| Backend generated-data tests | 3 passed |
| Backend default unit project | 11 passed |
| Backend contract tests | 25 passed |
| Backend adapter test through isolated audit config | 1 passed |
| Backend typecheck / lint | Passed / passed |
| Backend acceptance | 80 failed, 10 skipped; unfinished benefits/API/AI modules block readiness |
| Backend integration project | No tests discovered; command exits 0 |
| Backend full verify | Fails at Windows line-ending handling in frozen-file gate |
| Actual configured database verification | Failed at connection/TLS stage |
| Live calculation browser journey | Real request reaches scaffold after temporary URL correction; unavailable state preserves values |
| Member panel → review | Works with controlled synthetic browser responses; currency and percentages convert correctly; fee/eligibility/timing remain unconfirmed |

The controlled member browser responses were explicitly test doubles and were removed after the test. They do not prove successful reads from Atlas. Production build, actual database contents, live priced results, and account persistence were not verified.

## Reproduce the probes

From the repository root, with the frontend and backend running:

```powershell
node integration-audit/http-probes.mjs current-http.json
node --env-file=backend/.env.local integration-audit/mongo-readonly.mjs
node --import ./backend/node_modules/tsx/dist/loader.mjs integration-audit/mapping-probes.mjs
node backend/node_modules/vitest/vitest.mjs run --config integration-audit/backend-adapter.vitest.config.mjs
```

Fix URL normalization and environment loading first, establish database connectivity, then reconcile contracts and prevent unsupported data from being lost before enabling pricing. Add genuine integration tests so a successful test command demonstrates frontend/backend behavior.
