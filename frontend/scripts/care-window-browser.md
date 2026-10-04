# CareWindow browser acceptance gate

Start the deterministic backend (`npm run serve` in `backend`) on port 4000 and the frontend (`npm run dev` in `frontend`) on port 3000. The frontend must point `CAREWINDOW_ENGINE_URL` at that backend, and the backend must allow the frontend origin through `ALLOWED_ORIGINS`.

With Playwright and its Chromium browser installed, run from `frontend`:

```powershell
node scripts/care-window-browser.mjs
```

The runner imports the project's `playwright` package. An environment that already provides Playwright can supply its module entry through `PLAYWRIGHT_MODULE`, without changing project dependencies. `CHROMIUM_EXECUTABLE` overrides its browser executable when the environment supplies a browser separately. `CAREWINDOW_BROWSER_URL` overrides the frontend URL; `CAREWINDOW_BROWSER_OUTPUT` overrides the artifact directory.

The desktop and mobile journeys use Tab, Enter, and Space to reach and activate controls. They load the passport, compare visits, extract and confirm treatment, inspect calculations and sources, pin an exact returned appointment, rerun with that lock, undo, reset, and apply preferences. Assertions check the submitted lock tuple, every returned alternative's `user_locked` event, server-produced reset results, and canonical plan identity. A separate case injects a retryable health failure and an urgent response that still contains cost options, to verify retry and cost suppression.

The gate fails on browser exceptions, console errors, HTTP 4xx/5xx responses, and failed requests. Only the deliberately injected health and visit failures are allowed in their dedicated test. The successful care planning journey also rejects legacy auth, calculation, and fixture APIs. JSON results and desktop/mobile screenshots are written under `integration-audit/care-window-browser` by default. Use a production build (`npm run build`, then `npm run start`) for release validation; a development server is supported for iteration.

Use `--states-only` to run the injected retry, empty, partial, and urgent checks separately. Add `--voice` to include the original landing and voice flow, or `--voice-only` to run that flow alone. The voice check requires the configured live Gemini and Chatterbox services and submits clearly fictional typed facts. It checks real fact proposals, WAV responses, and their preservation into confirmation; it does not request microphone access.
