import type { BasisPoints, Cents } from "./types";

const wholeDollars = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 });
const dollarsAndCents = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Formats integer cents for display. Formatting only — never arithmetic on results. */
export function formatCents(cents: Cents): string {
  if (!Number.isInteger(cents)) throw new Error(`formatCents expects integer cents, got ${cents}`);
  // Whole dollars stay compact ($1,500); any cents always show two digits ($1,500.50).
  return (cents % 100 === 0 ? wholeDollars : dollarsAndCents).format(cents / 100);
}

export function formatBasisPoints(bps: BasisPoints): string {
  return `${bps / 100}%`;
}

export type ParseResult<T> = { ok: true; value: T } | { ok: false; message: string };

/** Parses "$1,500", "1500" or "1,500.50" into integer cents. Blank is not zero. */
export function parseDollarsToCents(input: string): ParseResult<Cents> {
  const cleaned = input.trim().replace(/[$,\s]/g, "");
  if (cleaned === "") return { ok: false, message: "Enter an amount." };
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return { ok: false, message: "Enter a dollar amount like 1,500 or 1,500.00." };
  const [whole, fraction = ""] = cleaned.split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents)) return { ok: false, message: "That amount is too large." };
  return { ok: true, value: cents };
}

/** Parses "80" or "80%" into basis points (0–100%). */
export function parsePercentToBasisPoints(input: string): ParseResult<BasisPoints> {
  const cleaned = input.trim().replace(/[%\s]/g, "");
  if (cleaned === "") return { ok: false, message: "Enter a percentage." };
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return { ok: false, message: "Enter a percentage like 80." };
  const [whole, fraction = ""] = cleaned.split(".");
  const bps = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (bps > 10000) return { ok: false, message: "A plan can pay at most 100%." };
  return { ok: true, value: bps };
}

/** Renders stored cents back into the editable text form used by draft facts. */
export function centsToInput(cents: Cents): string {
  const whole = Math.trunc(cents / 100);
  const fraction = cents % 100;
  return fraction === 0 ? whole.toLocaleString("en-US") : `${whole.toLocaleString("en-US")}.${String(fraction).padStart(2, "0")}`;
}
