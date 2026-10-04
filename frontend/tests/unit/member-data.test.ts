import { describe, expect, it } from "vitest";
import { memberExtraction, type MemberData } from "@/lib/adapters/live/member-data";

const data: MemberData = {
  member: { member_id: "member-42", display_name: "Test Member", observed_at: "2026-10-03T09:00:00-04:00", benefit_state: { benefit_year: 2026, plan_paid_ytd_cents: 48250, annual_maximum_remaining_cents: 101750, deductible_remaining_cents: { in_network: 2500 }, pending_claims: [{ claim_id: "pending-1" }] } },
  plan: { display_name: "Core", effective_from: "2026-01-01", effective_to: "2027-12-31", deductible: { in_network: { individual_cents: 5000 } }, annual_maximum: { individual_cents: 150000, preventive_counts_toward_maximum: true }, coverage: { basic: { in_network_plan_share_bps: 8000, deductible_applies: true } } },
  procedure_catalog: [{ cdt: "D2392", service_class: "basic" }], claims: [],
  procedure_card: { procedure_card_id: "card-42", procedures: [{ procedure_id: "procedure-42", cdt: "D2392", label: "Filling", dentist_estimated_fee_cents: 25499, target_by_date: "2026-11-04", earliest_safe_date: "2026-10-05", latest_safe_date: "2027-01-10", confirmation_status: "UNVERIFIED_AI_EXTRACTION_DEMO", dependencies: [] }] },
};

describe("database member intake", () => {
  it("imports actual balances and intersects dentist windows with benefit years", () => {
    const extraction = memberExtraction(data);
    const facts = Object.fromEntries(extraction.proposals.map((p) => [p.fieldPath, p.value]));
    expect(facts["plan.y1.alreadyUsed"]).toBe("482.50");
    expect(facts["plan.y1.deductibleSatisfied"]).toBe("25.00");
    expect(facts["care.p1.category"]).toBe("basic");
    expect(facts["timing.p1.y1.latest"]).toBe("2026-12-31");
    expect(facts["timing.p1.y2.earliest"]).toBe("2027-01-01");
    expect(extraction.evidence[0].sourceId).toBe("member-42");
  });
  it("does not turn estimates or missing confirmations into verified calculation inputs", () => {
    const facts = Object.fromEntries(memberExtraction(data).proposals.map((p) => [p.fieldPath, p.value]));
    expect(facts["care.p1.fee"]).toBeUndefined();
    expect(facts["care.p1.eligibilityConfirmed"]).toBeUndefined();
    expect(facts["timing.p1.permission"]).toBeUndefined();
    expect(facts["plan.y2.alreadyUsed"]).toBeUndefined();
    expect(facts["plan.y2.rulesUnchanged"]).toBeUndefined();
  });
  it("supports a member without a stored treatment card", () => {
    expect(memberExtraction({ ...data, procedure_card: null }).proposals.some((p) => p.fieldPath.startsWith("care."))).toBe(false);
  });
});
