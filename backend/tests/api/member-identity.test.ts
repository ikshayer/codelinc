import { describe, expect, it } from "vitest";
import type { Db } from "mongodb";
import { lookupMongoMember } from "../../src/api/mongo-demo";
import { calculateRequestWithMember } from "../../src/api/calculate";
import { originalScenario } from "../analysis/helpers";
import { COLLECTIONS } from "../../src/db/collections";

const identity = { memberId: "SYN-MEMBER-0021", dateOfBirth: "1974-08-19" };
function benefits(memberId = identity.memberId, dateOfBirth = identity.dateOfBirth, maximum = 150000, paid = 13360, share = 5000) {
  return { synthetic_demo: true, member: { member_id: memberId, display_name: "Parker Patel", date_of_birth: dateOfBirth, plan_version_id: `plan-${maximum}`, member_snapshot_id: `${memberId}-v1`, observed_at: "2026-10-03T21:30:00-04:00", coverage_effective_from: "2026-01-01",
    benefit_state: { benefit_year: 2026, annual_maximum_total_cents: maximum, plan_paid_ytd_cents: paid, annual_maximum_remaining_cents: maximum - paid, deductible_remaining_cents: { in_network: 0 }, rollover_bank_cents: 0, pending_claims: [] as { projected_plan_payment_cents?: number }[], source: { status: "VERIFIED_DEMO" } } },
    plan: { plan_version_id: `plan-${maximum}`, display_name: `Plan ${maximum}`, effective_from: "2026-01-01", effective_to: "2027-12-31", verification_status: "VERIFIED_DEMO", deductible: { in_network: { individual_cents: 5000 } }, annual_maximum: { individual_cents: maximum, preventive_counts_toward_maximum: true, accumulator_basis: "plan_paid_amount" },
      coverage: { preventive: { in_network_plan_share_bps: 10000, deductible_applies: false }, basic: { in_network_plan_share_bps: 8000, deductible_applies: true }, major: { in_network_plan_share_bps: share, deductible_applies: true } }, rollover: { enabled: true } }, procedure_card: null, claims: [], procedure_catalog: [] };
}
function request() {
  const scenario = originalScenario();
  scenario.procedures = [{ ...scenario.procedures[3], contractedFeeCents: 200000, timingPermission: "unknown", windows: [] }];
  scenario.dependencies = [];
  return { requestId: "member-request", analysisId: "member-analysis", revision: 0, scenario, memberIdentity: identity };
}

