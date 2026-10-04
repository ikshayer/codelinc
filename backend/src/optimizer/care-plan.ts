import {
  CONTRACT_VERSION,
  ENGINE_IDS,
  SEARCH_LIMITS,
  URGENCY_RANK,
  confirmedProcedureProblems,
  diffDays,
  issue,
  localDateOf,
  resolveMoney,
  yearMonthOf,
  type AdjudicationLine,
  type Alternative,
  type AlternativeDifference,
  type AlternativeLabel,
  type AppointmentSlot,
  type CarePlanRequest,
  type CarePlanResult,
  type ClaimEvent,
  type ClaimRoute,
  type DecisionTraceEntry,
  type FundingAllocation,
  type FundingSourceType,
  type Issue,
  type MonthlyRequirement,
  type NextAction,
  type ObjectiveVector,
  type PlanRegistry,
  type ProcedureRecommendation,
  type ProviderOption,
  type ReasonCode,
  type RecommendationMode,
  type RolloverShift,
  type RouteComparison,
  type ScheduledEvent,
  type SimulationResult,
  type SolverMeta,
} from "@/domain";
import type { BenefitEngine, CarePlanOptimizer } from "@/domain/ports";
import {
  amountRange,
  compareStrings,
  isMemberAvailable,
  providerClaimRoute,
  simulationIssues,
  slotCompare,
  uniqueIssues,
} from "./shared";

const alternativeLabelOrder: AlternativeLabel[] = [
  "lowest_total_cost",
  "earliest_safe_completion",
  "smoothest_monthly_payments",
];
/** Label order inside one alternative: the LOWEST_TOTAL_COST winner's own label first. */
const alternativeLabelDisplayOrder: AlternativeLabel[] = ["lowest_member_cost", ...alternativeLabelOrder];
/** (1.7) §4.1: the ranking key (= label) each mode recommends. */
const modeLabel: Record<RecommendationMode, AlternativeLabel> = {
  BALANCED: "lowest_total_cost",
  LOWEST_TOTAL_COST: "lowest_member_cost",
  EARLIEST_SAFE_COMPLETION: "earliest_safe_completion",
  SMOOTHEST_PAYMENTS: "smoothest_monthly_payments",
};
const DETERMINISTIC_TIE_BREAKER = "service dates, then provider ids, then claim routes, then slot ids, urgency-then-procedure-id order";
const reasonOrder: ReasonCode[] = [
  "WITHIN_SAFE_WINDOW",
  "MEETS_DENTIST_TARGET",
  "AFTER_DENTIST_TARGET",
  "EARLIEST_COMPATIBLE_SLOT",
  "HEALING_INTERVAL",
  "AFTER_PLAN_RESET",
  "BEFORE_PLAN_RESET",
  "USES_EXPIRING_FUNDS",
  "FITS_MONTHLY_BUDGET",
  "SELF_PAY_LOWER_PORTFOLIO_COST",
];
const actionOrder: NextAction["kind"][] = [
  "REQUEST_APPOINTMENT",
  "REQUEST_PRETREATMENT_ESTIMATE",
  "CONFIRM_SELF_PAY_WITH_OFFICE",
  "CONFIRM_MISSING_DATA",
  "CONTACT_DENTIST_NOW",
  "SUBMIT_FSA_CLAIM",
];
const fundingTypeOrder: FundingSourceType[] = ["CASH", "FSA", "HRA", "HSA", "PROVIDER_PLAN", "FINANCING"];

interface Candidate {
  procedure: ProcedureRecommendation;
  provider: ProviderOption;
  slot: AppointmentSlot;
  route: ClaimRoute;
}

interface FundingResult {
  byEvent: Map<string, { allocations: FundingAllocation[]; shortfall: number }>;
  monthly: MonthlyRequirement[];
  gap: number;
  expiringUnused: number;
  fees: number;
  issues: Issue[];
}

interface EvaluatedSchedule {
  picks: Map<string, Candidate | null>;
  activeProcedures: ProcedureRecommendation[];
  scheduleKey: string;
  simulation: SimulationResult;
  funding: FundingResult;
  objective: ObjectiveVector;
  tieKey: string[];
  unscheduled: Alternative["unscheduled"];
}

function emptyResult(
  request: CarePlanRequest,
  asOfDate: string,
  status: CarePlanResult["status"],
  unresolved: Issue[],
  trace: DecisionTraceEntry[],
  stats: CarePlanResult["search_stats"] = { candidates_built: 0, schedules_evaluated: 0, schedules_feasible: 0, pass: 1 },
  boundsApplied: string[] = [],
): CarePlanResult {
  return {
    contract_version: CONTRACT_VERSION,
    engine_id: ENGINE_IDS.optimizer,
    status,
    as_of: request.as_of,
    as_of_date: asOfDate,
    recommended_alternative_id: null,
    mode: request.preferences?.mode ?? "BALANCED",
    alternatives: [],
    evidence: [],
    unresolved: uniqueIssues(unresolved),
    decision_trace: trace,
    search_stats: stats,
    solver_meta: solverMeta("NO_FEASIBLE_SOLUTION", stats, boundsApplied),
  };
}

function solverMeta(status: SolverMeta["status"], stats: CarePlanResult["search_stats"], boundsApplied: string[]): SolverMeta {
  return {
    status,
    candidates_built: stats.candidates_built,
    schedules_evaluated: stats.schedules_evaluated,
    schedules_rejected: stats.schedules_evaluated - stats.schedules_feasible,
    elapsed_ms: null,
    deterministic_tie_breaker: DETERMINISTIC_TIE_BREAKER,
    bounds_applied: boundsApplied,
  };
}

function domainProblems(request: CarePlanRequest): Issue[] {
  const problems: Issue[] = [];
  const ids = new Set(request.procedures.map((procedure) => procedure.procedure_id));
  const locked = new Set<string>();
  const lockedAppointments = new Set<string>();
  for (const lock of request.schedule_locks ?? []) {
    if (!ids.has(lock.procedure_id)) {
      problems.push(issue("SCHEMA_INVALID", "blocking", "A schedule lock names an unknown procedure.", { procedure_id: lock.procedure_id, field: "schedule_locks" }));
    }
    if (locked.has(lock.procedure_id)) {
      problems.push(issue("SCHEMA_INVALID", "blocking", "A procedure can have only one schedule lock.", { procedure_id: lock.procedure_id, field: "schedule_locks" }));
    }
    locked.add(lock.procedure_id);
    const appointmentKey = `${lock.provider_id}\u0000${lock.slot_id}`;
    if (lockedAppointments.has(appointmentKey)) {
      problems.push(issue("SCHEMA_INVALID", "blocking", "A provider appointment can be locked to only one procedure.", { procedure_id: lock.procedure_id, provider_id: lock.provider_id, field: "schedule_locks" }));
    }
    lockedAppointments.add(appointmentKey);
    const provider = request.providers.find((value) => value.provider_id === lock.provider_id);
    if (!provider || !provider.slots.items.some((slot) => slot.slot_id === lock.slot_id)) {
      problems.push(issue("SCHEMA_INVALID", "blocking", "A schedule lock names an unknown provider appointment.", { procedure_id: lock.procedure_id, provider_id: lock.provider_id, field: "schedule_locks" }));
    }
  }
  const adjacency = new Map<string, string[]>();
  for (const procedure of request.procedures) {
    adjacency.set(procedure.procedure_id, procedure.dependencies.map((dependency) => dependency.depends_on));
    for (const dependency of procedure.dependencies) {
      if (!ids.has(dependency.depends_on)) {
        problems.push(
          issue("DEPENDENCY_INVALID", "blocking", "A procedure depends on an unknown procedure.", {
            procedure_id: procedure.procedure_id,
            field: "procedures.dependencies",
          }),
        );
      }
    }
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): boolean => {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    for (const dependency of adjacency.get(id) ?? []) if (ids.has(dependency) && visit(dependency)) return true;
    visiting.delete(id);
    visited.add(id);
    return false;
  };
  if ([...ids].sort(compareStrings).some(visit)) {
    problems.push(issue("DEPENDENCY_INVALID", "blocking", "Procedure dependencies contain a cycle.", { field: "procedures.dependencies" }));
  }

  const latest = request.procedures
    .map((procedure) => procedure.latest_safe_date)
    .filter((value): value is string => value !== null)
    .sort(compareStrings)
    .at(-1);
  if (latest && request.planning_horizon_end < latest) {
    problems.push(
      issue("SCHEMA_INVALID", "blocking", "The planning horizon ends before a dentist-confirmed latest safe date.", {
        field: "planning_horizon_end",
      }),
    );
  }
  if (request.procedures.length > SEARCH_LIMITS.max_procedures) {
    problems.push(issue("SCHEMA_INVALID", "blocking", "Too many procedures for the bounded MVP search.", { field: "procedures" }));
  }
  if (request.providers.length > SEARCH_LIMITS.max_providers) {
    problems.push(issue("SCHEMA_INVALID", "blocking", "Too many providers for the bounded MVP search.", { field: "providers" }));
  }
  for (const provider of request.providers) {
    if (provider.slots.items.length > SEARCH_LIMITS.max_slots_per_provider) {
      problems.push(
        issue("SCHEMA_INVALID", "blocking", "A provider has too many appointment slots for the bounded MVP search.", {
          provider_id: provider.provider_id,
          field: "providers.slots.items",
        }),
      );
    }
  }
  return uniqueIssues(problems);
}

