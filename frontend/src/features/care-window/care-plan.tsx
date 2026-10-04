"use client";

import type { ExplainRequest } from "@engine/api";
import type { RolloverOutcome, RolloverStatus } from "@engine/benefits";
import type { Alternative, AlternativeLabel, EvidenceIndexEntry, NextAction, ReasonCode, RecommendationMode, ScheduledEvent } from "@engine/optimizer";
import type { ScheduleLock } from "@engine/optimizer";
import { CalendarCheckIcon } from "lucide-react";
import { useId, useState } from "react";

import { ErrorPanel } from "@/components/shared/feedback";
import { SectionHeading } from "@/components/shared/page";
import { StatusChip } from "@/components/shared/status-chip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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

import { ProcedureEditor } from "./procedure-editor";
import { PreferenceEditor, preferenceMember, type MemberPreferences } from "./preference-editor";
import { BenefitsAfterEvent, EventCostBreakdown, RouteComparisonCard } from "./event-details";

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

export function CarePlanSection({ scenario }: { scenario: DemoScenario }) {
  const docId = useId();
  const [documentId, setDocumentId] = useState(scenario.documents[0]?.document_id ?? "");
  const [consent, setConsent] = useState(false);
  const [extraction, extract, resetExtraction] = useEngineCall<ExtractionResult>();
  const [draft, setDraft] = useState<ProcedureRecommendation[]>([]);
  const [included, setIncluded] = useState<Set<string>>(new Set());
  const [affirmed, setAffirmed] = useState<Set<string>>(new Set());
  const [preferences, setPreferences] = useState<MemberPreferences>(scenario.member);
  const [locks, setLocks] = useState<ScheduleLock[]>([]);
  const [lockHistory, setLockHistory] = useState<ScheduleLock[][]>([]);
  const [baseline, setBaseline] = useState<{ request: CarePlanRequest; result: CarePlanResult } | null>(null);
  const [resultVersion, setResultVersion] = useState(0);
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
    setLocks([]);
    setLockHistory([]);
    setBaseline(null);
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
    setAffirmed(new Set());
  }

  function edit(procedure: ProcedureRecommendation) {
    setDraft((list) => list.map((p) => p.procedure_id === procedure.procedure_id ? procedure : p));
    setAffirmed((current) => new Set([...current].filter((id) => id !== procedure.procedure_id)));
    resetAfter();
  }

  async function run(request: CarePlanRequest) {
    setPlanRequest(request);
    const result = await optimize((signal) => engine.carePlan(request, signal));
    if (result) setResultVersion((v) => v + 1);
    return result;
  }

  async function changeLocks(next: ScheduleLock[], history = [...lockHistory, locks]) {
    if (!planRequest) return;
    setLocks(next);
    setLockHistory(history);
    await run({ ...planRequest, schedule_locks: next });
  }

  async function applyPreferences(next: MemberPreferences) {
    setPreferences(next);
    if (!planRequest) return;
    const request = { ...planRequest, member: preferenceMember(scenario.member, next) };
    const result = await run(request);
    if (result && locks.length === 0) setBaseline({ request, result });
  }

  async function resetRecommended() {
    if (!baseline) return;
    setLocks([]);
    setLockHistory([]);
    setPreferences(baseline.request.member);
    setMode(baseline.result.mode);
    await run(baseline.request);
  }

  async function confirmAndPlan() {
    const procedures = draft.filter((p) => included.has(p.procedure_id) && affirmed.has(p.procedure_id));
    const confirmed = await confirm((signal) => engine.confirm({ as_of: scenario.postvisit_as_of, confirmed_by: "member", procedures }, signal));
    if (!confirmed || confirmed.procedures.length === 0) return;
    const body: CarePlanRequest = {
      as_of: scenario.postvisit_as_of,
      member: preferenceMember(scenario.member, preferences),
      providers: scenario.providers_postvisit,
      procedures: confirmed.procedures,
      planning_horizon_end: scenario.planning_horizon_end,
      max_alternatives: 3,
    };
    const request = mode === DEFAULT_MODE ? body : withMode(body, mode);
    const result = await run(request);
    if (result && locks.length === 0) setBaseline({ request, result });
  }

  async function changeMode(next: RecommendationMode) {
    setMode(next);
    if (!planRequest) return;
    const request = withMode(planRequest, next);
    const result = await run(request);
    if (result && locks.length === 0) setBaseline({ request, result });
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
                <ProcedureEditor
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
                  affirmed={affirmed.has(p.procedure_id)}
                  onAffirm={(on) => { setAffirmed((current) => { const next = new Set(current); if (on) next.add(p.procedure_id); else next.delete(p.procedure_id); return next; }); resetAfter(); }}
                  onEdit={edit}
                  asOf={scenario.postvisit_as_of}
                  disabled={confirmation.status === "loading" || plan.status === "loading"}
                />
              </li>
            ))}
          </ol>
          {draft.length > 0 && (
            <Button onClick={confirmAndPlan} disabled={included.size === 0 || [...included].some((id) => !affirmed.has(id)) || confirmation.status === "loading" || plan.status === "loading"}>
              {(confirmation.status === "loading" || plan.status === "loading") && <Spinner />}
              <CalendarCheckIcon aria-hidden />
              Confirm {included.size} procedures and build my plan
            </Button>
          )}
          {confirmation.status === "error" && <ErrorPanel title="Couldn't confirm these procedures" error={confirmation.error} onRetry={confirmAndPlan} />}
          {confirmation.status === "ready" && <IssueList issues={confirmation.data.issues} />}
        </div>
      )}

      <PreferenceEditor key={JSON.stringify(preferences)} initial={preferences} asOf={scenario.postvisit_as_of} onApply={applyPreferences} rebuilding={!!planRequest} disabled={plan.status === "loading" || confirmation.status === "loading"} issues={plan.status === "ready" ? plan.data.unresolved.filter((i) => i.field?.startsWith("member.budget") || i.field?.startsWith("member.travel") || i.field?.startsWith("member.availability")) : []} />
      {planRequest && <PrioritySelector value={mode} onChange={changeMode} disabled={plan.status === "loading"} />}
      {plan.status === "loading" && planRequest && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
          <Spinner /> Updating your care plan options…
        </p>
      )}
      {plan.status === "error" && <ErrorPanel title="Couldn't build a care plan" error={plan.error} onRetry={planRequest ? () => run(planRequest) : undefined} />}
      {planRequest && <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={plan.status === "loading" || lockHistory.length === 0} onClick={() => changeLocks(lockHistory[lockHistory.length - 1], lockHistory.slice(0, -1))}>Undo last change</Button>
        <Button variant="outline" disabled={plan.status === "loading" || !baseline || locks.length === 0} onClick={resetRecommended}>Reset to recommended</Button>
        <Button disabled={plan.status === "loading"} onClick={() => run({ ...planRequest, schedule_locks: locks })}>Re-optimize unlocked items</Button>
      </div>}
      {locks.length > 0 && <section aria-label="Pinned appointments" className="space-y-2 rounded-lg border p-4"><h3 className="font-semibold">Your plan · {locks.length} appointment{locks.length === 1 ? "" : "s"} pinned</h3>{locks.map((lock) => <div key={lock.procedure_id} className="flex flex-wrap items-center gap-2 text-sm"><span>{draft.find((p) => p.procedure_id === lock.procedure_id)?.description ?? lock.procedure_id} · {scenario.providers_postvisit.find((p) => p.provider_id === lock.provider_id)?.name ?? lock.provider_id} · {(() => { const slot = scenario.providers_postvisit.find((p) => p.provider_id === lock.provider_id)?.slots.items.find((s) => s.slot_id === lock.slot_id); return slot ? `${formatIsoDate(slot.date)} ${slot.start_time}-${slot.end_time}` : "Appointment details unavailable"; })()} · {CLAIM_ROUTE[lock.claim_route]}</span><Button size="sm" variant="outline" disabled={plan.status === "loading"} onClick={() => changeLocks(locks.filter((l) => l.procedure_id !== lock.procedure_id))}>Unpin appointment</Button></div>)}</section>}
      {plan.status === "ready" && planRequest && <PlanResult key={resultVersion} result={plan.data} request={planRequest} scenario={scenario} onPin={(event) => changeLocks([...locks.filter((l) => l.procedure_id !== event.procedure_id), { procedure_id: event.procedure_id, provider_id: event.provider_id, slot_id: event.slot_id, claim_route: event.claim_route }])} onUnpin={(event) => changeLocks(locks.filter((l) => l.procedure_id !== event.procedure_id))} baseline={locks.length > 0 ? baseline?.result : undefined} />}
    </section>
  );
}

