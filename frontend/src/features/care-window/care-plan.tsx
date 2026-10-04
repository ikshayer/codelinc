"use client";

import type { ExplainRequest } from "@engine/api";
import type { RolloverOutcome, RolloverStatus } from "@engine/benefits";
import type { Alternative, AlternativeLabel, EvidenceIndexEntry, NextAction, ReasonCode, RecommendationMode, ScheduledEvent } from "@engine/optimizer";
import type { Urgency } from "@engine/procedure";
import { CalendarCheckIcon } from "lucide-react";
import { useId, useState } from "react";

import { ErrorPanel } from "@/components/shared/feedback";
import { SectionHeading } from "@/components/shared/page";
import { StatusChip } from "@/components/shared/status-chip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ChipStatus } from "@/components/shared/status-chip";
import {
  engine,
  type CarePlanRequest,
  type CarePlanResult,
  type ConfirmData,
  type DemoScenario,
  type ExtractionResult,
  type ProcedureRecommendation,
} from "@/lib/adapters/live/engine";
import { formatIsoDate } from "@/lib/domain/dates";
import { formatCents } from "@/lib/domain/money";
import { EvidenceList, ExplainPanel, IssueList, formatRange, humanize, signedCents, useEngineCall, withoutShared } from "./parts";
import { DEFAULT_MODE, DifferenceList, PrioritySelector, SolverLine, withMode } from "./plan-modes";
import { CLAIM_ROUTE } from "./visit-navigator";

const URGENCY: Record<Urgency, string> = { act_now: "Act now", schedule_soon: "Schedule soon", can_plan_later: "Can plan later" };

export const ALT_LABEL: Record<AlternativeLabel, string> = {
  lowest_total_cost: "Balanced: lowest cost on your dentist's target dates",
  lowest_member_cost: "Lowest total cost",
  earliest_safe_completion: "Earliest safe completion",
  smoothest_monthly_payments: "Smoothest monthly payments",
};

const REASON: Record<ReasonCode, string> = {
  WITHIN_SAFE_WINDOW: "Inside your dentist's safe window",
  MEETS_DENTIST_TARGET: "Meets your dentist's target date",
  AFTER_DENTIST_TARGET: "After your dentist's target date",
  EARLIEST_COMPATIBLE_SLOT: "Earliest slot that fits",
  HEALING_INTERVAL: "Leaves the healing time your dentist asked for",
  AFTER_PLAN_RESET: "After your plan year resets",
  BEFORE_PLAN_RESET: "Before your plan year resets",
  USES_EXPIRING_FUNDS: "Uses FSA money before it expires",
  FITS_MONTHLY_BUDGET: "Fits your monthly budget",
  SELF_PAY_LOWER_PORTFOLIO_COST: "Paying the office directly costs less overall",
};

const ACTION: Record<NextAction["kind"], string> = {
  REQUEST_APPOINTMENT: "Request this appointment",
  REQUEST_PRETREATMENT_ESTIMATE: "Ask the office for a pre-treatment estimate",
  CONFIRM_SELF_PAY_WITH_OFFICE: "Confirm the self-pay price with the office",
  CONFIRM_MISSING_DATA: "Confirm the missing details",
  CONTACT_DENTIST_NOW: "Contact your dentist now",
  SUBMIT_FSA_CLAIM: "Submit an FSA claim",
};

type DateField = "earliest_safe_date" | "target_date" | "latest_safe_date";
const DATE_FIELDS: [DateField, string][] = [
  ["earliest_safe_date", "Earliest"],
  ["target_date", "Target"],
  ["latest_safe_date", "No later than"],
];

