"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useAnalysisController } from "@/features/analysis/analysis-provider";
import { ConfirmDialog } from "@/features/history/history-dialogs";
import { hasWork, latestDraft } from "@/features/history/history-items";

type Pending = "clearDraft" | "resetDemo" | null;

/** Clear the current draft, reset demo data and reach saved-analysis deletion. */
export function DataControls() {
  const { state, adapters, clearDraft, resetSession } = useAnalysisController();
  const [pending, setPending] = useState<Pending>(null);
  const draft = latestDraft(state.analyses);
  const demo = adapters.mode === "demo";

  function requestClear() {
    if (!draft) return;
    if (hasWork(draft)) {
      setPending("clearDraft");
      return;
    }
    clearDraft(draft.id);
    toast.success("Draft cleared");
  }

  async function resetDemo(): Promise<string | null> {
    // Reset the repository first so the history refetch that resetSession triggers sees the seeded data.
    const result = await adapters.history.reset?.();
    if (result && !result.ok) return result.error.message;
    resetSession({ reseed: true });
    toast.success("Demo data reset");
    return null;
  }

  return (
    <div className="divide-y border-y">
      <ControlRow
        title="Clear current draft"
        description={
          draft
            ? `Clears the facts, attached report and results from “${draft.title}”. Saved analyses aren't affected.`
            : "There's no draft in progress."
        }
      >
        <Button variant="outline" onClick={requestClear} disabled={!draft}>
          Clear current draft
        </Button>
      </ControlRow>

      {demo && (
        <ControlRow title="Reset demo data" description="Replaces your drafts and saved analyses with the original synthetic examples, and restores the sample profile.">
          <Button variant="outline" onClick={() => setPending("resetDemo")}>
            Reset demo data
          </Button>
        </ControlRow>
      )}

      <ControlRow
        title="Delete a saved analysis"
        description={
          adapters.history.persistence === "account"
            ? "Open it in History and choose Delete. It's removed from your account once the service confirms."
            : "Open it in History and choose Delete. Demo history only lasts for this session."
        }
      >
        <Button asChild variant="outline">
          <Link href="/history">Open history</Link>
        </Button>
      </ControlRow>

      <ConfirmDialog
        open={pending === "clearDraft"}
        title={`Clear “${draft?.title ?? "this draft"}”?`}
        description="This removes the gathered facts, the attached report and any results from this draft. The draft itself and your saved analyses stay."
        confirmLabel="Clear draft"
        busyLabel="Clearing"
        failureLead="Couldn't clear it."
        onClose={() => setPending(null)}
        onConfirm={async () => {
          if (draft) clearDraft(draft.id);
          toast.success("Draft cleared");
          return null;
        }}
      />
      <ConfirmDialog
        open={pending === "resetDemo"}
        title="Reset demo data?"
        description="Everything you changed in this demo session is replaced by the original synthetic drafts and saved analyses. You can't undo this."
        confirmLabel="Reset demo data"
        busyLabel="Resetting"
        failureLead="Couldn't reset demo data."
        onClose={() => setPending(null)}
        onConfirm={resetDemo}
      />
    </div>
  );
}

function ControlRow({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-4 py-5 sm:flex-row sm:items-center sm:justify-between sm:gap-8">
      <div className="max-w-xl">
        <h3 className="text-base font-medium">{title}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}
