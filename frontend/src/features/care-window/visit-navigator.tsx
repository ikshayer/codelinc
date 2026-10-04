"use client";

import type { ExplainRequest } from "@engine/api";
import type { ClaimRoute } from "@engine/benefits";
import type { Symptoms, Tradeoff, VisitIntent, VisitLabel, VisitOption } from "@engine/optimizer";
import { SirenIcon } from "lucide-react";
import { useId, useState } from "react";

import { ErrorPanel } from "@/components/shared/feedback";
import { SectionHeading } from "@/components/shared/page";
import { StatusChip } from "@/components/shared/status-chip";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Spinner } from "@/components/ui/spinner";
import { engine, type DemoScenario, type VisitNavigatorRequest, type VisitNavigatorResult } from "@/lib/adapters/live/engine";
import { formatIsoDate, formatTimestamp } from "@/lib/domain/dates";
import { formatCents } from "@/lib/domain/money";
import { EvidenceList, ExplainPanel, IssueList, formatRange, humanize, useEngineCall, withoutShared } from "./parts";

const INTENTS: Record<VisitIntent, string> = {
  routine: "Routine checkup and cleaning",
  new_concern: "Something new is bothering me",
  follow_up: "Follow-up on earlier care",
};

const SYMPTOMS: Record<keyof Symptoms, string> = {
  severe_pain: "Severe pain",
  swelling: "Swelling in my face or jaw",
  trauma: "An injury to my mouth or teeth",
  bleeding: "Bleeding that won't stop",
  fever: "Fever",
};

const NO_SYMPTOMS: Symptoms = { severe_pain: false, swelling: false, trauma: false, bleeding: false, fever: false };

export const VISIT_LABEL: Record<VisitLabel, string> = { best_overall: "Best overall", lowest_cost: "Lowest cost", soonest: "Soonest" };

export const CLAIM_ROUTE: Record<ClaimRoute, string> = {
  IN_NETWORK_CLAIM: "In-network claim",
  OUT_OF_NETWORK_CLAIM: "Out-of-network claim",
  SELF_PAY_NO_CLAIM: "Pay the office directly (no claim)",
};

/** Engine tier as words; null means the engine could not confirm the office is in this plan's network. */
export function networkTierLabel(tier: VisitOption["network_tier"]): string {
  if (tier === null) return "Network status needs confirmation";
  return tier === "in_network" ? "In network" : "Out of network";
}

/** Engine deltas as words. Sign picks the word; the magnitude is only formatted. */
function tradeoffText(t: Tradeoff, versusName: string): string {
  const parts: string[] = [];
  if (t.cost_delta_cents === null) parts.push("cost difference unknown");
  else if (t.cost_delta_cents !== 0) parts.push(`${formatCents(Math.abs(t.cost_delta_cents))} ${t.cost_delta_cents > 0 ? "more" : "less"}`);
  else parts.push("same cost");
  if (t.days_delta !== 0) parts.push(`${Math.abs(t.days_delta)} days ${t.days_delta > 0 ? "later" : "sooner"}`);
  if (t.miles_delta !== 0) parts.push(`${Math.abs(t.miles_delta)} mi ${t.miles_delta > 0 ? "farther" : "closer"}`);
  return `Compared with ${versusName}: ${parts.join(", ")}.`;
}

