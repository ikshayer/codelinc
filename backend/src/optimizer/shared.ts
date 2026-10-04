import {
  ageHours,
  diffDays,
  minutesOf,
  STALENESS_HOURS,
  weekdayOf,
  type AdjudicationLine,
  type AmountRange,
  type AppointmentSlot,
  type Issue,
  type MemberState,
  type ProviderOption,
  type SimulationResult,
} from "@/domain";

const severityRank = { blocking: 0, warning: 1, info: 2 } as const;

export function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function compareNumbers(a: number, b: number): number {
  return a - b;
}

export function sortIssues(issues: readonly Issue[]): Issue[] {
  return [...issues].sort((a, b) => {
    const fields: (keyof Issue)[] = ["code", "rule_id", "input_id", "procedure_id", "provider_id", "field", "message"];
    const severity = severityRank[a.severity] - severityRank[b.severity];
    if (severity !== 0) return severity;
    for (const field of fields) {
      const compared = compareStrings(String(a[field] ?? ""), String(b[field] ?? ""));
      if (compared !== 0) return compared;
    }
    return 0;
  });
}

export function uniqueIssues(issues: readonly Issue[]): Issue[] {
  const seen = new Set<string>();
  return sortIssues(issues).filter((value) => {
      const key = JSON.stringify([
        value.code,
        value.severity,
        value.rule_id,
        value.input_id,
        value.procedure_id,
        value.provider_id,
        value.field,
      ]);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function isMemberAvailable(member: MemberState, slot: AppointmentSlot): boolean {
  if (member.availability.unavailable.some((range) => range.start <= slot.date && slot.date <= range.end)) return false;
  const weekday = weekdayOf(slot.date);
  const start = minutesOf(slot.start_time);
  const end = minutesOf(slot.end_time);
  return member.availability.weekly.some(
    (window) => window.weekday === weekday && minutesOf(window.start_time) <= start && end <= minutesOf(window.end_time),
  );
}

/**
 * Unknown tier (null) maps to the OON placeholder: benefits blocks the line with NETWORK_STATUS_UNKNOWN
 * before any pricing, so it only ever surfaces as missing data. Never drop the candidate (CONTRACT §5.3).
 */
export function providerClaimRoute(provider: ProviderOption): "IN_NETWORK_CLAIM" | "OUT_OF_NETWORK_CLAIM" {
  return provider.network.tier === "in_network" ? "IN_NETWORK_CLAIM" : "OUT_OF_NETWORK_CLAIM";
}

export function amountRange(a: number, b: number): AmountRange {
  return { low_cents: Math.min(a, b), high_cents: Math.max(a, b) };
}

export function totalLine(lines: readonly AdjudicationLine[], field: keyof AdjudicationLine): number | null {
  let total = 0;
  for (const line of lines) {
    const value = line[field];
    if (typeof value !== "number") return null;
    total += value;
  }
  return total;
}

export function simulationIssues(result: SimulationResult): Issue[] {
  return uniqueIssues([...result.issues, ...result.lines.flatMap((line) => line.issues)]);
}

export function isNetworkStale(provider: ProviderOption, asOf: string): boolean {
  return ageHours(provider.network.observed_at, asOf) > STALENESS_HOURS.network_status;
}

export function slotCompare(a: AppointmentSlot, b: AppointmentSlot): number {
  return compareStrings(a.date, b.date) || compareStrings(a.start_time, b.start_time) || compareStrings(a.slot_id, b.slot_id);
}

export function daysUntil(asOfDate: string, slot: AppointmentSlot): number {
  return diffDays(asOfDate, slot.date);
}

export function roundOne(value: number): number {
  return Math.round((value + Number.EPSILON) * 10) / 10;
}
