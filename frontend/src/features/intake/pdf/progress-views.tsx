import { CheckIcon, CircleIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Spinner } from "@/components/ui/spinner";
import type { ReportStage } from "@/lib/adapters/types";
import { formatBytes } from "./file-checks";

// Progress is determinate only when the transport reports a measured value;
// otherwise the bar is indeterminate. We never invent a percentage.

function IndeterminateBar() {
  return (
    <div role="progressbar" aria-label="Working" className="relative h-1 w-full overflow-hidden rounded-full bg-muted">
      <div className="absolute inset-y-0 w-1/3 animate-pulse rounded-full bg-primary" />
    </div>
  );
}

export function UploadingView({ loaded, total, onCancel }: { loaded: number | null; total: number | null; onCancel: () => void }) {
  const measured = loaded !== null && total !== null && total > 0;
  return (
    <div className="space-y-3">
      <p className="flex items-center gap-2" role="status">
        <Spinner aria-hidden />
        <span>Uploading…</span>
        {measured && (
          <span className="tabular text-sm text-muted-foreground">
            {formatBytes(loaded)} of {formatBytes(total)}
          </span>
        )}
      </p>
      {measured ? <Progress value={Math.round((loaded / total) * 100)} aria-label="Upload progress" /> : <IndeterminateBar />}
      <Button variant="outline" onClick={onCancel}>
        Cancel
      </Button>
    </div>
  );
}

const STAGES: { stage: ReportStage; label: string }[] = [
  { stage: "checking", label: "Checking file" },
  { stage: "reading", label: "Reading report" },
  { stage: "extracting", label: "Extracting facts" },
];

export function ProcessingView({ stage, progress, onCancel }: { stage: ReportStage | null; progress: number | null; onCancel: () => void }) {
  const currentIndex = STAGES.findIndex((item) => item.stage === (stage ?? "checking"));
  return (
    <div className="space-y-4">
      <p role="status" className="font-medium">
        {STAGES[currentIndex].label}…
      </p>
      {progress !== null ? <Progress value={Math.round(progress * 100)} aria-label="Report analysis progress" /> : <IndeterminateBar />}
      <ol className="space-y-2">
        {STAGES.map((item, index) => {
          const state = index < currentIndex ? "done" : index === currentIndex ? "current" : "waiting";
          return (
            <li key={item.stage} className="flex items-center gap-2 text-sm" aria-current={state === "current" ? "step" : undefined}>
              {state === "done" && <CheckIcon aria-hidden className="size-4 text-success-foreground" />}
              {state === "current" && <Spinner aria-hidden role="presentation" />}
              {state === "waiting" && <CircleIcon aria-hidden className="size-4 text-muted-foreground" />}
              <span className={state === "waiting" ? "text-muted-foreground" : undefined}>{item.label}</span>
              <span className="sr-only">{state === "done" ? "done" : state === "current" ? "in progress" : "waiting"}</span>
            </li>
          );
        })}
      </ol>
      <Button variant="outline" onClick={onCancel}>
        Cancel
      </Button>
    </div>
  );
}
