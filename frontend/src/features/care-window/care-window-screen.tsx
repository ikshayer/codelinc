"use client";

import { useEffect } from "react";

import { ErrorPanel } from "@/components/shared/feedback";
import { Page, PageHeader } from "@/components/shared/page";
import { Skeleton } from "@/components/ui/skeleton";
import { engine, type DemoScenario } from "@/lib/adapters/live/engine";
import { CarePlanSection } from "./care-plan";
import { useEngineCall } from "./parts";
import { PassportSummary } from "./passport-summary";
import { VisitNavigatorSection } from "./visit-navigator";
import { EngineStatus } from "./engine-status";
import { CareWindowProgress } from "./care-window-progress";

export function CareWindowScreen() {
  const [scenario, load] = useEngineCall<DemoScenario>();
  useEffect(() => {
    void load((signal) => engine.scenario(signal));
  }, [load]);

  return (
    <Page>
      <PageHeader
        title="When and where to go"
        description="Explore synthetic benefits, compare visits and build a treatment schedule from the deterministic demo engine."
      />
      <EngineStatus />
      {scenario.status === "error" && (
        <ErrorPanel title="The care engine isn't reachable" error={scenario.error} onRetry={() => load((s) => engine.scenario(s))}>
          <p className="text-sm">Your inputs will appear once the demo engine is available.</p>
        </ErrorPanel>
      )}
      {(scenario.status === "loading" || scenario.status === "idle") && <Skeleton className="h-64 w-full" />}
      {scenario.status === "ready" && (
        <div className="space-y-14">
          <CareWindowProgress />
          <p className="text-sm text-muted-foreground">{scenario.data.title} · Synthetic data throughout this journey.</p>
          <PassportSummary scenario={scenario.data} />
          <VisitNavigatorSection scenario={scenario.data} />
          <CarePlanSection scenario={scenario.data} />
        </div>
      )}
    </Page>
  );
}
