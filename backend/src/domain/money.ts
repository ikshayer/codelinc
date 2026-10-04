/**
 * Money helpers. FROZEN (contract v1). Pure, deterministic, integer-only.
 * Every module must use these instead of re-implementing rounding or parsing.
 */
import { MAX_CENTS, type BasisPoints, type Cents, type MoneyInput, type Scenario } from "./primitives";

export class MoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MoneyError";
  }
}

function assertCents(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_CENTS) {
    throw new MoneyError(`${label} must be integer cents in [0, ${MAX_CENTS}], got ${value}`);
  }
}

/**
 * Parse an explicit decimal dollar string ("1450", "1,450.00", "$1,450.5") to cents
 * by string splitting. Never uses parseFloat. Throws on invalid input.
 */
export function parseUsd(text: string): Cents {
  const cleaned = text.trim().replace(/^\$/, "").replace(/,/g, "");
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(cleaned);
  if (!m) throw new MoneyError(`not a dollar amount: ${JSON.stringify(text)}`);
  const dollars = Number(m[1]);
  const frac = (m[2] ?? "").padEnd(2, "0");
  const cents = dollars * 100 + Number(frac);
  assertCents(cents, "parsed amount");
  return cents;
}

/**
 * Format cents as US dollars. Whole-dollar amounts render without decimals
 * ("$1,391"); others render with two decimals ("$1,391.05"). Negative values
 * render with a leading minus ("-$54"). Explanations MUST use this formatter.
 */
export function formatUsd(cents: number): string {
  if (!Number.isSafeInteger(cents)) throw new MoneyError(`formatUsd expects integer cents, got ${cents}`);
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100);
  const rem = abs % 100;
  const whole = dollars.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return rem === 0 ? `${sign}$${whole}` : `${sign}$${whole}.${rem.toString().padStart(2, "0")}`;
}

/**
 * Multiply cents by a basis-point rate and round half up to a cent:
 *   floor((cents * bps + 5000) / 10000)
 * This is THE rounding rule for plan share (decision D-004). Applied per claim line,
 * before any maximum or sublimit cap, never on aggregates.
 */
export function applyRateRoundHalfUp(cents: Cents, bps: BasisPoints): Cents {
  assertCents(cents, "cents");
  if (!Number.isSafeInteger(bps) || bps < 0 || bps > 10_000) throw new MoneyError(`bps out of range: ${bps}`);
  return Math.floor((cents * bps + 5000) / 10_000);
}

/** a + b, checked. */
export function addCents(a: Cents, b: Cents): Cents {
  assertCents(a, "a");
  assertCents(b, "b");
  const r = a + b;
  assertCents(r, "sum");
  return r;
}

/** a - b, checked. Throws instead of going negative (balances never go negative). */
export function subCents(a: Cents, b: Cents): Cents {
  assertCents(a, "a");
  assertCents(b, "b");
  if (b > a) throw new MoneyError(`subtraction would go negative: ${a} - ${b}`);
  return a - b;
}

/** Saturating subtraction: max(0, a - b). Use only where the contract says "floor at 0". */
export function subFloorZero(a: Cents, b: Cents): Cents {
  assertCents(a, "a");
  assertCents(b, "b");
  return a > b ? a - b : 0;
}

export function minCents(...values: Cents[]): Cents {
  if (values.length === 0) throw new MoneyError("minCents needs at least one value");
  values.forEach((v, i) => assertCents(v, `values[${i}]`));
  return Math.min(...values);
}

export function sumCents(values: readonly Cents[]): Cents {
  return values.reduce<Cents>((acc, v) => addCents(acc, v), 0);
}

/**
 * How a value affects the member's cost, used to resolve ranges per scenario.
 * - `higher_is_worse`: charges, allowed amounts, deductible remaining, pending reserved plan pay.
 * - `higher_is_better`: annual maximum remaining, sublimit remaining, account balances.
 */
export type MemberCostDirection = "higher_is_worse" | "higher_is_better";

/**
 * Resolve a MoneyInput for a scenario. Returns null for `unknown` (caller must emit
 * an INPUT_MISSING / NEEDS_CONFIRMATION issue — never substitute zero).
 */
export function resolveMoney(input: MoneyInput, scenario: Scenario, direction: MemberCostDirection): Cents | null {
  switch (input.kind) {
    case "exact":
      return input.cents;
    case "unknown":
      return null;
    case "range": {
      const pickHigh = (scenario === "worst_case") === (direction === "higher_is_worse");
      return pickHigh ? input.high_cents : input.low_cents;
    }
  }
}

/** True when the input carries a range (results must then be shown as a range). */
export function isRange(input: MoneyInput): boolean {
  return input.kind === "range";
}

export const exact = (cents: Cents): MoneyInput => ({ kind: "exact", cents });
