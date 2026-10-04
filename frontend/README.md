# CareWindow frontend

A responsive Next.js webapp for the CareWindow dental-benefits demo. You tell it who the analysis is for, then describe the treatment plan by uploading the dentist's report, talking it through with an AI intake assistant, or entering it by hand. You review every fact, confirm the plan and the dentist's timing separately, and compare dentist-permitted options. The comparison can be saved to history.

> **Synthetic data only.** This build runs in **demo mode** by default. Report analysis, the conversation and calculations are simulated or fixture-based, and every such screen is labeled. Nothing here is medical, dental or insurance advice.

Specs: [`FRONTEND_DESIGN.md`](FRONTEND_DESIGN.md), [`CLAUDE_FRONTEND_GOAL.md`](CLAUDE_FRONTEND_GOAL.md), the domain in [`../backend/CAREWINDOW_ARCHITECTURE.md`](../backend/CAREWINDOW_ARCHITECTURE.md), and service boundaries in [`docs/adapter-contracts.md`](docs/adapter-contracts.md).

## Run it

```bash
npm install
cp .env.example .env.local   # optional; demo mode is the default
npm run dev                  # http://localhost:3000
```

| Script | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build and server |
| `npm run typecheck` | Generates route types, then `tsc --noEmit` |
| `npm run lint` | ESLint (Next config) |
| `npm test` | Vitest unit, state and race tests in `tests/unit` |

## Try the journey

1. **Start an analysis** on the welcome page. Use the demo profile or type a name; date of birth is optional.
2. Pick **Upload a dentist report**, **Talk it through** or **Enter manually**. You can switch at any time: all three feed one draft.
   - *Report:* choose **Use sample report** (`public/samples/sample-dentist-report.pdf`). Demo mode analyzes only this synthetic file and shows an honest "connect the report service" state for any other PDF.
   - *Conversation:* a clearly labeled simulated conversation. The microphone is requested only after you click Start, and is stopped on End, navigation, Clear and sign-out.
   - *Sample:* **Use sample treatment** loads the canonical synthetic scenario.
3. **Review your details.** Every value shows its source (Manual, PDF page, Voice turn, Sample) and status (Needs review, Missing, Conflict, Confirmed). Confirm the plan and care, then separately affirm the dentist's timing, and select **Compare my options**.
4. **Compare.** Baseline $1,500 against the best dentist-permitted alternative $855, a $645 difference (fixture preview). Open any procedure for its calculation trace. **Edit dentist deadline** to 2026-12-31 to see the alternative disappear. **Save to history.**
5. **History** and **Profile**: search and filter, open an immutable dated snapshot, duplicate it as a new draft, rename, delete, edit patient details, and reset demo data.

Profile → **Demo data** has switches that make the mock services fail on purpose: an unreadable or encrypted PDF, a timeout, a voice reconnect or provider failure, history load/save/delete failures, and a calculation failure. Use them to see every recovery state.

## Modes: what is live and what is simulated

`NEXT_PUBLIC_CAREWINDOW_MODE` selects one adapter set (`src/lib/adapters/index.ts`).

| Service | Demo (default) | Live (`live`) |
| --- | --- | --- |
| Calculation | **Fixture preview**: precomputed records for four named synthetic scenarios (gates A–D); anything else is reported unavailable | `POST /api/calculate` (proposed). **Not connected.** |
| Report PDF | Simulated analysis of the bundled sample only | `/api/reports`, `/api/report-jobs/:id` (proposed). **Not connected.** |
| Voice | Simulated conversation; real mic permission and capture status only | `/api/voice/sessions` + WebSocket transport (proposed). **Not connected.** |
| Typed interpretation | Unavailable (no model); text is kept, never fake-understood | `POST /api/interpret` (architecture contract) |
| History | Session memory, seeded examples; refreshing resets it | `/api/analyses` (proposed), account-owned |
| Google sign-in | Unavailable ("Use demo profile" is a separate, labeled action) | Auth.js REST routes (`/api/auth/*`) when configured |

Live mode never falls back to fixtures. A missing service shows an honest unavailable state and offers sample or manual input.

### Real-engine gate: incomplete

The shared deterministic engine isn't in this repository yet, so **hard gates A–J are not satisfied by this build**. The fixture records reproduce the architecture's worked numbers, and the unit tests check their conservation, but static totals cannot prove the solver. Connect the engine through `CalculationAdapter` (`src/lib/adapters/live/calculation.ts`) and rerun the gates.

## Architecture

