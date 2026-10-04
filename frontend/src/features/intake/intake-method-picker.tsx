"use client";

import { FileTextIcon, MicIcon, PencilLineIcon } from "lucide-react";

import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type { IntakeMethod } from "@/features/analysis/state";
import { cn } from "@/lib/utils";

export const INTAKE_METHODS: { value: IntakeMethod; title: string; description: string; Icon: typeof FileTextIcon }[] = [
  {
    value: "pdf",
    title: "Upload a dentist report",
    description: "A PDF with prescribed procedures and quoted fees. Plan rules may still need separate confirmation.",
    Icon: FileTextIcon,
  },
  {
    value: "voice",
    title: "Talk it through",
    description: "A calm conversation with an AI intake assistant. You'll see the transcript and can type instead.",
    Icon: MicIcon,
  },
  {
    value: "manual",
    title: "Enter manually",
    description: "The fastest way if you know your plan rules, fees and the dates your dentist gave you.",
    Icon: PencilLineIcon,
  },
];

/** Three quiet selectable rows; the screen supplies a single Continue action. */
export function IntakeMethodPicker({ value, onChange, labelledBy }: { value: IntakeMethod | null; onChange: (method: IntakeMethod) => void; labelledBy: string }) {
  return (
    <RadioGroup value={value ?? ""} onValueChange={(v) => onChange(v as IntakeMethod)} aria-labelledby={labelledBy} className="gap-0 divide-y border-y">
      {INTAKE_METHODS.map(({ value: method, title, description, Icon }) => (
        <label
          key={method}
          htmlFor={`method-${method}`}
          className={cn(
            "flex min-h-11 cursor-pointer items-start gap-4 px-1 py-5 transition-colors hover:bg-muted/50",
            value === method && "bg-accent/60 hover:bg-accent/60",
          )}
        >
          <RadioGroupItem id={`method-${method}`} value={method} className="mt-1" />
          <Icon aria-hidden className={cn("mt-0.5 size-5 shrink-0", value === method ? "text-primary" : "text-muted-foreground")} />
          <span className="min-w-0">
            <span className={cn("block text-base", value === method ? "font-semibold" : "font-medium")}>{title}</span>
            <span className="mt-0.5 block text-sm text-muted-foreground">{description}</span>
          </span>
        </label>
      ))}
    </RadioGroup>
  );
}
