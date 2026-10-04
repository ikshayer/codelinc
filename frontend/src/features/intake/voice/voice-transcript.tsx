"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, type ReactNode } from "react";

import { LincolnAbe } from "@/components/brand/lincoln-logo";
import { EASE_OUT } from "@/components/motion/reveal";
import { cn } from "@/lib/utils";

import type { TurnView } from "./voice-session-state";

const NEAR_BOTTOM_PX = 64;

const TURN_MOTION = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.35, ease: EASE_OUT },
} as const;

function speakerName(turn: TurnView): string {
  return turn.speaker === "assistant" ? "Assistant" : "You";
}

/** The Lincoln mark marks the assistant's turns. It is a brand mark; the speaker is still named "Assistant". */
function AssistantAvatar() {
  return <LincolnAbe className="mt-7 h-8 shrink-0" />;
}

function FinalTurn({ turn }: { turn: TurnView }) {
  const person = turn.speaker === "person";
  return (
    <motion.div layout="position" {...TURN_MOTION} className={cn("flex gap-2.5", person ? "justify-end" : "justify-start")}>
      {!person && <AssistantAvatar />}
      <div className={cn("flex min-w-0 max-w-[88%] flex-col", person ? "items-end" : "items-start")}>
        <p className="mb-1 px-1 text-sm font-medium text-muted-foreground">{speakerName(turn)}</p>
        <p className={cn("rounded-2xl px-4 py-2.5 text-base text-pretty", person ? "rounded-br-md bg-accent text-accent-foreground" : "rounded-bl-md bg-muted/70")}>{turn.text}</p>
      </div>
    </motion.div>
  );
}

/** Provisional text: visibly unfinished, and hidden from the live log so partial words aren't announced. */
function ProvisionalTurn({ turn }: { turn: TurnView }) {
  const person = turn.speaker === "person";
  const label = person ? "Listening…" : "Speaking…";
  return (
    <motion.div layout="position" {...TURN_MOTION} className={cn("flex gap-2.5", person ? "justify-end" : "justify-start")}>
      {!person && <AssistantAvatar />}
      <div className={cn("flex min-w-0 max-w-[88%] flex-col", person ? "items-end" : "items-start")}>
        <p className="mb-1 px-1 text-sm font-medium text-muted-foreground">
          {speakerName(turn)} <span className="ml-1 font-normal">{label}</span>
        </p>
        <p className={cn("rounded-2xl border border-dashed px-4 py-2.5 text-base text-pretty text-muted-foreground", person && "italic")}>{turn.text}</p>
      </div>
    </motion.div>
  );
}

/**
 * Secondary transcript rail beside (or below) the orb. The log announces
 * finalized turns only; partial turns sit outside it. The region scrolls on its
 * own so the controls stay in view, and `children` (proposed details) sit below it.
 */
export function VoiceTranscript({ turns, children, className }: { turns: TurnView[]; children?: ReactNode; className?: string }) {
  const scroller = useRef<HTMLDivElement>(null);
  const followLatest = useRef(true);

  useEffect(() => {
    const element = scroller.current;
    if (element && followLatest.current) element.scrollTo({ top: element.scrollHeight, behavior: "smooth" });
  }, [turns]);

  const finals = turns.filter((turn) => turn.final);
  const provisional = turns.filter((turn) => !turn.final);

  return (
    <div className={cn("flex min-h-0 flex-col overflow-hidden rounded-2xl border bg-card", className)}>
      <h2 className="border-b px-5 py-3 font-display text-lg font-semibold">Transcript</h2>
      <div
        ref={scroller}
        role="region"
        aria-label="Transcript"
        tabIndex={0}
        onScroll={(event) => {
          const { scrollHeight, scrollTop, clientHeight } = event.currentTarget;
          followLatest.current = scrollHeight - scrollTop - clientHeight < NEAR_BOTTOM_PX;
        }}
        className="min-h-48 flex-1 overflow-y-auto px-5 py-4 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset"
      >
        {turns.length === 0 && <p className="text-muted-foreground">The conversation will appear here as you talk.</p>}
        <div role="log" aria-label="Conversation transcript" aria-relevant="additions" className="space-y-4">
          <AnimatePresence initial={false}>
            {finals.map((turn) => (
              <FinalTurn key={turn.key} turn={turn} />
            ))}
          </AnimatePresence>
        </div>
        {provisional.length > 0 && (
          <div aria-hidden className="mt-4 space-y-4">
            {provisional.map((turn) => (
              <ProvisionalTurn key={turn.key} turn={turn} />
            ))}
          </div>
        )}
      </div>
      {children}
    </div>
  );
}
