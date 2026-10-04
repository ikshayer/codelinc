"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Notice } from "@/components/shared/feedback";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useAnalysisController } from "@/features/analysis/analysis-provider";
import { ConfirmDialog } from "@/features/history/history-dialogs";
import { GoogleSignInControl, useGoogleSignIn } from "./google-sign-in";

/** Account connection: guest, loading, signed in, expired session or provider unavailable. */
export function AccountSection() {
  const { state, adapters, resetSession, setAuth } = useAnalysisController();
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const google = useGoogleSignIn("/profile");
  const { auth } = state;

  async function signOut(): Promise<string | null> {
    const result = await adapters.auth.signOut();
    if (!result.ok) return result.error.message;
    // Stops media, aborts requests and clears the prior account's client data before returning as a guest.
    resetSession({ reseed: adapters.mode === "demo" });
    setAuth({ status: "guest" });
    router.push("/");
    return null;
  }

  if (auth.status === "loading") {
    return (
      <div aria-busy="true" className="space-y-3">
        <p className="text-sm text-muted-foreground">Checking your sign-in status.</p>
        <Skeleton className="h-11 w-56" />
      </div>
    );
  }

  if (auth.status === "signedIn") {
    const { account } = auth;
    return (
      <div className="space-y-5">
        <dl className="space-y-3">
          {account.name && (
            <div>
              <dt className="text-sm text-muted-foreground">Signed in as</dt>
              <dd className="text-base font-medium">{account.name}</dd>
            </div>
          )}
          {account.email && (
            <div>
              <dt className="text-sm text-muted-foreground">Account email</dt>
              <dd className="text-base break-all">{account.email}</dd>
            </div>
          )}
        </dl>
        <p className="text-sm text-muted-foreground">This is your account, not the patient. Patient details above stay separate, and saved analyses are stored with this account.</p>
        <Button variant="outline" onClick={() => setConfirmOpen(true)}>
          Sign out
        </Button>
        <ConfirmDialog
          open={confirmOpen}
          title="Sign out?"
          description="You'll return to guest mode and drafts held in this browser are cleared. Analyses saved to your account stay there."
          confirmLabel="Sign out"
          busyLabel="Signing out"
          failureLead="Couldn't sign out."
          onClose={() => setConfirmOpen(false)}
          onConfirm={signOut}
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {auth.status === "expired" ? (
        <Notice tone="warning" title="Your session ended">
          Sign in again to keep saving analyses to your account. Your current draft is still here.
        </Notice>
      ) : (
        <p className="text-base">Sign in to save analyses across visits.</p>
      )}
      <GoogleSignInControl google={google} />
      {auth.status === "guest" && <p className="text-sm text-muted-foreground">You can keep using CareWindow as a guest. Guest analyses last only for this session.</p>}
    </div>
  );
}