function topologicalOrder(procedures: ProcedureRecommendation[]): ProcedureRecommendation[] {
  const byId = new Map(procedures.map((procedure) => [procedure.procedure_id, procedure]));
  const done = new Set<string>();
  const output: ProcedureRecommendation[] = [];
  const visit = (procedure: ProcedureRecommendation) => {
    if (done.has(procedure.procedure_id)) return;
    for (const dependency of [...procedure.dependencies].sort((a, b) => compareStrings(a.depends_on, b.depends_on))) {
      const predecessor = byId.get(dependency.depends_on);
      if (predecessor) visit(predecessor);
    }
    done.add(procedure.procedure_id);
    output.push(procedure);
  };
  [...procedures]
    .sort((a, b) => URGENCY_RANK[a.urgency!] - URGENCY_RANK[b.urgency!] || compareStrings(a.procedure_id, b.procedure_id))
    .forEach(visit);
  return output;
}

function buildCandidates(request: CarePlanRequest): Map<string, Candidate[]> {
  const asOfDate = localDateOf(request.as_of, request.member.time_zone);
  const map = new Map<string, Candidate[]>();
  for (const procedure of [...request.procedures].sort((a, b) => compareStrings(a.procedure_id, b.procedure_id))) {
    const candidates: Candidate[] = [];
    if (!procedure.cdt_code || !procedure.earliest_safe_date || !procedure.latest_safe_date) {
      map.set(procedure.procedure_id, candidates);
      continue;
    }
    const latest = procedure.latest_safe_date < request.planning_horizon_end ? procedure.latest_safe_date : request.planning_horizon_end;
    for (const provider of [...request.providers].sort((a, b) => compareStrings(a.provider_id, b.provider_id))) {
      if (!procedure.allowed_specialties.includes(provider.specialty)) continue;
      if (provider.travel.distance_miles > request.member.travel.hard_max_miles) continue;
      const price = provider.pricing.find((row) => row.cdt_code === procedure.cdt_code);
      for (const slot of [...provider.slots.items].sort(slotCompare)) {
        if (slot.kind !== "treatment" || slot.date <= asOfDate) continue;
        if (slot.date < procedure.earliest_safe_date || slot.date > latest) continue;
        if (!isMemberAvailable(request.member, slot)) continue;
        candidates.push({ procedure, provider, slot, route: providerClaimRoute(provider) });
        if (price?.cash_quote !== null && price?.cash_quote !== undefined) {
          candidates.push({ procedure, provider, slot, route: "SELF_PAY_NO_CLAIM" });
        }
      }
    }
    candidates.sort(
      (a, b) =>
        compareStrings(a.slot.date, b.slot.date) ||
        compareStrings(a.slot.start_time, b.slot.start_time) ||
        compareStrings(a.provider.provider_id, b.provider.provider_id) ||
        compareStrings(a.slot.slot_id, b.slot.slot_id) ||
        compareStrings(a.route, b.route),
    );
    const lock = (request.schedule_locks ?? []).find((value) => value.procedure_id === procedure.procedure_id);
    map.set(
      procedure.procedure_id,
      lock
        ? candidates.filter(
            (candidate) =>
              candidate.provider.provider_id === lock.provider_id &&
              candidate.slot.slot_id === lock.slot_id &&
              candidate.route === lock.claim_route,
          )
        : candidates,
    );
  }
  return map;
}

function dependenciesSatisfied(picks: Map<string, Candidate | null>, procedures: ProcedureRecommendation[]): boolean {
  for (const procedure of procedures) {
    const current = picks.get(procedure.procedure_id) ?? null;
    if (!current) continue;
    for (const dependency of procedure.dependencies) {
      const predecessor = picks.get(dependency.depends_on) ?? null;
      if (!predecessor) return false;
      const gap = diffDays(predecessor.slot.date, current.slot.date);
      if (gap < dependency.min_gap_days || (dependency.max_gap_days !== null && gap > dependency.max_gap_days)) return false;
    }
  }
  return true;
}

function chronologicalCandidates(picks: Map<string, Candidate | null>): Candidate[] {
  return [...picks.values()]
    .filter((candidate): candidate is Candidate => candidate !== null)
    .sort(
      (a, b) =>
        compareStrings(a.slot.date, b.slot.date) ||
        compareStrings(a.slot.start_time, b.slot.start_time) ||
        compareStrings(a.procedure.procedure_id, b.procedure.procedure_id),
    );
}

function claimEvents(candidates: Candidate[], prefix: string): ClaimEvent[] {
  return candidates.map((candidate, index) => ({
    event_id: `${prefix}-e${index + 1}`,
    procedure_id: candidate.procedure.procedure_id,
    cdt_code: candidate.procedure.cdt_code!,
    tooth: candidate.procedure.tooth,
    service_date: candidate.slot.date,
    claim_date: null,
    provider_id: candidate.provider.provider_id,
    claim_route: candidate.route,
  }));
}

function unscheduledVector(
  procedures: readonly ProcedureRecommendation[],
  picks: ReadonlyMap<string, Candidate | null>,
): [number, number, number] {
  const result: [number, number, number] = [0, 0, 0];
  for (const procedure of procedures) {
    if (!picks.get(procedure.procedure_id)) result[URGENCY_RANK[procedure.urgency!]] += 1;
  }
  return result;
}

function compareNumberVectors(a: readonly number[], b: readonly number[]): number {
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

function sameStringVector(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

/**
 * Worst-case whole-schedule member total with the event at `index` switched to `route` (everything else unchanged).
 * `total` is null when any line is not OK/NOT_COVERED; `issues` then explain why.
 */
function simulateWithRoute(
  benefits: BenefitEngine,
  registry: PlanRegistry,
  request: CarePlanRequest,
  candidates: Candidate[],
  index: number,
  route: ClaimRoute,
  prefix: string,
): { total: number | null; issues: Issue[] } {
  const switched = candidates.map((value, candidateIndex) => (candidateIndex === index ? { ...value, route } : value));
  const simulation = benefits.simulate(registry, {
    as_of: request.as_of,
    scenario: "worst_case",
    member: request.member,
    providers: request.providers,
    events: claimEvents(switched, prefix),
  });
  if (
    simulation.status !== "OK" ||
    simulation.totals === null ||
    simulation.lines.some((line) => line.status !== "OK" && line.status !== "NOT_COVERED")
  ) {
    return { total: null, issues: simulationIssues(simulation) };
  }
  return { total: simulation.totals.member_responsibility_cents, issues: [] };
}

function selfPayIsStrictlyCheaper(
  benefits: BenefitEngine,
  registry: PlanRegistry,
  request: CarePlanRequest,
  candidates: Candidate[],
  selfPaySimulation: SimulationResult,
): { eligible: boolean; issues: Issue[] } {
  const selfPayTotal = selfPaySimulation.totals?.member_responsibility_cents;
  if (selfPayTotal === null || selfPayTotal === undefined) return { eligible: false, issues: simulationIssues(selfPaySimulation) };
  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index]!;
    if (candidate.route !== "SELF_PAY_NO_CLAIM") continue;
    const claim = simulateWithRoute(benefits, registry, request, candidates, index, providerClaimRoute(candidate.provider), "eval-claim");
    if (claim.total === null) return { eligible: false, issues: uniqueIssues(claim.issues) };
    if (claim.total <= selfPayTotal) return {
      eligible: false,
      issues: (request.schedule_locks ?? []).some((lock) => lock.procedure_id === candidate.procedure.procedure_id)
        ? [issue("CLAIM_ROUTE_INVALID", "blocking", "The pinned direct-payment route is no longer cheaper across the full care plan. Unpin this appointment to compare eligible claim routes.", {
            procedure_id: candidate.procedure.procedure_id, provider_id: candidate.provider.provider_id, field: "schedule_locks",
          })]
        : [],
    };
  }
  return { eligible: true, issues: [] };
}

