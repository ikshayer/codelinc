"use client";

import { useEffect, useRef } from "react";

import { cn } from "@/lib/utils";

import type { TurnView } from "./voice-session-state";

const NEAR_BOTTOM_PX = 64;

function speakerName(turn: TurnView): string {
  return turn.speaker === "assistant" ? "Assistant" : "You";
}

function FinalTurn({ turn }: { turn: TurnView }) {
  return (
    <div>
      <p className="text-sm font-medium text-muted-foreground">{speakerName(turn)}</p>
      <p className="text-base text-pretty">{turn.text}</p>
    </div>
  );
}

/** Provisional text: visibly unfinished, and hidden from the live log so partial words aren't announced. */
function ProvisionalTurn({ turn }: { turn: TurnView }) {
  const label = turn.speaker === "person" ? "Listening…" : "Speaking…";
  return (
    <div>
      <p className="text-sm font-medium text-muted-foreground">
        {speakerName(turn)} <span className="ml-1 font-normal">{label}</span>
      </p>
      <p className={cn("text-base text-pretty text-muted-foreground", turn.speaker === "person" && "italic")}>{turn.text}</p>
    </div>
  );
}

/**
 * Readable transcript. The log announces finalized turns only; partial turns sit
 * outside it. The region scrolls on its own so the controls below stay in view.
 */
export function VoiceTranscript({ turns }: { turns: TurnView[] }) {
  const scroller = useRef<HTMLDivElement>(null);
  const followLatest = useRef(true);

  useEffect(() => {
    const element = scroller.current;
    if (element && followLatest.current) element.scrollTop = element.scrollHeight;
  }, [turns]);

  const finals = turns.filter((turn) => turn.final);
  const provisional = turns.filter((turn) => !turn.final);

  return (
    <div
      ref={scroller}
      role="region"
      aria-label="Transcript"
      tabIndex={0}
      onScroll={(event) => {
        const { scrollHeight, scrollTop, clientHeight } = event.currentTarget;
        followLatest.current = scrollHeight - scrollTop - clientHeight < NEAR_BOTTOM_PX;
      }}
      className="h-[min(48vh,26rem)] min-h-56 overflow-y-auto px-4 py-4 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 md:px-6"
    >
      {turns.length === 0 && <p className="text-muted-foreground">The conversation will appear here as you talk.</p>}
      <div role="log" aria-label="Conversation transcript" aria-relevant="additions" className="space-y-4">
        {finals.map((turn) => (
          <FinalTurn key={turn.key} turn={turn} />
        ))}
      </div>
      {provisional.length > 0 && (
        <div aria-hidden className="mt-4 space-y-4">
          {provisional.map((turn) => (
            <ProvisionalTurn key={turn.key} turn={turn} />
          ))}
        </div>
      )}
    </div>
  );
}