export function VisitNavigatorSection({ scenario }: { scenario: DemoScenario }) {
  const intentId = useId();
  const [intent, setIntent] = useState<VisitIntent>(scenario.visit_defaults.intent);
  const [symptoms, setSymptoms] = useState<Symptoms>(NO_SYMPTOMS);
  const [state, run, reset] = useEngineCall<VisitNavigatorResult>();
  const [request, setRequest] = useState<VisitNavigatorRequest | null>(null);

  function search() {
    const body: VisitNavigatorRequest = {
      as_of: scenario.previsit_as_of,
      member: scenario.member,
      providers: scenario.providers_previsit,
      visit: { intent, expected_codes: scenario.visit_defaults.expected_codes_by_intent[intent], symptoms },
      known_procedures: [],
      max_options: 3,
    };
    setRequest(body);
    void run((signal) => engine.visitNavigator(body, signal));
  }

  return (
    <section aria-labelledby="before-heading">
      <SectionHeading id="before-heading" description="Tell us why you're going. We'll compare dentists by safety first, then cost, wait and travel.">
        Before the visit: where and when to go
      </SectionHeading>
      <div className="grid gap-6 md:grid-cols-[minmax(0,18rem)_1fr]">
        <div className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor={intentId}>Reason for the visit</Label>
            <NativeSelect
              id={intentId}
              className="w-full"
              value={intent}
              onChange={(e) => {
                setIntent(e.target.value as VisitIntent);
                reset();
              }}
            >
              {Object.entries(INTENTS).map(([value, label]) => (
                <NativeSelectOption key={value} value={value}>
                  {label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          <fieldset className="space-y-3">
            <legend className="mb-2 text-sm font-medium">Do you have any of these right now?</legend>
            {(Object.keys(SYMPTOMS) as (keyof Symptoms)[]).map((key) => (
              <div key={key} className="flex items-center gap-3">
                <Checkbox
                  id={`symptom-${key}`}
                  checked={symptoms[key]}
                  onCheckedChange={(checked) => {
                    setSymptoms((s) => ({ ...s, [key]: checked === true }));
                    reset();
                  }}
                />
                <Label htmlFor={`symptom-${key}`} className="font-normal">
                  {SYMPTOMS[key]}
                </Label>
              </div>
            ))}
          </fieldset>
          <Button onClick={search} disabled={state.status === "loading"}>
            {state.status === "loading" && <Spinner />}
            Find visit options
          </Button>
        </div>

        <div className="min-w-0 space-y-5" aria-live="polite">
          {state.status === "idle" && <p className="text-sm text-muted-foreground">Your options appear here: at most three, each with what you’d pay and why.</p>}
          {state.status === "error" && <ErrorPanel title="Couldn't compare visit options" error={state.error} onRetry={search} />}
          {state.status === "ready" && request && <NavigatorResult result={state.data} request={request} scenario={scenario} />}
        </div>
      </div>
    </section>
  );
}

function NavigatorResult({ result, request, scenario }: { result: VisitNavigatorResult; request: VisitNavigatorRequest; scenario: DemoScenario }) {
  const providerName = (id: string) => scenario.providers_previsit.find((p) => p.provider_id === id)?.name ?? id;
  const optionName = (id: string) => result.options.find((o) => o.option_id === id)?.provider_name ?? id;
  const explain: ExplainRequest = { result_kind: "visit_navigator", request, focus_id: null };

  return (
    <>
      {result.safety.urgent && (
        <Alert variant="destructive" role="alert">
          <SirenIcon aria-hidden />
          <AlertTitle className="font-medium">Contact a dentist now</AlertTitle>
          <AlertDescription>
            <p>{result.safety.message}</p>
            {result.safety.triggered_by.length > 0 && <p className="mt-1">Because you reported: {result.safety.triggered_by.map(humanize).join(", ")}.</p>}
          </AlertDescription>
        </Alert>
      )}
      {result.status !== "OK" && <StatusChip status="needsReview" label={humanize(result.status)} />}
      {result.options.length === 0 && !result.safety.urgent && <p className="text-sm text-muted-foreground">No dentist fits these needs right now.</p>}
      <ol className="space-y-4">
        {result.options.map((option) => (
          <li key={option.option_id}>
            <OptionCard option={option} sharedIssues={result.issues} optionName={optionName} />
          </li>
        ))}
      </ol>
      {result.excluded.length > 0 && (
        <p className="text-sm text-muted-foreground">
          Not shown:{" "}
          {result.excluded.map((e) => `${providerName(e.provider_id)} (${e.reasons.map(humanize).join(", ").toLowerCase()})`).join("; ")}.
        </p>
      )}
      {result.conditional_scenarios.map((c) => (
        <div key={c.scenario_id} className="rounded-lg border p-4 text-sm">
          <p className="font-medium">If your dentist confirms more care</p>
          <ul className="mt-2 space-y-1">
            {c.compared.map((row) => (
              <li key={row.option_id + row.claim_route}>
                {CLAIM_ROUTE[row.claim_route]} at {optionName(row.option_id)}: {formatRange(row.horizon_member_cost)} over the plan horizon
              </li>
            ))}
          </ul>
          <p className="mt-2">{c.winner_claim_route ? `Lower overall: ${CLAIM_ROUTE[c.winner_claim_route]}.` : "Not enough verified facts to pick a route yet."}</p>
          <IssueList issues={c.missing} className="mt-2 space-y-1" />
        </div>
      ))}
      <IssueList issues={result.issues} />
      <EvidenceList evidence={result.evidence} />
      <ExplainPanel label="Why these options?" request={explain} />
    </>
  );
}

export function OptionCard({ option, sharedIssues, optionName }: { option: VisitOption; sharedIssues: VisitNavigatorResult["issues"]; optionName: (id: string) => string }) {
  return (
    <article className="space-y-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-center gap-2">
        {option.labels.map((label) => (
          <Badge key={label} variant="secondary">
            {VISIT_LABEL[label]}
          </Badge>
        ))}
        {option.status === "NEEDS_CONFIRMATION" && <StatusChip status="needsReview" label="Needs confirmation" />}
      </div>
      <div>
        <h3 className="text-base font-semibold">{option.provider_name}</h3>
        <p className="text-sm text-muted-foreground">
          {formatIsoDate(option.slot.date)} at {option.slot.start_time} (in {option.days_until} days) · {option.distance_miles} mi, {option.travel_minutes} min away
        </p>
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-muted-foreground">You pay</dt>
          <dd className="text-base font-semibold tabular-nums">{formatRange(option.member_cost)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Plan pays</dt>
          <dd className="tabular-nums">{formatRange(option.plan_pay)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Network</dt>
          <dd>{networkTierLabel(option.network_tier)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Billing</dt>
          <dd>{CLAIM_ROUTE[option.claim_route]}</dd>
        </div>
      </dl>
      <p className="text-xs text-muted-foreground">
        Network status checked {formatTimestamp(option.network_observed_at)}
        {option.network_stale && " — this may be out of date; confirm with the office."}
      </p>
      {option.exceeds_hard_monthly_limit && <StatusChip status="missing" label="Over your monthly budget" />}
      {option.tradeoffs.map((t) => (
        <p key={t.versus_option_id} className="text-sm">
          {tradeoffText(t, optionName(t.versus_option_id))}
        </p>
      ))}
      <IssueList issues={withoutShared(option.issues, sharedIssues)} />
    </article>
  );
}
