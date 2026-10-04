/** Contract tests for frozen primitives. PLANNER-OWNED. Must pass at freeze time. */
import { describe, expect, it } from "vitest";
import {
  addDays,
  addMonths,
  applyRateRoundHalfUp,
  diffDays,
  formatDisplayDate,
  formatUsd,
  IsoDate,
  isValidIsoDate,
  localDateOf,
  MoneyInput,
  parseFactId,
  parseUsd,
  resolveMoney,
  subCents,
  weekdayOf,
} from "@/domain";

describe("money", () => {
  it("parses dollar strings by splitting, never floats", () => {
    expect(parseUsd("1450")).toBe(145000);
    expect(parseUsd("$1,450.00")).toBe(145000);
    expect(parseUsd("0.1")).toBe(10);
    expect(parseUsd("19.99")).toBe(1999);
    expect(() => parseUsd("1.999")).toThrow();
    expect(() => parseUsd("-5")).toThrow();
  });
  it("formats whole dollars without decimals and others with two", () => {
    expect(formatUsd(137200)).toBe("$1,372");
    expect(formatUsd(137201)).toBe("$1,372.01");
    expect(formatUsd(0)).toBe("$0");
    expect(formatUsd(-5400)).toBe("-$54");
  });
  it("rounds plan share half up per line (CareWindow test K)", () => {
    expect(applyRateRoundHalfUp(101, 5000)).toBe(51);
    expect(applyRateRoundHalfUp(95000, 8000)).toBe(76000);
    expect(applyRateRoundHalfUp(10500, 8000)).toBe(8400);
    expect(applyRateRoundHalfUp(1, 5000)).toBe(1);
    expect(applyRateRoundHalfUp(3, 3333)).toBe(1);
  });
  it("never goes negative", () => {
    expect(() => subCents(100, 101)).toThrow();
  });
  it("resolves ranges per scenario and direction; unknown is never zero", () => {
    const r: MoneyInput = { kind: "range", low_cents: 100, high_cents: 200 };
    expect(resolveMoney(r, "worst_case", "higher_is_worse")).toBe(200);
    expect(resolveMoney(r, "best_case", "higher_is_worse")).toBe(100);
    expect(resolveMoney(r, "worst_case", "higher_is_better")).toBe(100);
    expect(resolveMoney(r, "best_case", "higher_is_better")).toBe(200);
    expect(resolveMoney({ kind: "unknown" }, "worst_case", "higher_is_worse")).toBeNull();
    expect(() => MoneyInput.parse({ kind: "range", low_cents: 5, high_cents: 4 })).toThrow();
  });
});

describe("dates", () => {
  it("validates real calendar dates", () => {
    expect(isValidIsoDate("2027-02-28")).toBe(true);
    expect(isValidIsoDate("2027-02-29")).toBe(false);
    expect(isValidIsoDate("2028-02-29")).toBe(true);
    expect(() => IsoDate.parse("2027-02-30")).toThrow();
  });
  it("does day arithmetic in epoch days", () => {
    expect(diffDays("2026-10-20", "2026-11-05")).toBe(16);
    expect(diffDays("2026-10-15", "2027-01-05")).toBe(82);
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2026-10-20", -60)).toBe("2021-10-20");
    expect(addMonths("2024-01-01", 12)).toBe("2025-01-01");
    expect(weekdayOf("2026-10-20")).toBe(2); // Tuesday
    expect(weekdayOf("2026-10-17")).toBe(6); // Saturday
    expect(weekdayOf("2026-10-19")).toBe(1); // Monday
  });
  it("derives the member-local as-of date", () => {
    expect(localDateOf("2026-10-15T21:00:00Z", "America/New_York")).toBe("2026-10-15");
    expect(localDateOf("2026-10-16T02:00:00Z", "America/New_York")).toBe("2026-10-15");
  });
  it("formats display dates for explanations", () => {
    expect(formatDisplayDate("2026-11-05")).toBe("Nov 5, 2026");
  });
});

describe("fact ids", () => {
  it("parses every namespace and rejects junk", () => {
    expect(parseFactId("rule:annual_maximum.2026")).toEqual({ kind: "rule", ref: "annual_maximum.2026" });
    expect(parseFactId("input:member.budget")?.kind).toBe("input");
    expect(parseFactId("calc:alt-1-e2.plan_pay")?.kind).toBe("calc");
    expect(parseFactId("proc:proc-rc-30.urgency")?.kind).toBe("proc");
    expect(parseFactId("proc:proc-rc-30.favorite_color")).toBeNull();
    expect(parseFactId("annual_maximum.2026")).toBeNull();
  });
});
