import {
  BEST_OVERALL_COST_TOLERANCE,
  CONTRACT_VERSION,
  ENGINE_IDS,
  RED_FLAG_SYMPTOMS,
  issue,
  localDateOf,
  type ClaimEvent,
  type DecisionTraceEntry,
  type Issue,
  type PlanRegistry,
  type ProviderOption,
  type VisitLabel,
  type VisitNavigatorRequest,
  type VisitNavigatorResult,
  type VisitOption,
} from "@/domain";
import type { BenefitEngine, VisitNavigator } from "@/domain/ports";
import {
  amountRange,
  compareNumbers,
  compareStrings,
  daysUntil,
  isMemberAvailable,
  isNetworkStale,
  providerClaimRoute,
  roundOne,
  simulationIssues,
  slotCompare,
  totalLine,
  uniqueIssues,
} from "./shared";

const labelOrder: VisitLabel[] = ["best_overall", "lowest_cost", "soonest"];

interface Candidate {
  provider: ProviderOption;
  option: VisitOption;
  appliedRuleIds: string[];
}

function emptyResult(
  request: VisitNavigatorRequest,
  asOfDate: string,
  status: VisitNavigatorResult["status"],
  issues: Issue[],
  trace: DecisionTraceEntry[],
): VisitNavigatorResult {
  return {
    contract_version: CONTRACT_VERSION,
    engine_id: ENGINE_IDS.optimizer,
    status,
    as_of: request.as_of,
    as_of_date: asOfDate,
    safety: { urgent: false, triggered_by: [], message: null },
    options: [],
    excluded: [],
    conditional_scenarios: [],
    evidence: [],
    issues: uniqueIssues(issues),
    decision_trace: trace,
  };
}

function dominanceFilter(candidates: Candidate[]): Candidate[] {
  return candidates.filter((candidate) => {
    if (candidate.option.status !== "OK" || !candidate.option.member_cost) return true;
    return !candidates.some((other) => {
      if (other === candidate || other.option.status !== "OK" || !other.option.member_cost) return false;
      const a = other.option;
      const b = candidate.option;
      const noWorse =
        a.member_cost!.high_cents <= b.member_cost!.high_cents &&
        a.days_until <= b.days_until &&
        a.travel_minutes <= b.travel_minutes &&
        a.distance_miles <= b.distance_miles;
      const better =
        a.member_cost!.high_cents < b.member_cost!.high_cents ||
        a.days_until < b.days_until ||
        a.travel_minutes < b.travel_minutes ||
        a.distance_miles < b.distance_miles;
      return noWorse && better;
    });
  });
}

function priceCandidate(
  benefits: BenefitEngine,
  registry: PlanRegistry,
  request: VisitNavigatorRequest,
  provider: ProviderOption,
): Candidate | null {
  const slot = provider.slots.items
    .filter((item) => item.kind === "exam" && item.date > localDateOf(request.as_of, request.member.time_zone))
    .filter((item) => isMemberAvailable(request.member, item))
    .sort(slotCompare)[0];
  if (!slot) return null;

  const optionId = `opt-${provider.provider_id}`;
  const route = providerClaimRoute(provider);
  const events: ClaimEvent[] = [...request.visit.expected_codes]
    .sort(compareStrings)
    .map((code, index) => ({
      event_id: `${optionId}-l${index + 1}`,
      procedure_id: `visit-${code.toLowerCase()}`,
      cdt_code: code,
      tooth: null,
      service_date: slot.date,
      claim_date: null,
      provider_id: provider.provider_id,
      claim_route: route,
    }));
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
  const problems = uniqueIssues([...simulationIssues(worst), ...simulationIssues(best)]);
  const priced = worst.totals !== null && best.totals !== null && worst.lines.every((line) => line.status !== "NEEDS_CONFIRMATION");
  const modeledWorst = totalLine(worst.lines, "modeled_charge_cents");
  const modeledBest = totalLine(best.lines, "modeled_charge_cents");
  const planWorst = totalLine(worst.lines, "plan_pay_cents");
  const planBest = totalLine(best.lines, "plan_pay_cents");
  const memberWorst = totalLine(worst.lines, "member_responsibility_cents");
  const memberBest = totalLine(best.lines, "member_responsibility_cents");
  const deductibleWorst = totalLine(worst.lines, "deductible_applied_cents");
  const deductibleBest = totalLine(best.lines, "deductible_applied_cents");
  const maxWorst = worst.lines.reduce((sum, line) => sum + (line.counts_toward_maximum ? (line.plan_pay_cents ?? 0) : 0), 0);
  const maxBest = best.lines.reduce((sum, line) => sum + (line.counts_toward_maximum ? (line.plan_pay_cents ?? 0) : 0), 0);
  const memberCost = priced && memberWorst !== null && memberBest !== null ? amountRange(memberWorst, memberBest) : null;
  const asOfDate = localDateOf(request.as_of, request.member.time_zone);
  return {
    provider,
    appliedRuleIds: [...new Set([...worst.applied_rule_ids, ...best.applied_rule_ids])].sort(compareStrings),
    option: {
      option_id: optionId,
      labels: ["soonest"],
      status: priced ? "OK" : "NEEDS_CONFIRMATION",
      provider_id: provider.provider_id,
      location_id: provider.location_id,
      provider_name: provider.name,
      network_tier: provider.network.tier,
      network_observed_at: provider.network.observed_at,
      network_stale: isNetworkStale(provider, request.as_of),
      slot,
      days_until: daysUntil(asOfDate, slot),
      distance_miles: provider.travel.distance_miles,
      travel_minutes: provider.travel.travel_minutes,
      claim_route: route,
      modeled_charge: priced && modeledWorst !== null && modeledBest !== null ? amountRange(modeledWorst, modeledBest) : null,
      plan_pay: priced && planWorst !== null && planBest !== null ? amountRange(planWorst, planBest) : null,
      member_cost: memberCost,
      deductible_applied:
        priced && deductibleWorst !== null && deductibleBest !== null ? amountRange(deductibleWorst, deductibleBest) : null,
      annual_max_used: priced ? amountRange(maxWorst, maxBest) : null,
      exceeds_hard_monthly_limit: memberCost ? memberCost.high_cents > request.member.budget.hard_monthly_limit_cents : null,
      tradeoffs: [],
      lines: worst.lines,
      issues: problems,
    },
  };
}

