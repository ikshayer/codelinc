# Backend/frontend delivery verification — 2026-10-04

## Latest identity update

The original identity step now contains only required Member ID and Date of Birth inputs. Name, additional contact fields, and optional labels were removed. The matched database record supplies the display name internally. Exact Member ID/DOB lookup and calculation-time authoritative benefit reload are implemented; 33 focused backend tests, typecheck, lint and frozen contract checks pass. Parker's conservative calculation reserves the $93 pending payment separately from $277.10 settled usage, retains the $25 deductible, and excludes the unresolved $300 rollover bank. Available base benefits are $1,629.90.

During submission, an incoming merge conflict in `member-data.ts` was resolved without dropping lookup or conservative-estimate support. Current runtime limitation: Atlas server selection is timing out again; the restarted data API returns a retryable 503 for member lookup, and the engine cannot finish its Mongo startup. Earlier successful Atlas evidence below predates this timeout. The final identity form has been verified in the development app on port 3000; port 3010 is the earlier production build.

The merged repository preserves the original landing → identity → PDF/voice/manual intake → confirmation → comparison flow. The original confirmed scenario reaches the backend `/api/calculate` through Next's same-origin proxy. Planning controls and disclosures extend the existing comparison page; `/care-window` remains an additional canonical synthetic demo.

## Verified behavior

| Requirement | Current evidence |
| --- | --- |
| Original flow and layout preserved | Desktop and 390px mobile keyboard journeys in `delivery-browser/results.json`; rendered comparison screenshots in the same directory |
| Server calculation and editable assumptions | Original-calculation API tests cover fee/coverage edits, cent reconciliation, safe windows, deadlines, dependencies and stable same-day processing; real browser requests return HTTP 200 |
| Pins, Your plan, undo/reset and priorities | Both browser journeys pin the returned crown date, verify every returned alternative, rerun, undo/reset to the original server result, and apply monthly cash preferences; exact appointment tuples are additionally verified in `/care-window` |
| Engine status and passport trust | Retry, metadata, synthetic identity, plan/network identity, observation/source/rule distinctions, settled/pending/available balances; unit and browser gates |
| Treatment and preferences | Separate factual confirmation/inclusion, editable extracted fields, hard/preferred budgets, availability and travel; engine requests and browser assertions |
| Financial and benefit disclosures | Returned funding sources/payment dates/fees, monthly allocation, benefit states, adjudication cases, formula operands, route uncertainty and contextual evidence; rendered disclosures and browser checks |
| Recovery and safety | Retryable health/visit errors, empty visit/treatment, partial network/cost and urgent cost suppression pass browser checks |
| Voice remains in original flow | `voice-merged-browser/results.json`: real typed Gemini turn, seven proposed facts, two Chatterbox WAV responses, preserved label/fee in confirmation; microphone hardware was not exercised |
| Atlas runtime and persistence | Engine runs on port 4000 in Mongo mode. `npm run db:verify:engine` passes six canonical plan versions, schema/checksum round trips, idempotent result writes, collision rejection and audit hashes. Existing demo dataset verification also passes |
| Existing data and auth wiring | After restarting the stale data API following VPN removal, frontend `/api/demo/health`, `/api/demo/members`, `/api/engine/health` and `/api/auth/session` all return HTTP 200 |

## Final checks

- Backend `npm run verify`: 74 frozen files, golden values, typecheck, lint, 25 contract + 43 unit + 212 acceptance + 98 integration tests, and three data tests pass. Final database verifier changes also pass typecheck/lint and the actual Atlas check.
- Frontend: production build, typecheck, clean lint and 193 tests pass.
- Complete Atlas-backed desktop/mobile engine and original-flow keyboard browser gates pass. No unexpected browser exceptions, console errors, HTTP failures or failed requests remain. Next's cancelled speculative payloads and Chromium's bodyless voice teardown after an acknowledged HTTP 204 are recorded separately.
- `git diff --check` passes.

The stable verification frontend remains at `http://localhost:3010`, with `AUTH_TRUST_HOST=true` for this local test host. The existing development frontend remains at port 3000. Engine, demo data and voice services use ports 4000, 3001 and 3002 respectively; GPU speech uses port 8001.

These are synthetic planning capabilities. Account-owned history, live payer verification, booking and verified financing remain future contract work. The original category-based intake deliberately uses confirmed fees/rules and modeled service dates; it does not invent canonical provider appointments or replace the user's facts with the standalone demo member.