/** (1.2) CONTRACT §5.9: cash vs claim for one event over the whole schedule, worst case. Not a ranking input. */
function routeComparison(
  benefits: BenefitEngine,
  registry: PlanRegistry,
  request: CarePlanRequest,
  candidates: Candidate[],
  index: number,
  prefix: string,
): RouteComparison | null {
  const candidate = candidates[index]!;
  const price = candidate.provider.pricing.find((row) => row.cdt_code === candidate.procedure.cdt_code);
  if (price?.cash_quote === null || price?.cash_quote === undefined) return null;
  const claimRoute = providerClaimRoute(candidate.provider);
  const claim = simulateWithRoute(benefits, registry, request, candidates, index, claimRoute, prefix);
  const cash = simulateWithRoute(benefits, registry, request, candidates, index, "SELF_PAY_NO_CLAIM", prefix);
  const known = claim.total !== null && cash.total !== null;
  return {
    claim_route: claimRoute,
    claim_total_cents: claim.total,
    cash_total_cents: cash.total,
    difference_cents: known ? Math.abs(claim.total! - cash.total!) : null,
    winner_claim_route: known ? (cash.total! < claim.total! ? "SELF_PAY_NO_CLAIM" : claimRoute) : null,
    missing: uniqueIssues([claim, cash].flatMap(missingIssues)),
  };
}

/**
 * (1.5) CONTRACT §5.10: what moving this flexible event into the next plan year would do to the closing
 * year's carryover. Display only: never a ranking input, never for time-sensitive care.
 */
function rolloverShift(
  benefits: BenefitEngine,
  registry: PlanRegistry,
  request: CarePlanRequest,
  allCandidates: Map<string, Candidate[]>,
  candidates: Candidate[],
  index: number,
  prefix: string,
  worst: SimulationResult,
): RolloverShift | null {
  const candidate = candidates[index]!;
  const line = worst.lines[index]!;
  if (candidate.procedure.urgency !== "can_plan_later") return null;
  if (line.status !== "OK" || line.counts_toward_maximum !== true || (line.plan_pay_cents ?? 0) <= 0) return null;
  const outcome = worst.rollover.find(
    (value) => value.closing_plan_version_id === line.plan_version_id && (value.status === "NOT_EARNED" || value.status === "UNCERTAIN"),
  );
  if (!outcome?.next_plan_version_id || worst.totals === null) return null;
  const usedSlots = new Set(
    candidates.filter((_, other) => other !== index).map((value) => `${value.provider.provider_id}@${value.slot.slot_id}`),
  );
  const picks = new Map(candidates.map((value) => [value.procedure.procedure_id, value] as [string, Candidate | null]));
  const moved = (allCandidates.get(candidate.procedure.procedure_id) ?? []).find((option) => {
    if (option.provider.provider_id !== candidate.provider.provider_id || option.route !== candidate.route) return false;
    if (usedSlots.has(`${option.provider.provider_id}@${option.slot.slot_id}`)) return false;
    const plan = benefits.resolvePlanVersion(registry, request.member.plan_key, option.slot.date);
    if (!plan.ok || plan.plan.plan_version_id !== outcome.next_plan_version_id) return false;
    return dependenciesSatisfied(new Map(picks).set(candidate.procedure.procedure_id, option), request.procedures);
  });
  if (!moved) return null;
  const simulation = benefits.simulate(registry, {
    as_of: request.as_of,
    scenario: "worst_case",
    member: request.member,
    providers: request.providers,
    events: claimEvents(chronologicalCandidates(new Map(picks).set(candidate.procedure.procedure_id, moved)), `${prefix}-shift`),
  });
  const after = simulation.rollover.find((value) => value.closing_plan_version_id === outcome.closing_plan_version_id);
  if (
    simulation.status !== "OK" ||
    simulation.totals === null ||
    !after?.final_bank ||
    after.status === outcome.status ||
    !(after.status === "CONDITIONAL" || after.status === "EARNED" || after.status === "UNCERTAIN")
  ) {
    return null;
  }
  return {
    closing_plan_version_id: outcome.closing_plan_version_id,
    moved_to_date: moved.slot.date,
    moved_to_slot_id: moved.slot.slot_id,
    plan_pay_in_closing_period_cents: line.plan_pay_cents!,
    status_if_moved: after.status,
    final_bank_if_moved: after.final_bank,
    member_cost_delta_cents: simulation.totals.member_responsibility_cents - worst.totals.member_responsibility_cents,
  };
}

/** Why a version is unknown: its blocking issues, or all of its issues if none blocks; as warnings. */
function missingIssues(version: { total: number | null; issues: Issue[] }): Issue[] {
  if (version.total !== null) return [];
  const blocking = version.issues.filter((value) => value.severity === "blocking");
  return (blocking.length ? blocking : version.issues).map((value) => ({ ...value, severity: "warning" as const }));
}

function allocateFunding(request: CarePlanRequest, candidates: Candidate[], lines: AdjudicationLine[]): FundingResult {
  const accountRemaining = new Map<string, number>();
  const fundingIssues: Issue[] = [];
  for (const account of [...request.member.funding_accounts].sort((a, b) => compareStrings(a.source_id, b.source_id))) {
    const balance = resolveMoney(account.balance.value, "worst_case", "higher_is_better");
    if (balance === null) {
      fundingIssues.push(
        issue("INPUT_MISSING", "warning", "A funding balance is unknown and was not allocated.", { input_id: account.balance.input_id }),
      );
    }
    accountRemaining.set(account.source_id, balance ?? 0);
  }
  const cashByMonth = new Map<string, number>();
  const byEvent = new Map<string, { allocations: FundingAllocation[]; shortfall: number }>();
  const usedByAccount = new Map<string, number>();
  let gap = 0;
  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index]!;
    const line = lines[index]!;
    let remaining = line.member_responsibility_cents ?? 0;
    const allocations: FundingAllocation[] = [];
    let allocationIndex = 1;
    const add = (sourceId: string, sourceType: FundingSourceType, amount: number, inputId: string) => {
      if (amount <= 0) return;
      allocations.push({
        allocation_id: `${line.event_id}-f${allocationIndex++}`,
        event_id: line.event_id,
        source_id: sourceId,
        source_type: sourceType,
        payment_date: candidate.slot.date,
        amount_cents: amount,
        fees_cents: 0,
        input_id: inputId,
      });
      remaining -= amount;
    };
    const restricted = [...request.member.funding_accounts]
      .filter((account) => account.type === "FSA" || account.type === "HRA")
      .filter(
        (account) =>
          account.eligible_service_from <= candidate.slot.date &&
          (account.eligible_service_through === null || candidate.slot.date <= account.eligible_service_through),
      )
      .sort(
        (a, b) =>
          compareStrings(a.eligible_service_through ?? "9999-12-31", b.eligible_service_through ?? "9999-12-31") ||
          compareStrings(a.source_id, b.source_id),
      );
    for (const account of restricted) {
      const available = accountRemaining.get(account.source_id) ?? 0;
      const amount = Math.min(remaining, available);
      add(account.source_id, account.type, amount, account.balance.input_id);
      accountRemaining.set(account.source_id, available - amount);
      usedByAccount.set(account.source_id, (usedByAccount.get(account.source_id) ?? 0) + amount);
    }
    const month = yearMonthOf(candidate.slot.date);
    const cashUsed = cashByMonth.get(month) ?? 0;
    const cashAvailable = Math.max(0, request.member.budget.hard_monthly_limit_cents - cashUsed);
    const cash = Math.min(remaining, cashAvailable);
    add("cash", "CASH", cash, request.member.budget.input_id);
    cashByMonth.set(month, cashUsed + cash);

    const hsas = [...request.member.funding_accounts]
      .filter((account) => account.type === "HSA")
      .sort((a, b) => compareStrings(a.source_id, b.source_id));
    for (const account of hsas) {
      const available = Math.max(0, (accountRemaining.get(account.source_id) ?? 0) - account.reserve_cents);
      const amount = Math.min(remaining, available);
      add(account.source_id, "HSA", amount, account.balance.input_id);
      accountRemaining.set(account.source_id, (accountRemaining.get(account.source_id) ?? 0) - amount);
      usedByAccount.set(account.source_id, (usedByAccount.get(account.source_id) ?? 0) + amount);
    }
    for (const plan of candidate.provider.payment_plans.filter((value) => value.verified)) {
      fundingIssues.push(
        issue("FUNDING_SOURCE_INELIGIBLE", "info", "A verified office payment plan is not modeled in MVP v1.", {
          input_id: plan.input_id,
          provider_id: candidate.provider.provider_id,
        }),
      );
    }
    gap += remaining;
    byEvent.set(line.event_id, { allocations, shortfall: remaining });
  }

  const monthlyMap = new Map<string, Map<FundingSourceType, number>>();
  for (const value of byEvent.values()) {
    for (const allocation of value.allocations) {
      const month = yearMonthOf(allocation.payment_date);
      const sources = monthlyMap.get(month) ?? new Map<FundingSourceType, number>();
      sources.set(allocation.source_type, (sources.get(allocation.source_type) ?? 0) + allocation.amount_cents);
      monthlyMap.set(month, sources);
    }
  }
  const monthly = [...monthlyMap]
    .sort(([a], [b]) => compareStrings(a, b))
    .map(([month, sources]) => {
      const cash = sources.get("CASH") ?? 0;
      return {
        month,
        cash_cents: cash,
        by_source: [...sources]
          .sort(([a], [b]) => fundingTypeOrder.indexOf(a) - fundingTypeOrder.indexOf(b))
          .map(([source_type, amount_cents]) => ({ source_type, amount_cents })),
        exceeds_preferred: cash > request.member.budget.preferred_monthly_limit_cents,
        exceeds_hard: cash > request.member.budget.hard_monthly_limit_cents,
      };
    });
  const expiringUnused = request.member.funding_accounts
    .filter(
      (account) =>
        (account.type === "FSA" || account.type === "HRA") &&
        account.eligible_service_through !== null &&
        account.eligible_service_through <= request.planning_horizon_end,
    )
    .reduce((sum, account) => {
      const initial = resolveMoney(account.balance.value, "worst_case", "higher_is_better") ?? 0;
      return sum + Math.max(0, initial - (usedByAccount.get(account.source_id) ?? 0));
    }, 0);
  return { byEvent, monthly, gap, expiringUnused, fees: 0, issues: uniqueIssues(fundingIssues) };
}

