/** Rule lookup, plan resolution and issue helpers shared by the benefit engine. */
import {
  issue,
  isWithin,
  samePlanKey,
  SUPPORTED_PLAN_TYPES,
  type Issue,
  type IsoDate,
  type NetworkTier,
  type PlanDefinition,
  type PlanKey,
  type PlanRegistry,
  type PlanResolution,
  type PlanRule,
  type PlanRuleType,
  type PlanType,
  type RuleOf,
  type ServiceClass,
} from "@/domain";

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Rules of one plan grouped by type, each group sorted by rule_id (registry order never matters). */
const indexCache = new WeakMap<PlanDefinition, Map<PlanRuleType, PlanRule[]>>();

export function rulesOf<T extends PlanRuleType>(plan: PlanDefinition, type: T): RuleOf<T>[] {
  let idx = indexCache.get(plan);
  if (!idx) {
    idx = new Map();
    for (const r of [...plan.rules].sort((a, b) => cmp(a.rule_id, b.rule_id))) {
      const list = idx.get(r.rule_type) ?? [];
      list.push(r);
      idx.set(r.rule_type, list);
    }
    indexCache.set(plan, idx);
  }
  return (idx.get(type) ?? []) as RuleOf<T>[];
}

export interface MatchCtx {
  network: NetworkTier | null;
  serviceClass: ServiceClass | null;
  code: string;
}

/** Structured lookup (CONTRACT §2.3): each applies_when field is null or equal / contains. */
export function matches(r: PlanRule, m: MatchCtx): boolean {
  const w = r.applies_when;
  return (
    (w.network === null || w.network === m.network) &&
    (w.service_class === null || w.service_class === m.serviceClass) &&
    (w.cdt_codes === null || w.cdt_codes.includes(m.code))
  );
}

const STATUS_CODE = {
  UNVERIFIED: "RULE_UNVERIFIED",
  UNKNOWN: "RULE_UNKNOWN",
  CONFLICT: "RULE_CONFLICT",
  NOT_APPLICABLE: "RULE_MISSING",
  VERIFIED: "RULE_CONFLICT",
} as const;

export function ruleStatusIssue(r: PlanRule): Issue {
  const what = r.status === "NOT_APPLICABLE" ? "does not apply" : `is ${r.status.toLowerCase().replace("_", " ")}`;
  return issue(STATUS_CODE[r.status], "blocking", `Plan rule ${r.rule_id} ${what}; confirm it with the plan.`, {
    rule_id: r.rule_id,
  });
}

export function missingRuleIssue(type: PlanRuleType): Issue {
  return issue("RULE_MISSING", "blocking", `The plan document does not provide a ${type} rule; confirm it with the plan.`, {
    field: `rules.${type}`,
  });
}

/**
 * Exactly one VERIFIED rule among `candidates`, else blocking issues: any non-verified candidate
 * blocks with its status code; none → RULE_MISSING; two VERIFIED → RULE_CONFLICT per rule.
 */
export function requireVerified<R extends PlanRule>(candidates: R[], type: PlanRuleType): { rule: R } | { issues: Issue[] } {
  const bad = candidates.filter((r) => r.status !== "VERIFIED");
  if (bad.length) return { issues: bad.map(ruleStatusIssue) };
  if (candidates.length === 0) return { issues: [missingRuleIssue(type)] };
  if (candidates.length > 1) return { issues: candidates.map(ruleStatusIssue) };
  return { rule: candidates[0]! };
}

export function supportsPlanType(t: PlanType): boolean {
  return (SUPPORTED_PLAN_TYPES as readonly PlanType[]).includes(t);
}

/** CONTRACT §2.2. Never falls back to a similar plan. */
export function resolvePlanVersion(registry: PlanRegistry, key: PlanKey, serviceDate: IsoDate): PlanResolution {
  const found = registry.plans.filter(
    (p) => samePlanKey(p.key, key) && isWithin(serviceDate, p.coverage_period.start, p.coverage_period.end),
  );
  if (found.length === 0) {
    return {
      ok: false,
      status: "NEEDS_CONFIRMATION",
      issues: [issue("PLAN_NOT_FOUND", "blocking", `No plan version matches this plan identity on ${serviceDate}.`, { field: "member.plan_key" })],
    };
  }
  if (found.length > 1) {
    return {
      ok: false,
      status: "NEEDS_CONFIRMATION",
      issues: [issue("RULE_CONFLICT", "blocking", `More than one plan version matches this plan identity on ${serviceDate}.`, { field: "member.plan_key" })],
    };
  }
  const plan = found[0]!;
  if (!supportsPlanType(plan.plan_type)) {
    return {
      ok: false,
      status: "UNSUPPORTED_PLAN_TYPE",
      issues: [issue("PLAN_TYPE_UNSUPPORTED", "blocking", `Plan type ${plan.plan_type} is not supported; only DPPO plans are estimated.`)],
    };
  }
  return { ok: true, plan, issues: [] };
}

const SEVERITY = { blocking: 0, warning: 1, info: 2 } as const;
const ISSUE_KEYS = ["code", "rule_id", "input_id", "procedure_id", "provider_id", "field", "message"] as const;

/** CONTRACT §1.11: dedupe on (code, severity, refs, field); sort by severity then keys, nulls first. */
export function normalizeIssues(issues: readonly Issue[]): Issue[] {
  const sorted = [...issues].sort((a, b) => {
    const s = SEVERITY[a.severity] - SEVERITY[b.severity];
    if (s) return s;
    for (const k of ISSUE_KEYS) {
      const x = a[k] ?? "";
      const y = b[k] ?? "";
      if (x !== y) return x === "" ? -1 : y === "" ? 1 : cmp(x, y);
    }
    return 0;
  });
  const seen = new Set<string>();
  return sorted.filter((i) => {
    const key = [i.code, i.severity, i.rule_id, i.input_id, i.procedure_id, i.provider_id, i.field].join("\u0000");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
