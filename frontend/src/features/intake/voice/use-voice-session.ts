"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";

import { useAnalysisController, type RequestTicket } from "@/features/analysis/analysis-provider";
import type { IntakeExtraction, VoiceEvent, VoiceSessionHandle } from "@/lib/adapters/types";
import { adapterError } from "@/lib/adapters/shared";

import { requestMicrophone, setStreamMuted, stopStream } from "./microphone";
import { initialVoiceState, isConversationLive, voiceReducer, type EndReason, type VoiceUiState } from "./voice-session-state";
import { sanitizeExtraction } from "./voice-extraction";

interface HeldResources {
  stream: MediaStream | null;
  session: VoiceSessionHandle | null;
  ticket: RequestTicket | null;
  unsubscribe: (() => void) | null;
  unregisterTeardown: (() => void) | null;
}

const NOTHING_HELD: HeldResources = { stream: null, session: null, ticket: null, unsubscribe: null, unregisterTeardown: null };

interface SessionContext {
  attempt: number;
  sessionId: string;
  ticket: RequestTicket;
}

export interface VoiceSessionApi {
  state: VoiceUiState;
  stream: MediaStream | null;
  mode: "demo" | "live";
  live: boolean;
  start(options: { withMicrophone: boolean }): Promise<void>;
  end(): Promise<void>;
  setMuted(muted: boolean): void;
  stopSpeaking(): void;
  sendText(text: string): Promise<void>;
  dismissError(): void;
}

/**
 * Owns one conversation: microphone, session, request ticket and the store
 * writes. Every resource is released together in `release`, which End, failure,
 * navigation, unmount and Clear/sign-out all use.
 */
