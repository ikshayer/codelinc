"use client";

import type { PassportItem } from "@engine/benefits";
import { useEffect } from "react";

import { ErrorPanel } from "@/components/shared/feedback";
import { SectionHeading } from "@/components/shared/page";
import { StatusChip } from "@/components/shared/status-chip";
import { Skeleton } from "@/components/ui/skeleton";
import { engine, type BenefitPassport, type DemoScenario } from "@/lib/adapters/live/engine";
import { formatIsoDate, formatTimestamp } from "@/lib/domain/dates";
import { formatBasisPoints, formatCents } from "@/lib/domain/money";
import { EngineSource, IssueList, formatRange, useEngineCall } from "./parts";

function itemValue(item: PassportItem): string {
  if (item.value_cents !== null) return formatCents(item.value_cents);
  if (item.value_range) return formatRange(item.value_range);
  if (item.value_bps !== null) return formatBasisPoints(item.value_bps);
  if (item.value_date) return formatIsoDate(item.value_date);
  return item.value_text ?? "Unknown";
}

export function passportStatus(item: PassportItem, issues: BenefitPassport["issues"] = []): string {
  if (issues.some((issue) => issue.code === "INPUT_STALE" && issue.input_id !== null && item.input_ids.includes(issue.input_id))) return "Stale";
  if (item.rule_status === "NOT_APPLICABLE") return "Not applicable";
  if (item.rule_status === "UNKNOWN") return "Unknown";
  if (item.rule_status === "CONFLICT") return "Needs confirmation (conflicting sources)";
  if (item.rule_status === "UNVERIFIED" || item.source === "NEEDS_CONFIRMATION") return "Needs confirmation";
  if (item.source === "MEMBER_CONFIRMED") return "User-entered";
  if (item.value_range || item.source === "ESTIMATE") return "Partial";
  if (item.rule_status === "VERIFIED" || item.source === "CLAIM_EOB" || item.source === "PLAN_VERIFIED") return "Verified";
  return "Needs confirmation";
}

export function ItemRow({ item, issues = [] }: { item: PassportItem; issues?: BenefitPassport["issues"] }) {
  const status = passportStatus(item, issues);
  return (
    <div className="flex flex-col gap-1 border-b py-2 last:border-b-0 sm:flex-row sm:items-center sm:justify-between">
      <dt className="text-sm text-muted-foreground">{item.label}</dt>
      <dd className="flex flex-wrap items-center gap-2 text-sm font-medium tabular-nums">
        {itemValue(item)}
        <StatusChip status={status === "Verified" ? "confirmed" : status === "Unknown" ? "missing" : "needsReview"} label={status} />
        <EngineSource source={item.source} />
        <details className="w-full text-xs font-normal">
          <summary className="cursor-pointer">Source and freshness</summary>
          <p className="mt-1">Last checked: {item.observed_at ? formatTimestamp(item.observed_at) : "Not supplied"}</p>
          <p>Rules: {item.rule_ids.join(", ") || "Not applicable"}</p>
          <p className="break-all">Input references: {item.input_ids.join(", ") || "None supplied"}</p>
          <IssueList issues={issues.filter((issue) => (issue.input_id !== null && item.input_ids.includes(issue.input_id)) || (issue.rule_id !== null && item.rule_ids.includes(issue.rule_id)))} />
        </details>
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
    <section aria-labelledby="passport-heading" className="scroll-mt-40">
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

export function Passport({ passport, scenario }: { passport: BenefitPassport; scenario: DemoScenario }) {
  const primary = passport.sections.filter((s) => PRIMARY.has(s.section_id));
  const more = passport.sections.filter((s) => !PRIMARY.has(s.section_id));
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {passport.carrier_name} · {passport.plan_name} · {formatIsoDate(passport.coverage_period_start)} to {formatIsoDate(passport.coverage_period_end)}.{" "}
        <span className="font-medium text-foreground">Balances reset {formatIsoDate(passport.next_reset_date)}.</span>
      </p>
      <p className="text-sm">Plan option {passport.plan_option_id} · Network {passport.network_id} · Version {passport.plan_version_id} · Snapshot as of {formatTimestamp(passport.as_of)}</p>
      <section aria-label="Benefits available now" className="rounded-lg border p-4">
        <h3 className="font-semibold">Benefits available now</h3>
        <p className="mt-1 text-xs text-muted-foreground">Settled balances and pending reservations are separate. Values are returned by the demo engine.</p>
        <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
          {[
            ["Annual maximum remaining (settled)", passport.current_period.annual_max_remaining_cents],
            ["Pending reservation against maximum", passport.current_period.pending_reserved_max_cents],
            ["Annual maximum available after pending", passport.current_period.annual_max_available_cents],
            ["Deductible remaining (settled)", passport.current_period.deductible_remaining_cents],
            ["Pending reservation against deductible", passport.current_period.pending_reserved_deductible_cents],
            ["Deductible available after pending", passport.current_period.deductible_available_cents],
          ].map(([label, value]) => <div key={String(label)}><dt className="text-muted-foreground">{label}</dt><dd className="font-medium tabular-nums">{formatCents(Number(value))}</dd></div>)}
        </dl>
        <div className="mt-3"><EngineSource source={passport.current_period.source} /></div>
      </section>
      <details className="rounded-lg border px-4 py-3 text-sm">
        <summary className="cursor-pointer font-medium">Data quality</summary>
        <p className="mt-2">Verified refers to the synthetic source supplied to this engine. Last-checked dates show observations, not live payer retrieval. Stale and partial indicators are shown when the engine provides that evidence.</p>
        <IssueList issues={passport.issues} />
      </details>
      <div className="grid gap-6 md:grid-cols-2">
        {primary.map((section) => (
          <div key={section.section_id}>
            <h3 className="mb-1 text-base font-semibold">{section.title}</h3>
            <dl>
              {section.items.map((item) => (
                <ItemRow key={item.item_id} item={item} issues={passport.issues} />
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
                    <ItemRow key={item.item_id} item={item} issues={passport.issues} />
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
