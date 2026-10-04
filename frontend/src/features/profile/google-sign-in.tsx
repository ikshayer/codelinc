"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useAnalysisController } from "@/features/analysis/analysis-provider";

type Availability = { status: "checking" } | { status: "available" } | { status: "unavailable"; reason: string };

const DEFAULT_UNAVAILABLE = "Google sign-in isn't available right now.";

/**
 * Google sign-in through the auth adapter. Demo mode reports unavailable and
 * never simulates success; live mode starts the real provider redirect.
 */
export function useGoogleSignIn(callbackPath: string) {
  const { adapters } = useAnalysisController();
  const [availability, setAvailability] = useState<Availability>({ status: "checking" });
  const [redirecting, setRedirecting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void adapters.auth.googleAvailability(controller.signal).then((result) => {
      if (controller.signal.aborted) return;
      if (!result.ok) setAvailability({ status: "unavailable", reason: result.error.message });
      else setAvailability(result.value.available ? { status: "available" } : { status: "unavailable", reason: result.value.reason ?? DEFAULT_UNAVAILABLE });
    });
    return () => controller.abort();
  }, [adapters]);

  async function start() {
    setRedirecting(true);
    setStartError(null);
    // Resolves only if the redirect could not start.
    const result = await adapters.auth.signInWithGoogle(new URL(callbackPath, window.location.origin).toString());
    setRedirecting(false);
    if (!result.ok) setStartError(result.error.message);
  }

  return { availability, redirecting, startError, start };
}

export type GoogleSignIn = ReturnType<typeof useGoogleSignIn>;

/** "Continue with Google" with its availability, progress and failure messages. */
export function GoogleSignInControl({ google, variant = "default" }: { google: GoogleSignIn; variant?: "default" | "outline" }) {
  const { availability, redirecting, startError, start } = google;
  return (
    <div className="space-y-3">
      <Button variant={variant} onClick={() => void start()} disabled={availability.status !== "available" || redirecting}>
        {(redirecting || availability.status === "checking") && <Spinner />}
        {redirecting ? "Connecting to Google" : "Continue with Google"}
      </Button>
      <div aria-live="polite" className="text-sm text-muted-foreground">
        {availability.status === "checking" && "Checking whether Google sign-in is available."}
        {availability.status === "unavailable" && availability.reason}
      </div>
      {startError && (
        <p role="alert" className="text-sm text-destructive">
          Couldn&apos;t start Google sign-in. {startError} You can continue as a guest.
        </p>
      )}
    </div>
  );
}