```
src/app/(public)/              Welcome, Sign-in
src/app/(workspace)/           Dashboard, analysis routes, history, profile
src/components/ui/             shadcn primitives (installed through the shadcn MCP)
src/components/shell|shared/   Header + mobile Menu sheet, page frame, status/source chips, empty/error states
src/features/analysis/         The analysis store (state.ts reducer + provider), FactField, Confirm, Compare
src/features/intake/           Identity form, method picker, intake workspace, PDF and voice intake
src/features/history|profile/  History list + snapshot detail, dashboard, profile, sign-in
src/lib/domain/                Architecture types, field registry, draft/evidence rules, scenario validation (no benefit math)
src/lib/adapters/              Typed Report/Voice/Interpret/Calculation/History/Auth adapters, mock + live
src/fixtures/                  Synthetic profile, sample treatment, report, conversation, calculation records
tests/unit/                    Domain, fixture and reducer race tests
```

Trust boundaries the code enforces:

- **One draft, one evidence model.** PDF, voice, sample and manual proposals all go through `applyProposals`. Proposals never confirm themselves. A value a person edited is never overwritten, and disagreeing sources become an explicit conflict that shows both values.
- **Unknown is not zero.** A blank field is a blocking, field-linked issue (`buildConfirmedScenario`). If timing permission is unknown, the procedure stays fixed to its planned date.
- **Separate confirmations.** The financial confirmation covers plan and care. Dentist timing needs its own affirmation, and AI output can never set permission or eligibility.
- **Money comes from records only.** Components format fields of `CalculationRecord` and `ScenarioComparison` and do no arithmetic on money.
- **Async isolation.** Each request carries analysis, request ID, revision and a session epoch. The reducer drops late or replaced responses, and Clear and sign-out advance the epoch, so old callbacks can't repopulate state. Any edit hides stale results immediately.
- **Storage.** Drafts, transcripts, DOB and PDFs live only in memory. Nothing goes to localStorage.

## shadcn MCP

`.mcp.json` configures `shadcn@latest mcp`. The Claude Code session that built this app was started from the repository root, so the server wasn't auto-loaded. `scripts/shadcn-mcp.mjs` drives the same server over stdio with the MCP SDK (`node scripts/shadcn-mcp.mjs list-tools`, `… call search_items_in_registries '{"query":"…"}'`). It was used to list registries, browse the `@shadcn` UI items, search `@react-bits`, view items and produce the install command for every primitive in `src/components/ui/` plus React Bits **BlurText** (the landing headline reveal). The style is `radix-nova` (Radix primitives, Lucide icons, Geist).

## Known gaps and decisions

- **Not connected:** the real calculation engine, report extraction, voice transport, `/api/interpret`, history persistence, Auth.js and a live `/api/profile`. Each one has a typed live adapter and a documented contract, and each reports itself unavailable until the backend exists.
- **Late source results after an edit:** report and typed-interpret replies are still accepted after an unrelated manual edit. They're keyed by request ID and session epoch, and `applyProposals` never overwrites an edited value; a clash becomes a visible conflict instead. File replacement, Clear, delete and sign-out reject late replies.
- **Voice leave guard:** it covers in-app link clicks (including method switching) and tab close. Browser Back isn't intercepted, but unmount always stops the microphone and ends the session.
- **Session memory:** refreshing the page restores the seeded demo data and drops in-progress drafts, by design: nothing is written to browser storage.

## Visual design

- **Brand:** Lincoln Financial's 2024 palette, taken from lincolnfinancial.com: burgundy `#650030` (primary actions) and horizon orange `#FF4F17` (decorative accents only, because it fails contrast as small text). Headings use Source Serif 4, and the UI and money use Geist.
- **Logo and mascot:** the official 2024 logo and its Abraham Lincoln mark (`public/brand/`, served from lincolnfinancial.com's own assets). The mark serves as CareWindow's guide in the header on phones, the landing hero, setup, the assistant's transcript avatar and empty states. It is never recolored, and the AI assistant still introduces itself as an AI assistant.
- **React Bits (via the shadcn MCP):**
  - **Grainient:** the animated brand backdrop. A vivid hero field on the landing page and setup, a soft wash behind every page header. It pauses offscreen and freezes under reduced motion.
  - **Orb:** the voice assistant. Scale and jitter follow the real microphone level while listening, it pulses while the assistant speaks, swirls while thinking, and greys out when muted or ended.
  - **BlurText:** the landing headline.
- **Motion:** `motion` drives:
  - route transitions (`src/app/template.tsx`)
  - staggered entrances (`src/components/motion/reveal.tsx`)
  - sliding indicators for the nav, intake tabs, stages, filters and wizard
  - direction-aware wizard and setup steps
  - Compare result reveals and timeline travel

  `MotionConfig reducedMotion="user"` applies the user's reduced-motion setting app-wide.
- **Manual entry** is a six-step wizard (`src/features/intake/manual/`). The current step lives in the URL (`?step=`), a completeness rail shows progress, and the last step is a "Check and continue" digest.
