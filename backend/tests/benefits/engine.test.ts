import { describe, expect, it } from "vitest";
import { MemberState, ProviderOption, SimulationResult, type ClaimEvent } from "@/domain";
import { benefitEngine, loadRegistry } from "@/benefits";
import memberJson from "../../fixtures/synthetic/member.json";
import providersJson from "../../fixtures/synthetic/providers.postvisit.json";

const AS_OF = "2026-10-15T21:00:00Z";
const member = () => MemberState.parse(structuredClone(memberJson));
const providers = () => ProviderOption.array().parse(structuredClone(providersJson));
const ev = (o: Partial<ClaimEvent>): ClaimEvent => ({
  event_id: "e1",
  procedure_id: "p1",
  cdt_code: "D2392",
  tooth: "14",
  service_date: "2026-11-05",
  claim_date: null,
  provider_id: "prov-rivera",
  claim_route: "IN_NETWORK_CLAIM",
  ...o,
});
const run = (events: ClaimEvent[], m = member(), p = providers()) =>
  SimulationResult.parse(benefitEngine.simulate(loadRegistry(), { as_of: AS_OF, scenario: "worst_case", member: m, providers: p, events }));

describe("benefit engine", () => {
  it("rounds plan share half up per line, before the cap", () => {
    const p = providers();
    p[0]!.pricing.find((x) => x.cdt_code === "D2392")!.contracted_allowed!.value = { kind: "exact", cents: 18001 };
    const m = member();
    m.pending_claims = [];
    // 80% × (18001 − 5000) = 10400.8 → 10401
    expect(run([ev({})], m, p).lines[0]!.plan_pay_cents).toBe(10401);
  });

  it("Dec 31 uses the 2026 period and Jan 1 the fresh 2027 period", () => {
    const s = run([ev({ event_id: "a", service_date: "2026-12-31" }), ev({ event_id: "b", service_date: "2027-01-01" })]);
    expect(s.lines.map((l) => l.plan_version_id)).toEqual(["nwd-ppo-standard-2026", "nwd-ppo-standard-2027"]);
    expect(s.lines[1]!.state_before!.opened_from).toBe("plan_rules");
    expect(s.ledger_before.periods.map((p) => p.plan_version_id)).toEqual(["nwd-ppo-standard-2026", "nwd-ppo-standard-2027"]);
    // (1.5) The VERIFIED 2026 carryover closes once at the 2027 open: not earned ($500+ paid), nothing added.
    expect(s.rollover.map((o) => [o.closing_plan_version_id, o.status])).toEqual([["nwd-ppo-standard-2026", "NOT_EARNED"]]);
    expect(s.issues.some((i) => i.rule_id === "rollover.2026")).toBe(false);
    expect(s.lines[1]!.state_before!.annual_max_remaining_cents).toBe(150000);
  });

  it("an UNVERIFIED carryover is noted at the next period open, never applied", () => {
    const reg = structuredClone(loadRegistry());
    const rule = reg.plans.find((p) => p.plan_version_id === "nwd-ppo-standard-2026")!.rules.find((r) => r.rule_id === "rollover.2026")!;
    rule.status = "UNVERIFIED";
    const s = benefitEngine.simulate(reg, {
      as_of: "2026-10-15T21:00:00Z",
      scenario: "best_case",
      member: member(),
      providers: providers(),
      events: [ev({ event_id: "a", service_date: "2026-12-31" }), ev({ event_id: "b", service_date: "2027-01-01" })],
    });
    expect(s.issues.some((i) => i.code === "RULE_UNVERIFIED" && i.rule_id === "rollover.2026")).toBe(true);
    expect(s.rollover).toEqual([]);
    expect(s.lines[1]!.state_before!.annual_max_remaining_cents).toBe(150000);
  });

  it("a CONFLICT frequency rule blocks with one issue per conflicting rule", () => {
    const line = run([ev({ cdt_code: "D2740", tooth: "30", service_date: "2027-02-09" })]).lines[0]!;
    expect(line.status).toBe("NEEDS_CONFIRMATION");
    expect(line.issues.filter((i) => i.code === "RULE_CONFLICT").map((i) => i.rule_id)).toEqual([
      "frequency_limit.crowns.2027",
      "frequency_limit.crowns_note_4.2027",
    ]);
  });

  it("a second crown on the same tooth within 60 months is NOT_COVERED, priced, and leaves state unchanged", () => {
    const s = run([
      ev({ event_id: "a", cdt_code: "D2740", tooth: "30", service_date: "2026-10-20" }),
      ev({ event_id: "b", cdt_code: "D2740", tooth: "30", service_date: "2026-11-05" }),
    ]);
    const b = s.lines[1]!;
    expect(b.status).toBe("NOT_COVERED");
    expect(b.member_responsibility_cents).toBe(b.patient_charge_cents);
    expect(b.state_after).toEqual(b.state_before);
  });
});

describe("benefit engine (1.4) source authority and route order", () => {
  const plan2026 = (reg: ReturnType<typeof loadRegistry>) => reg.plans.find((p) => p.plan_version_id === "nwd-ppo-standard-2026")!;

  it("a rule citing an educational and an authoritative source still validates", () => {
    const reg = structuredClone(loadRegistry());
    const plan = plan2026(reg);
    const src = reg.sources.find((s) => s.source_id === plan.source_documents[0]!.source_id)!;
    const edu = { ...structuredClone(src), source_id: "nwd-ppo-2026-faq", document_role: "educational" as const };
    reg.sources.push(edu);
    plan.source_documents.push({ source_id: edu.source_id, sha256: edu.sha256 });
    plan.source_precedence = [...plan.source_precedence, edu.source_id];
    const rule = plan.rules.find((r) => r.rule_id === "deductible.2026")!;
    rule.evidence.push({ ...rule.evidence[0]!, source_id: edu.source_id });
    expect(benefitEngine.validatePlan(reg, plan).issues).toEqual([]);
    // Backed by the educational source alone → rejected for that rule only.
    rule.evidence = rule.evidence.filter((e) => e.source_id === edu.source_id);
    const report = benefitEngine.validatePlan(reg, plan);
    expect(report.ok).toBe(false);
    expect(report.issues.map((i) => [i.code, i.rule_id])).toEqual([["SOURCE_NOT_AUTHORITATIVE", "deductible.2026"]]);
  });

  it("plan resolution runs before the route check", () => {
    const m = member();
    m.plan_key.group_id = "other-group";
    const line = run([ev({ claim_route: "OUT_OF_NETWORK_CLAIM" })], m).lines[0]!;
    expect(line.issues.map((i) => i.code)).toEqual(["PLAN_NOT_FOUND"]);
    expect(line.network_tier).toBeNull();
  });
});
