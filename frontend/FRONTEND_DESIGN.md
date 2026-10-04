# CareWindow - Complete Frontend Design

Design specification v1.1 | October 3, 2026 | Synthetic demo data

Visual companion: `../output/pdf/CAREWINDOW_FRONTEND_DESIGN.pdf`. Screen drawings in the PDF are illustrative design compositions.

## 1. A calmer way to understand dental costs

CAREWINDOW / COMPLETE FRONTEND DESIGN / 03 OCT 2026

**Optimize the benefits. Never the care.**

A Next.js webapp built with shadcn/ui. People introduce themselves, upload a dentist report or talk with an AI intake assistant, review the extracted facts, compare dentist-permitted options and return to their saved history.

> **Claude Code goal:** Build the complete responsive frontend in `/frontend`, using its configured shadcn MCP. Deliver every screen, interaction and recovery state in this document, with typed backend adapters and clearly labeled synthetic demo behavior.

| THE EXPERIENCE | THE TECHNICAL FOUNDATION |
| --- | --- |
| Identity + PDF + voice + history | Next.js App Router + TypeScript + shadcn/ui |
| Simple, spacious, easy to scan | One shared confirmation flow |
| Every estimate is inspectable | Money from deterministic CalculationRecord |
| Desktop and mobile feel complete | Synthetic demo data; backend-ready contracts |

**Reading guide:** pp. 2-4 decisions and visual system; pp. 5-12 screen designs; pp. 13-16 behavior and integration; pp. 17-20 Claude execution goal and acceptance. Mockups illustrate layout and hierarchy, not screenshots of a built app.

## 2. The design contract

01 / SCOPE AND DECISIONS

This document adds the frontend scope explicitly requested after the architecture revision. It supersedes that document's exclusions of identity, PDF intake, voice and history for the frontend deliverable. Its financial model, user confirmation boundary and dentist constraints remain authoritative.

| DECISION | DESIGN DIRECTION |
| --- | --- |
| Confirmed by user | Next.js webapp; shadcn/ui and shadcn MCP in /frontend; identity, dentist PDF, conversational voice and history; synthetic demo data. Simple UI inspired by Hubble and OpenTag. |
| Visual direction | User-selected simplicity, with Hubble and OpenTag as references. White canvas, charcoal text, restrained teal action color and spacious typography are the proposed CareWindow interpretation. |
| Provisional account choice | Guest first. Optional Google sign-in to save across sessions. Name and date of birth remain editable profile fields. |
| Provisional voice/history choice | Benefits/treatment-plan intake, live transcript and proposed fact cards; history holds reports, intake sessions and saved comparisons. |
| Initial delivery assumption | Complete frontend with mock adapters and live-adapter contracts. Backend endpoints, database, OAuth credentials and voice provider were not supplied. |

### What complete frontend means

- Every route and visible control has working behavior: loading, empty, validation, success, failure, cancellation and retry. No decorative dead buttons.
- All input methods converge on the same review form. PDF/voice output is proposed data, never an automatically confirmed scenario.
- A demo adapter exercises realistic flows with synthetic fixtures. It says Demo mode and Simulated analysis or Simulated conversation where applicable.
- Live integrations use the same interfaces. Live mode cannot silently fall back to invented results; offer an explicit switch to a sample.

> AI interprets. Code calculates. The dentist constrains. The user decides. The assistant is introduced as an AI benefits-intake assistant, never as a licensed dentist.

The frontend design is complete without making unverified claims about a production backend. Google sign-in does not replace patient details or verify eligibility. The app must still support manual intake and the architecture's full cost-comparison workflow.

## 3. One workspace. One clear next step.

02 / INFORMATION ARCHITECTURE

| ROUTE | PURPOSE / PRIMARY ACTION |
| --- | --- |
| / | Welcome with product promise, Start an analysis and Use sample. Return users continue to dashboard. |
| /dashboard | Recent activity, Continue draft and New analysis. No invented health score. |
| /analysis/new | Identity card + Upload report / Talk it through / Enter manually. |
| /analysis/[id]/intake | Active PDF, voice or manual session; persistent draft identity and progress. |
| /analysis/[id]/confirm | Review plan, care and separately affirmed dentist timing. Compare my options. |
| /analysis/[id]/compare | Financial hero, timelines, traces, deadline edit and Save to history. |
| /history + /history/[id] | Search/filter previous sessions; view an immutable snapshot or resume a draft. |
| /profile | Identity, account connection, demo-data controls and saved-data actions. |
| /sign-in | Optional Google sign-in; cancellation returns to the preserved guest draft. |

### Navigation that stays out of the way

Desktop: a 64 px top navigation with CareWindow wordmark, Home, History and Profile; New analysis is the primary navigation action. Show a quiet Demo mode label. Use a centered 1120 px workspace and 680-720 px forms. Omit the persistent app sidebar. Page headings carry a short explanation and one primary task action.

