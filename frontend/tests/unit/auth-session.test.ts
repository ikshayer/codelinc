import { afterEach, describe, expect, it, vi } from "vitest";
import { Auth } from "@auth/core";
import { encode } from "next-auth/jwt";
import { buildAuthConfig } from "@/lib/server/auth-config";

const secret = "test-only-auth-secret-with-at-least-thirty-two-characters";
const origin = "http://localhost:3000";
const cookieName = "authjs.session-token";
const config = () => ({
  ...buildAuthConfig({ AUTH_SECRET: secret, AUTH_GOOGLE_ID: "test-client", AUTH_GOOGLE_SECRET: "test-client-secret" }),
  basePath: "/api/auth", trustHost: true,
  logger: { error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
});
const request = (path: string, init: RequestInit = {}) => new Request(`${origin}/api/auth${path}`, init);
async function sessionCookie(maxAge = 3600) {
  const token = await encode({ secret, salt: cookieName, maxAge, token: {
    sub: "google:test-subject", name: "Test User", email: "test@example.test",
    access_token: "must-not-be-exposed", refresh_token: "must-not-be-exposed",
  } });
  return `${cookieName}=${token}`;
}
afterEach(() => vi.unstubAllGlobals());

describe("Auth.js session and OAuth boundary", () => {
  it("uses Google's stable provider subject instead of a transient user ID or email", async () => {
    const token = await config().callbacks!.jwt!({
      token: { sub: "transient-id" }, user: { id: "transient-id", email: "old@example.test" },
      account: { provider: "google", type: "oidc", providerAccountId: "stable-subject" },
      trigger: "signIn",
    });
    expect(token?.sub).toBe("google:stable-subject");
  });

  it("accepts only verified Google profiles", async () => {
    const input = { user: { id: "test-id" }, account: { provider: "google", type: "oidc" as const, providerAccountId: "test-id" } };
    const signIn = config().callbacks!.signIn!;
    expect(await signIn({ ...input, profile: { email_verified: true } })).toBe(true);
    expect(await signIn({ ...input, profile: { email_verified: false } })).toBe(false);
    expect(await signIn(input)).toBe(false);
  });

  it("serves a guest session without a database", async () => {
    const response = await Auth(request("/session"), config());
    expect(response.status).toBe(200);
    expect(await response.json()).toBeNull();
  });

  it("exposes the authenticated account ID but no provider tokens", async () => {
    const response = await Auth(request("/session", { headers: { cookie: await sessionCookie() } }), config());
    const body = await response.json();
    expect(body.user).toMatchObject({ id: "google:test-subject", name: "Test User", email: "test@example.test" });
    expect(JSON.stringify(body)).not.toContain("must-not-be-exposed");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.getSetCookie().join(";")).toContain("HttpOnly");
  });

  it.each(["expired", "tampered"])("rejects a %s session cookie", async kind => {
    const cookie = kind === "expired" ? await sessionCookie(-60) : `${cookieName}=not-a-valid-session`;
    const response = await Auth(request("/session", { headers: { cookie } }), config());
    expect(await response.json()).toBeNull();
    expect(response.headers.getSetCookie().join(";")).toContain("Max-Age=0");
  });

  it("does not advertise Google with incomplete credentials", async () => {
    const response = await Auth(request("/providers"), { ...config(), ...buildAuthConfig({ AUTH_SECRET: secret }) });
    expect(await response.json()).toEqual({});
  });

  it("does not reveal the client secret in provider discovery", async () => {
    const response = await Auth(request("/providers"), config());
    const body = await response.json();
    expect(body.google).toMatchObject({ id: "google", callbackUrl: `${origin}/api/auth/callback/google` });
    expect(JSON.stringify(body)).not.toContain("test-client-secret");
  });

  it("rejects sign-out without the matching CSRF token", async () => {
    const response = await Auth(request("/signout", {
      method: "POST", headers: { cookie: await sessionCookie(), "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ callbackUrl: "/" }),
    }), config());
    expect(response.headers.get("location")).toContain("MissingCSRF");
    expect(response.headers.getSetCookie().join(";")).not.toContain(`${cookieName}=;`);
  });

  it("clears an authenticated session using the adapter's CSRF and JSON redirect protocol", async () => {
    const csrf = await Auth(request("/csrf"), config());
    const { csrfToken } = await csrf.json();
    const cookies = [await sessionCookie(), ...csrf.headers.getSetCookie().map(c => c.split(";")[0])].join("; ");
    const response = await Auth(request("/signout", {
      method: "POST", headers: { cookie: cookies, "Content-Type": "application/x-www-form-urlencoded", "X-Auth-Return-Redirect": "1" },
      body: new URLSearchParams({ csrfToken, callbackUrl: "/" }),
    }), config());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ url: `${origin}/` });
    expect(response.headers.getSetCookie().join(";")).toContain(`${cookieName}=;`);
    expect(response.headers.getSetCookie().join(";")).toContain("Max-Age=0");
  });

  it("starts Google authorization with PKCE/state and rejects an external return URL", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({
      issuer: "https://accounts.google.com",
      authorization_endpoint: "https://accounts.google.com/o/oauth2/v2/auth",
      token_endpoint: "https://oauth2.googleapis.com/token",
      jwks_uri: "https://www.googleapis.com/oauth2/v3/certs",
      code_challenge_methods_supported: ["S256"],
    })));
    const csrf = await Auth(request("/csrf"), config());
    const { csrfToken } = await csrf.json();
    const cookies = csrf.headers.getSetCookie().map(c => c.split(";")[0]).join("; ");
    const response = await Auth(request("/signin/google", {
      method: "POST", headers: { cookie: cookies, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ csrfToken, callbackUrl: "https://outside.example/" }),
    }), config());
    const url = new URL(response.headers.get("location")!);
    expect(url.origin).toBe("https://accounts.google.com");
    expect(url.searchParams.get("redirect_uri")).toBe(`${origin}/api/auth/callback/google`);
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("state")).toBeTruthy();
    expect(url.searchParams.get("scope")).toBe("openid profile email");
    expect(response.headers.getSetCookie().join(";")).not.toContain("outside.example");
  });
});
