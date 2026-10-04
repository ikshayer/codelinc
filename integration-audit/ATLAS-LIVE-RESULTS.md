# Live Atlas integration results

Date: October 4, 2026

Switching Wi-Fi restored connectivity. The database verifier passed, and the previously blocked database-backed HTTP and browser checks now run successfully. This does not complete the pricing engine or other missing services.

## Newly completed checks

| Check | Result |
| --- | --- |
| Actual Atlas demo dataset verification | Passed; counts and expanded dataset checksum match the generator |
| Backend and frontend health/overview/member/provider routes | HTTP 200; both datasets ready, 200 members, 32 providers |
| Actual member mappings | All 200 stored synthetic members passed currency, coverage percentage, deductible, overflow, and unsupported-input checks |
| Atlas → backend → frontend member payload preservation | Exact JSON equality for SYN-MEMBER-0001, 0002, and 0003, covering all three plans and financial/timing/no-treatment-card cases |
| Provider payload preservation | All 32 stored provider records match the backend response and frontend proxy response |
| Other proxy payloads | Health, overview, member list, and golden member detail match direct backend responses |
| Actual browser member selection → review | Passed for SYN-MEMBER-0001, 0002, and 0003, without intercepted responses |
| Browser monetary values and provenance | Annual maximum and already-used amounts match returned data; source badges identify Database |
| Browser unsupported inputs | Applicable pending-claim, rollover, and maximum-gap warnings appear in review |
| Missing member | HTTP 404 through both servers |
| Invalid calculation request | HTTP 422 through both servers |

The stored population contains 30 members with pending claims, 153 with rollover, 78 whose first four imported procedures contain a maximum-gap constraint, and 79 without treatment cards. These are actual database observations. The maximum-gap number counts members, whereas the baseline audit's generator number counted dependency records.

Browser samples:

| Member | Annual maximum | Already used | Checked conditions |
| --- | --- | --- | --- |
| SYN-MEMBER-0001 | $1,000.00 | $161.70 | Maximum-gap warning, database provenance |
| SYN-MEMBER-0002 | $2,000.00 | $277.10 | Pending claims, rollover, no treatment card |
| SYN-MEMBER-0003 | $1,500.00 | $156.60 | Rollover and maximum-gap warnings |

## Remaining limitations

- `/api/calculate` still returns HTTP 503 with the explicit engine-unavailable message. Restored database access does not implement the pricing engine or reconcile its contract with the frontend.
- Authentication, history, and typed interpretation routes still return HTTP 404. PDF/voice/history persistence and priced comparisons remain unavailable.
- Existing unit/contract/mock HTTP tests were already runnable without Atlas. Database connectivity does not address the unfinished acceptance modules or the Windows frozen-file gate.
- The browser emitted repeated WebGL context-limit warnings during navigation. They did not fail the data-import checks; their cause has not been isolated. Authentication/history 404s also appear in the console.
- This pass performed no database writes and does not verify write persistence, concurrent edits, or production deployment.

## Evidence and reproduction

- [HTTP probe results](atlas-live-http.json)
- [Atlas mapping and payload equality results](live-atlas-check.json)
- [Read-only audit script](live-atlas-check.mts)
- [Browser review snapshot](live-member-review.yml)
- [Browser API requests](live-browser-network.log)
- [Browser console](live-browser-console.log)

Start the backend and frontend in separate terminals using their documented development commands. Then, from the repository root:

```powershell
node integration-audit/http-probes.mjs atlas-live-http.json
node --import ./backend/node_modules/tsx/dist/loader.mjs integration-audit/live-atlas-check.mts
```

The audit script reads only the synthetic dataset IDs, tests every stored expanded member's mapping, and compares representative API payloads with their stored records after normal BSON-to-JSON date serialization. Temporary servers started for this pass were stopped afterward.