function scheduleKey(picks: Map<string, Candidate | null>, activeProcedures: ProcedureRecommendation[]): string {
  return [...activeProcedures]
    .sort((a, b) => compareStrings(a.procedure_id, b.procedure_id))
    .map((procedure) => {
      const candidate = picks.get(procedure.procedure_id);
      return candidate
        ? `${procedure.procedure_id}@${candidate.slot.date}@${candidate.provider.provider_id}@${candidate.route}`
        : `${procedure.procedure_id}@unscheduled`;
    })
    .join("|");
}

function objectiveFor(
  request: CarePlanRequest,
  activeProcedures: ProcedureRecommendation[],
  picks: Map<string, Candidate | null>,
  simulation: SimulationResult,
  funding: FundingResult,
): { objective: ObjectiveVector; tieKey: string[]; unscheduled: Alternative["unscheduled"] } {
  const unscheduledByUrgency: [number, number, number] = [0, 0, 0];
  const latenessByUrgency: [number, number, number] = [0, 0, 0];
  const unscheduled: Alternative["unscheduled"] = [];
  for (const procedure of activeProcedures) {
    const rank = URGENCY_RANK[procedure.urgency!];
    const candidate = picks.get(procedure.procedure_id) ?? null;
    if (!candidate) {
      unscheduledByUrgency[rank] += 1;
      unscheduled.push({
        procedure_id: procedure.procedure_id,
        reason: "DEPENDENCY_INVALID",
        message: "No compatible complete schedule could place this procedure.",
      });
    } else {
      latenessByUrgency[rank] += Math.max(0, diffDays(procedure.target_date!, candidate.slot.date));
    }
  }
  const candidates = chronologicalCandidates(picks);
  const distinctVisits = new Map<string, ProviderOption>();
  for (const candidate of candidates) distinctVisits.set(`${candidate.provider.provider_id}@${candidate.slot.date}`, candidate.provider);
  const dates = [...new Set(candidates.map((candidate) => candidate.slot.date))].sort(compareStrings);
  const memberCost = simulation.totals?.member_responsibility_cents ?? 0;
  const objective: ObjectiveVector = {
    unscheduled_by_urgency: unscheduledByUrgency,
    lateness_days_by_urgency: latenessByUrgency,
    funding_shortfall_cents: funding.gap,
    total_member_cost_cents: memberCost + funding.fees,
    total_fees_cents: funding.fees,
    peak_monthly_cash_cents: Math.max(0, ...funding.monthly.map((month) => month.cash_cents)),
    travel_minutes_total: [...distinctVisits.values()].reduce((sum, provider) => sum + provider.travel.travel_minutes, 0),
    visit_days: dates.length,
    wait_days_total: candidates.reduce(
      (sum, candidate) => sum + diffDays(localDateOf(request.as_of, request.member.time_zone), candidate.slot.date),
      0,
    ),
    expiring_funds_unused_cents: funding.expiringUnused,
    completion_date: dates.at(-1) ?? null,
  };
  const tieProcedures = [...activeProcedures].sort(
    (a, b) => URGENCY_RANK[a.urgency!] - URGENCY_RANK[b.urgency!] || compareStrings(a.procedure_id, b.procedure_id),
  );
  const tieKey = [
    ...tieProcedures.map((procedure) => picks.get(procedure.procedure_id)?.slot.date ?? "9999-12-31"),
    ...tieProcedures.map((procedure) => picks.get(procedure.procedure_id)?.provider.provider_id ?? ""),
    ...tieProcedures.map((procedure) => picks.get(procedure.procedure_id)?.route ?? ""),
    ...tieProcedures.map((procedure) => picks.get(procedure.procedure_id)?.slot.slot_id ?? ""),
  ];
  return { objective, tieKey, unscheduled };
}

function flatObjectivePrefix(objective: ObjectiveVector): (number | string)[] {
  return [
    ...objective.unscheduled_by_urgency,
    ...objective.lateness_days_by_urgency,
    objective.funding_shortfall_cents,
  ];
}

function rankingKey(schedule: EvaluatedSchedule, label: AlternativeLabel): (number | string)[] {
  const objective = schedule.objective;
  const commonEnd = [
    objective.travel_minutes_total,
    objective.visit_days,
    objective.wait_days_total,
    objective.expiring_funds_unused_cents,
    ...schedule.tieKey,
  ];
  if (label === "lowest_member_cost") {
    return [
      ...objective.unscheduled_by_urgency,
      objective.funding_shortfall_cents,
      objective.total_member_cost_cents,
      ...objective.lateness_days_by_urgency,
      objective.peak_monthly_cash_cents,
      ...commonEnd,
    ];
  }
  if (label === "earliest_safe_completion") {
    return [
      ...flatObjectivePrefix(objective),
      objective.completion_date ?? "9999-12-31",
      objective.total_member_cost_cents,
      objective.peak_monthly_cash_cents,
      ...commonEnd,
    ];
  }
  if (label === "smoothest_monthly_payments") {
    return [
      ...flatObjectivePrefix(objective),
      objective.peak_monthly_cash_cents,
      objective.total_member_cost_cents,
      ...commonEnd,
    ];
  }
  return [
    ...flatObjectivePrefix(objective),
    objective.total_member_cost_cents,
    objective.peak_monthly_cash_cents,
    ...commonEnd,
  ];
}

function compareKeys(a: (number | string)[], b: (number | string)[]): number {
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const left = a[index];
    const right = b[index];
    if (left === right) continue;
    if (typeof left === "number" && typeof right === "number") return left - right;
    return compareStrings(String(left ?? ""), String(right ?? ""));
  }
  return 0;
}