describe("exact member identity and authoritative benefits", () => {
  it("queries ID and DOB together, returns linked plan, strips Mongo IDs and keeps a null procedure card", async () => {
    const data = benefits();
    const queries: Record<string, unknown>[] = [];
    const db = { collection(name: string) { return {
      async findOne(query: Record<string, unknown>) {
        if (name === COLLECTIONS.datasets) return { status: "ready", procedure_catalog: [] };
        if (name === COLLECTIONS.memberSnapshots) { queries.push(query); return query.member_id === identity.memberId && query.date_of_birth === identity.dateOfBirth ? { ...data.member, _id: "private" } : null; }
        if (name === COLLECTIONS.plans) return query.plan_version_id === data.member.plan_version_id ? { ...data.plan, _id: "private" } : null;
        return null;
      }, find() { return { sort() { return { async toArray() { return []; } }; } }; },
    }; } } as unknown as Db;
    const matched = await lookupMongoMember(db, identity);
    expect(matched.status).toBe(200);
    expect(matched.body).toMatchObject({ member: { member_id: identity.memberId }, plan: { plan_version_id: data.member.plan_version_id }, procedure_card: null });
    expect(JSON.stringify(matched.body)).not.toContain("private");
    expect(queries[0]).toMatchObject({ member_id: identity.memberId, date_of_birth: identity.dateOfBirth });
    const wrongDob = await lookupMongoMember(db, { ...identity, dateOfBirth: "1974-08-18" });
    const unknown = await lookupMongoMember(db, { ...identity, memberId: "UNKNOWN-MEMBER" });
    expect(wrongDob).toEqual(unknown);
    expect(wrongDob).toEqual({ status: 200, body: { matched: false } });
    const count = queries.length;
    expect((await lookupMongoMember(db, { ...identity, dateOfBirth: "1974-02-30" })).status).toBe(422);
    expect((await lookupMongoMember(db, { ...identity, unrecognized: true })).status).toBe(422);
    expect(queries).toHaveLength(count);
  });
  it("matches only the normalized full name AND DOB and rejects ambiguous identities without leaking candidates", async () => {
    const data = benefits(); let ambiguous = false;
    const db = { collection(name: string) { return {
      async distinct(_field: string, query: { display_name: RegExp; date_of_birth: string }) {
        if (query.date_of_birth !== identity.dateOfBirth || !query.display_name.test(data.member.display_name)) return [];
        return ambiguous ? [identity.memberId, "SYN-MEMBER-0999"] : [identity.memberId];
      },
      async findOne(query: Record<string, unknown>) {
        if (name === COLLECTIONS.datasets) return { status: "ready", procedure_catalog: [] };
        if (name === COLLECTIONS.memberSnapshots) return query.member_id === identity.memberId && query.date_of_birth === identity.dateOfBirth && (query.display_name as RegExp).test(data.member.display_name) ? data.member : null;
        if (name === COLLECTIONS.plans) return data.plan;
        return null;
      }, find() { return { sort() { return { async toArray() { return []; } }; } }; },
    }; } } as unknown as Db;
    expect((await lookupMongoMember(db, { displayName: "  pArKeR   PATEL  ", dateOfBirth: identity.dateOfBirth })).body).toMatchObject({ member: { member_id: identity.memberId }, procedure_card: null });
    for (const pair of [{ displayName: "Parker", dateOfBirth: identity.dateOfBirth }, { displayName: "Parker Patel", dateOfBirth: "1974-08-18" }, { displayName: "Parker.*", dateOfBirth: identity.dateOfBirth }]) expect(await lookupMongoMember(db, pair)).toEqual({ status: 200, body: { matched: false } });
    ambiguous = true;
    expect(await lookupMongoMember(db, { displayName: "Parker Patel", dateOfBirth: identity.dateOfBirth })).toEqual({ status: 200, body: { matched: false } });
  });
  it("uses distinct linked plan and settled balances and discards browser rule and balance edits", async () => {
    const body = request();
    for (const year of body.scenario.plan.years) { year.annualMaximumCents = 999999; year.deductibleCents = 0; year.utilization.priorInsurerPaymentsCents = 0; year.utilization.priorDeductibleSatisfiedCents = 0; year.rules.major.insurerBasisPoints = 10000; }
    const core = await calculateRequestWithMember(body, async (pair) => { expect(pair).toEqual(identity); return { status: 200, body: benefits() }; });
    expect(core).toMatchObject({ status: 200, body: { baseline: { totalInsurerCents: 100000, totalPatientCents: 100000 }, memberBenefitContext: { settledPlanPaidCents: 13360, baseRemainingCents: 136640 } } });
    const other = { memberId: "SYN-MEMBER-0024", dateOfBirth: "2004-04-19" };
    const value = await calculateRequestWithMember({ ...body, memberIdentity: other }, async () => ({ status: 200, body: benefits(other.memberId, other.dateOfBirth, 100000, 52320, 4000) }));
    expect(value).toMatchObject({ status: 200, body: { baseline: { totalInsurerCents: 47680, totalPatientCents: 152320 }, memberBenefitContext: { baseRemainingCents: 47680, settledPlanPaidCents: 52320 } } });
  });
  it("returns a conservative Parker estimate with settled usage, pending reserve and excluded bank separate", async () => {
    const parker = { memberId: "SYN-MEMBER-0002", dateOfBirth: "2018-02-28" };
    const data = benefits(parker.memberId, parker.dateOfBirth, 200000, 27710, 6000);
    data.member.benefit_state.pending_claims = [{ projected_plan_payment_cents: 9300 }];
    data.member.benefit_state.rollover_bank_cents = 30000;
    data.member.benefit_state.deductible_remaining_cents.in_network = 2500;
    data.plan.deductible.in_network.individual_cents = 2500;
    const body = request(); body.scenario.procedures[0].contractedFeeCents = 300000;
    const result = await calculateRequestWithMember({ ...body, memberIdentity: parker }, async () => ({ status: 200, body: data }));
    expect(result).toMatchObject({ status: 200, body: { baseline: { totalInsurerCents: 162990, totalPatientCents: 137010, ledgers: [{ maximum: { totalCents: 200000, usedBeforeCents: 27710, reservedBeforeCents: 9300, consumedInScheduleCents: 162990, remainingCents: 0 }, deductible: { appliedInScheduleCents: 2500 } }, {}] }, memberBenefitContext: { settledPlanPaidCents: 27710, baseRemainingCents: 172290, pendingProjectedPlanPaymentCents: 9300, baseAvailableAfterPendingCents: 162990, rolloverBankCents: 30000, deductibleRemainingCents: 2500, status: "CONSERVATIVE", estimateKind: "CONSERVATIVE_BASE_ONLY", pendingTreatment: "RESERVED_PROJECTED", rolloverTreatment: "EXCLUDED_UNCONFIRMED" } } });
    expect(result.body).not.toHaveProperty("error");
  });
  it("keeps an unknown pending projection unknown and blocks it instead of reserving zero", async () => {
    const data = benefits(); data.member.benefit_state.pending_claims = [{}];
    const result = await calculateRequestWithMember(request(), async () => ({ status: 200, body: data }));
    expect(result).toMatchObject({ status: 422, body: { error: { code: "NEEDS_CONFIRMATION" }, memberBenefitContext: { pendingProjectedPlanPaymentCents: null, baseAvailableAfterPendingCents: null, pendingTreatment: "UNKNOWN" } } });
  });
  it("never leaks benefits or falls back to guest values after mismatch or database failure", async () => {
    const missing = await calculateRequestWithMember(request(), async () => ({ status: 200, body: { matched: false } }));
    expect(missing).toMatchObject({ status: 404, body: { error: { code: "MEMBER_NOT_FOUND" } } });
    expect(missing.body).not.toHaveProperty("memberBenefitContext");
    expect((await calculateRequestWithMember(request(), async () => { throw new Error("private connection string"); })).status).toBe(503);
  });
  it("does not read the database for guests, invalid requests or revision conflicts", async () => {
    const lookup = async () => { throw new Error("Lookup must not run"); };
    const { memberIdentity: _identity, ...guest } = request();
    expect((await calculateRequestWithMember(guest, lookup)).status).toBe(200);
    expect((await calculateRequestWithMember({ ...request(), revision: 1 }, lookup)).status).toBe(409);
    expect((await calculateRequestWithMember({ ...request(), arbitrary: true }, lookup)).status).toBe(422);
    expect((await calculateRequestWithMember({ ...request(), memberIdentity: { memberId: identity.memberId } }, lookup)).status).toBe(422);
  });
  it("blocks stale sources, unlinked plans, inconsistent balances and pre-enrollment care", async () => {
    for (const alter of [
      (data: ReturnType<typeof benefits>) => { data.member.benefit_state.source.status = "STALE_DEMO"; },
      (data: ReturnType<typeof benefits>) => { data.plan.plan_version_id = "unlinked-plan"; },
      (data: ReturnType<typeof benefits>) => { data.member.benefit_state.annual_maximum_remaining_cents = 1; },
      (data: ReturnType<typeof benefits>) => { data.member.coverage_effective_from = "2026-12-01"; },
    ]) { const data = benefits(); alter(data); expect((await calculateRequestWithMember(request(), async () => ({ status: 200, body: data }))).status).toBe(422); }
  });
});
