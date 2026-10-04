import {
  CircleAlertIcon,
  CircleCheckIcon,
  HourglassIcon,
  Loader2Icon,
  MicIcon,
  MicOffIcon,
  RefreshCwIcon,
  Volume2Icon,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

import type { VoiceStatus } from "./voice-session-state";

// Every state has its own words and icon; color is never the only signal.

export interface StatusPresentation {
  /** Full wording, announced to screen readers. */
  label: string;
  /** Short name shown large beneath the orb. */
  title: string;
  description: string;
  Icon: LucideIcon;
  spins?: boolean;
}

export const STATUS_PRESENTATION: Record<VoiceStatus, StatusPresentation> = {
  ready: { label: "Ready", title: "Ready", description: "Nothing is captured until you start the conversation.", Icon: MicIcon },
  requesting: {
    label: "Waiting for microphone permission",
    title: "Waiting for microphone",
    description: "Choose Allow in your browser's prompt. You can cancel or type instead.",
    Icon: Loader2Icon,
    spins: true,
  },
  denied: { label: "Microphone unavailable", title: "Microphone unavailable", description: "The conversation hasn't started. You can retry or type instead.", Icon: MicOffIcon },
  connecting: { label: "Connecting", title: "Connecting", description: "Starting the conversation.", Icon: Loader2Icon, spins: true },
  listening: { label: "Listening", title: "Listening", description: "Answer in your own words, or type instead.", Icon: MicIcon },
  thinking: { label: "Thinking", title: "Thinking", description: "The assistant is preparing its reply.", Icon: HourglassIcon },
  speaking: { label: "Speaking", title: "Speaking", description: "Select Stop speaking to interrupt.", Icon: Volume2Icon },
  muted: { label: "Muted — nothing is being captured", title: "Muted", description: "Muted — nothing is being captured. Unmute to speak again, or keep typing.", Icon: MicOffIcon },
  reconnecting: { label: "Reconnecting", title: "Reconnecting", description: "Your transcript is kept. You can keep typing.", Icon: RefreshCwIcon, spins: true },
  failed: { label: "Conversation stopped", title: "Conversation stopped", description: "The microphone is off. What was gathered so far is kept.", Icon: CircleAlertIcon },
  ended: { label: "Conversation ended", title: "Conversation ended", description: "The microphone is off and the conversation is closed.", Icon: CircleCheckIcon },
};

export function StatusIcon({ status, className }: { status: VoiceStatus; className?: string }) {
  const { Icon, spins } = STATUS_PRESENTATION[status];
  return <Icon aria-hidden className={cn("size-5 shrink-0", spins && "animate-spin motion-reduce:animate-none", className)} />;
}