function pretreatmentAction(
  benefits: BenefitEngine,
  registry: PlanRegistry,
  request: CarePlanRequest,
  candidate: Candidate,
  line: AdjudicationLine,
): NextAction | null {
  if (candidate.route === "SELF_PAY_NO_CLAIM" || line.patient_charge_cents === null) return null;
  const resolution = benefits.resolvePlanVersion(registry, request.member.plan_key, candidate.slot.date);
  if (!resolution.ok) return null;
  const rule = resolution.plan.rules.find((value) => value.rule_type === "pretreatment_estimate");
  if (rule?.rule_type !== "pretreatment_estimate" || rule.status !== "VERIFIED" || !rule.value) return null;
  return line.patient_charge_cents > rule.value.recommended_above_cents
    ? { kind: "REQUEST_PRETREATMENT_ESTIMATE", provider_id: candidate.provider.provider_id, slot_id: candidate.slot.slot_id, by_date: null }
    : null;
}

function eventReasons(
  benefits: BenefitEngine,
  registry: PlanRegistry,
  request: CarePlanRequest,
  allCandidates: Map<string, Candidate[]>,
  candidate: Candidate,
  allocations: FundingAllocation[],
): ReasonCode[] {
  const procedureCandidates = allCandidates.get(candidate.procedure.procedure_id) ?? [];
  const reasons: ReasonCode[] = ["WITHIN_SAFE_WINDOW"];
  reasons.push(candidate.slot.date <= candidate.procedure.target_date! ? "MEETS_DENTIST_TARGET" : "AFTER_DENTIST_TARGET");
  const earliestDate = procedureCandidates.map((value) => value.slot.date).sort(compareStrings)[0];
  if (earliestDate === candidate.slot.date) reasons.push("EARLIEST_COMPATIBLE_SLOT");
  if (candidate.procedure.dependencies.length) reasons.push("HEALING_INTERVAL");
  if (earliestDate) {
    const earliestPlan = benefits.resolvePlanVersion(registry, request.member.plan_key, earliestDate);
    const chosenPlan = benefits.resolvePlanVersion(registry, request.member.plan_key, candidate.slot.date);
    if (earliestPlan.ok && chosenPlan.ok && earliestPlan.plan.plan_version_id !== chosenPlan.plan.plan_version_id) reasons.push("AFTER_PLAN_RESET");
  }
  const chosenPlan = benefits.resolvePlanVersion(registry, request.member.plan_key, candidate.slot.date);
  if (
    chosenPlan.ok &&
    procedureCandidates.some((other) => {
      if (other.slot.date <= candidate.slot.date) return false;
      const later = benefits.resolvePlanVersion(registry, request.member.plan_key, other.slot.date);
      return later.ok && later.plan.plan_version_id !== chosenPlan.plan.plan_version_id;
    })
  ) {
    reasons.push("BEFORE_PLAN_RESET");
  }
  if (allocations.some((allocation) => allocation.source_type === "FSA" || allocation.source_type === "HRA")) {
    reasons.push("USES_EXPIRING_FUNDS");
  }
  if (allocations.some((allocation) => allocation.source_type === "CASH")) reasons.push("FITS_MONTHLY_BUDGET");
  if (candidate.route === "SELF_PAY_NO_CLAIM") reasons.push("SELF_PAY_LOWER_PORTFOLIO_COST");
  return [...new Set(reasons)].sort((a, b) => reasonOrder.indexOf(a) - reasonOrder.indexOf(b));
}

function formatDollars(cents: number): string {
  const dollars = cents / 100;
  const whole = Number.isInteger(dollars);
  return `$${dollars.toLocaleString("en-US", { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 })}`;
}

/**
 * (1.7) §6.5: same-day claims are processed in (service_date, event_id) order, which can change who
 * absorbs the deductible or the annual maximum. For each date with 2+ claim events, re-simulate that
 * date's claim events in reverse order and warn when the worst-case member total differs.
 */
function sameDayOrderIssues(
  benefits: BenefitEngine,
  registry: PlanRegistry,
  request: CarePlanRequest,
  events: ClaimEvent[],
  memberTotalCents: number,
  prefix: string,
): Issue[] {
  const claimIndexesByDate = new Map<string, number[]>();
  events.forEach((event, index) => {
    if (event.claim_route === "SELF_PAY_NO_CLAIM") return;
    claimIndexesByDate.set(event.service_date, [...(claimIndexesByDate.get(event.service_date) ?? []), index]);
  });
  const issues: Issue[] = [];
  for (const [, indexes] of [...claimIndexesByDate].sort(([a], [b]) => compareStrings(a, b))) {
    if (indexes.length < 2) continue;
    const reordered = [...events];
    indexes.forEach((eventIndex, position) => {
      reordered[eventIndex] = events[indexes[indexes.length - 1 - position]!]!;
    });
    const simulation = benefits.simulate(registry, {
      as_of: request.as_of,
      scenario: "worst_case",
      member: request.member,
      providers: request.providers,
      events: reordered.map((event, index) => ({ ...event, event_id: `${prefix}-o${String(index + 1).padStart(2, "0")}` })),
    });
    const otherTotal = simulation.totals?.member_responsibility_cents;
    if (otherTotal === undefined || otherTotal === memberTotalCents) continue;
    issues.push(
      issue(
        "SAME_DAY_ORDER_AFFECTS_COST",
        "warning",
        `The order the plan processes same-day claims changes your cost: ${formatDollars(memberTotalCents)} in this order, ${formatDollars(otherTotal)} in the other.`,
        { procedure_id: events[indexes[0]!]!.procedure_id },
      ),
    );
  }
  return issues;
}

function finalAlternative(
  benefits: BenefitEngine,
  registry: PlanRegistry,
  request: CarePlanRequest,
  allCandidates: Map<string, Candidate[]>,
  schedule: EvaluatedSchedule,
  alternativeId: string,
  labels: AlternativeLabel[],
): Alternative {
  const candidates = chronologicalCandidates(schedule.picks);
  const events = claimEvents(candidates, alternativeId);
  const worst = benefits.simulate(registry, {
    as_of: request.as_of,
    scenario: "worst_case",
    member: request.member,
    providers: request.providers,
    events,
  });
  const best = benefits.simulate(registry, {
    as_of: request.as_of,
    scenario: "best_case",
    member: request.member,
    providers: request.providers,
    events,
  });
  const funding = allocateFunding(request, candidates, worst.lines);
  const recalculated = objectiveFor(request, schedule.activeProcedures, schedule.picks, worst, funding);
  const scheduledEvents: ScheduledEvent[] = candidates.map((candidate, index) => {
    const lineWorst = worst.lines[index]!;
    const lineBest = best.lines[index]!;
    const eventFunding = funding.byEvent.get(lineWorst.event_id) ?? { allocations: [], shortfall: lineWorst.member_responsibility_cents ?? 0 };
    const nextActions: NextAction[] = [
      {
        kind: "REQUEST_APPOINTMENT",
        provider_id: candidate.provider.provider_id,
        slot_id: candidate.slot.slot_id,
        by_date: null,
      },
    ];
    const pretreatment = pretreatmentAction(benefits, registry, request, candidate, lineWorst);
    if (pretreatment) nextActions.push(pretreatment);
    if (candidate.route === "SELF_PAY_NO_CLAIM") {
      nextActions.push({
        kind: "CONFIRM_SELF_PAY_WITH_OFFICE",
        provider_id: candidate.provider.provider_id,
        slot_id: candidate.slot.slot_id,
        by_date: candidate.slot.date,
      });
    }
    const expiring = eventFunding.allocations.find(
      (allocation) => allocation.source_type === "FSA" || allocation.source_type === "HRA",
    );
    if (expiring) {
      const account = request.member.funding_accounts.find((value) => value.source_id === expiring.source_id);
      nextActions.push({
        kind: "SUBMIT_FSA_CLAIM",
        provider_id: candidate.provider.provider_id,
        slot_id: candidate.slot.slot_id,
        by_date: account?.claim_deadline ?? null,
      });
    }
    nextActions.sort((a, b) => actionOrder.indexOf(a.kind) - actionOrder.indexOf(b.kind));
    return {
      event_id: lineWorst.event_id,
      procedure_id: candidate.procedure.procedure_id,
      service_date: candidate.slot.date,
      slot_id: candidate.slot.slot_id,
      provider_id: candidate.provider.provider_id,
      location_id: candidate.provider.location_id,
      claim_route: candidate.route,
      user_locked: (request.schedule_locks ?? []).some(
        (lock) =>
          lock.procedure_id === candidate.procedure.procedure_id &&
          lock.provider_id === candidate.provider.provider_id &&
          lock.slot_id === candidate.slot.slot_id &&
          lock.claim_route === candidate.route,
      ),
      line_worst: lineWorst,
      line_best: lineBest,
      member_cost: amountRange(lineWorst.member_responsibility_cents!, lineBest.member_responsibility_cents!),
      plan_pay: amountRange(lineWorst.plan_pay_cents!, lineBest.plan_pay_cents!),
      funding: eventFunding.allocations,
      shortfall_cents: eventFunding.shortfall,
      reasons: eventReasons(benefits, registry, request, allCandidates, candidate, eventFunding.allocations),
      next_actions: nextActions,
      route_comparison: routeComparison(benefits, registry, request, candidates, index, alternativeId),
      rollover_shift: rolloverShift(benefits, registry, request, allCandidates, candidates, index, alternativeId, worst),
    };
  });
  const worstTotals = worst.totals!;
  const bestTotals = best.totals!;
  const sameDayIssues = sameDayOrderIssues(benefits, registry, request, events, worstTotals.member_responsibility_cents, alternativeId);
  const ruleIds = [
    ...new Set([...worst.applied_rule_ids, ...best.applied_rule_ids, ...worst.rollover.flatMap((outcome) => outcome.applied_rule_ids)]),
  ].sort(compareStrings);
  return {
    alternative_id: alternativeId,
    labels: [...labels].sort((a, b) => alternativeLabelDisplayOrder.indexOf(a) - alternativeLabelDisplayOrder.indexOf(b)),
    schedule_key: schedule.scheduleKey,
    events: scheduledEvents,
    unscheduled: schedule.unscheduled,
    totals: {
      modeled_charge: amountRange(worstTotals.modeled_charge_cents, bestTotals.modeled_charge_cents),
      contractual_adjustment: amountRange(worstTotals.contractual_adjustment_cents, bestTotals.contractual_adjustment_cents),
      plan_pay: amountRange(worstTotals.plan_pay_cents, bestTotals.plan_pay_cents),
      member_cost: amountRange(worstTotals.member_responsibility_cents, bestTotals.member_responsibility_cents),
      fees_cents: funding.fees,
    },
    funding_gap_cents: funding.gap,
    monthly: funding.monthly,
    benefit_states: scheduledEvents.map((event) => ({ event_id: event.event_id, state_after: event.line_worst.state_after! })),
    objective: recalculated.objective,
    applied_rule_ids: ruleIds,
    issues: uniqueIssues([...simulationIssues(worst), ...simulationIssues(best), ...funding.issues, ...sameDayIssues]),
    rollover: worst.rollover,
    difference_from_recommended: null,
  };
}