export function CarePlanSection({ scenario }: { scenario: DemoScenario }) {
  const docId = useId();
  const [documentId, setDocumentId] = useState(scenario.documents[0]?.document_id ?? "");
  const [consent, setConsent] = useState(false);
  const [extraction, extract, resetExtraction] = useEngineCall<ExtractionResult>();
  const [draft, setDraft] = useState<ProcedureRecommendation[]>([]);
  const [included, setIncluded] = useState<Set<string>>(new Set());
  const [confirmation, confirm, resetConfirmation] = useEngineCall<ConfirmData>();
  const [plan, optimize, resetPlan] = useEngineCall<CarePlanResult>();
  const [planRequest, setPlanRequest] = useState<CarePlanRequest | null>(null);
  const [mode, setMode] = useState<RecommendationMode>(DEFAULT_MODE);

  const doc = scenario.documents.find((d) => d.document_id === documentId);
  const needsConsent = doc?.kind === "transcript";

  function resetAfter() {
    resetConfirmation();
    resetPlan();
    setPlanRequest(null);
  }

  async function read() {
    if (!doc) return;
    resetAfter();
    const result = await extract((signal) =>
      engine.extract(
        {
          as_of: scenario.postvisit_as_of,
          document_id: doc.document_id,
          kind: doc.kind,
          text: doc.text,
          image: null,
          consent: { recording_consent: needsConsent && consent, retain_audio: false },
        },
        signal,
      ),
    );
    setDraft(result?.procedures ?? []);
    setIncluded(new Set());
  }

  function edit(procedureId: string, field: DateField, value: string) {
    setDraft((list) => list.map((p) => (p.procedure_id === procedureId ? { ...p, [field]: value || null } : p)));
    resetAfter();
  }

  async function confirmAndPlan() {
    const procedures = draft.filter((p) => included.has(p.procedure_id));
    const confirmed = await confirm((signal) => engine.confirm({ as_of: scenario.postvisit_as_of, confirmed_by: "member", procedures }, signal));
    if (!confirmed || confirmed.procedures.length === 0) return;
    const body: CarePlanRequest = {
      as_of: scenario.postvisit_as_of,
      member: scenario.member,
      providers: scenario.providers_postvisit,
      procedures: confirmed.procedures,
      planning_horizon_end: scenario.planning_horizon_end,
      max_alternatives: 3,
    };
    const request = mode === DEFAULT_MODE ? body : withMode(body, mode);
    setPlanRequest(request);
    await optimize((signal) => engine.carePlan(request, signal));
  }

  async function changeMode(next: RecommendationMode) {
    setMode(next);
    if (!planRequest) return;
    const request = withMode(planRequest, next);
    setPlanRequest(request);
    await optimize((signal) => engine.carePlan(request, signal));
  }

  return (
    <section aria-labelledby="after-heading" className="space-y-6">
      <SectionHeading id="after-heading" description="Read your dentist's treatment plan, check it, then see when and where to do each step.">
        After the visit: plan your treatment
      </SectionHeading>

      <div className="flex flex-col gap-4 md:flex-row md:items-end">
        <div className="min-w-0 flex-1 space-y-2">
          <Label htmlFor={docId}>Dentist’s plan (synthetic sample)</Label>
          <NativeSelect
            id={docId}
            className="w-full"
            value={documentId}
            onChange={(e) => {
              setDocumentId(e.target.value);
              resetExtraction();
              setDraft([]);
              resetAfter();
            }}
          >
            {scenario.documents.map((d) => (
              <NativeSelectOption key={d.document_id} value={d.document_id}>
                {d.title}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        <Button onClick={read} disabled={!doc || extraction.status === "loading" || (needsConsent && !consent)}>
          {extraction.status === "loading" && <Spinner />}
          Read the plan
        </Button>
      </div>
      {needsConsent && (
        <div className="flex items-center gap-3">
          <Checkbox id="recording-consent" checked={consent} onCheckedChange={(c) => setConsent(c === true)} />
          <Label htmlFor="recording-consent" className="font-normal">
            Everyone in this conversation agreed to it being recorded. Audio is not kept.
          </Label>
        </div>
      )}
      {doc && (
        <details className="rounded-lg border px-4 py-3 text-sm">
          <summary className="cursor-pointer font-medium">Show the document text</summary>
          <pre className="mt-3 overflow-x-auto font-mono text-xs whitespace-pre-wrap">{doc.text}</pre>
        </details>
      )}

      {extraction.status === "error" && <ErrorPanel title="Couldn't read the plan" error={extraction.error} onRetry={read} />}
      {extraction.status === "ready" && (
        <div className="space-y-4">
          <h3 className="text-base font-semibold">Check what we read</h3>
          <p className="text-sm text-muted-foreground">Nothing is used until you confirm it matches what your dentist told you.</p>
          {extraction.data.ignored_instructions.map((ig, i) => (
            <p key={i} className="text-sm">
              <StatusChip status="conflict" label="Ignored" /> Instruction-like text in the document was not followed: “{ig.text}” ({ig.reason})
            </p>
          ))}
          <IssueList issues={extraction.data.warnings} />
          {draft.length === 0 && <p className="text-sm text-muted-foreground">No procedures were found in this document.</p>}
          <ol className="space-y-4">
            {draft.map((p) => (
              <li key={p.procedure_id}>
                <ProcedureCard
                  procedure={p}
                  all={draft}
                  included={included.has(p.procedure_id)}
                  confirmed={confirmation.status === "ready" && confirmation.data.procedures.some((c) => c.procedure_id === p.procedure_id)}
                  onInclude={(on) => {
                    setIncluded((s) => {
                      const next = new Set(s);
                      if (on) next.add(p.procedure_id);
                      else next.delete(p.procedure_id);
                      return next;
                    });
                    resetAfter();
                  }}
                  onEdit={(field, value) => edit(p.procedure_id, field, value)}
                />
              </li>
            ))}
          </ol>
          {draft.length > 0 && (
            <Button onClick={confirmAndPlan} disabled={included.size === 0 || confirmation.status === "loading" || plan.status === "loading"}>
              {(confirmation.status === "loading" || plan.status === "loading") && <Spinner />}
              <CalendarCheckIcon aria-hidden />
              Confirm {included.size} and plan my care
            </Button>
          )}
          {confirmation.status === "error" && <ErrorPanel title="Couldn't confirm these procedures" error={confirmation.error} />}
          {confirmation.status === "ready" && <IssueList issues={confirmation.data.issues} />}
        </div>
      )}

      {planRequest && <PrioritySelector value={mode} onChange={changeMode} disabled={plan.status === "loading"} />}
      {plan.status === "loading" && planRequest && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
          <Spinner /> Updating your care plan options…
        </p>
      )}
      {plan.status === "error" && <ErrorPanel title="Couldn't build a care plan" error={plan.error} />}
      {plan.status === "ready" && planRequest && <PlanResult key={plan.data.mode} result={plan.data} request={planRequest} scenario={scenario} />}
    </section>
  );
}

function ProcedureCard({
  procedure: p,
  all,
  included,
  confirmed,
  onInclude,
  onEdit,
}: {
  procedure: ProcedureRecommendation;
  all: ProcedureRecommendation[];
  included: boolean;
  confirmed: boolean;
  onInclude: (on: boolean) => void;
  onEdit: (field: DateField, value: string) => void;
}) {
  const fee = p.dentist_fee.value;
  const inferred = new Set<string>(p.inferred_fields);
  const mark = (field: string) => (inferred.has(field) ? " (inferred, please check)" : "");
  return (
    <article className="space-y-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="font-semibold">{p.description}</h4>
        {confirmed ? <StatusChip status="confirmed" /> : <StatusChip status="needsReview" label="Unverified" />}
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-muted-foreground">Code{mark("cdt_code")}</dt>
          <dd>{p.cdt_code ?? "Missing"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Tooth{mark("tooth")}</dt>
          <dd>{p.tooth ?? "None"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Office fee{mark("dentist_fee")}</dt>
          <dd className="tabular-nums">{fee.kind === "exact" ? formatCents(fee.cents) : fee.kind === "range" ? formatRange(fee) : "Missing"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Timing{mark("urgency")}</dt>
          <dd>{p.urgency ? URGENCY[p.urgency] : "Missing"}</dd>
        </div>
      </dl>
      <div className="grid gap-3 sm:grid-cols-3">
        {DATE_FIELDS.map(([field, label]) => (
          <div key={field} className="space-y-1">
            <Label htmlFor={`${p.procedure_id}-${field}`} className="text-xs text-muted-foreground">
              {label}
              {mark(field)}
            </Label>
            <Input id={`${p.procedure_id}-${field}`} type="date" value={p[field] ?? ""} onChange={(e) => onEdit(field, e.target.value)} />
          </div>
        ))}
      </div>
      {p.dependencies.map((d) => (
        <p key={d.depends_on} className="text-sm">
          After {all.find((o) => o.procedure_id === d.depends_on)?.description ?? d.depends_on}: wait at least {d.min_gap_days} days
          {d.max_gap_days !== null && `, at most ${d.max_gap_days}`}.
        </p>
      ))}
      {p.source.dentist_statements.length > 0 && (
        <div className="text-sm">
          <p className="text-muted-foreground">Your dentist said:</p>
          {p.source.dentist_statements.map((s, i) => (
            <blockquote key={i} className="border-l-2 pl-3 italic">
              “{s}”
            </blockquote>
          ))}
        </div>
      )}
      <div className="flex items-center gap-3">
        <Checkbox id={`include-${p.procedure_id}`} checked={included} onCheckedChange={(c) => onInclude(c === true)} />
        <Label htmlFor={`include-${p.procedure_id}`} className="font-normal">
          This matches what my dentist told me
        </Label>
      </div>
    </article>
  );
}

function PlanResult({ result, request, scenario }: { result: CarePlanResult; request: CarePlanRequest; scenario: DemoScenario }) {
  const [selected, setSelected] = useState(result.recommended_alternative_id ?? result.alternatives[0]?.alternative_id ?? "");
  const focus = result.alternatives.some((a) => a.alternative_id === selected) ? selected : null;
  const explain: ExplainRequest = { result_kind: "care_plan", request, focus_id: focus };

  return (
    <div className="space-y-5" aria-live="polite">
      <h3 className="text-base font-semibold">Your care plan options</h3>
      {result.status !== "OK" && <StatusChip status="needsReview" label={humanize(result.status)} />}
      <IssueList issues={result.unresolved} />
      {result.alternatives.length === 0 ? (
        <p className="text-sm text-muted-foreground">No schedule fits every dentist window. Check the dates above with your dentist.</p>
      ) : (
        <Tabs value={selected} onValueChange={setSelected}>
          <TabsList className="h-auto flex-wrap">
            {result.alternatives.map((alt) => (
              <TabsTrigger key={alt.alternative_id} value={alt.alternative_id}>
                {ALT_LABEL[alt.labels[0]]}
                {alt.alternative_id === result.recommended_alternative_id && " (recommended)"}
              </TabsTrigger>
            ))}
          </TabsList>
          {result.alternatives.map((alt) => (
            <TabsContent key={alt.alternative_id} value={alt.alternative_id} className="pt-4">
              <AlternativeView alt={alt} request={request} scenario={scenario} shared={result.unresolved} evidence={result.evidence} />
            </TabsContent>
          ))}
        </Tabs>
      )}
      <SolverLine meta={result.solver_meta} />
      <EvidenceList evidence={result.evidence} />
      <ExplainPanel label="Why this plan?" request={explain} />
    </div>
  );
}

function AlternativeView({
  alt,
  request,
  scenario,
  shared,
  evidence,
}: {
  alt: Alternative;
  request: CarePlanRequest;
  scenario: DemoScenario;
  shared: CarePlanResult["unresolved"];
  evidence: EvidenceIndexEntry[];
}) {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        {alt.labels.map((l) => (
          <Badge key={l} variant="secondary">
            {ALT_LABEL[l]}
          </Badge>
        ))}
      </div>
      <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-muted-foreground">You pay in total</dt>
          <dd className="text-lg font-semibold tabular-nums">{formatRange(alt.totals.member_cost)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Plan pays</dt>
          <dd className="tabular-nums">{formatRange(alt.totals.plan_pay)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Done by</dt>
          <dd>{alt.objective.completion_date ? formatIsoDate(alt.objective.completion_date) : "Not scheduled"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Not covered by your funds</dt>
          <dd className="tabular-nums">{formatCents(alt.funding_gap_cents)}</dd>
        </div>
      </dl>

      <ol className="relative space-y-6 border-l pl-6">
        {alt.events.map((event) => (
          <li key={event.event_id} className="relative">
            <span aria-hidden className="absolute top-1.5 -left-[1.95rem] size-3 rounded-full border-2 border-primary bg-background" />
            <EventView event={event} request={request} scenario={scenario} rollover={alt.rollover} />
          </li>
        ))}
      </ol>

      {alt.unscheduled.length > 0 && (
        <ul className="space-y-1 text-sm">
          {alt.unscheduled.map((u) => (
            <li key={u.procedure_id}>
              <StatusChip status="missing" label="Not scheduled" /> {request.procedures.find((p) => p.procedure_id === u.procedure_id)?.description ?? u.procedure_id}: {u.message}
            </li>
          ))}
        </ul>
      )}

      {alt.monthly.length > 0 && (
        <div className="text-sm">
          <p className="font-medium">New money out of pocket by month</p>
          <ul className="mt-1 space-y-1">
            {alt.monthly.map((m) => (
              <li key={m.month} className="flex flex-wrap items-center gap-2">
                <span className="w-20 text-muted-foreground">{m.month}</span>
                <span className="tabular-nums">{formatCents(m.cash_cents)}</span>
                {m.exceeds_hard && <StatusChip status="conflict" label="Over your hard limit" />}
                {!m.exceeds_hard && m.exceeds_preferred && <StatusChip status="missing" label="Over your preferred limit" />}
              </li>
            ))}
          </ul>
        </div>
      )}
      {alt.difference_from_recommended && (
        <DifferenceList
          difference={alt.difference_from_recommended}
          procedureName={(id) => request.procedures.find((p) => p.procedure_id === id)?.description ?? id}
        />
      )}
      <RolloverPanel outcomes={alt.rollover} evidence={evidence} />
      <IssueList issues={withoutShared(alt.issues, shared)} />
    </div>
  );
}

// (contract 1.5) UI-007: the engine's year-close carryover outcome, formatted only. Never "guaranteed".
const ROLLOVER_STATUS: Record<RolloverStatus, { label: string; chip: ChipStatus }> = {
  EARNED: { label: "Earned", chip: "confirmed" },
  CONDITIONAL: { label: "Conditional: may be added", chip: "needsReview" },
  NOT_EARNED: { label: "Not earned", chip: "missing" },
  UNCERTAIN: { label: "Uncertain", chip: "needsReview" },
  NEEDS_CONFIRMATION: { label: "Needs confirmation", chip: "missing" },
};

export const rolloverStatusLabel = (status: RolloverStatus) => ROLLOVER_STATUS[status].label;
const belowWord = (o: RolloverOutcome) => (o.threshold_comparison === "LT" ? "below" : "at or below");

export function RolloverPanel({ outcomes, evidence }: { outcomes: RolloverOutcome[]; evidence: EvidenceIndexEntry[] }) {
  if (outcomes.length === 0) return null;
  return (
    <section className="space-y-4 rounded-lg border px-4 py-3 text-sm" aria-label="Unused maximum carryover">
      <p className="font-medium">Unused maximum carryover</p>
      {outcomes.map((o) => {
        const status = ROLLOVER_STATUS[o.status];
        const quotes = evidence.find((e) => e.rule_id === o.rule_id && e.plan_version_id === o.closing_plan_version_id)?.evidence ?? [];
        return (
          <div key={`${o.closing_plan_version_id}:${o.rule_id}`} className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <StatusChip status={status.chip} label={status.label} />
              <span className="text-muted-foreground">Plan year ending {formatIsoDate(o.closing_period_end)}</span>
            </div>
            {o.settled_plan_paid && <p className="tabular-nums">Plan paid so far this year: {formatRange(o.settled_plan_paid)}</p>}
            <p className="tabular-nums">
              Plan payments toward the maximum: {formatRange(o.qualifying_plan_paid)} (carryover needs {belowWord(o)} {formatCents(o.threshold_cents)})
            </p>
            <p className="tabular-nums">Carryover to next year: {o.final_bank ? formatRange(o.final_bank) : "Needs confirmation"}</p>
            {o.lost_to_cap_cents !== null && o.lost_to_cap_cents > 0 && <p className="tabular-nums">Lost to cap: {formatCents(o.lost_to_cap_cents)}</p>}
            {o.forfeited_cents !== null && o.forfeited_cents > 0 && <p className="tabular-nums">Carryover balance lost: {formatCents(o.forfeited_cents)}</p>}
            <IssueList issues={o.issues} />
            <details className="rounded-md border px-3 py-2">
              <summary className="cursor-pointer">How this was calculated · rule {o.rule_id}</summary>
              <ul className="mt-2 space-y-1">
                {o.steps.map((step) => (
                  <li key={step.step_id} className="flex flex-wrap justify-between gap-2">
                    <span>{step.label}</span>
                    <span className="tabular-nums">{step.result_cents !== null ? formatCents(step.result_cents) : step.result_text}</span>
                  </li>
                ))}
              </ul>
              {quotes.map((ref, i) => (
                <blockquote key={i} className="mt-2 border-l-2 pl-3">
                  “{ref.quote}” <span className="text-xs text-muted-foreground">({ref.source_id}, {ref.locator})</span>
                </blockquote>
              ))}
            </details>
          </div>
        );
      })}
    </section>
  );
}

/**
 * "Optional: moving this to …" line for a flexible event (engine `rollover_shift`, display only).
 * Claims the move keeps payments under the threshold only when the engine's moved status says so.
 */
export function RolloverShiftNote({ shift, outcome }: { shift: NonNullable<ScheduledEvent["rollover_shift"]>; outcome: RolloverOutcome | undefined }) {
  const threshold = outcome && `this year's plan payments ${belowWord(outcome)} ${formatCents(outcome.threshold_cents)}`;
  const effect =
    !threshold ? "" : shift.status_if_moved === "CONDITIONAL" || shift.status_if_moved === "EARNED" ? ` keeps ${threshold}` : shift.status_if_moved === "UNCERTAIN" ? ` may keep ${threshold}, depending on pending claims` : "";
  return (
    <p className="text-sm">
      Optional: moving this to {formatIsoDate(shift.moved_to_date)}
      {effect}; carryover if moved:{" "}
      {rolloverStatusLabel(shift.status_if_moved).toLowerCase()}, {formatRange(shift.final_bank_if_moved)}; estimated cost change {signedCents(shift.member_cost_delta_cents)}.
    </p>
  );
}

function EventView({ event, request, scenario, rollover }: { event: ScheduledEvent; request: CarePlanRequest; scenario: DemoScenario; rollover: RolloverOutcome[] }) {
  const procedure = request.procedures.find((p) => p.procedure_id === event.procedure_id);
  const provider = scenario.providers_postvisit.find((p) => p.provider_id === event.provider_id)?.name ?? event.provider_id;
  const sourceLabel = (sourceId: string, type: string) =>
    type === "CASH" ? "Cash (monthly budget)" : (scenario.member.funding_accounts.find((a) => a.source_id === sourceId)?.label ?? type);
  const rc = event.route_comparison;

  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">{formatIsoDate(event.service_date)}</p>
      <h4 className="font-semibold">{procedure?.description ?? event.procedure_id}</h4>
      <p className="text-sm">
        {provider} · {CLAIM_ROUTE[event.claim_route]}
      </p>
      <p className="text-sm tabular-nums">
        Plan pays {formatRange(event.plan_pay)} · <span className="font-semibold">You pay {formatRange(event.member_cost)}</span>
      </p>
      {event.funding.length > 0 && (
        <p className="text-sm text-muted-foreground">
          Paid from: {event.funding.map((f) => `${sourceLabel(f.source_id, f.source_type)} ${formatCents(f.amount_cents)}`).join(", ")}
          {event.shortfall_cents > 0 && `; ${formatCents(event.shortfall_cents)} not covered`}
        </p>
      )}
      {rc?.winner_claim_route && rc.difference_cents !== null && (
        <p className="text-sm">
          {CLAIM_ROUTE[rc.winner_claim_route]} saves {formatCents(rc.difference_cents)} across your whole plan.
        </p>
      )}
      {event.rollover_shift && (
        <RolloverShiftNote shift={event.rollover_shift} outcome={rollover.find((o) => o.closing_plan_version_id === event.rollover_shift?.closing_plan_version_id)} />
      )}
      <ul className="flex flex-wrap gap-1.5">
        {event.reasons.map((r) => (
          <li key={r}>
            <Badge variant="outline" className="font-normal">
              {REASON[r]}
            </Badge>
          </li>
        ))}
      </ul>
      {event.next_actions.length > 0 && (
        <ul className="list-disc space-y-0.5 pl-5 text-sm">
          {event.next_actions.map((a, i) => (
            <li key={i}>
              {ACTION[a.kind]}
              {a.by_date && ` by ${formatIsoDate(a.by_date)}`}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
