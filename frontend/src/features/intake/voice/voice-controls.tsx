"use client";

import { AnimatePresence, motion } from "motion/react";
import { FlaskConicalIcon, KeyboardIcon, MicIcon, MicOffIcon, SendIcon, VolumeXIcon, XIcon, type LucideIcon } from "lucide-react";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EASE_OUT } from "@/components/motion/reveal";
import { cn } from "@/lib/utils";

import type { VoicePhase } from "./voice-session-state";

export interface VoiceControlsProps {
  phase: VoicePhase;
  muted: boolean;
  canStopSpeaking: boolean;
  typingOpen: boolean;
  onToggleTyping(): void;
  onStart(): void;
  onPlayDemo?: () => void;
  onEnd(): void;
  onToggleMute(): void;
  onStopSpeaking(): void;
  onSend(text: string): void;
}

function startLabel(phase: VoicePhase): string {
  switch (phase) {
    case "permissionDenied":
      return "Try the microphone again";
    case "failed":
      return "Start again";
    case "ended":
      return "Start another conversation";
    default:
      return "Start conversation";
  }
}

function TypedInput({ onSend }: { onSend(text: string): void }) {
  const inputId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");

  useEffect(() => input.current?.focus(), []);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!text.trim()) return;
    onSend(text);
    setText("");
  };

  return (
    <form onSubmit={submit} className="space-y-1.5 p-1">
      <Label htmlFor={inputId} className="pl-4 text-sm text-muted-foreground">
        Type your answer
      </Label>
      <div className="flex items-center gap-2">
        <Input id={inputId} ref={input} value={text} onChange={(event) => setText(event.target.value)} autoComplete="off" className="h-12 rounded-full bg-card px-5" />
        <Button type="submit" disabled={!text.trim()} className="h-12 shrink-0 rounded-full px-5">
          <SendIcon data-icon="inline-start" aria-hidden />
          Send
        </Button>
      </div>
    </form>
  );
}

interface RoundControlProps {
  label: string;
  Icon: LucideIcon;
  onClick(): void;
  tone?: "neutral" | "active" | "danger";
  pressed?: boolean;
  expanded?: boolean;
}

/** A large round icon button with its text label beneath, as one target. */
function RoundControl({ label, Icon, onClick, tone = "neutral", pressed, expanded }: RoundControlProps) {
  return (
    <motion.button
      type="button"
      layout
      initial={{ opacity: 0, scale: 0.7 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.7 }}
      whileTap={{ scale: 0.94 }}
      transition={{ duration: 0.25, ease: EASE_OUT }}
      onClick={onClick}
      aria-pressed={pressed}
      aria-expanded={expanded}
      className="group flex w-19 cursor-pointer flex-col items-center gap-2 rounded-xl text-center outline-none sm:w-24"
    >
      <span
        className={cn(
          "grid size-14 place-items-center rounded-full border shadow-sm transition-colors group-focus-visible:ring-3 group-focus-visible:ring-ring/50",
          tone === "neutral" && "border-border bg-card text-foreground group-hover:bg-accent",
          tone === "active" && "border-primary bg-primary text-primary-foreground group-hover:bg-primary/90",
          tone === "danger" && "border-destructive bg-destructive text-destructive-foreground group-hover:bg-destructive/90",
        )}
      >
        <Icon aria-hidden className="size-6" />
      </span>
      <span className="text-sm leading-tight font-medium text-pretty">{label}</span>
    </motion.button>
  );
}

const PILL = "h-14 rounded-full px-7 text-base whitespace-normal";

/**
 * Round icon controls under the orb. They sit after the transcript in the
 * layout, and are sticky only while a conversation is active, so they never
 * cover the introduction or the summary.
 */
export function VoiceControls(props: VoiceControlsProps) {
  const { phase, muted, canStopSpeaking, typingOpen } = props;
  const busyStarting = phase === "requestingPermission" || phase === "connecting";
  const inSession = phase === "active";
  const canStart = !busyStarting && !inSession;
  const ended = phase === "ended";
  const typingLabel = typingOpen ? "Hide typing" : "Type instead";

  return (
    <div className={cn("space-y-4 px-4 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] md:px-8", inSession && "sticky bottom-0 z-10 rounded-b-2xl bg-card/85 backdrop-blur-md")}>
      <AnimatePresence initial={false}>
        {typingOpen && (
          <motion.div
            key="composer"
            initial={{ height: 0, opacity: 0, y: 24 }}
            animate={{ height: "auto", opacity: 1, y: 0 }}
            exit={{ height: 0, opacity: 0, y: 24 }}
            transition={{ duration: 0.3, ease: EASE_OUT }}
            className="mx-auto w-full max-w-lg overflow-hidden"
          >
            <TypedInput onSend={props.onSend} />
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex flex-wrap items-start justify-center gap-x-3 gap-y-3 sm:gap-x-5">
        {canStart && (
          <div className="flex w-full flex-wrap items-center justify-center gap-3">
            {props.onPlayDemo && phase !== "permissionDenied" && (
              <Button variant={ended ? "outline" : "default"} onClick={props.onPlayDemo} className={PILL}>
                <FlaskConicalIcon data-icon="inline-start" aria-hidden />
                Play demo conversation
              </Button>
            )}
            <Button variant={props.onPlayDemo || ended ? "outline" : "default"} onClick={props.onStart} className={PILL}>
              <MicIcon data-icon="inline-start" aria-hidden />
              {props.onPlayDemo && phase === "ready" ? "Test microphone" : startLabel(phase)}
            </Button>
            <Button variant="ghost" aria-expanded={typingOpen} onClick={props.onToggleTyping} className={PILL}>
              <KeyboardIcon data-icon="inline-start" aria-hidden />
              {typingLabel}
            </Button>
          </div>
        )}

        {busyStarting && (
          <div className="flex w-full flex-wrap items-center justify-center gap-3">
            <Button variant="outline" onClick={props.onEnd} className={PILL}>
              <XIcon data-icon="inline-start" aria-hidden />
              Cancel
            </Button>
            <Button variant="ghost" aria-expanded={typingOpen} onClick={props.onToggleTyping} className={PILL}>
              <KeyboardIcon data-icon="inline-start" aria-hidden />
              {typingLabel}
            </Button>
          </div>
        )}

        {inSession && (
          <AnimatePresence mode="popLayout" initial={false}>
            <RoundControl key="mute" label={muted ? "Unmute" : "Mute"} Icon={muted ? MicOffIcon : MicIcon} tone={muted ? "active" : "neutral"} pressed={muted} onClick={props.onToggleMute} />
            {canStopSpeaking && <RoundControl key="stop" label="Stop speaking" Icon={VolumeXIcon} onClick={props.onStopSpeaking} />}
            <RoundControl key="type" label={typingLabel} Icon={KeyboardIcon} expanded={typingOpen} onClick={props.onToggleTyping} />
            <RoundControl key="end" label="End conversation" Icon={XIcon} tone="danger" onClick={props.onEnd} />
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
