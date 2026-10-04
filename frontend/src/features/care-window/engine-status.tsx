"use client";

import type { HealthData } from "@engine/api";
import { useEffect } from "react";
import { ErrorPanel } from "@/components/shared/feedback";
import { Button } from "@/components/ui/button";
import { engine } from "@/lib/adapters/live/engine";
import { useEngineCall } from "./parts";

export function EngineStatus() {
  const [state, run] = useEngineCall<HealthData>();
  useEffect(() => { void run((signal) => engine.health(signal)); }, [run]);
  return (
    <aside aria-label="Demo engine status" className="space-y-3 rounded-lg border p-4 text-sm">
      <p className="font-semibold">Synthetic demo dataset</p>
      <p>No real member, insurance plan, dentist, appointment or claim. Plan facts and prices come from the demo dataset; only your preferences and treatment confirmation are editable.</p>
      {(state.status === "idle" || state.status === "loading") && <p role="status">Checking engine readiness…</p>}
      {state.status === "error" && <ErrorPanel title="Engine readiness check failed" error={state.error} retryLabel="Retry health check" onRetry={() => run((signal) => engine.health(signal))} />}
      {state.status === "ready" && (
        <>
          <p role="status">Engine ready · Rules v{state.data.contract_version} · Registry {state.data.registry_version} · {state.data.ai_mode} explanations</p>
          <p className="text-muted-foreground">Readiness checks the demo engine. Insurance coverage is not verified with a payer.</p>
          <details>
            <summary className="cursor-pointer">Engine details</summary>
            <p className="mt-2 break-words">Plan versions: {state.data.plan_version_ids.join(", ")}</p>
            {state.metadata && <p className="mt-1 break-words">Synthetic response · {state.metadata.generated_by} · request {state.metadata.request_id}</p>}
          </details>
          <Button variant="outline" size="sm" onClick={() => run((signal) => engine.health(signal))}>Retry health check</Button>
        </>
      )}
    </aside>
  );
}
