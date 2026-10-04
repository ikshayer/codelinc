import { AlertTriangleIcon, CheckIcon, CircleDashedIcon, CircleDotIcon, FileClockIcon, GitCompareArrowsIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { FactDisplayStatus } from "@/lib/domain/draft";

// Status is always text plus an icon — never color alone.

export type ChipStatus = FactDisplayStatus | "draft" | "compared";

const STATUS: Record<ChipStatus, { label: string; variant: "outline" | "warning" | "destructive" | "success" | "secondary"; Icon: typeof CheckIcon }> = {
  missing: { label: "Missing", variant: "warning", Icon: CircleDashedIcon },
  needsReview: { label: "Needs review", variant: "outline", Icon: CircleDotIcon },
  conflict: { label: "Conflict", variant: "destructive", Icon: AlertTriangleIcon },
  confirmed: { label: "Confirmed", variant: "success", Icon: CheckIcon },
  draft: { label: "Draft", variant: "secondary", Icon: FileClockIcon },
  compared: { label: "Compared", variant: "success", Icon: GitCompareArrowsIcon },
};

export function StatusChip({ status, label }: { status: ChipStatus; label?: string }) {
  const { label: defaultLabel, variant, Icon } = STATUS[status];
  return (
    <Badge variant={variant} className="h-6 gap-1 rounded-md px-2 font-medium">
      <Icon aria-hidden />
      {label ?? defaultLabel}
    </Badge>
  );
}