function monthlyCashByMonth(alternative: Alternative): Map<string, number> {
  return new Map(alternative.monthly.map((month) => [month.month, month.cash_cents]));
}

function serviceDatesByProcedure(alternative: Alternative): Map<string, string | null> {
  const dates = new Map<string, string | null>();
  for (const entry of alternative.unscheduled) dates.set(entry.procedure_id, null);
  for (const event of alternative.events) dates.set(event.procedure_id, event.service_date);
  return dates;
}

/** Final annual-maximum state of each plan version the schedule touches (benefit_states is chronological). */
function lastAnnualMaxByPlanVersion(alternative: Alternative): Map<string, number> {
  const planVersionByEvent = new Map(alternative.events.map((event) => [event.event_id, event.line_worst.plan_version_id]));
  const remaining = new Map<string, number>();
  for (const { event_id, state_after } of alternative.benefit_states) {
    const planVersionId = planVersionByEvent.get(event_id);
    if (planVersionId) remaining.set(planVersionId, state_after.annual_max_remaining_cents);
  }
  return remaining;
}

/** Σ final_bank over the rollover outcomes; null when any outcome's final_bank is unknown. */
function rolloverFinalBank(alternative: Alternative): { low_cents: number; high_cents: number } | null {
  let low = 0;
  let high = 0;
  for (const outcome of alternative.rollover) {
    if (outcome.final_bank === null) return null;
    low += outcome.final_bank.low_cents;
    high += outcome.final_bank.high_cents;
  }
  return { low_cents: low, high_cents: high };
}

function issueCodes(alternative: Alternative): Set<Issue["code"]> {
  return new Set(alternative.issues.map((value) => value.code));
}

function setDifference<T extends string>(from: Set<T>, minus: Set<T>): T[] {
  return [...from].filter((value) => !minus.has(value)).sort(compareStrings);
}

/** (1.7) §6.3: this − recommended, worst case, from two finished alternatives (no benefit-engine calls). */
function differenceFromRecommended(recommended: Alternative, alternative: Alternative): AlternativeDifference {
  const recommendedMonths = monthlyCashByMonth(recommended);
  const months = monthlyCashByMonth(alternative);
  const recommendedDates = serviceDatesByProcedure(recommended);
  const dates = serviceDatesByProcedure(alternative);
  const recommendedBank = rolloverFinalBank(recommended);
  const bank = rolloverFinalBank(alternative);
  const recommendedMaximum = lastAnnualMaxByPlanVersion(recommended);
  const maximum = lastAnnualMaxByPlanVersion(alternative);
  const recommendedCodes = issueCodes(recommended);
  const codes = issueCodes(alternative);
  const recommendedCompletion = recommended.objective.completion_date;
  const completion = alternative.objective.completion_date;
  return {
    member_cost_delta_cents: alternative.totals.member_cost.high_cents - recommended.totals.member_cost.high_cents,
    plan_pay_delta_cents: alternative.totals.plan_pay.high_cents - recommended.totals.plan_pay.high_cents,
    peak_monthly_cash_delta_cents: alternative.objective.peak_monthly_cash_cents - recommended.objective.peak_monthly_cash_cents,
    monthly: [...new Set([...recommendedMonths.keys(), ...months.keys()])].sort(compareStrings).map((month) => ({
      month,
      cash_delta_cents: (months.get(month) ?? 0) - (recommendedMonths.get(month) ?? 0),
    })),
    completion_shift_days: recommendedCompletion !== null && completion !== null ? diffDays(recommendedCompletion, completion) : null,
    service_date_changes: [...new Set([...recommendedDates.keys(), ...dates.keys()])].sort(compareStrings).flatMap((procedureId) => {
      const recommendedDate = recommendedDates.get(procedureId) ?? null;
      const thisDate = dates.get(procedureId) ?? null;
      if (recommendedDate === thisDate) return [];
      return [
        {
          procedure_id: procedureId,
          recommended_date: recommendedDate,
          this_date: thisDate,
          shift_days: recommendedDate !== null && thisDate !== null ? diffDays(recommendedDate, thisDate) : null,
        },
      ];
    }),
    rollover_final_bank_delta:
      bank !== null && recommendedBank !== null
        ? { low_cents: bank.low_cents - recommendedBank.low_cents, high_cents: bank.high_cents - recommendedBank.high_cents }
        : null,
    annual_max_remaining_delta: [...maximum.keys()]
      .filter((planVersionId) => recommendedMaximum.has(planVersionId))
      .sort(compareStrings)
      .map((planVersionId) => ({
        plan_version_id: planVersionId,
        delta_cents: maximum.get(planVersionId)! - recommendedMaximum.get(planVersionId)!,
      })),
    warnings_added: setDifference(codes, recommendedCodes),
    warnings_removed: setDifference(recommendedCodes, codes),
  };
}

/**
 * The mode winner first, then every label winner in order; schedules shared by several winners merge
 * their labels. `lowest_member_cost` is only ever the LOWEST_TOTAL_COST mode's label.
 */
function selectAlternatives(
  pool: EvaluatedSchedule[],
  mode: RecommendationMode,
): { schedule: EvaluatedSchedule; labels: AlternativeLabel[] }[] {
  const selected: { schedule: EvaluatedSchedule; labels: AlternativeLabel[] }[] = [];
  for (const label of [modeLabel[mode], ...alternativeLabelOrder]) {
    const best = [...pool].sort((a, b) => compareKeys(rankingKey(a, label), rankingKey(b, label)))[0]!;
    const existing = selected.find((entry) => sameStringVector(entry.schedule.tieKey, best.tieKey));
    if (!existing) selected.push({ schedule: best, labels: [label] });
    else if (!existing.labels.includes(label)) existing.labels.push(label);
  }
  return selected;
}

/**
 * Largest k such that Π(min(len, k) + 1) over the procedures stays within the schedule limit, or null
 * when no cap is needed (bounded search).
 */
