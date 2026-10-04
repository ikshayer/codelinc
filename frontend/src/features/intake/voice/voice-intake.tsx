"use client";

import { FlaskConicalIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ErrorPanel, Notice } from "@/components/shared/feedback";
import { useAnalysis } from "@/features/analysis/analysis-provider";
import { cn } from "@/lib/utils";

import type { MicFailureKind } from "./microphone";
import { LeaveConversationDialog } from "./leave-conversation-dialog";
import { ProposalBatchCard } from "./proposal-batch-card";
import { formatElapsed, useElapsedSeconds } from "./use-conversation-clock";
import { useMicLevel, usePrefersReducedMotion } from "./use-mic-level";
import { useNavigationGuard } from "./use-navigation-guard";
import { useVoiceSession } from "./use-voice-session";
import { VoiceControls } from "./voice-controls";
import { VoiceDisclosure } from "./voice-disclosure";
import { describeValues } from "./voice-extraction";
import { displayStatus } from "./voice-session-state";
import { STATUS_PRESENTATION, StatusIcon } from "./voice-status";
import { VoiceSummary, hasVoiceFacts } from "./voice-summary";
import { VoiceTranscript } from "./voice-transcript";

const MIC_HELP: Record<MicFailureKind, string> = {
  blocked: "To retry, allow the microphone for this site (the icon next to the address), then select Try the microphone again.",
  noDevice: "Connect or enable a microphone, then select Try the microphone again.",
  busy: "Close other apps or tabs that are using the microphone, then select Try the microphone again.",
  unsupported: "Open this page in a current browser over a secure connection to use the microphone.",
  unknown: "Check your microphone and browser settings, then select Try the microphone again.",
};

