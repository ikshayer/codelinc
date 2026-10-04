"use client";

import { FileUpIcon } from "lucide-react";
import { useId, useState, type DragEvent, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { ReportLimits } from "@/lib/adapters/types";
import { cn } from "@/lib/utils";
import { formatBytes } from "./file-checks";

// Accessible PDF drop zone. Dragging over only highlights it; dropping or
// choosing a file selects it. Nothing is uploaded until "Send for analysis".

interface DropZoneProps {
  limits: ReportLimits;
  onFiles: (files: File[]) => void;
  onChoose: () => void;
  onUseSample: () => void;
  loadingSample: boolean;
  /** Extra links under the buttons, e.g. "Enter details manually". */
  children?: ReactNode;
}

export function DropZone({ limits, onFiles, onChoose, onUseSample, loadingSample, children }: DropZoneProps) {
  const [dragging, setDragging] = useState(false);
  const headingId = useId();
  const hintId = useId();

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    if (!event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setDragging(true);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    onFiles(Array.from(event.dataTransfer.files));
  }

  return (
    <div
      role="group"
      aria-labelledby={headingId}
      aria-describedby={hintId}
      data-dragging={dragging || undefined}
      onDragOver={handleDragOver}
      onDragEnter={handleDragOver}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
      }}
      onDrop={handleDrop}
      className={cn(
        "flex flex-col items-center gap-4 rounded-lg border-2 border-dashed px-5 py-10 text-center transition-colors duration-150",
        dragging ? "border-primary bg-accent" : "border-border",
      )}
    >
      <FileUpIcon aria-hidden className="size-8 text-muted-foreground" />
      <div className="space-y-1">
        <p id={headingId} className="text-lg font-medium">
          {dragging ? "Drop the PDF to select it" : "Drag your dentist report here"}
        </p>
        <p id={hintId} className="text-sm text-muted-foreground">
          One PDF, up to {formatBytes(limits.maxBytes)} and {limits.maxPages} pages. Dropping a file only selects it.
        </p>
      </div>
      <Button onClick={onChoose}>Choose PDF</Button>
      <div className="flex flex-col items-center gap-1 sm:flex-row sm:gap-2">
        <Button variant="link" onClick={onUseSample} disabled={loadingSample}>
          {loadingSample && <Spinner aria-hidden />}
          Use sample report
        </Button>
        {children}
      </div>
    </div>
  );
}
