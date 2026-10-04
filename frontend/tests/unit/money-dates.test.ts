import { describe, expect, it } from "vitest";
import { isoFromParts, isValidIsoDate } from "@/lib/domain/dates";
import { formatCents, parseDollarsToCents, parsePercentToBasisPoints } from "@/lib/domain/money";

describe("parseDollarsToCents", () => {
  it("parses dollar signs and thousands separators", () => {
    expect(parseDollarsToCents("$1,500")).toEqual({ ok: true, value: 150000 });
  });
  it("pads a single fractional digit to cents", () => {
    expect(parseDollarsToCents("1500.5")).toEqual({ ok: true, value: 150050 });
  });
  it("treats blank as not-ok, never zero", () => {
    expect(parseDollarsToCents("").ok).toBe(false);
    expect(parseDollarsToCents("   ").ok).toBe(false);
    expect(parseDollarsToCents("$").ok).toBe(false);
  });
  it("accepts an explicit zero", () => {
    expect(parseDollarsToCents("0")).toEqual({ ok: true, value: 0 });
  });
  it("rejects non-numeric, negative and sub-cent input", () => {
    expect(parseDollarsToCents("abc").ok).toBe(false);
    expect(parseDollarsToCents("-5").ok).toBe(false);
    expect(parseDollarsToCents("1.234").ok).toBe(false);
  });
});

describe("parsePercentToBasisPoints", () => {
  it("converts whole percent to basis points", () => {
    expect(parsePercentToBasisPoints("80")).toEqual({ ok: true, value: 8000 });
    expect(parsePercentToBasisPoints("80%")).toEqual({ ok: true, value: 8000 });
  });
  it("allows 0 and 100", () => {
    expect(parsePercentToBasisPoints("0")).toEqual({ ok: true, value: 0 });
    expect(parsePercentToBasisPoints("100")).toEqual({ ok: true, value: 10000 });
  });
  it("rejects more than 100 percent, blank and junk", () => {
    expect(parsePercentToBasisPoints("101").ok).toBe(false);
    expect(parsePercentToBasisPoints("").ok).toBe(false);
    expect(parsePercentToBasisPoints("eighty").ok).toBe(false);
  });
});

describe("formatCents", () => {
  it("formats integer cents", () => {
    expect(formatCents(150000)).toBe("$1,500");
    expect(formatCents(150025)).toBe("$1,500.25");
  });
  // Source bug: Intl minimumFractionDigits is 0, so 150050 renders "$1,500.5".
  it("shows two decimals when cents are not whole dollars", () => {
    expect(formatCents(150050)).toBe("$1,500.50");
  });
  it("rejects non-integer cents instead of rounding", () => {
    expect(() => formatCents(10.5)).toThrow();
    expect(() => formatCents(Number.NaN)).toThrow();
  });
});

describe("isoFromParts", () => {
  it("builds a zero-padded ISO date", () => {
    expect(isoFromParts("1", "5", "2026")).toBe("2026-01-05");
  });
  it("rejects Feb 30 and other impossible dates", () => {
    expect(isoFromParts("2", "30", "2026")).toBeNull();
    expect(isoFromParts("13", "1", "2026")).toBeNull();
    expect(isoFromParts("2", "29", "2027")).toBeNull();
  });
  it("accepts a leap day only in leap years", () => {
    expect(isoFromParts("2", "29", "2028")).toBe("2028-02-29");
    expect(isValidIsoDate("2026-02-30")).toBe(false);
  });
  it("rejects non-numeric or short-year parts", () => {
    expect(isoFromParts("a", "1", "2026")).toBeNull();
    expect(isoFromParts("1", "1", "26")).toBeNull();
  });
});