export function makeVisitNavigator(benefits: BenefitEngine): VisitNavigator {
  return {
    engine_id: ENGINE_IDS.optimizer,
    navigate(registry, request) {
      const asOfDate = localDateOf(request.as_of, request.member.time_zone);
      const trace: DecisionTraceEntry[] = [
        { seq: 0, kind: "INPUT_VALIDATED", message: "Visit request validated.", data: { provider_count: request.providers.length } },
      ];
      const urgentSymptoms = RED_FLAG_SYMPTOMS.filter((name) => request.visit.symptoms[name]);
      trace.push({
        seq: trace.length,
        kind: "SAFETY_GATE",
        message: urgentSymptoms.length ? "Urgent symptoms triggered the safety route." : "No urgent symptom was reported.",
        data: { urgent: urgentSymptoms.length > 0, triggered_by: urgentSymptoms },
      });

      const resolution = benefits.resolvePlanVersion(registry, request.member.plan_key, asOfDate);
      if (!resolution.ok) {
        const result = emptyResult(request, asOfDate, resolution.status, resolution.issues, trace);
        result.safety = {
          urgent: urgentSymptoms.length > 0,
          triggered_by: urgentSymptoms,
          message: urgentSymptoms.length ? "Contact a dentist now and take the earliest practical appointment." : null,
        };
        return result;
      }
      if (!benefits.supportsPlanType(resolution.plan.plan_type)) {
        return emptyResult(
          request,
          asOfDate,
          "UNSUPPORTED_PLAN_TYPE",
          [issue("PLAN_TYPE_UNSUPPORTED", "blocking", `Plan type ${resolution.plan.plan_type} is not supported.`)],
          trace,
        );
      }

      const excluded: VisitNavigatorResult["excluded"] = [];
      const candidates: Candidate[] = [];
      for (const provider of [...request.providers].sort((a, b) => compareStrings(a.provider_id, b.provider_id))) {
        if (provider.travel.distance_miles > request.member.travel.hard_max_miles) {
          excluded.push({ provider_id: provider.provider_id, reasons: ["TRAVEL_LIMIT_EXCEEDED"] });
          trace.push({ seq: trace.length, kind: "OPTION_EXCLUDED", message: "Provider exceeds the travel limit.", data: { provider_id: provider.provider_id } });
          continue;
        }
        const candidate = priceCandidate(benefits, registry, request, provider);
        if (!candidate) {
          excluded.push({ provider_id: provider.provider_id, reasons: ["AVAILABILITY_NO_INTERSECTION"] });
          trace.push({ seq: trace.length, kind: "OPTION_EXCLUDED", message: "No compatible exam appointment is available.", data: { provider_id: provider.provider_id } });
          continue;
        }
        candidates.push(candidate);
      }

      const remaining = dominanceFilter(candidates);
      trace.push({
        seq: trace.length,
        kind: "CANDIDATES_BUILT",
        message: "Visit options were priced and filtered.",
        data: { built: candidates.length, non_dominated: remaining.length },
      });
      const soonest = [...remaining].sort(
        (a, b) =>
          slotCompare(a.option.slot, b.option.slot) ||
          compareNumbers(a.option.travel_minutes, b.option.travel_minutes) ||
          compareStrings(a.option.provider_id, b.option.provider_id),
      )[0];
      const ok = remaining.filter((candidate) => candidate.option.status === "OK" && candidate.option.member_cost);
      const lowest = [...ok].sort(
        (a, b) =>
          compareNumbers(a.option.member_cost!.high_cents, b.option.member_cost!.high_cents) ||
          compareNumbers(a.option.days_until, b.option.days_until) ||
          compareNumbers(a.option.travel_minutes, b.option.travel_minutes) ||
          compareStrings(a.option.provider_id, b.option.provider_id),
      )[0];
      const minCost = lowest?.option.member_cost?.high_cents ?? 0;
      const tolerance = Math.max(
        BEST_OVERALL_COST_TOLERANCE.min_cents,
        Math.ceil((minCost * BEST_OVERALL_COST_TOLERANCE.share_bps) / 10_000),
      );
      const bestOverall = urgentSymptoms.length
        ? soonest
        : [...ok].sort(
            (a, b) =>
              compareNumbers(Number(a.option.exceeds_hard_monthly_limit), Number(b.option.exceeds_hard_monthly_limit)) ||
              compareNumbers(
                Number(a.option.member_cost!.high_cents > minCost + tolerance),
                Number(b.option.member_cost!.high_cents > minCost + tolerance),
              ) ||
              compareNumbers(a.option.days_until, b.option.days_until) ||
              compareNumbers(a.option.travel_minutes, b.option.travel_minutes) ||
              compareNumbers(a.option.member_cost!.high_cents, b.option.member_cost!.high_cents) ||
              compareStrings(a.option.provider_id, b.option.provider_id),
          )[0];

      const picks: [VisitLabel, Candidate | undefined][] = [
        ["best_overall", bestOverall],
        ["lowest_cost", lowest],
        ["soonest", soonest],
      ];
      const selected: Candidate[] = [];
      for (const [label, candidate] of picks) {
        if (!candidate) continue;
        if (candidate.option.status === "NEEDS_CONFIRMATION" && label !== "soonest") continue;
        const existing = selected.find((item) => item.option.option_id === candidate.option.option_id);
        if (existing) existing.option.labels.push(label);
        else {
          candidate.option.labels = [label];
          selected.push(candidate);
        }
      }
      for (const candidate of selected) {
        candidate.option.labels.sort((a, b) => labelOrder.indexOf(a) - labelOrder.indexOf(b));
      }
      const limited = selected.slice(0, request.max_options);
      for (const candidate of limited) {
        candidate.option.tradeoffs = limited
          .filter((other) => other !== candidate)
          .map((other) => ({
            versus_option_id: other.option.option_id,
            cost_delta_cents:
              candidate.option.member_cost && other.option.member_cost
                ? candidate.option.member_cost.high_cents - other.option.member_cost.high_cents
                : null,
            days_delta: candidate.option.days_until - other.option.days_until,
            miles_delta: roundOne(candidate.option.distance_miles - other.option.distance_miles),
            minutes_delta: candidate.option.travel_minutes - other.option.travel_minutes,
          }))
          .sort((a, b) => compareStrings(a.versus_option_id, b.versus_option_id));
      }
      trace.push({
        seq: trace.length,
        kind: "SCHEDULE_RANKED",
        message: "Visit options were ranked deterministically.",
        data: { option_ids: limited.map((item) => item.option.option_id) },
      });
      const allIssues = uniqueIssues(limited.flatMap((candidate) => candidate.option.issues));
      const status: VisitNavigatorResult["status"] = urgentSymptoms.length
        ? "URGENT_CARE_ROUTE"
        : limited.some((candidate) => candidate.option.status === "OK")
          ? "OK"
          : limited.length
            ? "NEEDS_CONFIRMATION"
            : "NO_FEASIBLE_SCHEDULE";
      const ruleIds = [...new Set(limited.flatMap((candidate) => candidate.appliedRuleIds))].sort(compareStrings);
      return {
        contract_version: CONTRACT_VERSION,
        engine_id: ENGINE_IDS.optimizer,
        status,
        as_of: request.as_of,
        as_of_date: asOfDate,
        safety: {
          urgent: urgentSymptoms.length > 0,
          triggered_by: urgentSymptoms,
          message: urgentSymptoms.length ? "Contact a dentist now and take the earliest practical appointment." : null,
        },
        options: limited.map((candidate) => candidate.option),
        excluded: excluded.sort((a, b) => compareStrings(a.provider_id, b.provider_id)),
        conditional_scenarios: [],
        evidence: benefits.evidenceFor(registry, ruleIds).sort((a, b) => compareStrings(a.rule_id, b.rule_id)),
        issues: allIssues,
        decision_trace: trace,
      };
    },
  };
}
