# CareWindow aligned synthetic demo

The existing landing page, navigation, sample entry and intake → confirmation → comparison journey are preserved, including the live voice assistant. Planning controls and disclosures are integrated into the existing comparison page. The engine-backed `/care-window` route remains an additional demo view, not a replacement entry flow.

The original `/api/calculate` scaffold is replaced with a server calculation adapter for the original confirmed category-based scenario. Next proxies it to the deterministic backend using `CAREWINDOW_ENGINE_URL`. This model preserves confirmed fees, coverage assumptions, utilization, dates and dependencies; it does not substitute the standalone demo member or fabricate CDT codes, providers or appointment slots. Its service-date pins, priority changes, monthly cash limits, benefit state, funding requirements, formulas and comparison differences all come from the backend. The original comparison layout and confirmation gate remain intact.

## Contract and trust boundaries

The merged engine supports both file fixtures and Mongo-backed canonical data. `backend npm run serve` loads `.env.local`; when `MONGODB_URI` is configured, startup requires a reachable database and a seeded canonical registry/scenario. Mongo mode restores server-owned member/provider facts and stores immutable care-plan audit records; only budget, availability and travel preferences remain member-editable. The original category-based calculation uses the user's confirmed scenario instead of substituting the canonical demo member. Neither path provides authenticated payer retrieval, account-owned history retrieval, booking, corrections or verified installment financing. No claim of account saving or live insurance verification is made.

Contract 1.8 adds the missing exact `schedule_locks` tuple (`procedure_id`, `provider_id`, `slot_id`, `claim_route`) and `events[].user_locked`. A pin must match a feasible returned appointment, survive every returned alternative, and obey clinical windows, dependencies and member preferences. Impossible pins produce explicit issues; they are never silently dropped. Removing pins and resetting sends another engine request. The browser performs input normalization and display formatting, never benefit, schedule, ranking or result-difference calculations.

The passport now returns exact plan-option and network identity. Engine envelopes retain contract version, synthetic identity, request ID and generator metadata. Readiness indicates engine availability, not live coverage verification.

## Phase A coverage

| Requirement | Representation |
| --- | --- |
| Engine health and synthetic status | Retryable engine status; existing entry flow preserved; legacy auth is not queried while on `/care-window` |
| Passport identity, freshness, statuses and current balances | Exact plan/network/version; per-item source/observation/rule/input disclosures; distinct status labels; settled, reserved and available values |
| Before-visit safety and volatile facts | Urgent gate suppresses options and comparisons; provider fact observations, source references, contextual issues and rule evidence |
| Treatment editing and confirmation | Editable extracted facts, dependencies and statements; separate inclusion and factual confirmation; server confirmation gate |
| Member preferences | Budget, weekly/unavailable availability and travel editor; hard versus preferred limits; engine rebuild |
| Exact member appointment control | Pin/unpin, locked badges, Your plan, undo, reset, re-optimize; original server recommendation remains inspectable |
| Care-plan financial and benefit disclosures | Full totals and fees, funding gap, service/slot information, funding payment dates and sources, monthly allocations, matching event benefit state |
| Adjudication and uncertainty | Both returned cases, pricing and cap fields, issues, formulas, operands, fact references and linked plan evidence; cash-versus-claim card includes missing facts |
| Trust and next steps | Rollover preserved; warnings beside affected events and in summary; next-action checklist; appointments are explicitly not booked |
| Keyboard, mobile and recovery | Repeatable full-path browser runner with console and network gates and injected error, empty, partial and urgent cases |

Existing engine-produced priority reranking and differences between alternatives are preserved. Numerical differences between the original recommendation and a later member-pinned rerun still require a dedicated backend comparison contract; the UI shows the two server results without calculating deltas.

Decision traces, search statistics and internal objective components are deliberately internal. The member sees concrete labels, costs, dates, tradeoffs and solver completeness, with no opaque score. Plan shopping, arbitrary provider schedules, engine care-plan history and production v2 identity remain separate contract work. Navigation consolidation from the review attachment is deliberately deferred at the user's request to preserve the original flow. The existing Gemini/Chatterbox voice service feeds proposed facts into the original confirmation gate; it is not replaced by the standalone sample extractor.

## Run and verify

Start `npm run serve` in `backend`, then `npm run dev` in `frontend`, and open `http://localhost:3000` for the original flow. `/care-window` is the additional canonical engine demo. Start `npm run dev:voice` for Gemini/Chatterbox intake; the demo data API is the separate `npm run dev:api` service. The frontend calculation and engine proxy use `CAREWINDOW_ENGINE_URL` (default `http://localhost:4000`). If using another frontend port, include its origin in the backend `ALLOWED_ORIGINS` environment variable.

Validation commands: backend `npm run verify`; frontend `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`. The keyboard browser runner is documented in [care-window-browser.md](../scripts/care-window-browser.md). Its report and screenshots are written to `integration-audit/care-window-browser/` by default.