export function useVoiceSession(analysisId: string, storedTurns: Parameters<typeof initialVoiceState>[0]): VoiceSessionApi {
  const controller = useAnalysisController();
  const controllerRef = useRef(controller);
  useEffect(() => {
    controllerRef.current = controller;
  });

  const [state, dispatch] = useReducer(voiceReducer, storedTurns, initialVoiceState);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const held = useRef<HeldResources>(NOTHING_HELD);
  /** Bumped whenever a start is superseded, so late async results clean up instead of resurrecting a session. */
  const attempt = useRef(0);
  const counter = useRef(0);

  const release = useCallback(async (how: "finish" | "cancel"): Promise<void> => {
    const resources = held.current;
    held.current = NOTHING_HELD;
    resources.unsubscribe?.();
    resources.unregisterTeardown?.();
    stopStream(resources.stream);
    setStream(null);
    if (resources.ticket) {
      if (how === "finish") controllerRef.current.finishRequest(resources.ticket);
      else controllerRef.current.cancelRequest(resources.ticket);
    }
    try {
      await resources.session?.end();
    } catch (error) {
      console.error("Voice session didn't close cleanly", error);
    }
  }, []);

  const finish = useCallback(
    async (reason: EndReason) => {
      attempt.current += 1;
      const closing = release("finish");
      dispatch({ type: "finished", at: Date.now(), reason });
      await closing;
    },
    [release],
  );

  const fail = useCallback(
    async (context: SessionContext) => {
      if (attempt.current !== context.attempt) return;
      attempt.current += 1;
      const closing = release("finish");
      dispatch({
        type: "failed",
        at: Date.now(),
        fallback: adapterError("UNAVAILABLE", "The voice service stopped. What was gathered so far is kept.", true),
      });
      await closing;
    },
    [release],
  );

  const showProposals = useCallback((ticket: RequestTicket, extraction: IntakeExtraction, keepRequest: boolean, quoteFrom: string | null) => {
    const sanitized = sanitizeExtraction(extraction);
    if (!sanitized.hasContent) return false;
    controllerRef.current.applyExtraction(ticket, sanitized.extraction, { keepRequest });
    if (sanitized.extraction.proposals.length > 0) {
      const evidence = sanitized.extraction.evidence.find((item) => item.turnId === quoteFrom) ?? sanitized.extraction.evidence[0];
      counter.current += 1;
      dispatch({
        type: "batch",
        batch: {
          id: `batch:${counter.current}`,
          sourceLabel: evidence?.sourceLabel ?? "Conversation",
          quote: evidence?.literalQuote ?? null,
          proposals: sanitized.extraction.proposals.map(({ fieldPath, value }) => ({ fieldPath, value })),
        },
      });
    }
    return true;
  }, []);

  const handleEvent = useCallback(
    (event: VoiceEvent, context: SessionContext) => {
      if (attempt.current !== context.attempt || event.sessionId !== context.sessionId) return;
      switch (event.type) {
        case "transcript":
          dispatch({ type: "event", event });
          if (event.final) {
            controllerRef.current.appendVoiceTurn(context.ticket, event.sessionId, {
              turnId: event.turnId,
              speaker: event.speaker,
              text: event.text,
              at: new Date().toISOString(),
            });
          }
          return;
        case "proposals":
          showProposals(context.ticket, event.extraction, true, event.turnId);
          return;
        case "state":
          if (event.state === "failed") void fail(context);
          else if (event.state === "ended") void finish("provider");
          else dispatch({ type: "event", event });
          return;
        case "error":
          dispatch({ type: "event", event });
          return;
        case "ended":
          void finish(event.reason);
          return;
      }
    },
    [fail, finish, showProposals],
  );

  const start = useCallback(
    async ({ withMicrophone }: { withMicrophone: boolean }) => {
      const mine = ++attempt.current;
      const current = controllerRef.current;
      // Clear, sign-out and delete reach this through registerTeardown.
      held.current = {
        ...NOTHING_HELD,
        unregisterTeardown: current.registerTeardown(analysisId, () => {
          attempt.current += 1;
          void release("cancel");
          dispatch({ type: "reset" });
        }),
      };
      dispatch({ type: "requestMicrophone" });

      if (withMicrophone) {
        const microphone = await requestMicrophone();
        if (attempt.current !== mine) {
          if (microphone.ok) stopStream(microphone.stream);
          return;
        }
        if (!microphone.ok) {
          held.current.unregisterTeardown?.();
          held.current = NOTHING_HELD;
          dispatch({ type: "microphoneFailed", failure: microphone.failure });
          return;
        }
        held.current = { ...held.current, stream: microphone.stream };
        setStream(microphone.stream);
      }

      dispatch({ type: "connecting" });
      const ticket = current.startRequest(analysisId, "voice");
      held.current = { ...held.current, ticket };
      const created = await current.adapters.voice.createSession(
        { consent: true },
        { analysisId, requestId: ticket.requestId, revision: ticket.revision, signal: ticket.signal },
      );
      if (attempt.current !== mine) {
        if (created.ok) await created.value.end();
        return;
      }
      if (!created.ok) {
        attempt.current += 1;
        const closing = release("finish");
        dispatch({ type: "failed", at: Date.now(), fallback: created.error });
        await closing;
        return;
      }

      const session = created.value;
      const context: SessionContext = { attempt: mine, sessionId: session.info.sessionId, ticket };
      const unsubscribe = session.subscribe((event) => handleEvent(event, context));
      held.current = { ...held.current, session, unsubscribe };
      if (held.current.stream) session.attachMicrophone(held.current.stream);
      dispatch({ type: "connected", at: Date.now(), simulated: session.info.capabilities.simulated });
    },
    [analysisId, handleEvent, release],
  );

  const setMuted = useCallback((muted: boolean) => {
    setStreamMuted(held.current.stream, muted);
    held.current.session?.setMuted(muted);
    dispatch({ type: "muted", muted });
  }, []);

  const stopSpeaking = useCallback(() => held.current.session?.stopSpeaking(), []);

  const sendText = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text) return;
      const session = held.current.session;
      if (session) {
        // The session echoes the typed text as a final person turn.
        session.sendText(text);
        return;
      }
      const current = controllerRef.current;
      counter.current += 1;
      const turnKey = `local:${counter.current}`;
      dispatch({ type: "localTurn", turn: { key: turnKey, speaker: "person", text, final: true } });
      dispatch({ type: "typedNotice", message: null });
      const ticket = current.startRequest(analysisId, "interpret");
      const result = await current.adapters.interpret.interpret(text, {
        analysisId,
        requestId: ticket.requestId,
        revision: ticket.revision,
        signal: ticket.signal,
      });
      if (ticket.signal.aborted) return; // replaced by a newer message, or cleared
      if (!result.ok) {
        current.finishRequest(ticket);
        if (result.error.code !== "CANCELLED") dispatch({ type: "typedNotice", message: result.error.message });
        return;
      }
      if (!showProposals(ticket, result.value, false, null)) {
        current.finishRequest(ticket);
        dispatch({ type: "typedNotice", message: "Nothing in that message could be added as a detail. Add it in Facts gathered." });
      }
    },
    [analysisId, showProposals],
  );

  // Leaving the screen never leaves a microphone or session behind.
  useEffect(
    () => () => {
      attempt.current += 1;
      void release("cancel");
    },
    [analysisId, release],
  );

  return {
    state,
    stream,
    mode: controller.adapters.mode,
    live: isConversationLive(state),
    start,
    end: () => finish("user"),
    setMuted,
    stopSpeaking,
    sendText,
    dismissError: () => dispatch({ type: "dismissError" }),
  };
}
