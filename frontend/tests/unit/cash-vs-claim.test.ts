import { describe, expect, it } from "vitest";
import { CASH_VS_CLAIM_ROWS } from "@/fixtures/cash-vs-claim";
import { cashVsClaimVerdict } from "@/features/analysis/compare/explanations";

// Fixture-data checks only. These do NOT prove the backend route comparison.

const FORBIDDEN = ["AI determined", "benefits expire", "guaranteed", "in-system", "out-of-system"]; // backend WORDING.forbidden_phrases

describe("cash vs claim fixture", () => {
  it("rows are internally consistent and unknown is never 0", () => {
    for (const row of CASH_VS_CLAIM_ROWS) {
      const known = row.claimTotalCents !== null && row.cashTotalCents !== null;
      expect(row.differenceCents === null, row.id).toBe(!known);
      expect(row.winnerClaimRoute === null, row.id).toBe(!known);
      expect(row.missing.length > 0, row.id).toBe(!known);
      if (known) expect(row.differenceCents).toBe(Math.abs(row.claimTotalCents! - row.cashTotalCents!));
    }
  });

  it("rows sharing a procedure and date are told apart by their scenario label", () => {
    const keys = CASH_VS_CLAIM_ROWS.map((row) => `${row.procedureLabel}|${row.serviceDate}|${row.scenarioLabel}`);
    expect(new Set(keys).size).toBe(keys.length);
    for (const row of CASH_VS_CLAIM_ROWS) expect(row.scenarioLabel.trim(), row.id).not.toBe("");
  });

  it("copy avoids forbidden phrases", () => {
    for (const row of CASH_VS_CLAIM_ROWS) {
      for (const phrase of FORBIDDEN) expect(row.copy.toLowerCase()).not.toContain(phrase.toLowerCase());
    }
  });
});

describe("cashVsClaimVerdict", () => {
  it("maps the winner field to a recommendation", () => {
    expect(cashVsClaimVerdict("SELF_PAY_NO_CLAIM")).toBe("payCash");
    expect(cashVsClaimVerdict("IN_NETWORK_CLAIM")).toBe("fileClaim");
    expect(cashVsClaimVerdict(null)).toBe("confirmFirst");
  });
});
