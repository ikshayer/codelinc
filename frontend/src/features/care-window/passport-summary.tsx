"use client";

import type { PassportItem } from "@engine/benefits";
import { useEffect } from "react";

import { ErrorPanel } from "@/components/shared/feedback";
import { SectionHeading } from "@/components/shared/page";
import { StatusChip } from "@/components/shared/status-chip";
import { Skeleton } from "@/components/ui/skeleton";
import { engine, type BenefitPassport, type DemoScenario } from "@/lib/adapters/live/engine";
import { formatIsoDate } from "@/lib/domain/dates";
import { formatBasisPoints, formatCents } from "@/lib/domain/money";
import { EngineSource, IssueList, formatRange, useEngineCall } from "./parts";

function itemValue(item: PassportItem): string {
  if (item.value_cents !== null) return formatCents(item.value_cents);
  if (item.value_range) return formatRange(item.value_range);
  if (item.value_bps !== null) return formatBasisPoints(item.value_bps);
  if (item.value_date) return formatIsoDate(item.value_date);
  return item.value_text ?? "Unknown";
}

function ItemRow({ item }: { item: PassportItem }) {
  const unverified = item.rule_status !== null && item.rule_status !== "VERIFIED" && item.rule_status !== "NOT_APPLICABLE";
  return (
    <div className="flex flex-col gap-1 border-b py-2 last:border-b-0 sm:flex-row sm:items-center sm:justify-between">
      <dt className="text-sm text-muted-foreground">{item.label}</dt>
      <dd className="flex flex-wrap items-center gap-2 text-sm font-medium tabular-nums">
        {itemValue(item)}
        {unverified ? <StatusChip status="needsReview" label="Unverified" /> : <EngineSource source={item.source} />}
      </dd>
    </div>
  );
}

const PRIMARY = new Set(["balances", "funding"]);

export function PassportSummary({ scenario }: { scenario: DemoScenario }) {
  const [state, run] = useEngineCall<BenefitPassport>();
  useEffect(() => {
    void run((signal) => engine.passport({ as_of: scenario.previsit_as_of, member: scenario.member }, signal));
  }, [run, scenario]);

  return (
    <section aria-labelledby="passport-heading">
      <SectionHeading id="passport-heading" description="What your plan has left, when it resets and what's about to expire.">
        Your benefits
      </SectionHeading>
      {state.status === "error" && (
        <ErrorPanel title="Couldn't load your benefits" error={state.error} onRetry={() => run((s) => engine.passport({ as_of: scenario.previsit_as_of, member: scenario.member }, s))} />
      )}
      {(state.status === "loading" || state.status === "idle") && <Skeleton className="h-48 w-full" />}
      {state.status === "ready" && <Passport passport={state.data} scenario={scenario} />}
    </section>
  );
}

function Passport({ passport, scenario }: { passport: BenefitPassport; scenario: DemoScenario }) {
  const primary = passport.sections.filter((s) => PRIMARY.has(s.section_id));
  const more = passport.sections.filter((s) => !PRIMARY.has(s.section_id));
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {passport.carrier_name} · {passport.plan_name} · {formatIsoDate(passport.coverage_period_start)} to {formatIsoDate(passport.coverage_period_end)}.{" "}
        <span className="font-medium text-foreground">Balances reset {formatIsoDate(passport.next_reset_date)}.</span>
      </p>
      <div className="grid gap-6 md:grid-cols-2">
        {primary.map((section) => (
          <div key={section.section_id}>
            <h3 className="mb-1 text-base font-semibold">{section.title}</h3>
            <dl>
              {section.items.map((item) => (
                <ItemRow key={item.item_id} item={item} />
              ))}
              {section.section_id === "funding" &&
                scenario.member.funding_accounts.map((account) => (
                  <div key={account.source_id} className="flex flex-col gap-1 py-2 sm:flex-row sm:items-center sm:justify-between">
                    <dt className="text-sm text-muted-foreground">{account.label}: claims due by</dt>
                    <dd className="text-sm font-medium">{account.claim_deadline ? formatIsoDate(account.claim_deadline) : "Unknown"}</dd>
                  </div>
                ))}
            </dl>
          </div>
        ))}
      </div>
      {more.length > 0 && (
        <details className="rounded-lg border px-4 py-3">
          <summary className="cursor-pointer text-sm font-medium">Coverage and plan rules</summary>
          <div className="mt-3 grid gap-6 md:grid-cols-2">
            {more.map((section) => (
              <div key={section.section_id}>
                <h3 className="mb-1 text-sm font-semibold">{section.title}</h3>
                <dl>
                  {section.items.map((item) => (
                    <ItemRow key={item.item_id} item={item} />
                  ))}
                </dl>
              </div>
            ))}
          </div>
        </details>
      )}
      <IssueList issues={passport.issues} />
    </div>
  );
}
