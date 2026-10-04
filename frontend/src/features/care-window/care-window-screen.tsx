"use client";

import { useEffect } from "react";

import { ErrorPanel, Notice } from "@/components/shared/feedback";
import { Page, PageHeader } from "@/components/shared/page";
import { Skeleton } from "@/components/ui/skeleton";
import { engine, type DemoScenario } from "@/lib/adapters/live/engine";
import { CarePlanSection } from "./care-plan";
import { useEngineCall } from "./parts";
import { PassportSummary } from "./passport-summary";
import { VisitNavigatorSection } from "./visit-navigator";

export function CareWindowScreen() {
  const [scenario, load] = useEngineCall<DemoScenario>();
  useEffect(() => {
    void load((signal) => engine.scenario(signal));
  }, [load]);

  return (
    <Page>
      <PageHeader
        title="When and where to go"
        description="Recommendations from CareWindow's deterministic engine: every amount comes from your plan's verified rules and your confirmed details."
      />
      {scenario.status === "error" && (
        <ErrorPanel title="The care engine isn't reachable" error={scenario.error} onRetry={() => load((s) => engine.scenario(s))}>
          <p className="text-sm">
            Start it with <code>cd backend &amp;&amp; npm run serve</code>.
          </p>
        </ErrorPanel>
      )}
      {(scenario.status === "loading" || scenario.status === "idle") && <Skeleton className="h-64 w-full" />}
      {scenario.status === "ready" && (
        <div className="space-y-14">
          <Notice title="Synthetic data">{scenario.data.title}. No real member, plan or dentist.</Notice>
          <PassportSummary scenario={scenario.data} />
          <VisitNavigatorSection scenario={scenario.data} />
          <CarePlanSection scenario={scenario.data} />
        </div>
      )}
    </Page>
  );
}
