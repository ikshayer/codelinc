# Google sign-in

The frontend serves Auth.js at `/api/auth/*` and uses the existing Google button, account display, and sign-out dialog. `next-auth` is pinned to `5.0.0-beta.32`, the v5 release documented by Auth.js and compatible with Next.js 16. This release is still labeled beta.

## Local setup

1. Open [Google Auth Platform](https://console.cloud.google.com/auth/overview) and select or create a project.
2. Configure Branding and Audience for the OAuth consent screen. For an external app in testing, add the Google accounts you want to use as test users if Google requires it.
3. Under Clients, create an OAuth client with application type **Web application**.
4. Register these **Authorized redirect URIs** if you use both local hostnames:

   ```text
   http://localhost:3000/api/auth/callback/google
   http://127.0.0.1:3000/api/auth/callback/google
   ```

5. Save the credentials in **frontend/.env.local**:

   ```dotenv
   NEXT_PUBLIC_CAREWINDOW_MODE=live
   AUTH_GOOGLE_ID=your-google-client-id
   AUTH_GOOGLE_SECRET=your-google-client-secret
   ```

   Keep these server-only; do not prefix them with `NEXT_PUBLIC_`. The MongoDB URI and Atlas API keys are different credentials and cannot enable Google login.

6. Generate the session encryption secret from the frontend directory:

   ```powershell
   node scripts/setup-auth-secret.mjs
   ```

   This adds a random `AUTH_SECRET` to `.env.local` without printing it. An existing nonempty secret is preserved. The local workspace secret was generated during implementation.

7. Restart `npm run dev`, open `http://localhost:3000/sign-in`, and choose **Continue with Google**. After approval, the app returns to the requested page. Profile displays the account name/email and offers Sign out.

The backend does not need to run for login. The session/provider routes report guest/unavailable when credentials are incomplete. Missing credentials never create a fake signed-in account.

## Session behavior and scope

- Auth.js validates Google's OAuth/OIDC response. Google profiles must have a verified email; no email-domain restriction is imposed.
- Sessions use encrypted, HttpOnly cookies, with HTTPS secure-cookie defaults in production. Session lifetime is 30 days. OAuth uses state and PKCE; sign-in and sign-out use Auth.js CSRF protection.
- The account ID is `google:<provider subject>`, stable across logins and independent of display name/email. The session response exposes account ID, name, email, image, and expiry, not Google access/refresh tokens.
- Guest use remains available. Demo mode still uses the mock auth adapter and does not sign in.
- No MongoDB user/account collections are introduced. This provides login/session identity; account history storage, backend authorization for private records, and account deletion remain separate work.
- Drafts remain in memory. Leaving for Google reloads the app, so an unsaved guest draft is not carried through OAuth. Sign in before starting work you want to keep open. This change does not add browser storage for patient data.

## Deployment

Set `AUTH_SECRET`, `AUTH_GOOGLE_ID`, and `AUTH_GOOGLE_SECRET` in the frontend host's secret settings. Add `https://your-domain/api/auth/callback/google` to the Google client's allowed redirect URIs, matching the scheme, hostname, port, and path exactly. Keep the same secret across instances and restarts; changing it invalidates existing sessions.

Auth.js normally infers the origin. If a trusted reverse proxy requires it, set `AUTH_URL=https://your-domain` and `AUTH_TRUST_HOST=true`, and ensure the proxy supplies controlled host/protocol headers. Do not use the backend API origin as `AUTH_URL`.

## Verification

`npm test` exercises real Auth.js cookie decoding, guest and authenticated session responses, expired/tampered cookies, provider discovery, CSRF rejection, sign-out cookie clearing, and Google authorization redirects with PKCE/state and an external return URL rejected. The OAuth-discovery response and session identity in these tests are synthetic; they do not prove an actual Google approval/token exchange.

The full Google round trip requires a configured client and a user signing in with their Google account. Do not paste client secrets or Google passwords into chat.

Implementation checks on October 4, 2026: all 148 frontend tests, typecheck, and lint passed. The running Next.js server returned HTTP 200 for session/providers/CSRF, read a short-lived synthetic authenticated cookie, and cleared it on sign-out. Playwright confirmed that unconfigured Google login is disabled while guest access remains available. Google credentials were absent, so a real Google login was not completed.

Sources: [Auth.js installation](https://authjs.dev/getting-started/installation), [Google provider](https://authjs.dev/getting-started/providers/google), [session identity](https://authjs.dev/guides/extending-the-session), [Google OAuth client and redirect setup](https://developers.google.com/identity/protocols/oauth2/web-server).