export function VoiceIntake({ analysisId }: { analysisId: string }) {
  const analysis = useAnalysis(analysisId);
  const router = useRouter();
  const reducedMotion = usePrefersReducedMotion();
  const voice = useVoiceSession(analysisId, analysis?.voiceTurns);
  const { state } = voice;
  const status = displayStatus(state);
  const presentation = STATUS_PRESENTATION[status];
  const [typingOpen, setTypingOpen] = useState(false);
  const guard = useNavigationGuard(voice.live);
  const elapsed = useElapsedSeconds(state.startedAt, state.endedAt);
  const micMuted = status === "muted";
  const micCapturing = state.phase === "active" && voice.stream !== null;
  const level = useMicLevel(voice.stream, micCapturing && !micMuted && !reducedMotion);

  const facts = analysis?.draft.facts;
  const batches = useMemo(
    () => (facts ? state.batches.map((batch) => ({ batch, values: describeValues(batch.proposals, facts) })) : []),
    [facts, state.batches],
  );

  if (!analysis) return null;

  const demo = voice.mode === "demo";
  const started = state.startedAt !== null;
  const showDisclosure = state.phase === "ready" || state.phase === "requestingPermission" || state.phase === "permissionDenied";
  const showTranscript = state.turns.length > 0 || state.phase === "active" || state.phase === "connecting" || typingOpen;
  const showSummary = state.phase === "ended" || ((state.phase === "ready" || state.phase === "failed" || state.phase === "permissionDenied") && hasVoiceFacts(analysis.draft));
  const intakeLink = (method: "pdf" | "manual") => `/analysis/${analysisId}/intake?method=${method}`;

  const start = (withMicrophone = true) => void voice.start({ withMicrophone });
  const openTyping = () => setTypingOpen(true);

  const leave = async () => {
    const href = guard.pendingHref;
    guard.clearPending();
    await voice.end();
    if (href) router.push(href);
  };

  return (
    <div className="space-y-10">
      <section aria-label="Voice conversation" className="rounded-lg border">
        <p role="status" className="sr-only">
          {presentation.label}. {presentation.description}
        </p>

        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b px-4 py-3 md:px-6">
          <div className="flex items-center gap-2">
            <StatusIcon status={status} className={cn(status === "failed" && "text-destructive", status === "ended" && "text-muted-foreground")} />
            <span className="font-medium">{presentation.label}</span>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            {demo && (
              <Badge variant="secondary" className="h-6 rounded-md px-2">
                <FlaskConicalIcon aria-hidden />
                Simulated conversation
              </Badge>
            )}
            {started && (
              <span>
                Elapsed <span className="tabular">{formatElapsed(elapsed)}</span>
              </span>
            )}
          </div>
        </div>

        <div className="space-y-1 px-4 pt-3 text-sm text-muted-foreground md:px-6">
          <p>{presentation.description}</p>
          {micCapturing && (
            <p className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-foreground">{micMuted ? "Microphone muted" : "Microphone on"}</span>
              {!micMuted && !reducedMotion && (
                <span aria-hidden className="inline-block h-1.5 w-24 rounded-full bg-muted">
                  <span className="block h-full rounded-full bg-primary transition-[width] duration-150" style={{ width: `${Math.round(level * 100)}%` }} />
                </span>
              )}
              {demo && <span>Level display only. Audio stays on this device and nothing is transcribed.</span>}
            </p>
          )}
        </div>

        {showDisclosure && <VoiceDisclosure mode={voice.mode} />}

        {state.phase === "permissionDenied" && state.micFailure && (
          <div className="px-4 pt-4 md:px-6">
            <Alert variant="warning">
              <AlertTitle>{state.micFailure.message}</AlertTitle>
              <AlertDescription className="space-y-3">
                <p>{MIC_HELP[state.micFailure.kind]}</p>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={openTyping}>
                    Type instead
                  </Button>
                  {demo && (
                    <Button variant="outline" size="sm" onClick={() => start(false)}>
                      Play the simulated conversation without a microphone
                    </Button>
                  )}
                </div>
              </AlertDescription>
            </Alert>
          </div>
        )}

        {state.phase === "failed" && state.error && (
          <div className="px-4 pt-4 md:px-6">
            <ErrorPanel title="The conversation stopped" error={state.error}>
              <Button variant="outline" size="sm" onClick={openTyping}>
                Type instead
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link href={intakeLink("pdf")}>Upload a report</Link>
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link href={intakeLink("manual")}>Enter details manually</Link>
              </Button>
            </ErrorPanel>
          </div>
        )}

        {state.phase !== "failed" && state.error && (
          <div className="px-4 pt-4 md:px-6">
            <ErrorPanel title="Something went wrong" error={state.error}>
              <Button variant="outline" size="sm" onClick={voice.dismissError}>
                Dismiss
              </Button>
            </ErrorPanel>
          </div>
        )}

        {state.phase === "ended" && state.endReason && state.endReason !== "user" && (
          <div className="px-4 pt-4 md:px-6">
            <Notice tone="warning">
              {state.endReason === "expired" ? "The conversation reached its time limit and was closed." : "The voice service ended the conversation."} The
              microphone is off and what was gathered is kept below.
            </Notice>
          </div>
        )}

        {showTranscript && <VoiceTranscript turns={state.turns} />}

        {state.typedNotice && (
          <div className="px-4 pb-4 md:px-6">
            <Notice>{state.typedNotice}</Notice>
          </div>
        )}

        {batches.length > 0 && (
          <div className="space-y-3 border-t px-4 py-4 md:px-6">
            <h3 className="text-base font-semibold">Proposed details</h3>
            {batches.map(({ batch, values }) => (
              <ProposalBatchCard key={batch.id} sourceLabel={batch.sourceLabel} quote={batch.quote} values={values} />
            ))}
          </div>
        )}

        <VoiceControls
          phase={state.phase}
          muted={micMuted}
          canStopSpeaking={state.agentState === "speaking"}
          typingOpen={typingOpen}
          onToggleTyping={() => setTypingOpen((open) => !open)}
          onStart={() => start()}
          onEnd={() => void voice.end()}
          onToggleMute={() => voice.setMuted(!micMuted)}
          onStopSpeaking={voice.stopSpeaking}
          onSend={(text) => void voice.sendText(text)}
        />
      </section>

      {showSummary && <VoiceSummary analysisId={analysisId} draft={analysis.draft} ended={state.phase === "ended"} />}

      <LeaveConversationDialog open={guard.pendingHref !== null} onStay={guard.clearPending} onLeave={() => void leave()} />
    </div>
  );
}