function PlanResult({ result, request, scenario, onPin, onUnpin, baseline }: { result: CarePlanResult; request: CarePlanRequest; scenario: DemoScenario; onPin: (event: ScheduledEvent) => void; onUnpin: (event: ScheduledEvent) => void; baseline?: CarePlanResult }) {
  const [selected, setSelected] = useState(result.recommended_alternative_id ?? result.alternatives[0]?.alternative_id ?? "");
  const focus = result.alternatives.some((a) => a.alternative_id === selected) ? selected : null;
  const explain: ExplainRequest = { result_kind: "care_plan", request, focus_id: focus };

  return (
    <div className="space-y-5" aria-live="polite">
      <h3 className="text-base font-semibold">{request.schedule_locks?.length ? "Your plan options" : "Your care plan options"}</h3>
      {baseline && <details className="rounded-lg border p-4 text-sm"><summary className="cursor-pointer font-medium">Original recommended plan</summary>{baseline.alternatives.filter((a) => a.alternative_id === baseline.recommended_alternative_id).map((a) => <div key={a.alternative_id} className="mt-3 space-y-2"><p>You pay {formatRange(a.totals.member_cost)} · Plan pays {formatRange(a.totals.plan_pay)}</p>{a.events.map((e) => <p key={e.event_id}>{formatIsoDate(e.service_date)} · {request.procedures.find((p) => p.procedure_id === e.procedure_id)?.description ?? e.procedure_id} · {scenario.providers_postvisit.find((p) => p.provider_id === e.provider_id)?.name ?? e.provider_id} · {CLAIM_ROUTE[e.claim_route]}</p>)}</div>)}</details>}
      {result.status !== "OK" && <StatusChip status="needsReview" label={humanize(result.status)} />}
      <IssueList issues={result.unresolved} />
      {result.alternatives.length === 0 ? (
        <p className="text-sm text-muted-foreground">No schedule fits every dentist window. Check the dates above with your dentist.</p>
      ) : (
        <Tabs value={selected} onValueChange={setSelected} className="min-w-0">
          <TabsList className="grid w-full grid-cols-1 gap-2 group-data-horizontal/tabs:h-auto sm:grid-cols-3" style={{ width: "100%", height: "auto" }}>
            {result.alternatives.map((alt) => (
              <TabsTrigger key={alt.alternative_id} value={alt.alternative_id} className="h-auto min-w-0 max-w-full break-words whitespace-normal text-left" style={{ whiteSpace: "normal" }}>
                <span className="min-w-0 space-y-1">
                <span className="block">{alt.labels.map((l) => ALT_LABEL[l]).join(" · ")}
                {alt.alternative_id === result.recommended_alternative_id && (request.schedule_locks?.length ? " (your plan)" : " (recommended)")}
                </span>
                <span className="block text-xs font-normal">You pay {formatRange(alt.totals.member_cost)} · Peak month {formatCents(alt.objective.peak_monthly_cash_cents)} · {alt.objective.completion_date ? `Done ${formatIsoDate(alt.objective.completion_date)}` : "Care unscheduled"}</span>
                </span>
              </TabsTrigger>
            ))}
          </TabsList>
          {result.alternatives.map((alt) => (
            <TabsContent key={alt.alternative_id} value={alt.alternative_id} className="pt-4">
              <AlternativeView alt={alt} request={request} scenario={scenario} shared={result.unresolved} evidence={result.evidence} onPin={onPin} onUnpin={onUnpin} />
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
  onPin,
  onUnpin,
}: {
  alt: Alternative;
  request: CarePlanRequest;
  scenario: DemoScenario;
  shared: CarePlanResult["unresolved"];
  evidence: EvidenceIndexEntry[];
  onPin: (event: ScheduledEvent) => void;
  onUnpin: (event: ScheduledEvent) => void;
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

      <details className="rounded-lg border p-4 text-sm"><summary className="cursor-pointer font-medium">Full financial summary</summary><dl className="mt-3 grid gap-3 sm:grid-cols-2"><div><dt>Modeled charge</dt><dd>{formatRange(alt.totals.modeled_charge)}</dd></div><div><dt>Network discount / adjustment</dt><dd>{formatRange(alt.totals.contractual_adjustment)}</dd></div><div><dt>Fees</dt><dd>{formatCents(alt.totals.fees_cents)}</dd></div><div><dt>Funding gap</dt><dd>{formatCents(alt.funding_gap_cents)}</dd></div><div><dt>Highest monthly cash</dt><dd>{formatCents(alt.objective.peak_monthly_cash_cents)}</dd></div></dl></details>
      <ol className="relative space-y-6 border-l pl-6">
        {alt.events.map((event) => (
          <li key={event.event_id} className="relative">
            <span aria-hidden className="absolute top-1.5 -left-[1.95rem] size-3 rounded-full border-2 border-primary bg-background" />
            <EventView event={event} request={request} scenario={scenario} rollover={alt.rollover} evidence={evidence} state={alt.benefit_states.find((s) => s.event_id === event.event_id)?.state_after} issues={[...shared, ...alt.issues].filter((i) => i.procedure_id === event.procedure_id || (i.provider_id === event.provider_id && (i.procedure_id === null || i.procedure_id === event.procedure_id)))} onPin={onPin} onUnpin={onUnpin} />
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
              <li key={m.month} className="space-y-1"><div className="flex flex-wrap items-center gap-2">
                <span className="w-20 text-muted-foreground">{m.month}</span>
                <span className="tabular-nums">{formatCents(m.cash_cents)}</span>
                {m.exceeds_hard && <StatusChip status="conflict" label="Over your hard limit" />}
                {!m.exceeds_hard && m.exceeds_preferred && <StatusChip status="missing" label="Over your preferred limit" />}</div>
                <ul className="ml-3 space-y-1">{m.by_source.map((source) => <li key={source.source_type} className="text-muted-foreground">{source.source_type}: {formatCents(source.amount_cents)}</li>)}</ul>
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

function EventView({ event, request, scenario, rollover, evidence, state, issues, onPin, onUnpin }: { event: ScheduledEvent; request: CarePlanRequest; scenario: DemoScenario; rollover: RolloverOutcome[]; evidence: EvidenceIndexEntry[]; state: Alternative["benefit_states"][number]["state_after"] | undefined; issues: CarePlanResult["unresolved"]; onPin: (event: ScheduledEvent) => void; onUnpin: (event: ScheduledEvent) => void }) {
  const procedure = request.procedures.find((p) => p.procedure_id === event.procedure_id);
  const provider = scenario.providers_postvisit.find((p) => p.provider_id === event.provider_id);
  const slot = provider?.slots.items.find((s) => s.slot_id === event.slot_id);
  return <div className="space-y-3">
    <p className="text-sm text-muted-foreground">Service date: {formatIsoDate(event.service_date)}{slot && ` · ${slot.start_time}–${slot.end_time} (${scenario.member.time_zone})`}</p>
    <div className="flex flex-wrap items-center gap-2"><h4 className="font-semibold">{procedure?.description ?? event.procedure_id}</h4>{event.user_locked && <Badge>Pinned by you</Badge>}<Button size="sm" variant="outline" onClick={() => event.user_locked ? onUnpin(event) : onPin(event)}>{event.user_locked ? "Unpin appointment" : "Pin this appointment"}</Button></div>
    <p className="text-sm">{provider?.name ?? event.provider_id} · {CLAIM_ROUTE[event.claim_route]} · Location {event.location_id} · Slot {event.slot_id}</p>
    <p className="text-sm tabular-nums">Plan pays {formatRange(event.plan_pay)} · <span className="font-semibold">You pay {formatRange(event.member_cost)}</span></p>
    <div className="text-sm"><h5 className="font-medium">Payment schedule</h5>{event.funding.length === 0 && <p className="text-muted-foreground">No funding allocations returned.</p>}<ul className="mt-1 space-y-1">{event.funding.map((f) => <li key={f.allocation_id}>{f.source_type === "CASH" ? "Cash (monthly budget)" : scenario.member.funding_accounts.find((a) => a.source_id === f.source_id)?.label ?? humanize(f.source_type)} · Payment {formatIsoDate(f.payment_date)} · {formatCents(f.amount_cents)} · Fees {formatCents(f.fees_cents)}<span className="block break-all text-xs text-muted-foreground">Funding fact: {f.input_id}</span></li>)}</ul>{event.shortfall_cents > 0 && <p className="font-medium">Funding shortfall: {formatCents(event.shortfall_cents)}</p>}</div>
    <IssueList issues={issues} />
    <BenefitsAfterEvent state={state} />
    <EventCostBreakdown worst={event.line_worst} best={event.line_best} evidence={evidence} />
    {event.route_comparison && <RouteComparisonCard comparison={event.route_comparison} />}
    {event.rollover_shift && <RolloverShiftNote shift={event.rollover_shift} outcome={rollover.find((o) => o.closing_plan_version_id === event.rollover_shift?.closing_plan_version_id)} />}
    <ul className="flex flex-wrap gap-1.5">{event.reasons.map((r) => <li key={r}><Badge variant="outline" className="font-normal">{REASON[r]}</Badge></li>)}</ul>
    {event.next_actions.length > 0 && <div><p className="text-sm font-medium">Next actions: appointments are not booked</p><ul className="mt-2 space-y-2 text-sm">{event.next_actions.map((a, i) => <li key={i}><label className="flex items-start gap-2"><input type="checkbox" className="mt-1" />{ACTION[a.kind]}{a.by_date && ` by ${formatIsoDate(a.by_date)}`}</label></li>)}</ul></div>}
  </div>;
}
