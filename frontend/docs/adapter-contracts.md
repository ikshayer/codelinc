# Adapter contracts

Screens talk to services only through the typed adapters in `src/lib/adapters/types.ts`. Each adapter has a mock (demo) and a live implementation; `src/lib/adapters/index.ts` picks one set from `NEXT_PUBLIC_CAREWINDOW_MODE`. The endpoints below are **proposed** for the backend team (FRONTEND_DESIGN.md §15). None of them exist yet.

## Shared envelope rules

- Every asynchronous request carries `analysisId`, `requestId` and the draft `revision` (`RequestScope`). The client accepts a response only for the active request and revision, and the store drops anything else. Replacing a file, editing, Clear and sign-out all make older responses inert, even when an abort races the reply.
- Errors normalize to `{ code, message, retryable, fieldPath? }` (`AdapterError`). The client distinguishes 401/403, 404, 413, 415, 422, 429, 502–504, timeout and network failure (see `requestJson` in `shared.ts`). Error bodies must not contain provider stack traces, credentials or input text.
- No DOB, report text or tokens in URLs. History ownership is enforced by the server from the session, never from a posted user ID.

## CalculationAdapter: shared deterministic engine

| Call | Contract |
| --- | --- |
| `POST /api/calculate` | `{ requestId, analysisId, revision, scenario: ConfirmedScenario }` → `ScenarioComparison` with `inputRevision === revision`. 404/503 → reported as "engine not connected". |

The UI performs no benefit math. Every displayed amount is a field of `CalculationRecord`, `BenefitYearLedger`, `ProcedureCalculation` or `ScenarioComparison`. In demo mode, `mock/calculation.ts` recognizes only four named synthetic scenarios (gates A–D) by exact input signature. It returns their precomputed records (`src/fixtures/calculation-fixtures.ts`), labeled **Fixture preview**, and anything else is "unavailable". **This does not satisfy the real-engine gate.**

## InterpretAdapter: existing `/api/interpret`

`POST /api/interpret` `{ requestId, draftRevision, text, syntheticDataAcknowledged: true }` → `{ requestId, draftRevision, mode, extraction: ExtractionResult }` (architecture contract). `src/lib/domain/proposals.ts` maps `ProposedFact`s to draft field paths. AI output can never set timing permission, eligibility or dentist approval.

## ReportAdapter: dentist PDF

| Call | Contract |
| --- | --- |
| `POST /api/reports` | multipart `file`, `analysisId`, `clientRevision`, `requestId` → `{ reportId, jobId, status }`. Upload byte progress comes from XHR. The backend validates bytes, type, encryption and page count (demo limits: 10 MB, 25 pages). |
| `GET /api/report-jobs/:id` | → `{ status: queued \| processing \| ready \| needsInput \| failed, stage, progress?, retryAfterMs?, extraction?, issues[] }`. The extraction is an `ExtractionResult` plus page references. |
| `DELETE /api/report-jobs/:id` | Cancels the job. The client ignores a stale completion even if cancellation races. |

Demo mode analyzes only the bundled synthetic sample (`public/samples/sample-dentist-report.pdf`, matched by flag or byte hash). Any other PDF gets an honest "connect the report service" state.

## VoiceAdapter: conversational intake

| Call | Contract |
| --- | --- |
| `POST /api/voice/sessions` | `{ analysisId, revision, consent: true }` → `{ sessionId, transportUrl, expiresAt, capabilities }`. Only a short-lived client credential, never a durable provider key. |
| transport (WebSocket) | Ordered `VoiceEvent`s: state, transcript delta/final, proposals, error, ended. The client drops events for other sessions and enforces increasing `sequence`. |
| `DELETE /api/voice/sessions/:id` | Called on End, navigation away, Clear, sign-out and unmount. |

Partial transcripts never become facts. Final proposals merge only as unconfirmed "Needs review" values.

## HistoryRepository

| Call | Contract |
| --- | --- |
| `GET /api/analyses?search=&cursor=&limit=` | → `{ items: SnapshotSummary[], nextCursor }` |
| `POST /api/analyses` + `Idempotency-Key` | Saves an immutable `AnalysisSnapshot` (scenario revision, engine version, records, evidence references). A repeated key returns the same snapshot. |
| `GET/PATCH/DELETE /api/analyses/:id` | Detail, rename (metadata only), delete with acknowledgement. Snapshot facts and results are immutable. |

Demo history lives in session memory (seeded synthetic examples; refreshing resets it) and is labeled that way.

## AuthAdapter: Auth.js (optional Google sign-in)

The live adapter uses Auth.js REST routes: `GET /api/auth/providers`, `GET /api/auth/session`, `GET /api/auth/csrf`, then a form `POST /api/auth/signin/google` / `POST /api/auth/signout`. If they're missing, Google sign-in shows as unavailable and the guest path stays intact. Demo mode never simulates a successful Google login; "Use demo profile" is a separate, labeled action. A Google account never replaces patient details or confirms coverage.

## Profile

Patient details (display name, optional full name, DOB, contact email) are kept in session memory and are separate from account identity. A live `GET/PATCH /api/profile` is proposed but not wired yet.
