import { describe, expect, it } from "vitest";
import { adaptMongoDocuments } from "../../src/adapter/mongo-optimizer.js";

describe("MongoDB optimizer adapter", () => {
  it("normalizes expanded MongoDB documents and filters unavailable slots", () => {
    const context = adaptMongoDocuments({
      member: { member_id: "M-1", plan_version_id: "P-1", observed_at: "2026-10-01T00:00:00Z", benefit_state: {} },
      plan: { plan_version_id: "P-1" },
      providers: [{ provider_id: "PR-1", display_name: "Dental", specialties: ["general_dentistry"], network_status_by_plan: { "P-1": "in_network" } }],
      quotes: [{ provider_id: "PR-1", cdt: "D0120", provider_charge_cents: 10000, in_network_allowed_cents: 8000 }],
      appointments: [{ provider_id: "PR-1", appointment_id: "A-1", start: "2026-10-02T09:00:00-04:00", duration_minutes: 30, supported_cdts: ["D0120"], status: "available" }, { provider_id: "PR-1", appointment_id: "A-2", start: "2026-10-03T09:00:00-04:00", duration_minutes: 30, supported_cdts: ["D0120"], status: "held" }],
      procedureCard: { procedures: [{ procedure_id: "PROC-1", cdt: "D0120", label: "Exam", dentist_estimated_fee_cents: 10000, required_specialty: "general", earliest_safe_date: "2026-10-01", target_by_date: "2026-10-05", latest_safe_date: "2026-10-10", confirmation_status: "DENTIST_AND_MEMBER_CONFIRMED_DEMO" }] },
    });
    expect(context.providers[0]?.network).toBe("in_network");
    expect(context.providers[0]?.slots).toHaveLength(1);
    expect(context.procedures[0]?.confirmed).toBe(true);
  });
});
