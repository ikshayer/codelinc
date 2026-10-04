"use client";

import { motion } from "motion/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, type ReactNode } from "react";

import { BrandBackdrop } from "@/components/brand/brand-backdrop";
import { EASE_OUT, Stagger, StaggerItem } from "@/components/motion/reveal";
import { Notice } from "@/components/shared/feedback";
import { Page } from "@/components/shared/page";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AbeGuide } from "@/features/history/abe-guide";
import { useAnalysisController } from "@/features/analysis/analysis-provider";
import { Press } from "@/features/analysis/compare/press";
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
      return { title: "Google sign-in was cancelled", message: "Google sign-in was cancelled. You can continue as a guest." };
    case "Configuration":
      return { title: "Google sign-in isn't set up correctly", message: "Sign-in isn't configured correctly on this site. You can continue as a guest." };
    case "SessionRequired":
      return { title: "Your session ended", message: "Sign in again to reconnect your account." };
    default:
      return { title: "Sign-in didn't finish", message: "Google sign-in didn't complete. Try again, or continue as a guest." };
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
    <Page backdrop={false} className="md:pt-10">
      <div className="grid gap-8 lg:grid-cols-12 lg:gap-14">
        <BrandPanel />

        <Stagger delay={0.25} gap={0.09} className="min-w-0 space-y-8 lg:col-span-7 lg:py-6">
          <StaggerItem>
            <h1 className="font-display text-[2rem] leading-[2.375rem] font-semibold tracking-tight text-foreground md:text-[2.75rem] md:leading-[3.125rem]">Sign in</h1>
            <p className="mt-3 max-w-[32rem] text-base text-pretty text-muted-foreground md:text-[17px] md:leading-7">
              Signing in is optional. Connect your Google account, or keep going as a guest.
            </p>
          </StaggerItem>

          {problem && (
            <StaggerItem>
              <Notice tone="warning" title={problem.title}>
                {problem.message}
              </Notice>
            </StaggerItem>
          )}
          {auth.status === "expired" && !problem && (
            <StaggerItem>
              <Notice tone="warning" title="Your session ended">
                Sign in again to reconnect your account.
              </Notice>
            </StaggerItem>
          )}

          {auth.status === "loading" && (
            <StaggerItem>
              <div aria-busy="true" className="space-y-3">
                <p className="text-sm text-muted-foreground">Checking your sign-in status.</p>
                <Skeleton className="h-11 w-56" />
              </div>
            </StaggerItem>
          )}

          {auth.status === "signedIn" && (
            <StaggerItem>
              <OptionRow
                id="signed-in-heading"
                featured
                title={`Signed in${auth.account.name ? ` as ${auth.account.name}` : ""}`}
                description="This is your account. It's separate from the patient details on your analyses."
              >
                {auth.account.email && <p className="text-base break-all">{auth.account.email}</p>}
                {draftToKeep ? (
                  <div className="space-y-4 border-t pt-5">
                    <p className="text-base font-medium">Keep your current draft?</p>
                    <p className="text-sm text-muted-foreground">
                      “{draftToKeep.title}” remains open in this browser session. Saving analyses to your account is not available yet.
                    </p>
                    <div className="flex flex-wrap gap-3">
                      <Press>
                        <Button onClick={() => router.push(resumePath(draftToKeep))}>Keep draft and continue</Button>
                      </Press>
                      <Button asChild variant="outline">
                        <Link href={destination}>Continue without opening it</Link>
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Press>
                    <Button asChild>
                      <Link href={destination}>Continue</Link>
                    </Button>
                  </Press>
                )}
              </OptionRow>
            </StaggerItem>
          )}

          {(auth.status === "guest" || auth.status === "expired") && (
            <>
              <StaggerItem>
                <OptionRow id="google-heading" featured title="Google account" description="Connect your Google account to CareWindow.">
                  <GoogleSignInControl google={google} />
                </OptionRow>
              </StaggerItem>

              <StaggerItem>
                <OptionRow id="guest-heading" title="Guest" description="Continue without signing in. Guest analyses last only for this session.">
                  <Press>
                    <Button asChild variant={google.availability.status === "available" ? "outline" : "default"}>
                      <Link href={destination}>Continue as guest</Link>
                    </Button>
                  </Press>
                </OptionRow>
              </StaggerItem>

              {adapters.mode === "demo" && (
                <StaggerItem>
                  <OptionRow
                    id="demo-profile-heading"
                    title="Demo profile"
                    description={`Fills in the synthetic sample patient, ${SAMPLE_PROFILE.displayName}. It isn't a Google account and nothing is signed in.`}
                  >
                    <Press>
                      <Button
                        variant="outline"
                        onClick={() => {
                          setProfile(SAMPLE_PROFILE);
                          router.push(destination);
                        }}
                      >
                        Use demo profile
                      </Button>
                    </Press>
                  </OptionRow>
                </StaggerItem>
              )}
            </>
          )}
        </Stagger>
      </div>
    </Page>
  );
}

/** Left panel: the live brand field with the product name and its one-line promise. */
function BrandPanel() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.8, ease: EASE_OUT }}
      className="relative min-h-44 overflow-hidden rounded-2xl [clip-path:inset(0_round_1rem)] lg:col-span-5 lg:min-h-[560px]"
    >
      <BrandBackdrop variant="hero" />
      <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/45 via-black/10 to-transparent" />
      <div className="relative flex h-full min-h-44 flex-col justify-end p-6 text-white md:p-10 lg:min-h-[560px]">
        <AbeGuide className="mb-4 h-16 rounded-lg md:h-20" delay={0.7} />
        <p className="font-display text-4xl font-semibold tracking-tight md:text-5xl">CareWindow</p>
        <p className="mt-3 max-w-xs text-base text-white/90 md:text-lg">See what you&apos;d pay for planned dental care on every date your dentist approves.</p>
      </div>
    </motion.div>
  );
}

/** One way to continue. The featured row carries the weight; the others stay quiet. */
function OptionRow({ id, title, description, featured = false, children }: { id: string; title: string; description: string; featured?: boolean; children: ReactNode }) {
  return (
    <section
      aria-labelledby={id}
      className={
        featured
          ? "space-y-4 rounded-2xl border bg-card p-6 shadow-[0_1px_2px_rgba(35,31,32,0.04),0_14px_32px_-16px_rgba(101,0,48,0.25)]"
          : "space-y-4 border-t pt-6"
      }
    >
      <div>
        <h2 id={id} className="font-display text-xl font-semibold tracking-tight">
          {title}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      {children}
    </section>
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
