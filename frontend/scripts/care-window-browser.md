# CareWindow browser acceptance gate

Add `--member` to include the original required member ID and date-of-birth lookup, or `--member-only` to run it separately. It verifies a wrong DOB and an unknown ID return the same non-match with no member data; distinct fresh synthetic members retain their actual plan limits and settled balances through sample care and comparison. The gate submits an edited copy of the real calculation request to prove that browser-supplied benefit limits and coverage rules cannot override server facts. Future utilization is explicitly confirmed as a fictional zero-use assumption. A third real member completes the UI with an explicitly conservative estimate: projected pending payments remain a separate reserve, the stored deductible remains unchanged, and an unresolved rollover bank is excluded from modeled payments.

Start the deterministic backend (`npm run serve` in `backend`) on port 4000 and the frontend (`npm run dev` in `frontend`) on port 3000. The frontend must point `CAREWINDOW_ENGINE_URL` at that backend, and the backend must allow the frontend origin through `ALLOWED_ORIGINS`.

With Playwright and its Chromium browser installed, run from `frontend`:

```powershell
node scripts/care-window-browser.mjs
```

The runner imports the project's `playwright` package. An environment that already provides Playwright can supply its module entry through `PLAYWRIGHT_MODULE`, without changing project dependencies. `CHROMIUM_EXECUTABLE` overrides its browser executable when the environment supplies a browser separately. `CAREWINDOW_BROWSER_URL` overrides the frontend URL; `CAREWINDOW_BROWSER_OUTPUT` overrides the artifact directory.

The desktop and mobile journeys use Tab, Enter, and Space to reach and activate controls. They load the passport, compare visits, extract and confirm treatment, inspect calculations and sources, pin an exact returned appointment, rerun with that lock, undo, reset, and apply preferences. Assertions check the submitted lock tuple, every returned alternative's `user_locked` event, server-produced reset results, and canonical plan identity. A separate case injects a retryable health failure and an urgent response that still contains cost options, to verify retry and cost suppression.

The gate fails on browser exceptions, console errors, HTTP 4xx/5xx responses, and failed requests. Only the deliberately injected health and visit failures are allowed in their dedicated test. Next's cancelled speculative route payloads and Chromium's cancelled bodyless voice DELETE after a confirmed HTTP 204 are recorded separately; an unacknowledged or failed DELETE still fails the gate. The successful care planning journey also rejects legacy auth, calculation, and fixture APIs. JSON results and desktop/mobile screenshots are written under `integration-audit/care-window-browser` by default. Use a production build (`npm run build`, then `npm run start`) for release validation; a development server is supported for iteration.

Use `--states-only` to run the injected retry, empty, partial, and urgent checks separately. Add `--voice` to include the original landing and voice flow, or `--voice-only` to run that flow alone. The voice check requires the configured live Gemini and Chatterbox services and submits clearly fictional typed facts. It checks real fact proposals, WAV responses, and their preservation into confirmation; it does not request microphone access.

Add `--original` to include the original sample → confirmation → live comparison path, or `--original-only` to run it separately. It verifies service-date pins, undo/reset, payment preferences, returned calculation/benefit disclosures and viewport sizing without changing the original entry flow.