function candidateCapFor(lengths: number[]): number | null {
  const product = (cap: number) => lengths.reduce((total, length) => total * (Math.min(length, cap) + 1), 1);
  if (product(Infinity) <= SEARCH_LIMITS.max_schedules_evaluated) return null;
  let cap = Math.max(...lengths);
  while (cap > 0 && product(cap) > SEARCH_LIMITS.max_schedules_evaluated) cap -= 1;
  return cap;
}

export function makeCarePlanOptimizer(benefits: BenefitEngine): CarePlanOptimizer {
  return {
    engine_id: ENGINE_IDS.optimizer,
    optimize(registry, request) {
      const asOfDate = localDateOf(request.as_of, request.member.time_zone);
      const trace: DecisionTraceEntry[] = [];
      const invalid = domainProblems(request);
      if (invalid.length) return emptyResult(request, asOfDate, "INVALID_INPUT", invalid, trace);
      trace.push({
        seq: trace.length,
        kind: "INPUT_VALIDATED",
        message: "Care plan request passed domain validation.",
        data: { procedure_count: request.procedures.length, provider_count: request.providers.length, schedule_lock_count: request.schedule_locks?.length ?? 0 },
      });

      const candidates = buildCandidates(request);
      const locks = new Map((request.schedule_locks ?? []).map((lock) => [lock.procedure_id, lock]));
      const lockIssues: Issue[] = [];
      for (const [procedureId, lock] of locks) {
        const matching = (candidates.get(procedureId) ?? []).filter((candidate) =>
          candidate.provider.provider_id === lock.provider_id && candidate.slot.slot_id === lock.slot_id && candidate.route === lock.claim_route,
        );
        candidates.set(procedureId, matching);
        if (!matching.length) lockIssues.push(issue("NO_SLOT_IN_WINDOW", "blocking",
          "This pinned appointment does not fit the confirmed care window, availability, travel limit, specialty, or claim route. Unpin it or check these details.",
          { procedure_id: procedureId, provider_id: lock.provider_id, field: "schedule_locks" },
        ));
      }
      const candidateCount = [...candidates.values()].reduce((sum, value) => sum + value.length, 0);
      trace.push({
        seq: trace.length,
        kind: "CANDIDATES_BUILT",
        message: "Treatment candidates were built from safe dates, availability, specialty, and travel limits.",
        data: Object.fromEntries([...candidates].sort(([a], [b]) => compareStrings(a, b)).map(([id, values]) => [id, values.length])),
      });
      const mode = request.preferences?.mode ?? "BALANCED";
      const candidateCap = candidateCapFor(request.procedures.map((procedure) => candidates.get(procedure.procedure_id)?.length ?? 0));
      const boundsApplied =
        candidateCap === null
          ? []
          : [`max_schedules_evaluated=${SEARCH_LIMITS.max_schedules_evaluated}: candidates per procedure capped at ${candidateCap}`];
      const searchCandidates =
        candidateCap === null
          ? candidates
          : new Map([...candidates].map(([procedureId, values]) => [procedureId, values.slice(0, candidateCap)] as [string, Candidate[]]));

      const candidateDates = [...new Set([...candidates.values()].flatMap((values) => values.map((value) => value.slot.date)))].sort(compareStrings);
      const planIssues: Issue[] = [];
      let unsupported = false;
      for (const date of candidateDates.length ? candidateDates : [asOfDate]) {
        const resolution = benefits.resolvePlanVersion(registry, request.member.plan_key, date);
        if (!resolution.ok) {
          planIssues.push(...resolution.issues);
          if (resolution.status === "UNSUPPORTED_PLAN_TYPE") unsupported = true;
        } else if (!benefits.supportsPlanType(resolution.plan.plan_type)) {
          unsupported = true;
          planIssues.push(issue("PLAN_TYPE_UNSUPPORTED", "blocking", `Plan type ${resolution.plan.plan_type} is not supported.`));
        }
      }
      if (unsupported) {
        return emptyResult(request, asOfDate, "UNSUPPORTED_PLAN_TYPE", planIssues, trace, {
          candidates_built: candidateCount,
          schedules_evaluated: 0,
          schedules_feasible: 0,
          pass: 1,
        });
      }
      if (planIssues.some((value) => value.severity === "blocking")) {
        return emptyResult(request, asOfDate, "NEEDS_CONFIRMATION", planIssues, trace, {
          candidates_built: candidateCount,
          schedules_evaluated: 0,
          schedules_feasible: 0,
          pass: 1,
        });
      }
      const confirmationIssues: Issue[] = [...request.procedures]
        .sort((a, b) => compareStrings(a.procedure_id, b.procedure_id))
        .filter((procedure) => confirmedProcedureProblems(procedure).length > 0)
        .map((procedure) =>
          issue("PROCEDURE_UNCONFIRMED", "blocking", "Confirm every clinical field before optimization.", {
            procedure_id: procedure.procedure_id,
            field: "procedures.confirmation",
          }),
        );
      for (const procedure of [...request.procedures].sort((a, b) => compareStrings(a.procedure_id, b.procedure_id))) {
        if (procedure.alternative_group_id === null) continue;
        confirmationIssues.push(
          issue("ALTERNATIVE_NOT_APPROVED", "blocking", "Ask your dentist which option to plan.", {
            procedure_id: procedure.procedure_id,
            field: "procedures.alternative_group_id",
          }),
        );
      }
      if (confirmationIssues.length) {
        return emptyResult(request, asOfDate, "NEEDS_CONFIRMATION", confirmationIssues, trace, {
          candidates_built: candidateCount,
          schedules_evaluated: 0,
          schedules_feasible: 0,
          pass: 1,
        });
      }
      if (request.member.secondary_coverage !== null) {
        return emptyResult(
          request,
          asOfDate,
          "NEEDS_CONFIRMATION",
          [issue("SECONDARY_COVERAGE_NOT_MODELED", "blocking", "Secondary coverage must be resolved before optimization.")],
          trace,
          { candidates_built: candidateCount, schedules_evaluated: 0, schedules_feasible: 0, pass: 1 },
        );
      }
      const opened = benefits.openLedger(registry, request.member, request.as_of, "worst_case");
      if (opened.issues.some((value) => value.severity === "blocking")) {
        return emptyResult(request, asOfDate, "NEEDS_CONFIRMATION", opened.issues, trace, {
          candidates_built: candidateCount,
          schedules_evaluated: 0,
          schedules_feasible: 0,
          pass: 1,
        });
      }

      if (lockIssues.length) return emptyResult(request, asOfDate, "NO_FEASIBLE_SCHEDULE", lockIssues, trace, {
        candidates_built: candidateCount, schedules_evaluated: 0, schedules_feasible: 0, pass: 1,
      });
      const evaluated: EvaluatedSchedule[] = [];
      const rejectedIssues: Issue[] = [];
      let schedulesEvaluated = 0;
      let uAll: [number, number, number] | null = null;
      let uOk: [number, number, number] | null = null;
      const ordered = topologicalOrder(request.procedures);
      const picks = new Map<string, Candidate | null>();
      const usedSlots = new Set<string>();
      const search = (index: number) => {
        if (index === ordered.length) {
          if (!dependenciesSatisfied(picks, ordered)) return;
          schedulesEvaluated += 1;
          const scheduleUnscheduled = unscheduledVector(ordered, picks);
          if (uAll === null || compareNumberVectors(scheduleUnscheduled, uAll) < 0) uAll = scheduleUnscheduled;
          const orderedCandidates = chronologicalCandidates(picks);
          const simulation = benefits.simulate(registry, {
            as_of: request.as_of,
            scenario: "worst_case",
            member: request.member,
            providers: request.providers,
            events: claimEvents(orderedCandidates, "eval"),
          });
          if (
            simulation.status === "UNSUPPORTED_PLAN_TYPE" ||
            simulation.status === "NEEDS_CONFIRMATION" ||
            simulation.totals === null ||
            simulation.lines.some((line) => line.status === "NEEDS_CONFIRMATION" || line.status === "UNSUPPORTED_PLAN_TYPE")
          ) {
            rejectedIssues.push(...simulationIssues(simulation));
            return;
          }
          const selfPay = selfPayIsStrictlyCheaper(benefits, registry, request, orderedCandidates, simulation);
          if (!selfPay.eligible) {
            rejectedIssues.push(...selfPay.issues);
            return;
          }
          if (uOk === null || compareNumberVectors(scheduleUnscheduled, uOk) < 0) uOk = scheduleUnscheduled;
          const funding = allocateFunding(request, orderedCandidates, simulation.lines);
          const calculated = objectiveFor(request, ordered, picks, simulation, funding);
          const unscheduled = calculated.unscheduled.map((entry) => ({
            ...entry,
            reason: (candidates.get(entry.procedure_id)?.length ?? 0) === 0 ? ("NO_SLOT_IN_WINDOW" as const) : entry.reason,
            message:
              (candidates.get(entry.procedure_id)?.length ?? 0) === 0
                ? "No appointment fits the dentist-confirmed safe window."
                : entry.message,
          }));
          evaluated.push({
            picks: new Map(picks),
            activeProcedures: ordered,
            scheduleKey: scheduleKey(picks, ordered),
            simulation,
            funding,
            objective: calculated.objective,
            tieKey: calculated.tieKey,
            unscheduled,
          });
          return;
        }
        const procedure = ordered[index]!;
        const options: (Candidate | null)[] = [...(searchCandidates.get(procedure.procedure_id) ?? [])];
        if (!locks.has(procedure.procedure_id)) options.push(null);
        for (const candidate of options) {
          const slotKey = candidate ? `${candidate.provider.provider_id}@${candidate.slot.slot_id}` : null;
          if (slotKey && usedSlots.has(slotKey)) continue;
          if (candidate) {
            let dependencyImpossible = false;
            for (const dependency of procedure.dependencies) {
              if (!picks.has(dependency.depends_on)) continue;
              const predecessor = picks.get(dependency.depends_on);
              if (!predecessor) {
                dependencyImpossible = true;
                break;
              }
              const gap = diffDays(predecessor.slot.date, candidate.slot.date);
              if (gap < dependency.min_gap_days || (dependency.max_gap_days !== null && gap > dependency.max_gap_days)) {
                dependencyImpossible = true;
                break;
              }
            }
            if (dependencyImpossible) continue;
          }
          picks.set(procedure.procedure_id, candidate);
          if (slotKey) usedSlots.add(slotKey);
          search(index + 1);
          if (slotKey) usedSlots.delete(slotKey);
          picks.delete(procedure.procedure_id);
        }
      };
      search(0);

      const statsBase = { candidates_built: candidateCount, schedules_evaluated: schedulesEvaluated, schedules_feasible: evaluated.length };
      if (uAll !== null && (uOk === null || compareNumberVectors(uOk, uAll) > 0)) {
        if (locks.size > 0 && uOk === null && rejectedIssues.length > 0 && rejectedIssues.every((value) => value.code === "CLAIM_ROUTE_INVALID")) {
          return emptyResult(request, asOfDate, "NO_FEASIBLE_SCHEDULE", rejectedIssues, trace, { ...statsBase, pass: 1 }, boundsApplied);
        }
        return emptyResult(request, asOfDate, "NEEDS_CONFIRMATION", rejectedIssues, trace, { ...statsBase, pass: 1 }, boundsApplied);
      }
      if (!evaluated.length) {
        const noSlots = request.procedures
          .filter((procedure) => (candidates.get(procedure.procedure_id)?.length ?? 0) === 0)
          .map((procedure) =>
            issue("NO_SLOT_IN_WINDOW", "blocking", "No appointment fits the dentist-confirmed safe window.", {
              procedure_id: procedure.procedure_id,
            }),
          );
        const pinConflicts = [...locks.values()].map((lock) => issue("NO_SLOT_IN_WINDOW", "blocking",
          "The pinned appointments cannot form a feasible plan with the confirmed dependencies, distinct slots, and verified claim routes. Unpin an appointment to try again.",
          { procedure_id: lock.procedure_id, provider_id: lock.provider_id, field: "schedule_locks" },
        ));
        return emptyResult(request, asOfDate, "NO_FEASIBLE_SCHEDULE", [...noSlots, ...pinConflicts, ...rejectedIssues], trace, { ...statsBase, pass: 1 }, boundsApplied);
      }

      const minimumUnscheduled = uOk!;
      const passOne = evaluated.filter(
        (schedule) =>
          schedule.funding.gap === 0 && compareNumberVectors(schedule.objective.unscheduled_by_urgency, minimumUnscheduled) === 0,
      );
      const pass: 1 | 2 = passOne.length ? 1 : 2;
      const pool = passOne.length ? passOne : evaluated;
      trace.push({
        seq: trace.length,
        kind: "SEARCH_PASS",
        message: pass === 1 ? "Found schedules within the hard monthly funding limit." : "No schedule fits the hard monthly limit; ranking safest schedules with exact gaps.",
        data: { pass, schedules_evaluated: schedulesEvaluated, schedules_feasible: evaluated.length, pool_size: pool.length },
      });

      const limited = selectAlternatives(pool, mode).slice(0, request.max_alternatives);
      const finished = limited.map((entry, index) =>
        finalAlternative(benefits, registry, request, candidates, entry.schedule, `alt-${index + 1}`, entry.labels),
      );
      const recommended = finished[0];
      const alternatives = finished.map((alternative, index) =>
        index === 0 || recommended === undefined
          ? alternative
          : { ...alternative, difference_from_recommended: differenceFromRecommended(recommended, alternative) },
      );
      for (const alternative of alternatives) {
        trace.push({
          seq: trace.length,
          kind: "ALTERNATIVE_SELECTED",
          message: "A distinct ranked care plan alternative was selected.",
          data: { mode, alternative_id: alternative.alternative_id, labels: alternative.labels, objective: alternative.objective },
        });
      }

      const rejectedWarnings = uAll !== null && uOk !== null && compareNumberVectors(uOk, uAll) === 0
        ? rejectedIssues.map((value) => ({
            ...value,
            severity: value.severity === "blocking" ? ("warning" as const) : value.severity,
          }))
        : [];
      const unresolved: Issue[] = [
        ...opened.issues,
        ...planIssues,
        ...rejectedWarnings,
        ...alternatives.flatMap((alternative) => alternative.issues),
      ];
      const first = alternatives[0];
      let status: CarePlanResult["status"] = "OK";
      if (first?.unscheduled.length) {
        status = "NO_FEASIBLE_SCHEDULE";
        for (const entry of first.unscheduled) {
          unresolved.push(issue(entry.reason, "blocking", entry.message, { procedure_id: entry.procedure_id }));
          const procedure = request.procedures.find((value) => value.procedure_id === entry.procedure_id);
          if (procedure?.urgency === "act_now" || procedure?.urgency === "schedule_soon") {
            unresolved.push(
              issue("DEADLINE_UNMET", "blocking", "An urgent procedure could not be placed inside the dentist-confirmed deadline.", {
                procedure_id: entry.procedure_id,
              }),
            );
          }
        }
      } else if (pass === 2) {
        status = "BUDGET_SHORTFALL";
        unresolved.push(issue("BUDGET_SHORTFALL", "warning", "The safest schedule has an exact funding gap."));
      }
      const ruleIds = [...new Set(alternatives.flatMap((alternative) => alternative.applied_rule_ids))].sort(compareStrings);
      const planVersionIds = [
        ...new Set(
          alternatives.flatMap((alternative) => [
            ...alternative.events.flatMap((event) => [event.line_worst.plan_version_id, event.line_best.plan_version_id]),
            ...alternative.rollover.flatMap((outcome) => [outcome.closing_plan_version_id, outcome.next_plan_version_id]),
          ]).filter((id): id is string => id !== null),
        ),
      ].sort(compareStrings);
      return {
        contract_version: CONTRACT_VERSION,
        engine_id: ENGINE_IDS.optimizer,
        status,
        as_of: request.as_of,
        as_of_date: asOfDate,
        recommended_alternative_id: alternatives[0]?.alternative_id ?? null,
        mode,
        alternatives,
        evidence: benefits.evidenceFor(registry, ruleIds, planVersionIds).sort((a, b) => compareStrings(`${a.rule_id}:${a.plan_version_id}`, `${b.rule_id}:${b.plan_version_id}`)),
        unresolved: uniqueIssues(unresolved),
        decision_trace: trace,
        search_stats: { ...statsBase, pass },
        solver_meta: solverMeta(
          candidateCap !== null ? "BOUNDED_BEST_FOUND" : status === "NO_FEASIBLE_SCHEDULE" ? "NO_FEASIBLE_SOLUTION" : "OPTIMAL",
          { ...statsBase, pass },
          boundsApplied,
        ),
      };
    },
  };
}
