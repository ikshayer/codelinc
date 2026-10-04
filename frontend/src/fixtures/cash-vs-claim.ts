import type { Cents, ISODate } from "@/lib/domain/types";

// Mock rows mirroring the backend's ScheduledEvent.route_comparison (contract 1.2.0,
// CONTRACT §5.9) for the backend's synthetic golden scenario
// (backend/fixtures/golden/expected.json → postvisit.route_comparisons).
// Every value is a literal copied from there; nothing is computed. Live wiring is deferred.

export type ClaimRoute = "IN_NETWORK_CLAIM" | "OUT_OF_NETWORK_CLAIM" | "SELF_PAY_NO_CLAIM";

export interface CashVsClaimRow {
  id: string;
  /** Which golden variant and alternative the row comes from; tells same-date rows apart. */
  scenarioLabel: string;
  procedureLabel: string;
  serviceDate: ISODate;
  /** The tier's claim route being compared against cash. */
  claimRoute: ClaimRoute;
  /** Whole care plan, worst case. null = not known yet (never 0). */
  claimTotalCents: Cents | null;
  cashTotalCents: Cents | null;
  differenceCents: Cents | null;
  /** null when either total is unknown. */
  winnerClaimRoute: ClaimRoute | null;
  /** What blocks the comparison, in member wording. */
  missing: { code: string; message: string }[];
  copy: string;
}

export const CASH_VS_CLAIM_ROWS: CashVsClaimRow[] = [
  {
    id: "base-earliest-fill-20261022",
    scenarioLabel: "Base plan, earliest completion",
    procedureLabel: "Filling, tooth 14",
    serviceDate: "2026-10-22",
    claimRoute: "IN_NETWORK_CLAIM",
    claimTotalCents: 145600,
    cashTotalCents: 142600,
    differenceCents: 3000,
    winnerClaimRoute: "SELF_PAY_NO_CLAIM",
    missing: [],
    copy:
      "Paying the office's $150 cash price for the filling on Oct 22, 2026 is projected to lower your total for this care plan by $30 (about $1,426 vs $1,456 if you file a claim). Estimates use the higher end of each range. Confirm with the office that you can pay cash without a claim before your visit.",
  },
  {
    id: "this-year-lowest-fill-20261203",
    scenarioLabel: "If the filling must be done this year, lowest cost",
    procedureLabel: "Filling, tooth 14",
    serviceDate: "2026-12-03",
    claimRoute: "IN_NETWORK_CLAIM",
    claimTotalCents: 145600,
    cashTotalCents: 142600,
    differenceCents: 3000,
    winnerClaimRoute: "SELF_PAY_NO_CLAIM",
    missing: [],
    copy:
      "Paying the office's $150 cash price for the filling on Dec 3, 2026 is projected to lower your total for this care plan by $30 (about $1,426 vs $1,456 if you file a claim). Estimates use the higher end of each range. Confirm with the office that you can pay cash without a claim before your visit.",
  },
  {
    id: "base-lowest-fill-20270105",
    scenarioLabel: "Base plan, lowest cost",
    procedureLabel: "Filling, tooth 14",
    serviceDate: "2027-01-05",
    claimRoute: "IN_NETWORK_CLAIM",
    claimTotalCents: 137200,
    cashTotalCents: null,
    differenceCents: null,
    winnerClaimRoute: null,
    missing: [{ code: "RULE_UNKNOWN", message: "The 2027 plan document doesn't say whether you can decline to file a claim." }],
    copy:
      "We can't compare cash for the Jan 5, 2027 filling yet: the 2027 plan document doesn't say whether you can decline to file a claim. Filing the claim is projected at $1,372 for the whole plan.",
  },
  {
    id: "office-unknown-fill-20261022",
    scenarioLabel: "If the office hasn't confirmed cash, earliest completion",
    procedureLabel: "Filling, tooth 14",
    serviceDate: "2026-10-22",
    claimRoute: "IN_NETWORK_CLAIM",
    claimTotalCents: 145600,
    cashTotalCents: null,
    differenceCents: null,
    winnerClaimRoute: null,
    missing: [{ code: "SELF_PAY_NOT_VERIFIED", message: "The office hasn't confirmed it accepts cash without a claim." }],
    copy:
      "Ask the office whether they accept $150 cash without a claim. Until they confirm, this plan assumes a claim ($1,456 total).",
  },
];
