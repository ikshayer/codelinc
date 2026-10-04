import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { IdentityForm, validateIdentity } from "@/features/intake/identity-form";
import { MemberBenefitSummary } from "@/features/intake/member-benefit-summary";
import { lookupMember, memberBenefitsExtraction, type MemberData } from "@/lib/adapters/live/member-data";
import { reducer, type StoreState } from "@/features/analysis/state";

const member: MemberData = {
  member: { member_id: "SYN-MEMBER-0002", display_name: "Parker Irwin", date_of_birth: "2018-02-28", observed_at: "2026-10-03T09:00:00-04:00", benefit_state: { benefit_year: 2026, annual_maximum_total_cents: 200000, plan_paid_ytd_cents: 27710, annual_maximum_remaining_cents: 172290, deductible_remaining_cents: { in_network: 2500 }, rollover_bank_cents: 30000, pending_claims: [{ claim_id: "pending", projected_plan_payment_cents: 9300 }], source: { type: "synthetic_member_portal_snapshot", status: "VERIFIED_DEMO", as_of: "2026-10-03T09:00:00-04:00" } } },
  plan: { display_name: "Stored member plan", effective_from: "2026-01-01", effective_to: "2026-12-31", deductible: { in_network: { individual_cents: 5000 } }, annual_maximum: { individual_cents: 200000, preventive_counts_toward_maximum: true }, coverage: { preventive: { in_network_plan_share_bps: 10000, deductible_applies: false }, basic: { in_network_plan_share_bps: 8000, deductible_applies: true }, major: { in_network_plan_share_bps: 5000, deductible_applies: true } } },
  procedure_card: null, procedure_catalog: [], claims: [],
};
const values = { displayName: "", fullName: "", contactEmail: "", memberId: "SYN-MEMBER-0002", month: "02", day: "28", year: "2018" };
afterEach(() => vi.unstubAllGlobals());

describe("required member identity", () => {
  it("renders only required Member ID and DOB in both form layouts", () => {
    for (const compact of [false, true]) {
      const html = renderToStaticMarkup(createElement(IdentityForm, { initial: null, submitLabel: "Continue", onSubmit: () => undefined, compact }));
      expect(html).toContain("Member ID"); expect(html).toContain("Date of birth"); expect(html.match(/aria-required="true"/g)).toHaveLength(4);
      for (const removed of [">Name<", "More details", "Full name", "Email", "(optional)"]) expect(html).not.toContain(removed);
    }
  });

  it("requires ID and a real DOB without requiring an editable name", () => {
    expect(validateIdentity(values).details).toMatchObject({ memberId: "SYN-MEMBER-0002", dateOfBirth: "2018-02-28" });
    expect(validateIdentity({ ...values, memberId: "" }).errors.memberId).toBeDefined();
    expect(validateIdentity({ ...values, month: "", day: "", year: "" }).errors.dateOfBirth).toBeDefined();
    expect(validateIdentity({ ...values, day: "30" }).errors.dateOfBirth).toBeDefined();
  });

  it("sends the exact pair and accepts only that returned member", async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => new Response(JSON.stringify(member), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const identity = { memberId: member.member.member_id, dateOfBirth: member.member.date_of_birth! };
    expect(await lookupMember(identity, new AbortController().signal)).toEqual({ ok: true, value: member });
    expect(fetchMock.mock.calls[0][0]).toBe("/api/demo/member-lookup"); expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).toEqual(identity);
    expect((await lookupMember({ ...identity, dateOfBirth: "2018-02-27" }, new AbortController().signal)).ok).toBe(false);
  });

  it("keeps expected no-match responses blocked without using a different member", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ matched: false }), { status: 200 })));
    const outcome = await lookupMember({ memberId: "missing", dateOfBirth: "2018-02-28" }, new AbortController().signal);
    expect(outcome).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
  });

  it("seeds benefits only and protects them from subsequent treatment intake", () => {
    const initial: StoreState = { epoch: 0, analyses: {}, profile: null, auth: { status: "guest" } };
    const seeded = reducer(initial, { type: "createAnalysis", id: "a", title: "Member treatment", patient: { displayName: member.member.display_name, memberId: member.member.member_id, dateOfBirth: member.member.date_of_birth }, now: member.member.observed_at, memberData: member });
    expect(Object.keys(seeded.analyses.a.draft.facts).some((p) => p.startsWith("care."))).toBe(false);
    const extraction = { proposals: [{ fieldPath: "plan.y1.annualMaximum", value: "99999", evidenceId: "voice" }, { fieldPath: "care.p1.label", value: "Filling", evidenceId: "voice" }], evidence: [{ id: "voice", kind: "voice" as const, sourceId: "voice", sourceLabel: "Treatment discussion", receivedAt: member.member.observed_at }], overflow: [], missingFieldPaths: [], reviewNotes: [] };
    const updated = reducer(seeded, { type: "applyDirectProposals", analysisId: "a", extraction, now: member.member.observed_at });
    expect(updated.analyses.a.draft.facts["plan.y1.annualMaximum"].value).toBe("2000.00"); expect(updated.analyses.a.draft.facts["care.p1.label"].value).toBe("Filling");
  });

  it("permits the authorized conservative path only with verified source and known projections", () => {
    expect(memberBenefitsExtraction(member).evidence[0].blockingIssues).toEqual([]);
    expect(memberBenefitsExtraction(member).reviewNotes[0].message).toContain("Conservative base-benefit estimate");
    const missing = structuredClone(member); missing.member.benefit_state.pending_claims = [{ claim_id: "pending" }];
    expect(memberBenefitsExtraction(missing).evidence[0].blockingIssues).toEqual(expect.arrayContaining([expect.objectContaining({ code: "PENDING_CLAIMS" })]));
    const html = renderToStaticMarkup(createElement(MemberBenefitSummary, { data: member }));
    for (const text of ["$277.10", "$1,722.90", "$93", "$300", "Conservative base-benefit estimate only", "excludes the unconfirmed rollover bank"]) expect(html).toContain(text);
  });
});