Mobile: a 56 px top bar with wordmark and labeled Menu button opening a Sheet with Home, New analysis, History and Profile. Show the current page title outside the menu. Use one column and 20 px gutters. A sticky task action may sit above the safe area; reserve its height so it never covers content.

### Analysis journey

> Patient details -> Choose intake method -> Gather proposed facts -> Confirm plan + prescribed care + dentist timing -> Compare -> Save / revisit

Describe, Confirm and Compare remain the three analysis stages. Identity is a compact intake section, and history is a surrounding app destination. Switching intake methods retains existing facts; source conflicts require review. Back returns to the previous step without losing the draft. Direct links with missing/expired analysis IDs show a recovery page, not a blank screen.

Route changes during microphone use first offer Stay / End conversation and leave. Stop media tracks immediately after the user chooses to leave. Changed confirmed inputs hide stale precise results until the updated snapshot is confirmed.

## 4. Simple, spacious and task-focused

03 / REFERENCE-LED VISUAL SYSTEM

Hubble (https://hubble.ai/) and OpenTag (https://www.tryopentag.com/) are the user-selected simplicity references. Translate their concise product introductions and clear calls to action into a focused webapp. The palette and layouts below are CareWindow design choices, not sampled brand specifications.

Landing: a compact header, one large promise, a short explanation, Start an analysis and a quieter Use sample link, then one product preview. In the app, reduce headline scale and reveal detail as the task needs it.

| TOKEN | VALUE / APPLICATION |
| --- | --- |
| background / foreground | #FFFFFF / #202422 - white canvas, charcoal text |
| card / primary | #FFFFFF / #176B5B - white surfaces, restrained teal primary action |
| muted / muted-foreground | #F5F6F5 / #626B66 - neutral secondary surface and text |
| border / ring | #E3E7E4 / #176B5B - subtle dividers, clearly visible focus |
| warning / destructive | #FFF4DE with #875B18 / #B13D37 - missing assumptions and errors |
| type | Geist Sans or a bundled compatible sans; system fallback. Tabular figures for money. |
| scale | Landing 56/60 (mobile 36/42); app 32/40; section 24/32; body 16/24; helper 14/20; money 40/48. |
| spacing / shape | 4 px rhythm: 8, 12, 16, 24, 32, 48. Panels 12 px radius; controls 8 px. Section gaps 48-64 px. |
| controls | 44 px minimum interactive height; one strong primary action per task; icons always labeled. |

### shadcn composition

Use theme CSS variables and semantic colors rather than raw colors spread through components. Start with Button, Card, Input, Label/Field, Select, Checkbox, RadioGroup, Tabs, Badge, Alert, Dialog, Sheet, Accordion, Progress, Skeleton, Table, DropdownMenu and Tooltip. Discover available registry items through the MCP before installation. Custom domain components compose these primitives.

### Visual restraint

- Use generous whitespace, thin dividers, small line icons and a simple CareWindow wordmark. No stock dentist photos, medical avatar or fabricated provider identity.
- Group with whitespace and dividers first. Reserve bordered panels for upload, conversation, confirmation groups and comparison. Use simple rows for recent history; no decorative tile grid.
- Progress animations are 150-200 ms. The microphone indicator reflects actual state. Respect reduced motion; no decorative moving waveform when idle.
- Currency is right-aligned and formatted from integer cents. Do not use red/green alone to communicate whether an option is permitted.

Review at 1440 x 900, 1024 x 768, 390 x 844, 320 px minimum width and 200% zoom. Validate contrast and usable actions during implementation.

## 5. A short introduction, not a registration wall

04 / IDENTITY AND SIGN-IN

Start a new analysis with a compact **Who is this analysis for?** form section. The synthetic demo starts with an editable sample profile; a blank guest flow is also available.

| FIELD | BEHAVIOR |
| --- | --- |
| Name | Required for a named analysis; support preferred/display name plus full name if needed. Accept spaces, accents and punctuation. |
| Date of birth | Visible, optional for this benefits demo. If supplied, validate a real date, not in the future. Use month/day/year inputs; never force decades of calendar navigation. |
| Email | Optional guest contact/account field. Google account email is shown as account identity; it does not confirm the patient's details. |
| Plan/member details | Ask insurer/plan name only when relevant to the next task. Member ID is optional and masked. No SSN, ID-card photo, address or phone requirement. |

Continue is enabled after valid required fields. Inline errors appear after blur/submit, not on every keystroke. Identity is kept outside the financial scenario and never enters the benefits formula or AI context unless strictly needed.

Offer **Continue as guest** and **Continue with Google**. With Auth.js/NextAuth configured, use the real provider redirect/session. In demo mode show a separate, clearly labeled **Use demo profile** action; never simulate a successful Google login. Missing OAuth configuration displays a concise unavailable state and preserves the guest option.

Guest history is limited to the current session by default. After a successful sign-in, explicitly offer to attach the current draft to that account; do not merge accounts or histories by email/name. Display the patient name in the analysis header so the user can catch a wrong-person report.

## 6. Three ways to tell us about your plan

05 / DASHBOARD AND INPUT HUB

The first useful screen combines a clear promise with three input choices. Place **Use sample treatment** as a secondary text action below the headline; this must always work without upload, microphone or sign-in.

- **Upload a dentist report:** PDF intake for prescribed procedures and quoted fees. Tell users that insurance rules may still need separate confirmation.
- **Talk it through:** a calm voice conversation with visible transcript and a typed alternative.
- **Enter manually:** the fastest fallback for known plan rules, fees and dentist timing.

Returning dashboard: one Continue your draft section, New analysis, and a compact Recent analyses list with dates and statuses. Present the three intake options as quiet selectable rows, with a single Continue action after selection. Empty dashboard explains the three paths and offers sample data. Avoid showing a benefits balance until a confirmed plan snapshot supports it.

### Shared intake workspace

Each method opens the same analysis ID with a small profile strip, Describe / Confirm / Compare progress and a collapsible **Facts gathered** summary below the active input. Expand into a second column only when reviewing evidence on wide screens. Gathered rows say Needs review, Missing or Conflict. A count is a completeness aid, not an AI confidence score. Users can add a PDF after a conversation or type missing values without losing earlier evidence.

Changing source never overwrites a manually edited or confirmed field. Offer an explicit conflict choice showing both values and sources. Continue to review remains available when extraction fails; missing financial facts are resolved in Confirm before precise calculation.

## 7. Upload, understand, then review

06 / DENTIST REPORT PDF

Use an accessible drop zone with a real **Choose PDF** button. Show accepted type, configurable size cap and a **Use sample report** link. Suggested demo contract: one PDF, at most 10 MB and 25 pages; backend must validate type/content and page count.

| STATE | VISIBLE UI / ACTION |
| --- | --- |
| Selected | Filename, size, Remove, Replace and Send for analysis. No upload merely from dragging over the zone. |
| Uploading | Real byte progress if available; Cancel. Never present fabricated percentage as upload progress. |
| Processing | Stages: checking file, reading report, extracting facts. Indeterminate progress unless backend supplies a real value. |
| Needs input / failed | Unsupported or encrypted PDF, unreadable scan, oversized file, timeout and network errors each have clear recovery: replace, retry, type manually or use sample. |
| Ready | Summary of proposed procedures and fees; page-linked evidence. Review extracted facts is the primary action. |

The browser sends the file to the backend through the report adapter; extraction/OCR/model work belongs there. A text-only dentist report can omit plan limits or usage: preserve those as unknown. If scanned-PDF extraction is unavailable, say so and offer manual input.

Evidence drawer shows filename, page, quoted text and proposed value. An extracted name/DOB mismatch prompts **Is this your report?** before merging. Report text cannot authorize clinical flexibility: quote it for review and require a separate user affirmation of dentist-provided timing.

Cancel aborts the request and requests job cancellation. Ignore late replaced-file responses; Clear revokes preview URLs. Demo mode analyzes only its labeled sample fixture. Arbitrary PDFs require a connected backend.

## 8. A conversation that stays transparent

07 / VOICE ASSISTANT

Introduce: **“I'm CareWindow's AI assistant. I can help gather the details from your dentist's plan and benefits.”** Start with “What did your dentist recommend?” Ask one short question at a time, summarize what was heard, and make correction easy.

Before **Start conversation**, show what audio is sent and whether it is retained. Request microphone access only after the click. The session has a visible state, elapsed time, live transcript, Mute, Stop speaking, End conversation and Type instead. Allow interruption when supported; never keep listening after End.

| STATE | BEHAVIOR |
| --- | --- |
| Ready / permission | Explain microphone use; denial or unavailable device offers retry instructions and typed intake. |
| Listening / thinking / speaking | Distinct text labels; partial transcript is visually provisional. Final turns create proposed facts only. |
| Muted / reconnecting | Show that no input is captured while muted; preserve transcript; let user continue by typing. |
| Ended / interrupted | Stop tracks/playback, release session resources, and show an editable summary with Review details. |

The assistant may ask for prescribed work, quoted fees, plan rules and the dates the dentist supplied. It cannot diagnose, act as the treating dentist, infer safe delay or determine eligibility. A clinical question receives a short boundary response and returns to gathering the existing treatment-plan facts.

Provider-neutral backend voice session returns transport instructions and only a short-lived client credential if needed. Do not expose durable provider keys. A clearly labeled simulated transcript exercises the demo without claiming a live agent. A real microphone test may show capture status, but must not imply transcription or understanding when no service is connected.

## 9. Confidence comes from a clear review

08 / CONFIRMATION

Use three grouped sections: **Your plan**, **Your prescribed care**, **Timing your dentist approved**. Financial input language is conversational; field definitions and “Why we ask” are secondary. Sources remain one click away.

- Your plan: annual plan-payment maximum, already used, deductible and amount met, category percentages/exemptions, current/next benefit periods and explicit future assumptions.
- Your care: editable procedure name/category/contracted fee, eligibility confirmation and source. Keep the supported cap of four events; explain overflow instead of dropping care.
- Dentist timing: confirmed anchor, permitted dates/years, deadline and prerequisites. Unknown permission fixes the procedure to the confirmed anchor.

Each field has a source badge: Manual, PDF page, Voice turn or Sample, plus Needs review / Confirmed / Missing / Conflict. Add an intake-evidence wrapper for new source types; map the confirmed values to the architecture domain without letting an AI origin count as dentist authority.

“Everything look right?” may confirm visible financial groups, but a separate unchecked affirmation covers dentist-provided timing. Future-year assumptions are explicit. **Compare my options** validates the exact reviewed snapshot; missing maximum, fee or utilization blocks precision and focuses the corresponding field. Never turn blank into zero.

Editing a confirmed value invalidates it and all current calculated results. Conflicting PDF/voice/manual values require a selection or corrected entry with provenance. New extraction cannot silently replace edits. Show a persistent, readable error summary and retain every entered value.

## 10. Make the result understandable in seconds

09 / COMPARE HERO

Lead with **Baseline** and **Best dentist-permitted alternative**. Each has **You pay**, **Plan pays** and **Benefit left** by year. Follow with a simple timeline; place calculation details behind **Why did this change?** and a procedure drawer.

| CANONICAL RECORD | BASELINE | PERMITTED ALTERNATIVE |
| --- | --- | --- |
| Estimated patient total | $1,500 | $855 |
| Estimated plan payment | $550 | $1,195 |
| Benefit left: current / next | $0 / $1,500 | $80 / $775 |

Difference copy: **“$645 lower estimated patient cost under these confirmed assumptions.”** Always show payment-not-guaranteed and next-year assumption labels. Money comes only from CalculationRecord and deterministic ScenarioComparison fields. No formula or authoritative totals in UI components.

Click crown: show fee, deductible, eligible amount, insurer rate, cap and patient/plan portions, with source links. The next-year crown trace is $1,500 fee - $50 deductible, $725 plan payment, $775 patient cost. This trace is rendered from the selected record.

Edit dentist deadline -> affirm source -> Apply. The real solver must remove next-year candidates before ranking. The $855 column and $645 badge disappear; $1,500 remains with the dentist-priority explanation. The old result cannot flash while an edit is pending.

No cheaper alternative, equal cost, invalid inputs and failed calculation are complete screen states. Full current allowance must retain $830 current-year treatment over $855 later. In a frontend-only build, provide an explicit fixture-preview mode; real-engine acceptance remains a separate integration gate, never passed by static mock totals.

## 11. History with context, not just a file list

10 / SAVED ANALYSES AND REPORTS

History groups everything by analysis, so a PDF, conversation and cost comparison tell one story. Search title/procedure, filter All / Draft / Needs review / Compared, sort newest first, and offer an obvious Clear filters action.

| ITEM CONTENT | ACTIONS |
| --- | --- |
| Title, patient display name, created/updated date, input badges and status | Open details; Resume draft or View snapshot |
| Compared result: patient total, comparison date and assumptions | Inspect historical trace; Duplicate as new analysis |
| Report metadata and voice-session summary | View source when available; remove attachment separately with clear effect |
| Selected record | Rename; Delete with a named confirmation dialog |

Empty state: **“Your analyses will appear here.”** Offer New analysis and Use sample. Failed load offers Retry and keeps navigation usable. On mobile, use stacked cards rather than squeezing a desktop table. Search and filters must work against the data adapter.

Saving creates an immutable version with scenario revision, engine version, source references and calculation records. Opening history displays **Historical estimate - based on facts confirmed on [date]**. Do not show old utilization or dentist permission as current. Editing/duplicating creates a new draft and requires reconfirmation; previous money remains a dated snapshot.

Guest/demo history is session-local by default, with seeded synthetic examples and an explicit notice that refresh resets it. Live authenticated history persists through the backend repository. Save success appears only after acknowledgement; retry cannot create duplicates. On sign-out/account change, clear the prior user's client cache. Cancellation and deletion errors restore an honest state.

## 12. A small, useful account area

11 / PROFILE AND SETTINGS

### Patient details

Display/edit name and date of birth with the same controls as intake. Account email and patient identity are separate. Changing a profile does not rewrite old analysis snapshots. Before attaching a report to another patient, require an explicit choice. This design supports one active patient; dependent/family accounts are outside this version.

### Account connection

Guest sees Continue with Google and the explanation “Sign in to save analyses across visits.” A signed-in session shows account name/email and Sign out. Handle loading, denied consent, provider unavailable and expired session. Restore the draft after a recoverable sign-in failure. Do not collect a date of birth from Google unless a separately authorized integration actually supplies it; this design uses a manual field.

### Data controls

| CONTROL | EXPECTED EFFECT |
| --- | --- |
| Clear current draft | Confirm if work exists. Abort jobs/voice, revoke previews, clear provisional facts and results. |
| Reset demo data | Replace session-local fixtures with the original synthetic set. Clearly named destructive action. |
| Delete saved analysis | Live mode calls backend and waits for acknowledgement; historical source retention follows its documented policy. |
| Sign out | End auth session; stop capture; clear account-specific caches and return to guest mode. |

### Consent and storage copy

Synthetic demo notice is visible in shell and intake. Microphone consent and file-upload disclosure appear where those actions happen, not buried in settings. No real patient data is needed for this deliverable. Do not store PDF blobs, audio, DOB or transcripts in localStorage as a shortcut. Session-memory mock data is sufficient; durable storage belongs to the connected backend.

> Google sign-in is an optional account convenience. The frontend must remain usable with a synthetic guest profile and manual/sample input when authentication, upload or voice is unavailable.

### Avoid unnecessary account scope

No passwords, password reset, insurance eligibility verification, appointments, billing/subscriptions, clinician portal or family management in this frontend goal. Add only functionality required for the requested identity, intake, comparison and history experience.

## 13. Design the difficult moments too

12 / RESPONSIVE, ACCESSIBILITY AND STATES

| SURFACE | EMPTY / BUSY | FAILURE / RECOVERY |
| --- | --- | --- |
| Identity | Blank form / sign-in pending | Invalid date, OAuth canceled, expired session -> preserve guest draft |
| PDF | Choose file / upload + processing | Wrong type, size, encryption, unreadable scan, timeout -> replace/manual/sample |
| Voice | Ready / listening/thinking/speaking | Denied mic, device lost, reconnect, provider failure -> typed intake or labeled demo |
| Confirm | Missing or unreviewed facts | Conflict, unsupported plan, missing timing -> field-linked issues |
| Compare | No current valid snapshot / recomputing | Infeasible baseline, no cheaper option, engine failure -> honest state |
| History | No entries / skeleton rows | Failed load/save/delete, expired auth -> retry without false success |

### Responsive behavior

- At 1024 px, retain the compact top navigation and stack dense review layouts when needed. At 767 px and below, use the top bar with Menu Sheet and one-column forms.
- Evidence and calculation drawers become bottom/full-height sheets on phones. Primary actions remain reachable above the keyboard and device safe area.
- Compare stacks baseline then alternative, retaining per-year labels. Voice controls stay sticky while the transcript scrolls. PDF preview is optional to expand; it never pushes the action off screen.

### Accessible interactions

- Keyboard-complete flows, skip link, semantic headings, associated labels, visible focus, form errors linked through descriptions and announced after submit.
- Dialogs trap focus and restore it to the invoking control. Escape closes non-destructive overlays; destructive actions require an explicit button.
- Transcript has a readable log; announce finalized turns/status changes politely, not every partial token. All voice actions also work through text.
- Upload works without drag-and-drop. Status uses text plus icon/color. Minimum 44 px targets; contrast and 200% zoom checks; reduced-motion support.

Use skeletons for initial load, determinate progress only for measured values, and durable inline messages for errors that require action. Toasts can confirm a save; they cannot be the only explanation for lost data or a blocked calculation.

## 14. A frontend that is easy to connect

13 / NEXT.JS MODULE DESIGN

Build in `/frontend` with the App Router, TypeScript and shadcn/ui. Use server-rendered route shells where useful; interactive intake, media capture, forms and local analysis state are client components. Keep provider keys and auth secrets in server-only modules. Route groups organize layouts without changing public URLs.

| LOCATION | RESPONSIBILITY |
| --- | --- |
| src/app/(workspace)/ | Dashboard, analysis routes, history and profile; shared shell/layout. |
| src/app/(public)/ | Welcome and sign-in pages; clear guest path. |
| src/components/ui/ | MCP-installed shadcn primitives; semantic theme tokens. |
| src/features/intake/ | IdentityForm, IntakeMethodPicker, PdfUpload, ProcessingStatus, VoiceSession, Transcript, EvidenceDrawer. |
| src/features/analysis/ | ConfirmationGroups, DentistTimingEditor, CompareHero, BenefitMeter, ProcedureTrace, analysis reducer. |
| src/features/history/ | HistoryList, filters, SnapshotDetail and delete/duplicate flows. |
| src/lib/adapters/ | Typed Report, Voice, History, Auth and Calculation interfaces; mock/live implementations. |
| src/lib/domain/ | Import/reuse architecture types and validation; no UI calculation formulas. |
| src/fixtures/ | Synthetic profile, report, transcript, canonical scenario and counterexample; no real identities. |
| tests/ + README | Acceptance checks, run instructions, environment variables and mock/live limitations. |

Keep draft state in one analysis controller/reducer. UI-only expansion/focus state stays local. Adapters return typed results and normalized error codes; screens never call provider SDKs. Auth identity, intake evidence, confirmed scenario and calculated comparison are separate stores or clearly separated state slices.

Use feature-local components rather than one enormous page file. Reuse the same FactField, SourceBadge, EmptyState, ErrorPanel and StatusChip across PDF, voice and manual paths. Avoid adding a global state library or chart framework without a concrete need.

> The root architecture owns financial semantics. If its pure engine modules are available, import them through CalculationAdapter. If absent, label fixture previews and report the integration gate as incomplete; do not rebuild benefit math in React components.

## 15. Backend handoff: explicit and replaceable

14 / PROPOSED API CONTRACTS

These are proposed interfaces for coordination, not claims that endpoints already exist. A typed adapter isolates route/transport changes. `/api/interpret` retains the existing architecture contract. Authentication, extraction, voice and history can be mocked independently; live mode must report unavailable services accurately.

| SERVICE / PROPOSED ENDPOINT | REQUEST -> RESPONSE |
| --- | --- |
| Report: POST /api/reports | Multipart file + analysisId + clientRevision + requestId -> reportId, jobId and status. Backend validates bytes/type/pages. |
| Report: GET /api/report-jobs/:id | Poll status (respect retry hint) -> queued/processing/ready/needsInput/failed, stage, evidence-backed proposals and normalized error. |
| Report: DELETE /api/report-jobs/:id | Cancel job; UI ignores stale completion even if backend cancellation races. |
| Text: POST /api/interpret | Existing requestId, draftRevision, text, syntheticDataAcknowledged -> unconfirmed ExtractionResult. |
| Voice: POST /api/voice/sessions | analysisId, revision, consent -> sessionId, transport URL, expiry/capabilities; no durable provider key. |
| Voice transport + DELETE session | Events for state, transcript delta/final, proposed facts, errors, end; close session on End/unmount. |
| History: GET/POST /api/analyses | List with cursor/filter/search, or save immutable snapshot with idempotency key and version. |
| History: GET/PATCH/DELETE /api/analyses/:id | Fetch detail, rename metadata, or delete with acknowledgement. Server authorizes ownership. Snapshot facts/results stay immutable. |
| Auth / profile | Auth.js provider/session handlers when configured; profile GET/PATCH separately supplies patient details. |

### Shared envelope rules

Use opaque IDs, analysisId, requestId and revision on asynchronous work. Accept responses only for the active analysis/source revision. Normalize validation issues to code, fieldPath, message and retryable; no provider stacks or raw secrets. Distinguish 401/403, 413, 415, 422, 429, timeout and network failure where relevant.

Client validation improves feedback; the backend revalidates everything. History ownership is server-enforced, not based on a posted userId. Never place DOB, report text or tokens in URLs. Configure upload/voice limits from capabilities where available. Defaults in this document are proposed demo limits, not verified provider capabilities.

Mock adapters provide deterministic scenarios for success, missing facts, conflicts, delay, cancellation and failure. They may return only named synthetic fixtures and must surface their mode. Mock history mutations behave like real async calls, including idempotent save and recoverable delete failure.

## 16. Separate evidence, confirmation and results

15 / DATA AND STATE CONTRACT

| MODEL | MINIMUM FIELDS |
| --- | --- |
| PatientProfile | id, displayName, fullName?, dateOfBirth?, accountEmail?; outside benefit calculations. |
| IntakeEvidence | id, kind: manual/pdf/voice/sample, sourceId, pageNumber? or turnId?, literalQuote?, receivedAt. |
| DraftFact | fieldPath, rawValue/null, evidenceIds[], status: proposed/missing/conflict/confirmed, editedAtRevision. |
| ReportJob | reportId, jobId, analysisId, requestId, revision, status, file metadata, normalized issues. |
| VoiceEvent | sessionId, analysisId, revision, eventId, sequence, type, turnId?, payload; final vs partial explicit. |
| ConfirmedScenario | Reuse architecture type; per-field confirmation manifest, source, eligibility and dentist timing. |
| ScenarioComparison | Reuse architecture type; baseline/best CalculationRecord, rejected candidates, delta and status. |
| AnalysisSnapshot | id, version, title, patient display snapshot, createdAt/confirmedAt, engineVersion, scenario, records, evidence references and source mode. |

### Core transitions

Draft -> Gathering -> Needs review -> Confirmed/validated -> Calculated -> Saved snapshot. Error states retain the user's last draft. Clinical or financial edits return the working copy to Needs review and remove its precise result until validation/calculation succeeds. History remains immutable and clearly dated.

### Evidence mapping

PDF page and voice turn references live in the intake layer. After human review, map financial AI-origin facts to the existing provenance contract. Dentist timing must be separately affirmed as user-reported dentist information or synthetic fixture input. A model's successful schema parse cannot produce dentistApproved or eligibilityConfirmed by itself.

### Race and recovery rules

- Each text edit, file replacement or new source request advances its revision. Abort old requests; matching IDs/revision are still required because abort can race.
- Transcript deltas never produce confirmed facts. Finalized proposals merge only into untouched fields; conflicting or reviewed values open conflict resolution.
- Save records the exact current confirmed/calculated revision. Pending edits cannot be saved as a current estimate. Repeated save uses an idempotency key.
- Clear, sign-out and account switch stop media, abort requests, clear current data and revoke object URLs. Old callbacks cannot repopulate state.

## 17. Use the existing shadcn MCP deliberately

16 / CLAUDE IMPLEMENTATION WORKFLOW

Repository inspection found `frontend/.mcp.json` with a shadcn server using `npx` and arguments `shadcn@latest`, `mcp`. `frontend/package.json` currently declares shadcn ^4.21.1 as a dev dependency. No Next.js application or components.json was present at inspection. The configuration was read; an MCP connection was not established in this session.

### Claude Code preflight

- Start Claude Code from `/frontend`; read this design and `../CAREWINDOW_ARCHITECTURE.md`, plus applicable repository instructions. Preserve existing package and MCP configuration when scaffolding.
- Run `/mcp` in Claude Code and verify the shadcn server is Connected. Use the server to browse/search component and block options, inspect relevant examples, then install selected primitives into this project.
- Initialize the Next.js App Router application and shadcn project configuration using current official documentation. Keep one consistent supported component style/primitive family; avoid combining incompatible registry examples.
- If MCP connection fails, report the precise problem and fix configuration/access. Do not claim MCP usage or silently substitute a different component library. Record installed components and the source of any custom compositions.

### Build in vertical slices

| PHASE | EXIT CONDITION |
| --- | --- |
| 1. Foundation | App shell, semantic theme, routes, responsive navigation and adapter interfaces. |
| 2. First useful path | Synthetic identity -> manual/sample -> Confirm -> record-driven Compare. |
| 3. Rich intake | PDF and voice screens, full state machines, evidence/conflict review and mock/live adapters. |
| 4. Return visits | Dashboard, profile, optional auth states, history save/open/duplicate/delete. |
| 5. Integration and polish | Real engine gate where available, accessibility checks, mobile layouts, cancellation/races and screenshot review. |

Install only components used by the design. MCP supplies primitives and blocks; the feature behavior and layout still need implementation. Keep generated UI code editable in the repository. Freeze dependency versions in the lockfile after setup. No feature is done because only its happy-path screenshot looks complete.

## 18. Acceptance: the frontend must behave

17 / TESTABLE DEFINITION OF DONE

| CHECK | REQUIRED EVIDENCE |
| --- | --- |
| Routes + shell | All planned routes render; direct-link missing ID handled; navigation and active state work at desktop/mobile. |
| Identity | Name/DOB validation, guest flow, profile edit and OAuth loading/cancel/unavailable states retain the draft. |
| PDF | Choose/drop/remove/replace/upload/cancel/retry; page evidence; unreadable/encrypted/oversized errors; late job cannot overwrite new file. |
| Voice | Start permission, denial, mute, speaking/interrupt capability, transcript, End, typed fallback; all tracks stopped on exit. |
| Confirm | Every input editable; provenance visible; group financial confirmation and separate timing affirmation; unknown != zero. |
| Compare | Record-bound totals, year ledgers, timelines, crown trace and honest no-alternative/error states. |
| History | Working filters/search; save/open/rename/duplicate/delete; immutable dated snapshot; no false persistence claim. |
| Async isolation | Revision/account/source checks prevent stale results; Clear/sign-out cannot be undone by late responses. |
| Accessibility | Keyboard paths, labels, dialog focus, errors, reduced motion, readable transcript and 200% zoom. |
| Delivery | Type/build checks pass; no broken controls or console errors; README lists demo/live modes and unresolved integrations. |

### Real-engine integration gate

With the shared engine connected, the canonical scenario must compute $1,500 baseline, $855 permitted alternative and $645 conditional difference. Current-year crown deadline removes the later candidate and returns $1,500. Full current allowance selects $830 over $855; unknown dentist permission cannot move the event. Apply architecture hard gates A-J. Frontend fixture rendering alone does not satisfy these numeric/solver checks.

### Visual review

Capture the dashboard, identity, upload success/error, voice active/denied, confirmation, comparison, history empty/populated and profile at 1440 and 390 px. Check 320 px overflow, 1024 px layout and 200% zoom. Fix clipping, inconsistent spacing, hidden actions and overly dense forms. Verify top navigation, generous whitespace, one primary action per task and restrained panel use against the reference-led direction.

> Done means a teammate can complete the synthetic input -> review -> compare -> save -> revisit journey without coaching, and can explain which connected services are live versus simulated.

## 19. A ready-to-paste Claude Code goal

18 / IMPLEMENTATION BRIEF

**Goal:** Implement the complete CareWindow frontend inside `/frontend` using Next.js App Router, TypeScript and shadcn/ui through the already configured shadcn MCP. Follow `FRONTEND_DESIGN.md` and the accompanying PDF. Read the root architecture for domain types, confirmation rules, CalculationRecord and the deterministic engine/constraint contracts.

Build a simple, spacious, reference-led responsive app with a white canvas, charcoal type, restrained teal actions and compact top navigation with Dashboard, New analysis, History and Profile. The analysis flow includes identity details (name and optional DOB), optional Google sign-in, dentist PDF upload, conversational AI intake with transcript, manual/sample fallback, grouped confirmation, and a record-driven cost comparison. Every route and control must have functional loading, empty, error and recovery states.

Use synthetic data only. Default to guest access and typed mock/live adapters when backend services are unavailable. Mark simulated analysis/conversation and session-local history clearly. Do not claim a real Google session, PDF extraction, voice agent, durable storage or live calculation unless that integration is connected and tested.

Connect all intake methods to one draft/evidence model. Human review is required before confirmation; dentist timing needs separate affirmation. Unknown financial values remain unknown. All financial results originate from CalculationRecord; keep math outside components and use the shared engine when available. Preserve the original canonical fixture and deadline/counterexample behaviors.

Use MCP to discover and install relevant shadcn primitives/blocks. Preserve the existing configuration, inspect repository state before scaffolding, and keep provider secrets server-side. Implement feature modules and adapters defined in the design. Build incrementally from manual/sample path to rich intake, history and optional auth.

Run the acceptance checklist, type/build checks and responsive visual review. Deliver working frontend code, documented adapter contracts, environment example without secrets, synthetic fixtures and README. Report completed screens, checks run, MCP usage and any integrations that remain mocked. Do not mark the real-engine gate complete using canned totals.

> Companion handoff: `/frontend/CLAUDE_FRONTEND_GOAL.md` contains this goal with an ordered checklist. `/frontend/FRONTEND_DESIGN.md` is the editable specification. This PDF provides the visual direction and screen compositions.

This is an implementation goal for Claude Code, not a claim that this design-document task has already built the application.

## 20. Sources and open integration decisions

19 / HANDOFF NOTES

### Project sources

- CAREWINDOW_ARCHITECTURE.md: three-stage flow, confirmation boundary, financial domain/records, constrained solver, canonical fixture, fallback and hard gates.
- frontend/.mcp.json and frontend/package.json: existing shadcn MCP configuration and package declaration inspected on October 3, 2026.
- Latest user request: complete Next.js frontend, shadcn MCP, identity, dentist PDF, conversational voice and history. Follow-ups confirm synthetic demo data and a simple UI inspired by https://hubble.ai/ and https://www.tryopentag.com/.

### Official documentation checked

[1] shadcn MCP: https://ui.shadcn.com/docs/mcp

[2] shadcn Next.js setup: https://ui.shadcn.com/docs/installation/next

[3] shadcn theming: https://ui.shadcn.com/docs/theming

[4] Next.js project structure: https://nextjs.org/docs/app/getting-started/project-structure

[5] Auth.js Google provider: https://authjs.dev/getting-started/providers/google

[6] Google OpenID Connect: https://developers.google.com/identity/openid-connect/openid-connect

Checked October 3, 2026. Context7 tools were unavailable; official docs were used as fallback. Component names and API routes in this design are implementation choices, not evidence that a backend or third-party service has been provisioned.

### Defaults to revisit only if the owner changes them

| DESIGN DEFAULT | INTEGRATION STILL TO SUPPLY |
| --- | --- |
| Simple reference-led UI; responsive desktop/mobile | Hubble and OpenTag supplied; exact palette and brand assets remain implementation choices. |
| Guest first; optional Google account | OAuth app/redirect configuration and an actual session backend. |
| Natural benefits-intake assistant | Voice provider, transport/capabilities and retention contract. |
| PDF proposed facts with page evidence | Upload/extraction job endpoint and supported PDF/scan limits. |
| History per analysis, immutable snapshots | Authenticated persistence/ownership service; demo remains session-local. |
| Typed calculation adapter | Shared deterministic engine implementation or its agreed integration interface. |

Simplicity and the two reference sites are user-selected. Other unanswered preferences remain design defaults, not user-approved selections. They do not prevent building the synthetic frontend. The application code, original architecture and shadcn configuration were not modified by creation of this design package.
