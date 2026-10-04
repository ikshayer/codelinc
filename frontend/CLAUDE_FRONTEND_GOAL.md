# Claude Code goal: Complete CareWindow frontend

## Objective

Build the complete responsive CareWindow webapp frontend in this `/frontend` directory using Next.js App Router, TypeScript and shadcn/ui through the configured shadcn MCP. Implement the screens, flows, state behavior, theme, responsive layouts and acceptance criteria in `FRONTEND_DESIGN.md` and `../output/pdf/CAREWINDOW_FRONTEND_DESIGN.pdf`.

Read `../CAREWINDOW_ARCHITECTURE.md` for the domain, confirmation boundary, deterministic calculation records and dentist constraint rules. This latest frontend scope adds identity, PDF, voice and history despite their earlier exclusion. Preserve all financial/clinical trust boundaries. Follow applicable repository instructions.

## Scope and design decisions

- Confirmed: Next.js; shadcn MCP; identity fields; dentist PDF upload/analysis handoff; conversational voice intake; history; synthetic demo data; simple UI with Hubble and OpenTag as references.
- Defaults unless the owner changes them: white/charcoal light theme with restrained teal accents, guest-first with optional Google sign-in, one active patient, intake-focused AI with transcript, history per analysis, mock/live service adapters.
- Build Dashboard, New analysis/intake, Confirm, Compare, History/detail, Profile and optional Sign-in routes.
- Name is required for a named analysis; DOB is visible and optional for the benefits demo. Google account identity does not replace patient details or confirm coverage.
- The AI is an identified benefits-intake assistant. It may gather facts through a natural conversation, but cannot act as a licensed dentist, diagnose or infer safe delay.

## Visual direction

Use https://hubble.ai/ and https://www.tryopentag.com/ as the owner's simplicity references. Inspect them before styling. Build a compact top navigation, generous whitespace, strong typography and one clear primary action per task. Use simple rows for intake choices and history; reserve panels for meaningful task boundaries. Keep the welcome page concise and the working app focused. Use a mobile Menu Sheet and single-column forms. Follow the proposed tokens in the design; do not copy reference branding, claims, customer logos or marketing sections.

## MCP and repository preflight

1. Work from `/frontend`. Inspect existing files before scaffolding so `.mcp.json`, package metadata and user changes survive.
2. Use Claude Code `/mcp` to verify the configured shadcn server is Connected. Use it to browse/search/inspect and install relevant primitives and blocks. If unavailable, report and resolve the connection; do not falsely claim MCP usage or substitute another library silently.
3. Initialize the Next.js application and shadcn configuration with current documentation. Freeze dependencies in the lockfile. Reuse one consistent supported component style/primitive family.
4. Use semantic theme tokens and feature-local compositions; do not install unused components or add infrastructure without need.

## Execute in this order

1. App shell, theme, routes, responsive navigation, empty/error components and typed service adapters.
2. Synthetic identity -> manual/sample intake -> editable/group confirmation -> record-driven Compare. Keep the architecture's core working path visible throughout.
3. PDF choose/drop/remove/replace, upload/progress, analysis job, cancel/retry, source-page evidence, mismatch/conflict review and manual fallback.
4. Voice permission, active/listening/thinking/speaking/muted/reconnecting/ended states; readable transcript, typed fallback, controls, proposed fact cards and cleanup.
5. Dashboard draft/recent activity, history search/filter/save/open/rename/duplicate/delete, profile edits and optional real Google auth states.
6. Integration, accessibility, responsive screenshots, state/race tests, type/build checks and final README.

## Backend boundary and demo behavior

Implement typed ReportAdapter, VoiceAdapter, HistoryRepository, AuthAdapter and CalculationAdapter with mock/live implementations. Proposed endpoint details are in the design; they are not existing services. Provider credentials stay server-side.

All data is synthetic. Clearly label simulated extraction/conversation and session-local history. Arbitrary uploaded PDFs cannot silently receive unrelated sample results. Missing live services produce an honest unavailable state and explicit sample/manual option. Never fake a Google login, live agent, persistent save or engine result.

Use session memory for mock guest history/drafts. Do not store PDFs, audio, DOB or transcripts in localStorage. Live history is authenticated, backend-owned and versioned. Historical snapshots remain dated/immutable; editing creates a new draft requiring reconfirmation.

## Non-negotiable behavior

- PDF/voice/manual input joins one draft and evidence model. AI proposals never auto-confirm.
- Financial group confirmation and dentist timing affirmation remain separate. Unknown money is not zero; unknown timing permission remains fixed to its confirmed anchor.
- Every asynchronous result matches analysis, source/request, account where applicable, and revision. Replaced files, edits, Clear and sign-out reject late responses.
- All authoritative displayed money comes from CalculationRecord/ScenarioComparison. No UI formulas. Reuse the shared engine through an adapter when available.
- Current-year dentist deadline removes actual later candidates before ranking; stale alternatives/results disappear while edits are pending.
- Voice End, navigation and sign-out stop media tracks/playback and release the session. Partial transcripts do not become confirmed facts.
- Every control has real behavior and all relevant empty/loading/error/recovery states. Keyboard and typed alternatives are complete.

## Definition of done

1. Every designed route and main action works on desktop and mobile with synthetic data.
2. All three intake paths feed the same review; missing/conflicting facts have source-linked resolution.
3. Compare renders traceable records, timelines, per-year balances and meaningful no-alternative states.
4. History and profile operations work through adapters; save/persistence claims match actual service mode.
5. With the real engine connected: $1,500 baseline / $855 alternative / $645 difference; deadline returns $1,500 with no later feasible candidate; full current allowance chooses $830 over $855; unknown permission cannot move. Apply architecture hard gates A-J.
6. If the engine or backend is absent, fixture previews remain clearly labeled and the corresponding live integration gate is reported incomplete. Static mock totals cannot pass the solver tests.
7. Type/build checks and relevant interaction/race tests pass. Review 1440 and 390 px screenshots plus 320 px overflow, 1024 px layout, keyboard and 200% zoom.
8. Deliver frontend code, synthetic fixtures, README, environment example without secrets, adapter contract notes and a concise report of checks run, MCP usage and remaining mocked integrations.

Do not broaden into appointment booking, a clinician portal, production medical advice, claims adjudication or family accounts. Finish the requested frontend and make its remaining service dependencies explicit.
