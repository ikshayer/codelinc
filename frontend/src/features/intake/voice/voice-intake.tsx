"use client";

import { AnimatePresence, motion } from "motion/react";
import { FlaskConicalIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EASE_OUT } from "@/components/motion/reveal";
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
import { VoiceOrb } from "./voice-orb";
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
  const showTranscript = state.turns.length > 0 || batches.length > 0 || state.phase === "active" || state.phase === "connecting" || typingOpen;
  const showSummary = state.phase === "ended" || ((state.phase === "ready" || state.phase === "failed" || state.phase === "permissionDenied") && hasVoiceFacts(analysis.draft));
  const intakeLink = (method: "pdf" | "manual") => `/analysis/${analysisId}/intake?method=${method}`;

  const start = (withMicrophone = true) => void voice.start({ withMicrophone });
  const openTyping = () => setTypingOpen(true);
  const orbTap = state.phase === "ready" ? (demo ? () => start(false) : () => start()) : undefined;

  const leave = async () => {
    const href = guard.pendingHref;
    guard.clearPending();
    await voice.end();
    if (href) router.push(href);
  };

  return (
    <div className="space-y-10">
      <section aria-label="Voice conversation" className="grid gap-5 lg:grid-cols-12">
        <div className="flex min-w-0 lg:col-span-7">
          <div className="relative flex w-full flex-col rounded-2xl border bg-card bg-[radial-gradient(90%_55%_at_50%_0%,var(--accent),transparent_75%)] shadow-[0_1px_2px_rgba(35,31,32,0.04),0_8px_24px_-12px_rgba(101,0,48,0.12)] lg:min-h-184">
            <p role="status" className="sr-only">
              {presentation.label}. {presentation.description}
            </p>

            <div className="flex min-h-12 flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 pt-4 text-sm text-muted-foreground md:px-6">
              {demo ? (
                <Badge variant="secondary" className="h-6 rounded-md px-2">
                  <FlaskConicalIcon aria-hidden />
                  Simulated conversation
                </Badge>
              ) : (
                <span />
              )}
              {started && (
                <span>
                  Elapsed <span className="tabular">{formatElapsed(elapsed)}</span>
                </span>
              )}
            </div>

            <div className="flex flex-1 flex-col items-center justify-center gap-4 px-4 py-4 text-center md:px-8">
              <VoiceOrb status={status} microphoneLevel={level} reducedMotion={reducedMotion} collapsed={status === "failed" || status === "ended"} onActivate={orbTap} />

              <div aria-hidden className="flex min-h-12 items-center justify-center">
                <AnimatePresence mode="wait" initial={false}>
                  <motion.p
                    key={status}
                    initial={{ opacity: 0, y: 10, filter: "blur(4px)" }}
                    animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                    exit={{ opacity: 0, y: -10, filter: "blur(4px)" }}
                    transition={{ duration: 0.25, ease: EASE_OUT }}
                    className="flex items-center justify-center gap-2.5 font-display text-3xl font-semibold text-balance sm:text-4xl"
                  >
                    <StatusIcon status={status} className={cn("size-6 text-muted-foreground", status === "failed" && "text-destructive")} />
                    {presentation.title}
                  </motion.p>
                </AnimatePresence>
              </div>

              <div className="max-w-md space-y-1 text-pretty text-muted-foreground">
                <p>{presentation.description}</p>
                {micCapturing && (
                  <p className="text-sm">
                    <span className="font-medium text-foreground">{micMuted ? "Microphone muted." : "Microphone on."}</span>
                    {demo && " Level display only. Audio stays on this device and nothing is transcribed."}
                  </p>
                )}
              </div>

              {showDisclosure && <VoiceDisclosure mode={voice.mode} />}

              <div className="w-full max-w-lg space-y-3 text-left empty:hidden">
                {state.phase === "permissionDenied" && state.micFailure && (
                  <Alert variant="warning">
                    <AlertTitle>{state.micFailure.message}</AlertTitle>
                    <AlertDescription className="space-y-3">
                      <p>{MIC_HELP[state.micFailure.kind]}</p>
                      <div className="flex flex-wrap gap-2">
                        <Button variant="outline" size="sm" onClick={openTyping}>
                          Type instead
                        </Button>
                        {demo && (
                          <Button variant="outline" size="sm" className="h-auto min-h-11 py-2 whitespace-normal" onClick={() => start(false)}>
                            Play demo without a microphone
                          </Button>
                        )}
                      </div>
                    </AlertDescription>
                  </Alert>
                )}

                {state.phase === "failed" && state.error && (
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
                )}

                {state.phase !== "failed" && state.error && (
                  <ErrorPanel title="Something went wrong" error={state.error}>
                    <Button variant="outline" size="sm" onClick={voice.dismissError}>
                      Dismiss
                    </Button>
                  </ErrorPanel>
                )}

                {state.phase === "ended" && state.endReason && state.endReason !== "user" && (
                  <Notice tone="warning">
                    {state.endReason === "expired" ? "The conversation reached its time limit and was closed." : "The voice service ended the conversation."} The
                    microphone is off and what was gathered is kept below.
                  </Notice>
                )}

                {state.typedNotice && <Notice>{state.typedNotice}</Notice>}
              </div>
            </div>

            <VoiceControls
              phase={state.phase}
              muted={micMuted}
              canStopSpeaking={state.agentState === "speaking"}
              typingOpen={typingOpen}
              onToggleTyping={() => setTypingOpen((open) => !open)}
              onStart={() => start()}
              onPlayDemo={demo ? () => start(false) : undefined}
              onEnd={() => void voice.end()}
              onToggleMute={() => voice.setMuted(!micMuted)}
              onStopSpeaking={voice.stopSpeaking}
              onSend={(text) => void voice.sendText(text)}
            />
          </div>
        </div>

        <div className={cn("relative min-w-0 lg:col-span-5", !showTranscript && "hidden lg:block")}>
          <VoiceTranscript turns={state.turns} className="h-[min(52vh,26rem)] lg:absolute lg:inset-0 lg:h-auto">
            {batches.length > 0 && (
              <div className="max-h-[45%] space-y-2 overflow-y-auto border-t bg-muted/30 px-4 py-3">
                <h3 className="font-display text-base font-semibold">Proposed details</h3>
                {batches.map(({ batch, values }) => (
                  <ProposalBatchCard key={batch.id} sourceLabel={batch.sourceLabel} quote={batch.quote} values={values} />
                ))}
              </div>
            )}
          </VoiceTranscript>
        </div>
      </section>

      {showSummary && <VoiceSummary analysisId={analysisId} draft={analysis.draft} ended={state.phase === "ended"} />}

      <LeaveConversationDialog open={guard.pendingHref !== null} onStay={guard.clearPending} onLeave={() => void leave()} />
    </div>
  );
}
