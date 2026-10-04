"use client";

import { CheckIcon, SaveIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { ErrorPanel } from "@/components/shared/feedback";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { AdapterError } from "@/lib/adapters/types";
import { useAnalysisController } from "../analysis-provider";
import type { SavedReference } from "../state";
import { Press } from "./press";

type SaveState = { status: "idle" } | { status: "saving" } | { status: "failed"; error: AdapterError };

interface SaveControlsProps {
  analysisId: string;
  /** The reference for the revision currently shown, or null when it has not been saved. */
  saved: SavedReference | null;
}

/** Saves the current estimate to history. Retries reuse the store's idempotency key. */
export function SaveControls({ analysisId, saved }: SaveControlsProps) {
  const { saveToHistory, adapters } = useAnalysisController();
  const [state, setState] = useState<SaveState>({ status: "idle" });
  const sessionOnly = adapters.history.persistence === "session";

  async function save() {
    setState({ status: "saving" });
    const outcome = await saveToHistory(analysisId);
    if (outcome.ok) {
      setState({ status: "idle" });
      toast.success("Saved to history");
    } else {
      setState({ status: "failed", error: outcome.error });
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {saved ? (
          <>
            <Button disabled variant="outline">
              <CheckIcon aria-hidden />
              Saved to history
            </Button>
            <Link href={`/history/${saved.snapshotId}`} className="inline-flex min-h-11 items-center text-sm text-primary underline underline-offset-4">
              Open saved estimate
            </Link>
          </>
        ) : (
          <Press>
            <Button onClick={save} disabled={state.status === "saving"}>
              {state.status === "saving" ? <Spinner aria-hidden /> : <SaveIcon aria-hidden />}
              {state.status === "saving" ? "Saving" : "Save to history"}
            </Button>
          </Press>
        )}
      </div>
      <div aria-live="polite" className="text-sm text-muted-foreground">
        {saved && <span className="sr-only">Saved to history. </span>}
        {saved && sessionOnly && "Demo history lasts for this session."}
      </div>
      {state.status === "failed" && !saved && (
        <ErrorPanel title="We couldn't save this estimate" error={state.error} onRetry={save}>
          {state.error.code === "UNAUTHORIZED" && (
            <Button asChild variant="outline" size="sm">
              <Link href="/sign-in">Sign in</Link>
            </Button>
          )}
        </ErrorPanel>
      )}
    </div>
  );
}
