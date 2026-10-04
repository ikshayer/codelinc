"use client";

import { ChevronDownIcon, CopyPlusIcon, PencilIcon, PaperclipIcon, Trash2Icon } from "lucide-react";
import Link from "next/link";

import { Press } from "@/features/analysis/compare/press";
import { SourceBadge } from "@/components/shared/source-badge";
import { StatusChip } from "@/components/shared/status-chip";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import { formatCents } from "@/lib/domain/money";
import { formatTimestamp } from "@/lib/domain/dates";
import { itemCreatedAt, itemInputKinds, itemPatientName, itemTitle, type HistoryItem } from "./history-items";

interface HistoryRowProps {
  item: HistoryItem;
  duplicating: boolean;
  onRename: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onRemoveAttachment: () => void;
}

/** A card on every size: wide title and meta on the left, money and actions on the right from md up. */
export function HistoryRow({ item, duplicating, onRename, onDelete, onDuplicate, onRemoveAttachment }: HistoryRowProps) {
  const title = itemTitle(item);
  const inputKinds = itemInputKinds(item);
  const procedureLabels = item.kind === "draft" ? item.procedureLabels : item.summary.procedureLabels;
  const canRemoveAttachment = item.kind === "draft" && item.report !== null;

  return (
    <div className="p-4 md:p-6">
      <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_auto] md:gap-10">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <h3 className="min-w-0 font-display text-lg font-semibold break-words">{title}</h3>
            <StatusChip status={item.status} />
          </div>
          <p className="text-sm text-muted-foreground">For {itemPatientName(item)}</p>
          {procedureLabels.length > 0 && <p className="text-sm break-words">{procedureLabels.join(", ")}</p>}

          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span>Created {formatTimestamp(itemCreatedAt(item))}</span>
            {item.kind === "draft" ? <span>Updated {formatTimestamp(item.updatedAt)}</span> : <span>Saved {formatTimestamp(item.summary.savedAt)}</span>}
            {item.kind === "snapshot" && <span>Compared {formatTimestamp(item.summary.confirmedAt)}</span>}
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            {inputKinds.length > 0 ? inputKinds.map((kind) => <SourceBadge key={kind} kind={kind} />) : <span className="text-xs text-muted-foreground">No input yet</span>}
            {item.kind === "draft" && item.report && (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <PaperclipIcon aria-hidden className="size-3.5" />
                <span className="break-all">{item.report.name}</span>
              </span>
            )}
          </div>

        </div>

        <div className="flex flex-col gap-4 md:items-end md:justify-between">
          {item.kind === "snapshot" && (
            <dl className="flex flex-wrap gap-x-8 gap-y-2 md:flex-col md:items-end md:gap-y-3 md:text-right">
              <div>
                <dt className="text-sm text-muted-foreground">You pay at the best option</dt>
                <dd className="tabular text-2xl font-semibold text-primary">{formatCents(item.summary.bestPatientCents)}</dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">You pay at baseline</dt>
                <dd className="tabular text-base font-medium">{formatCents(item.summary.baselinePatientCents)}</dd>
              </div>
            </dl>
          )}
          <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Press>
          <Button asChild variant="outline">
            <Link href={item.kind === "draft" ? item.resumeHref : item.viewHref}>{item.kind === "snapshot" ? "View snapshot" : item.status === "compared" ? "Open comparison" : "Resume draft"}</Link>
          </Button>
          </Press>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" aria-label={`Actions for ${title}`} disabled={duplicating}>
                {duplicating ? <Spinner /> : null}
                Actions
                <ChevronDownIcon aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-60">
              {item.kind === "snapshot" && (
                <DropdownMenuItem className="min-h-11" onSelect={onDuplicate}>
                  <CopyPlusIcon aria-hidden />
                  Duplicate as new analysis
                </DropdownMenuItem>
              )}
              <DropdownMenuItem className="min-h-11" onSelect={onRename}>
                <PencilIcon aria-hidden />
                Rename
              </DropdownMenuItem>
              {canRemoveAttachment && (
                <DropdownMenuItem className="min-h-11" onSelect={onRemoveAttachment}>
                  <PaperclipIcon aria-hidden />
                  Remove attachment
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem className="min-h-11" variant="destructive" onSelect={onDelete}>
                <Trash2Icon aria-hidden />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          </div>
        </div>
      </div>
    </div>
  );
}
