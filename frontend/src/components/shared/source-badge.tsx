import { FileTextIcon, FlaskConicalIcon, MicIcon, PencilLineIcon } from "lucide-react";

import type { EvidenceKind, IntakeEvidence } from "@/lib/domain/types";
import { cn } from "@/lib/utils";

const KIND: Record<EvidenceKind, { label: string; Icon: typeof FileTextIcon }> = {
  manual: { label: "Manual", Icon: PencilLineIcon },
  pdf: { label: "PDF", Icon: FileTextIcon },
  voice: { label: "Voice", Icon: MicIcon },
  sample: { label: "Sample", Icon: FlaskConicalIcon },
};

export function sourceText(kind: EvidenceKind, evidence?: IntakeEvidence): string {
  if (kind === "manual" && evidence?.id.startsWith("database:")) return "Database";
  if (kind === "pdf" && evidence?.pageNumber) return `PDF page ${evidence.pageNumber}`;
  if (kind === "voice" && evidence?.turnId) return "Voice turn";
  return KIND[kind].label;
}

/** Where a value came from: Manual, PDF page N, Voice turn or Sample. */
export function SourceBadge({ kind, evidence, className }: { kind: EvidenceKind; evidence?: IntakeEvidence; className?: string }) {
  const { Icon } = KIND[kind];
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs text-muted-foreground", className)}>
      <Icon aria-hidden className="size-3.5" />
      {sourceText(kind, evidence)}
    </span>
  );
}
