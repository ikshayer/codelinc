import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";

type AuthEnvironment = Record<string, string | undefined>;

export function googleAuthConfigured(env: AuthEnvironment = process.env): boolean {
  return Boolean(env.AUTH_SECRET?.trim() && env.AUTH_GOOGLE_ID?.trim() && env.AUTH_GOOGLE_SECRET?.trim());
}

export function buildAuthConfig(env: AuthEnvironment = process.env): NextAuthConfig {
  return {
    secret: env.AUTH_SECRET,
    providers: googleAuthConfigured(env) ? [Google({
      clientId: env.AUTH_GOOGLE_ID,
      clientSecret: env.AUTH_GOOGLE_SECRET,
      checks: ["pkce", "state"],
    })] : [],
    session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
    pages: { signIn: "/sign-in", error: "/sign-in" },
    callbacks: {
      signIn({ account, profile }) {
        return account?.provider === "google" && profile?.email_verified === true;
      },
      jwt({ token, account }) {
        if (account?.provider === "google") token.sub = `google:${account.providerAccountId}`;
        return token;
      },
      session({ session, token }) {
        if (!token.sub) throw new Error("Session is missing its account identity.");
        session.user.id = token.sub;
        return session;
      },
    },
  };
}
