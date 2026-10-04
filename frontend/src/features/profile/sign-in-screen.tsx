"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { Notice } from "@/components/shared/feedback";
import { Page, PageHeader, SectionHeading } from "@/components/shared/page";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAnalysisController } from "@/features/analysis/analysis-provider";
import { hasWork, latestDraft, resumePath } from "@/features/history/history-items";
import { SAMPLE_PROFILE } from "@/fixtures/sample-treatment";
import { GoogleSignInControl, useGoogleSignIn } from "./google-sign-in";

const DEFAULT_DESTINATION = "/dashboard";

/** Only a path on this site is ever used as the post-sign-in destination. */
function safeDestination(raw: string | null): string {
  if (!raw) return DEFAULT_DESTINATION;
  const parsed = new URL(raw, "http://local.invalid");
  const path = `${parsed.pathname}${parsed.search}`;
  return path === "/" || path.startsWith("//") ? DEFAULT_DESTINATION : path;
}

/** Auth.js error codes mapped to what happened and what still works. */
function errorMessage(code: string | null): { title: string; message: string } | null {
  if (!code) return null;
  switch (code) {
    case "AccessDenied":
      return { title: "Google sign-in was cancelled", message: "Google sign-in was cancelled. Your draft is still here." };
    case "Configuration":
      return { title: "Google sign-in isn't set up correctly", message: "Sign-in isn't configured correctly on this site. Your draft is still here and you can continue as a guest." };
    case "SessionRequired":
      return { title: "Your session ended", message: "Sign in again to keep saving analyses. Your draft is still here." };
    default:
      return { title: "Sign-in didn't finish", message: "Google sign-in didn't complete. Try again, or continue as a guest. Your draft is still here." };
  }
}

export function SignInScreen() {
  return (
    <Suspense fallback={<SignInSkeleton />}>
      <SignInContent />
    </Suspense>
  );
}

function SignInContent() {
  const router = useRouter();
  const params = useSearchParams();
  const { state, adapters, setProfile } = useAnalysisController();
  const destination = safeDestination(params.get("callbackUrl"));
  const google = useGoogleSignIn(destination);
  const problem = errorMessage(params.get("error"));
  const { auth } = state;
  const guestDraft = latestDraft(state.analyses);
  const draftToKeep = guestDraft && hasWork(guestDraft) ? guestDraft : null;

  return (
    <Page width="form">
      <PageHeader title="Sign in" description="Signing in is optional. Sign in to save analyses across visits, or keep going as a guest." />

      <div className="space-y-10">
        {problem && (
          <Notice tone="warning" title={problem.title}>
            {problem.message}
          </Notice>
        )}
        {auth.status === "expired" && !problem && (
          <Notice tone="warning" title="Your session ended">
            Sign in again to keep saving analyses. Your draft is still here.
          </Notice>
        )}

        {auth.status === "loading" && (
          <div aria-busy="true" className="space-y-3">
            <p className="text-sm text-muted-foreground">Checking your sign-in status.</p>
            <Skeleton className="h-11 w-56" />
          </div>
        )}

        {auth.status === "signedIn" && (
          <section aria-labelledby="signed-in-heading" className="space-y-5">
            <SectionHeading id="signed-in-heading" description="This is your account. It's separate from the patient details on your analyses.">
              Signed in{auth.account.name ? ` as ${auth.account.name}` : ""}
            </SectionHeading>
            {auth.account.email && <p className="text-base break-all">{auth.account.email}</p>}
            {draftToKeep ? (
              <div className="space-y-4 border-y py-5">
                <p className="text-base font-medium">Keep your current draft?</p>
                <p className="text-sm text-muted-foreground">
                  You started “{draftToKeep.title}” before signing in. It stays in this session either way, and saving a comparison from it stores that comparison with this account. Nothing is merged by name or email.
                </p>
                <div className="flex flex-wrap gap-3">
                  <Button onClick={() => router.push(resumePath(draftToKeep))}>Keep draft and continue</Button>
                  <Button asChild variant="outline">
                    <Link href={destination}>Continue without opening it</Link>
                  </Button>
                </div>
              </div>
            ) : (
              <Button asChild>
                <Link href={destination}>Continue</Link>
              </Button>
            )}
          </section>
        )}

        {(auth.status === "guest" || auth.status === "expired") && (
          <>
            <section aria-labelledby="google-heading" className="space-y-4">
              <SectionHeading id="google-heading" description="Sign in to save analyses across visits.">
                Google account
              </SectionHeading>
              <GoogleSignInControl google={google} />
            </section>

            <section aria-labelledby="guest-heading" className="space-y-4">
              <SectionHeading id="guest-heading" description="Everything works without an account. Guest analyses last only for this session.">
                Guest
              </SectionHeading>
              <Button asChild variant={google.availability.status === "available" ? "outline" : "default"}>
                <Link href={destination}>Continue as guest</Link>
              </Button>
            </section>

            {adapters.mode === "demo" && (
              <section aria-labelledby="demo-profile-heading" className="space-y-4">
                <SectionHeading id="demo-profile-heading" description={`Fills in the synthetic sample patient, ${SAMPLE_PROFILE.displayName}. It isn't a Google account and nothing is signed in.`}>
                  Demo profile
                </SectionHeading>
                <Button
                  variant="outline"
                  onClick={() => {
                    setProfile(SAMPLE_PROFILE);
                    router.push(destination);
                  }}
                >
                  Use demo profile
                </Button>
              </section>
            )}
          </>
        )}
      </div>
    </Page>
  );
}

function SignInSkeleton() {
  return (
    <Page width="form">
      <div aria-busy="true" aria-label="Loading sign-in" className="space-y-6">
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-5 w-full max-w-md" />
        <Skeleton className="h-11 w-56" />
      </div>
    </Page>
  );
}
