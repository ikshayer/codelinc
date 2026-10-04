# CareWindow frontend UX review

Reviewed and improved October 3, 2026. The review used the running local app and Playwright on desktop and mobile with synthetic data.

## Findings and changes

| Finding | Change |
| --- | --- |
| Mobile header repeated a truncated page title beside the wordmark. | Hide the duplicate title on narrow phones; retain the full heading in the page. Give active desktop navigation a restrained teal background. |
| Identity onboarding presented four fields before getting to the task. | Keep name and optional date of birth visible. Put full name and email behind More details, preserve their values, and open the section automatically when email validation needs attention. Add a two-step setup indicator. |
| Fixed-width birth-date inputs crowded small screens. | Use a responsive three-column date layout. |
| Intake choices had lengthy descriptions and weak selected-state feedback. | Shorten descriptions, add quiet icon backgrounds and a teal selection edge, and name the Continue action for the chosen method. |
| Arrow keys moved focus without selecting an intake method. | Synchronize selection and focus for arrow keys, Home and End. Keep the shadcn radio primitives. |
| The manual-input tab was off-screen on phones. | Show PDF report, Voice chat and Manual together in a three-column mobile selector. Preserve the full accessible names. |
| Voice controls could obscure the introductory disclosure. | Make controls sticky only during an active session. Provide a direct, clearly labeled demo playback action without microphone access, with microphone testing as a separate action. |
| Intake showed a large expanded summary before any facts were gathered. | Collapse Facts gathered by default and simplify its count. Nonurgent demo notices use note semantics rather than alert semantics. |
| The sample review was more than 13,000 pixels tall on a phone. | Make plan, care and timing expandable groups with sticky section links. Preserve mounted field values, source evidence, validation and direct links to individual facts. |
| Saving a comparison required scrolling past its full breakdown. | Put Save to history in the result header. Keep editing available below the breakdown. |
| Results and landing page had little visual emphasis. | Add a restrained teal treatment to the lower-cost permitted option and a soft background to the landing preview. Simplify the headline and introduction. |

## Verification

- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm test`: all 122 tests passed across seven files.
- `npm run build`: passed.
- Playwright checked landing, dashboard, identity, history and profile at 320, 390, 1024 and 1440 pixels. No horizontal overflow was found. The comparison was also checked at these widths; the PDF and voice layouts were visually reviewed on mobile.
- Checked optional email validation, method selection, arrow/Home/End keys, sample PDF selection and extraction, simulated voice start/end without microphone access, confirmation gates, comparison, save-to-history, search and clearing filters.
- Section links open the appropriate review group. A direct fact hash opens a collapsed care group. Missing confirmation still blocks comparison.
- A clean browser context showed no page errors during onboarding and intake. The managed screenshot browser emitted hydration warnings from its injected caret-hiding styles; those were not reproduced in the clean context.

The backend, Google authentication and calculation engine remain subject to the existing adapter contracts. This review improves the frontend and does not establish that those live integrations are connected.

## Screenshots

- [Landing on desktop](../../output/frontend-review/landing-desktop.png)
- [Dashboard on desktop](../../output/frontend-review/dashboard-desktop.png)
- [Identity on mobile](../../output/frontend-review/identity-mobile.png)
- [PDF intake on mobile](../../output/frontend-review/pdf-mobile.png)
- [Voice intake on mobile](../../output/frontend-review/voice-mobile.png)
- [Review with groups collapsed](../../output/frontend-review/review-desktop.png)
- [Comparison on desktop](../../output/frontend-review/compare-desktop.png)
