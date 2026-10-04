"use client";

import type { ExplainRequest } from "@engine/api";
import type { EvidenceIndexEntry } from "@engine/optimizer";
import type { SourceLabel } from "@engine/primitives";
import { MessageCircleQuestionIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { ErrorPanel } from "@/components/shared/feedback";
import { StatusChip } from "@/components/shared/status-chip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { engine, type ExplainOutcome, type Issue } from "@/lib/adapters/live/engine";
import type { AdapterError, AdapterResult } from "@/lib/adapters/types";
import { formatCents } from "@/lib/domain/money";

// Shared pieces for the CareWindow engine page. Everything shown is an engine
// field; the only transformation here is formatting.

export type CallState<T> = { status: "idle" } | { status: "loading" } | { status: "error"; error: AdapterError } | { status: "ready"; data: T };

/** One in-flight engine call at a time; a newer call or unmount aborts the older one. */
export function useEngineCall<T>() {
  const [state, setState] = useState<CallState<T>>({ status: "idle" });
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const run = useCallback(async (fn: (signal: AbortSignal) => Promise<AdapterResult<T>>): Promise<T | null> => {
    controller.current?.abort();
    const ac = new AbortController();
    controller.current = ac;
    setState({ status: "loading" });
    const result = await fn(ac.signal);
    if (ac.signal.aborted) return null;
    setState(result.ok ? { status: "ready", data: result.value } : { status: "error", error: result.error });
    return result.ok ? result.value : null;
  }, []);
  const reset = useCallback(() => {
    controller.current?.abort();
    setState({ status: "idle" });
  }, []);
  return [state, run, reset] as const;
}

export function formatRange(range: { low_cents: number; high_cents: number } | null): string {
  if (!range) return "Unknown";
  return range.low_cents === range.high_cents ? formatCents(range.high_cents) : `${formatCents(range.low_cents)} to ${formatCents(range.high_cents)}`;
}

/** Engine cents with an explicit sign (+ or −), for deltas. */
export const signedCents = (cents: number) => `${cents < 0 ? "−" : "+"}${formatCents(Math.abs(cents))}`;

/** "RULE_UNKNOWN" → "Rule unknown". Fallback for codes without a hand-written label. */
export function humanize(code: string): string {
  const text = code.toLowerCase().replace(/_/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const SOURCE: Record<SourceLabel, string> = {
  PLAN_VERIFIED: "Plan document",
  CLAIM_EOB: "Claims record",
  PROVIDER: "Dentist office",
  DENTIST: "Dentist",
  MEMBER_CONFIRMED: "You confirmed",
  ESTIMATE: "Estimate",
  NEEDS_CONFIRMATION: "Needs confirmation",
};

/** Where an engine value came from. */
export function EngineSource({ source }: { source: SourceLabel }) {
  return (
    <Badge variant={source === "NEEDS_CONFIRMATION" ? "warning" : "outline"} className="font-normal">
      {SOURCE[source]}
    </Badge>
  );
}

/** Engine issues, most serious first as returned. Info notes are plain text. */
export function IssueList({ issues, className }: { issues: Issue[]; className?: string }) {
  if (issues.length === 0) return null;
  return (
    <ul className={className ?? "space-y-2"}>
      {issues.map((issue, i) => (
        <li key={`${issue.code}-${i}`} className="flex flex-wrap items-start gap-2 text-sm">
          {issue.severity === "blocking" && <StatusChip status="conflict" label="Blocking" />}
          {issue.severity === "warning" && <StatusChip status="needsReview" label="Check this" />}
          <span className={issue.severity === "info" ? "text-muted-foreground" : undefined}>{issue.message}</span>
        </li>
      ))}
    </ul>
  );
}

/** Drops issues already listed at the top level (same code and message). */
export function withoutShared(issues: Issue[], shared: Issue[]): Issue[] {
  return issues.filter((i) => !shared.some((s) => s.code === i.code && s.message === i.message));
}

/** Plan-document passages behind every rule the engine applied. */
export function EvidenceList({ evidence }: { evidence: EvidenceIndexEntry[] }) {
  if (evidence.length === 0) return null;
  return (
    <details className="rounded-lg border px-4 py-3 text-sm">
      <summary className="cursor-pointer font-medium">Plan evidence ({evidence.length} rules used)</summary>
      <ul className="mt-3 space-y-3">
        {evidence.map((entry) => (
          <li key={`${entry.plan_version_id}:${entry.rule_id}`}>
            <p className="font-mono text-xs text-muted-foreground">
              {entry.rule_id} · {entry.plan_version_id}
            </p>
            {entry.evidence.map((ref, i) => (
              <blockquote key={i} className="mt-1 border-l-2 pl-3">
                “{ref.quote}” <span className="text-xs text-muted-foreground">({ref.source_id}, {ref.locator})</span>
              </blockquote>
            ))}
          </li>
        ))}
      </ul>
    </details>
  );
}

/** "Why this plan?": the engine recomputes the result, explains it and validates every claim. */
export function ExplainPanel({ label, request }: { label: string; request: ExplainRequest }) {
  const [state, run, reset] = useEngineCall<ExplainOutcome>();
  const key = JSON.stringify(request);
  // A different plan or option makes an earlier explanation wrong; drop it.
  useEffect(() => reset(), [key, reset]);

  return (
    <div className="space-y-3">
      <Button variant="outline" onClick={() => run((signal) => engine.explain(request, signal))} disabled={state.status === "loading"}>
        {state.status === "loading" ? <Spinner /> : <MessageCircleQuestionIcon aria-hidden />}
        {label}
      </Button>
      {state.status === "error" && <ErrorPanel title="Couldn't explain this result" error={state.error} />}
      {state.status === "ready" && (
        <div className="space-y-4 rounded-lg border bg-muted/30 p-4" aria-live="polite">
          <p className="font-medium">{state.data.explanation.summary}</p>
          <ul className="space-y-2 text-sm">
            {state.data.explanation.claims.map((claim, i) => (
              <li key={i}>
                {claim.text}
                <span className="mt-1 flex flex-wrap gap-1">
                  {claim.fact_ids.map((id) => (
                    <code key={id} className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                      {id}
                    </code>
                  ))}
                </span>
              </li>
            ))}
          </ul>
          {state.data.explanation.missing_data.length > 0 && (
            <div className="text-sm">
              <p className="font-medium">Still missing</p>
              <ul className="mt-1 list-disc space-y-1 pl-5">
                {state.data.explanation.missing_data.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            {state.data.mode === "template" ? "Written from a fixed template" : "Written by AI"}
            {state.data.validation.ok ? ", checked against the engine result." : ", failed validation."}
            {state.data.fell_back_to_template && " The AI explanation was rejected, so the template was used."}
          </p>
        </div>
      )}
    </div>
  );
}
