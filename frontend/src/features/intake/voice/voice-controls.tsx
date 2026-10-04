"use client";

import { FlaskConicalIcon, KeyboardIcon, MicIcon, MicOffIcon, SendIcon, SquareIcon, VolumeXIcon, XIcon } from "lucide-react";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
    <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row sm:items-end">
      <div className="min-w-0 flex-1 space-y-1.5">
        <Label htmlFor={inputId}>Type your answer</Label>
        <Input id={inputId} ref={input} value={text} onChange={(event) => setText(event.target.value)} autoComplete="off" />
      </div>
      <Button type="submit" disabled={!text.trim()}>
        <SendIcon data-icon="inline-start" aria-hidden />
        Send
      </Button>
    </form>
  );
}

/**
 * Sticky within the conversation panel. It sits after the transcript in the
 * layout, so it reserves its own space and never covers content.
 */
export function VoiceControls(props: VoiceControlsProps) {
  const { phase, muted, canStopSpeaking, typingOpen } = props;
  const busyStarting = phase === "requestingPermission" || phase === "connecting";
  const inSession = phase === "active";
  const canStart = !busyStarting && !inSession;

  return (
    <div className={cn("space-y-3 rounded-b-lg border-t bg-background px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:px-6", inSession && "sticky bottom-0 z-10")}>
      {typingOpen && <TypedInput onSend={props.onSend} />}
      <div className="flex flex-wrap items-center gap-2">
        {canStart && (
          <>
            {props.onPlayDemo && phase !== "permissionDenied" && (
              <Button onClick={props.onPlayDemo} className="h-auto min-h-11 py-3 whitespace-normal">
                <FlaskConicalIcon data-icon="inline-start" aria-hidden />
                Play demo conversation
              </Button>
            )}
            <Button variant={props.onPlayDemo || phase === "ended" ? "outline" : "default"} onClick={props.onStart} className="h-auto min-h-11 py-3 whitespace-normal">
              <MicIcon data-icon="inline-start" aria-hidden />
              {props.onPlayDemo && phase === "ready" ? "Test microphone" : startLabel(phase)}
            </Button>
          </>
        )}
        {inSession && (
          <Button variant="outline" aria-pressed={muted} onClick={props.onToggleMute}>
            {muted ? <MicIcon data-icon="inline-start" aria-hidden /> : <MicOffIcon data-icon="inline-start" aria-hidden />}
            {muted ? "Unmute" : "Mute"}
          </Button>
        )}
        {inSession && canStopSpeaking && (
          <Button variant="outline" onClick={props.onStopSpeaking}>
            <VolumeXIcon data-icon="inline-start" aria-hidden />
            Stop speaking
          </Button>
        )}
        <Button variant="outline" aria-expanded={typingOpen} onClick={props.onToggleTyping}>
          <KeyboardIcon data-icon="inline-start" aria-hidden />
          {typingOpen ? "Hide typing" : "Type instead"}
        </Button>
        {inSession && (
          <Button variant="outline" onClick={props.onEnd} className="sm:ml-auto">
            <SquareIcon data-icon="inline-start" aria-hidden />
            End conversation
          </Button>
        )}
        {busyStarting && (
          <Button variant="outline" onClick={props.onEnd} className="sm:ml-auto">
            <XIcon data-icon="inline-start" aria-hidden />
            Cancel
          </Button>
        )}
      </div>
    </div>
  );
}
