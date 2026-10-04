/**
 * DEFECT (P1, dental-benefits / data/plans): every number a VERIFIED rule feeds into the math must
 * be visible in its literal evidence quote. oon_allowance_schedule.<y> quotes only the table header
 * ("| Procedure code | Out-of-Network Allowance |"), so $65/$25/... used for BrightSmile are unbacked.
 */
import { describe, expect, it } from "vitest";
import { formatUsd } from "@/domain";
import { registry } from "../acceptance/helpers";

describe("evidence quotes contain the values used", () => {
  for (const plan of registry().plans) {
    for (const rule of plan.rules.filter((r) => r.status === "VERIFIED" && r.rule_type === "oon_allowance_schedule")) {
      it(`${rule.rule_id}: every allowance row is quoted`, () => {
        const quotes = rule.evidence.map((e) => e.quote).join("\n");
        const v = rule.value as { allowances: { cdt_code: string; cents: number }[] };
        const missing = v.allowances.filter((a) => !quotes.includes(`| ${a.cdt_code} | ${formatUsd(a.cents)} |`));
        expect(missing.map((a) => a.cdt_code)).toEqual([]);
      });
    }
  }
});
