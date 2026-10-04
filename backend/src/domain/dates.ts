/**
 * Date helpers. FROZEN (contract v1). Pure and deterministic.
 * Calendar dates are compared as UTC epoch days; no locale parsing, no DST math.
 * Engines never read the system clock: every request carries `as_of`.
 */
import { isValidIsoDate, type IsoDate, type IsoDateTime, type LocalTime, type Weekday, type YearMonth } from "./primitives";

export class DateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DateError";
  }
}

const MS_PER_DAY = 86_400_000;

function assertDate(d: string): void {
  if (!isValidIsoDate(d)) throw new DateError(`invalid ISO date: ${d}`);
}

/** Days since 1970-01-01 for a calendar date. */
export function toEpochDay(d: IsoDate): number {
  assertDate(d);
  const [y, m, day] = d.split("-").map(Number) as [number, number, number];
  return Math.floor(Date.UTC(y, m - 1, day) / MS_PER_DAY);
}

export function fromEpochDay(n: number): IsoDate {
  if (!Number.isSafeInteger(n)) throw new DateError(`epoch day must be an integer: ${n}`);
  return new Date(n * MS_PER_DAY).toISOString().slice(0, 10);
}

export function addDays(d: IsoDate, days: number): IsoDate {
  return fromEpochDay(toEpochDay(d) + days);
}

/**
 * Calendar-month shift with day clamped to the target month's length:
 * addMonths("2026-01-31", 1) = "2026-02-28"; addMonths("2026-10-20", -60) = "2021-10-20".
 * Used for waiting periods and rolling-month frequency windows.
 */
export function addMonths(d: IsoDate, months: number): IsoDate {
  assertDate(d);
  if (!Number.isSafeInteger(months)) throw new DateError(`months must be an integer: ${months}`);
  const [y, m, day] = d.split("-").map(Number) as [number, number, number];
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = total - ny * 12 + 1;
  const dim = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  const nd = Math.min(day, dim);
  return `${String(ny).padStart(4, "0")}-${String(nm).padStart(2, "0")}-${String(nd).padStart(2, "0")}`;
}

/** Whole days from `a` to `b` (b - a). Positive when b is later. */
export function diffDays(a: IsoDate, b: IsoDate): number {
  return toEpochDay(b) - toEpochDay(a);
}

/** -1, 0, 1 ordering for sorting. */
export function compareDates(a: IsoDate, b: IsoDate): -1 | 0 | 1 {
  const x = toEpochDay(a);
  const y = toEpochDay(b);
  return x < y ? -1 : x > y ? 1 : 0;
}

/** Inclusive range check: start <= d <= end. */
export function isWithin(d: IsoDate, start: IsoDate, end: IsoDate): boolean {
  const n = toEpochDay(d);
  return toEpochDay(start) <= n && n <= toEpochDay(end);
}

/** 0 = Sunday ... 6 = Saturday. */
export function weekdayOf(d: IsoDate): Weekday {
  return new Date(toEpochDay(d) * MS_PER_DAY).getUTCDay();
}

export function yearMonthOf(d: IsoDate): YearMonth {
  assertDate(d);
  return d.slice(0, 7);
}

/** Minutes after midnight for `HH:MM`. */
export function minutesOf(t: LocalTime): number {
  const [h, m] = t.split(":").map(Number) as [number, number];
  return h * 60 + m;
}

/**
 * The member-local calendar date of an instant, using an IANA time zone
 * (e.g. "America/New_York"). Deterministic for a given tz database.
 */
export function localDateOf(instant: IsoDateTime, timeZone: string): IsoDate {
  const ms = Date.parse(instant);
  if (Number.isNaN(ms)) throw new DateError(`invalid instant: ${instant}`);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(ms));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Hours elapsed from `observed_at` to `as_of` (may be fractional; negative if observed after as_of). */
export function ageHours(observedAt: IsoDateTime, asOf: IsoDateTime): number {
  return (Date.parse(asOf) - Date.parse(observedAt)) / 3_600_000;
}

/** Display format required in explanations: "Nov 5, 2026" (decision D-016). */
export function formatDisplayDate(d: IsoDate): string {
  assertDate(d);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const [y, m, day] = d.split("-").map(Number) as [number, number, number];
  return `${months[m - 1]} ${day}, ${y}`;
}
