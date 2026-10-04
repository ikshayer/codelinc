import { FileTextIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { formatBytes } from "./file-checks";

/** The chosen file: name, size, and the actions that apply in the current state. */
export function FileRow({ name, sizeBytes, isSample, children }: { name: string; sizeBytes: number | null; isSample: boolean; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
      <div className="flex min-w-0 items-center gap-3">
        <FileTextIcon aria-hidden className="size-6 shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <p className="font-medium break-words">{name}</p>
          <p className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
            {sizeBytes !== null && <span>{formatBytes(sizeBytes)}</span>}
            {isSample && <Badge variant="secondary">Sample report</Badge>}
          </p>
        </div>
      </div>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </div>
  );
}
