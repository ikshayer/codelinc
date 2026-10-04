import type { ISODate } from "./types";

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** True only for a real calendar date in YYYY-MM-DD form (rejects 2026-02-30). */
export function isValidIsoDate(value: string): value is ISODate {
  const match = ISO_DATE.exec(value);
  if (!match) return false;
  const [, y, m, d] = match.map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/** Builds an ISO date from separate month/day/year inputs, or null if not a real date. */
export function isoFromParts(month: string, day: string, year: string): ISODate | null {
  if (!/^\d{1,2}$/.test(month) || !/^\d{1,2}$/.test(day) || !/^\d{4}$/.test(year)) return null;
  const iso = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  return isValidIsoDate(iso) ? iso : null;
}

export function partsFromIso(iso: ISODate | undefined): { month: string; day: string; year: string } {
  const match = iso ? ISO_DATE.exec(iso) : null;
  if (!match) return { month: "", day: "", year: "" };
  return { month: String(Number(match[2])), day: String(Number(match[3])), year: match[1] };
}

export function todayIso(now: Date = new Date()): ISODate {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/** ISO dates compare correctly as strings. */
export function compareIso(a: ISODate, b: ISODate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

const longDate = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

export function formatIsoDate(iso: ISODate): string {
  if (!isValidIsoDate(iso)) return iso;
  return longDate.format(new Date(`${iso}T00:00:00Z`));
}

const dateTime = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });

export function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? timestamp : dateTime.format(date);
}
