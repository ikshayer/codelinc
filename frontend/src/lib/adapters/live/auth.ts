import { adapterError, isAbortError } from "../shared";
import { fail, ok, type AdapterResult, type AuthAdapter, type AuthState } from "../types";

// Auth.js (NextAuth) REST endpoints, no client library. A missing handler (404)
// or a network failure means sign-in is unavailable; guest use stays possible.

const AUTH_BASE = "/api/auth";
const UNAVAILABLE_MESSAGE = "Google sign-in isn't available right now. You can continue as a guest.";

interface SessionPayload {
  user?: { id?: string | null; name?: string | null; email?: string | null } | null;
  expires?: string;
  error?: string;
}

async function authFetch<T>(path: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<AdapterResult<T | null>> {
  const { timeoutMs = 10000, signal, ...rest } = init;
  const timeout = AbortSignal.timeout(timeoutMs);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
  let response: Response;
  try {
    response = await fetch(`${AUTH_BASE}${path}`, { ...rest, signal: combined, credentials: "same-origin" });
  } catch (error) {
    if (signal?.aborted || isAbortError(error)) return fail(adapterError("CANCELLED", "Request cancelled."));
    return fail(adapterError("NETWORK", UNAVAILABLE_MESSAGE, true));
  }
  if (response.status === 404) return fail(adapterError("UNAVAILABLE", UNAVAILABLE_MESSAGE));
  if (response.status === 401 || response.status === 403) return fail(adapterError("UNAUTHORIZED", "Your session has ended. Sign in again to continue."));
  if (!response.ok) return fail(adapterError("UNAVAILABLE", UNAVAILABLE_MESSAGE, response.status >= 500));
  // Auth.js answers "no session" with {} or null depending on version.
  const body: unknown = await response.json().catch(() => null);
  return ok(body as T | null);
}

async function csrfToken(signal?: AbortSignal): Promise<AdapterResult<string>> {
  const result = await authFetch<{ csrfToken?: string }>("/csrf", { signal });
  if (!result.ok) return result;
  const token = result.value?.csrfToken;
  return token ? ok(token) : fail(adapterError("UNAVAILABLE", UNAVAILABLE_MESSAGE));
}

function sessionToAuthState(payload: SessionPayload | null): AuthState {
  if (!payload?.user) return { status: "guest" };
  if (payload.error) return { status: "expired" };
  if (payload.expires && Date.parse(payload.expires) <= Date.now()) return { status: "expired" };
  const { user } = payload;
  return {
    status: "signedIn",
    account: { accountId: user.id ?? user.email ?? "account", name: user.name ?? null, email: user.email ?? null },
  };
}

export const liveAuthAdapter: AuthAdapter = {
  mode: "live",

  async googleAvailability(signal) {
    const result = await authFetch<Record<string, unknown>>("/providers", { signal });
    if (!result.ok) {
      if (result.error.code === "CANCELLED") return result;
      return ok({ available: false, reason: result.error.message });
    }
    const available = Boolean(result.value && "google" in result.value);
    return ok({ available, reason: available ? null : "Google sign-in isn't set up for this app." });
  },

  async getSession(signal) {
    const result = await authFetch<SessionPayload>("/session", { signal });
    if (!result.ok) {
      // A 401 here means a session existed and ended; anything else leaves us a guest.
      return result.error.code === "UNAUTHORIZED" ? ok({ status: "expired" }) : result;
    }
    return ok(sessionToAuthState(result.value));
  },

  async signInWithGoogle(callbackUrl) {
    const token = await csrfToken();
    if (!token.ok) return token;
    // Auth.js expects a real form POST so the browser follows the OAuth redirect.
    const form = document.createElement("form");
    form.method = "POST";
    form.action = `${AUTH_BASE}/signin/google`;
    form.hidden = true;
    for (const [name, value] of Object.entries({ csrfToken: token.value, callbackUrl })) {
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = name;
      input.value = value;
      form.append(input);
    }
    document.body.append(form);
    form.submit();
    // The page is navigating away. Never resolve: callers only act if the redirect could not start.
    return new Promise<never>(() => undefined);
  },

  async signOut() {
    const token = await csrfToken();
    if (!token.ok) return token;
    const result = await authFetch<unknown>("/signout", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "X-Auth-Return-Redirect": "1" },
      body: new URLSearchParams({ csrfToken: token.value, callbackUrl: "/" }),
    });
    return result.ok ? ok(undefined) : result;
  },
};
