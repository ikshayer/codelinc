"use client";

import { ChevronDownIcon, CopyPlusIcon, PencilIcon, PaperclipIcon, Trash2Icon } from "lucide-react";
import Link from "next/link";

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

/** Stacked card on phones, divider row from md up. No squeezed tables. */
export function HistoryRow({ item, duplicating, onRename, onDelete, onDuplicate, onRemoveAttachment }: HistoryRowProps) {
  const title = itemTitle(item);
  const inputKinds = itemInputKinds(item);
  const procedureLabels = item.kind === "draft" ? item.procedureLabels : item.summary.procedureLabels;
  const canRemoveAttachment = item.kind === "draft" && item.report !== null;

  return (
    <li className="rounded-lg border p-4 md:rounded-none md:border-0 md:px-1 md:py-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between md:gap-8">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <h3 className="min-w-0 text-base font-semibold break-words">{title}</h3>
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

          {item.kind === "snapshot" && (
            <dl className="flex flex-wrap gap-x-8 gap-y-2 pt-1 text-sm">
              <div>
                <dt className="text-muted-foreground">You pay at baseline</dt>
                <dd className="tabular font-medium">{formatCents(item.summary.baselinePatientCents)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">You pay at the best option</dt>
                <dd className="tabular font-medium">{formatCents(item.summary.bestPatientCents)}</dd>
              </div>
            </dl>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button asChild variant="outline">
            <Link href={item.kind === "draft" ? item.resumeHref : item.viewHref}>{item.kind === "snapshot" ? "View snapshot" : item.status === "compared" ? "Open comparison" : "Resume draft"}</Link>
          </Button>
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
    </li>
  );
}
