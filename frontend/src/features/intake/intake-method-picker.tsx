"use client";

import { FileTextIcon, MicIcon, PencilLineIcon } from "lucide-react";
import { motion } from "motion/react";
import { useId } from "react";

import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type { IntakeMethod } from "@/features/analysis/state";
import { cn } from "@/lib/utils";

export const INTAKE_METHODS: { value: IntakeMethod; title: string; description: string; Icon: typeof FileTextIcon }[] = [
  {
    value: "pdf",
    title: "Upload a dentist report",
    description: "Add a PDF of your dentist's treatment plan and quoted fees.",
    Icon: FileTextIcon,
  },
  {
    value: "voice",
    title: "Talk it through",
    description: "Tell the AI assistant about your plan, by voice or text.",
    Icon: MicIcon,
  },
  {
    value: "manual",
    title: "Enter manually",
    description: "Fill in the treatment, fees and insurance details you know.",
    Icon: PencilLineIcon,
  },
];

/** Three quiet selectable rows; the screen supplies a single Continue action. */
export function IntakeMethodPicker({ value, onChange, labelledBy }: { value: IntakeMethod | null; onChange: (method: IntakeMethod) => void; labelledBy: string }) {
  // Scoped so two pickers on one screen don't share the sliding highlight.
  const highlightId = `method-highlight-${useId()}`;
  return (
    <RadioGroup
      value={value ?? ""}
      onValueChange={(v) => onChange(v as IntakeMethod)}
      aria-labelledby={labelledBy}
      orientation="vertical"
      className="gap-0 divide-y border-y"
      onKeyDownCapture={(event) => {
        // Keep the selected method in sync with arrow-key focus. The installed
        // primitive defers focus until after keyup, which can skip selection.
        if (event.altKey || event.ctrlKey || event.metaKey) return;
        const direction = event.key === "ArrowDown" || event.key === "ArrowRight" ? 1 : event.key === "ArrowUp" || event.key === "ArrowLeft" ? -1 : 0;
        if (!direction && event.key !== "Home" && event.key !== "End") return;
        const target = (event.target as HTMLElement).closest<HTMLButtonElement>("button[role=radio]");
        if (!target) return;
        const current = INTAKE_METHODS.findIndex((method) => method.value === target.value);
        const next = event.key === "Home" ? 0 : event.key === "End" ? INTAKE_METHODS.length - 1 : (current + direction + INTAKE_METHODS.length) % INTAKE_METHODS.length;
        event.preventDefault();
        event.stopPropagation();
        onChange(INTAKE_METHODS[next].value);
        event.currentTarget.querySelector<HTMLButtonElement>(`button[value="${INTAKE_METHODS[next].value}"]`)?.focus();
      }}
    >
      {INTAKE_METHODS.map(({ value: method, title, description, Icon }) => (
        <label
          key={method}
          htmlFor={`method-${method}`}
          className={cn(
            "relative flex min-h-11 cursor-pointer items-start gap-3 px-3 py-5 transition-colors hover:bg-muted/50 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring has-[:focus-visible]:outline-offset-2 sm:gap-4",
          )}
        >
          {value === method && (
            <motion.span
              layoutId={highlightId}
              aria-hidden
              className="absolute inset-0 border-l-2 border-l-brand bg-accent/70"
              transition={{ type: "spring", stiffness: 420, damping: 36 }}
            />
          )}
          <RadioGroupItem id={`method-${method}`} value={method} className="relative mt-1" />
          <span className={cn("relative flex size-9 shrink-0 items-center justify-center rounded-lg transition-colors", value === method ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
            <Icon aria-hidden className="size-4" />
          </span>
          <span className="relative min-w-0">
            <span className={cn("block text-base", value === method ? "font-semibold" : "font-medium")}>{title}</span>
            <span className="mt-0.5 block text-sm text-muted-foreground">{description}</span>
          </span>
        </label>
      ))}
    </RadioGroup>
  );
}
