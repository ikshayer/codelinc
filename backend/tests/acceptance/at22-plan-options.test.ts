/**
 * AT-22: Value / Standard / Enhanced plan options (CONTRACT §2.5, §3.10; requirements PLAN-001,
 * PLAN-004, §13, §14.1 #5/#6/#8). PLANNER-OWNED, FROZEN (1.6). Plan-option runs use a fresh 2026
 * member per option (fixtures/golden/expected.json → plan_options) and the shipped registry unless a
 * registry copy is named.
 */
import { describe, expect, it } from "vitest";
import {
  MemberState,
  PlanOptionsResult,
  registryRuleIdProblems,
  SimulationResult,
  type ClaimEvent,
  type PlanDefinition,
  type PlanRegistry,
  type ProviderOption,
  type RolloverOutcome,
} from "@/domain";
import type { ApiResponseLike } from "@/domain/ports";
import { createApiHandlers } from "@/api";
import { benefits, fx, golden, optimize, P1, P2, PV2026, registry } from "./helpers";

const PO = golden.plan_options;
const PV = { "ppo-value": "nwd-ppo-value-2026", "ppo-standard": PV2026, "ppo-enhanced": "nwd-ppo-enhanced-2026" } as const;
type Option = keyof typeof PV;
const NAME: Record<Option, string> = { "ppo-value": "PPO Value", "ppo-standard": "PPO Standard", "ppo-enhanced": "PPO Enhanced" };
const exact = (cents: number) => ({ kind: "exact" as const, cents });
const listed = (o: Option) => PO.listing.find((l) => l.plan_option_id === o)!;

/** Fresh 2026 member on `option`: full deductible and maximum, nothing paid, carryover $0. */
function optionMember(option: Option, o: { effectiveFrom?: string; ytd?: number; carry?: number } = {}): MemberState {
  const m = fx.member();
  const ytd = o.ytd ?? 0;
  const carry = o.carry ?? 0;
  m.plan_key.plan_option_id = option;
  m.coverage_effective_from = o.effectiveFrom ?? "2024-01-01";
  const a = m.accumulators.find((x) => x.plan_version_id === PV2026)!;
  a.plan_version_id = PV[option];
  a.deductible_remaining.value = exact(listed(option).deductible_cents);
  a.annual_max_remaining.value = exact(listed(option).annual_maximum_cents + carry - ytd);
  a.plan_paid_ytd.value = exact(ytd);
  a.carryover_balance = { ...a.carryover_balance!, value: exact(carry) };
  m.accumulators = [a];
  m.pending_claims = [];
  m.procedure_history = [];
  return MemberState.parse(m);
}

const EVENTS: ClaimEvent[] = PO.events.map((e) => ({ ...e, claim_date: null, claim_route: "IN_NETWORK_CLAIM" as const }));
const E1 = EVENTS[0]!;

/** Rivera with extra test-only prices for codes the golden fixture does not price (D6010, D8080). */
function providers(): ProviderOption[] {
  const list = fx.providersPost();
  const rivera = list.find((p) => p.provider_id === P1)!;
  const crown = rivera.pricing.find((r) => r.cdt_code === "D2740")!;
  for (const code of ["D6010", "D8080"]) {
    const id = `provider.${P1}.price.${code.toLowerCase()}`;
    rivera.pricing.push({
      ...structuredClone(crown),
      cdt_code: code,
      provider_charge: { ...crown.provider_charge!, input_id: `${id}.charge`, value: exact(300000) },
      contracted_allowed: { ...crown.contracted_allowed!, input_id: `${id}.allowed`, value: exact(220000) },
    });
  }
  return list;
}

function sim(events: ClaimEvent[], m: MemberState, reg: PlanRegistry = registry()): SimulationResult {
  return SimulationResult.parse(
    benefits.simulate(reg, { as_of: PO.as_of, scenario: "worst_case", member: m, providers: providers(), events }),
  );
}
const outcome = (s: SimulationResult, pv: string): RolloverOutcome | null => {
  const o = s.rollover.filter((x) => x.closing_plan_version_id === pv);
  expect(o.length).toBeLessThanOrEqual(1);
  return o[0] ?? null;
};
const plan = (reg: PlanRegistry, pv: string): PlanDefinition => reg.plans.find((p) => p.plan_version_id === pv)!;

/** Adds a minimal PPO Enhanced 2027 version (same key) so the Enhanced 2026 carryover has a next plan. */
function withEnhanced2027(reg: PlanRegistry = registry()): PlanRegistry {
  const copy = structuredClone(reg);
  const p = structuredClone(plan(copy, PV["ppo-enhanced"]));
  p.plan_version_id = "nwd-ppo-enhanced-2027";
  p.coverage_period = { start: "2027-01-01", end: "2027-12-31" };
  p.rules = p.rules.map((r) => ({ ...r, rule_id: r.rule_id.replace(/\.enhanced\.2026$/, ".enhanced.2027"), effective_from: "2027-01-01", effective_to: "2027-12-31" }));
  copy.plans.push(p);
  return copy;
}

describe("AT-22 PLAN-004 the registry loads Value, Standard and Enhanced", () => {
  it("every option validates and carries the required rule families", () => {
    const reg = registry();
    expect(reg.plans.map((p) => p.plan_version_id).sort()).toEqual(["nwd-ppo-enhanced-2026", PV2026, "nwd-ppo-standard-2027", "nwd-ppo-value-2026"]);
    for (const option of Object.keys(PV) as Option[]) {
      const p = plan(reg, PV[option]);
      expect(benefits.validatePlan(reg, p).ok, option).toBe(true);
      expect(p.key.plan_option_id).toBe(option);
      expect(p.plan_name).toBe(NAME[option]);
      const verified = (t: PlanDefinition["rules"][number]["rule_type"]) => p.rules.filter((r) => r.rule_type === t && r.status === "VERIFIED");
      expect(verified("deductible")).toHaveLength(1);
      expect(verified("annual_maximum")).toHaveLength(1);
      expect(verified("exclusion").length).toBeGreaterThanOrEqual(1);
      expect(verified("premium")).toHaveLength(1);
      expect(p.rules.filter((r) => r.rule_type === "lifetime_maximum").map((r) => r.status)).toEqual([option === "ppo-enhanced" ? "VERIFIED" : "NOT_APPLICABLE"]);
      expect(p.rules.filter((r) => r.rule_type === "rollover").map((r) => r.status)).toEqual([option === "ppo-value" ? "NOT_APPLICABLE" : "VERIFIED"]);
      // A share for every classified class in both networks.
      for (const map of verified("service_class_map")) {
        for (const network of ["in_network", "out_of_network"] as const) {
          const cls = map.applies_when.service_class;
          expect(verified("plan_share").some((r) => r.applies_when.network === network && r.applies_when.service_class === cls), `${option} ${network} ${cls}`).toBe(true);
        }
      }
    }
  });

  it("option values match the plan documents (deductible, maximum, shares, orthodontics, premium)", () => {
    const reg = registry();
    const rule = <T extends string>(p: PlanDefinition, id: T) => p.rules.find((r) => r.rule_id === id)!;
    const value = plan(reg, PV["ppo-value"]);
    expect(rule(value, "deductible.value.2026").value).toMatchObject({ individual_cents: 10000 });
    expect(rule(value, "annual_maximum.value.2026").value).toMatchObject({ individual_cents: 100000 });
    expect(rule(value, "plan_share.in_network.major.value.2026").value).toMatchObject({ rate_bps: 4000 });
    expect(rule(value, "waiting_period.major.value.2026").value).toEqual({ months: 12 });
    expect(rule(value, "exclusion.implants.value.2026").value).toEqual({ cdt_codes: ["D6010"] });
    const enhanced = plan(reg, PV["ppo-enhanced"]);
    expect(rule(enhanced, "annual_maximum.enhanced.2026").value).toMatchObject({ individual_cents: 250000, counts_classes: ["basic", "major"] });
    expect(rule(enhanced, "lifetime_maximum.orthodontic.enhanced.2026").value).toEqual({ individual_cents: 150000, service_class: "orthodontic" });
    expect(rule(enhanced, "plan_share.in_network.orthodontic.enhanced.2026").value).toMatchObject({ rate_bps: 5000 });
    expect(rule(enhanced, "rollover.enhanced.2026").value).toMatchObject({
      threshold_cents: 70000,
      threshold_comparison: "LTE",
      base_award_cents: 35000,
      network_bonus_cents: 15000,
      network_bonus_condition: "ANY_IN_NETWORK_CLAIM",
      bank_cap_cents: 125000,
      applies_to_next_plan_version_ids: ["nwd-ppo-enhanced-2027"],
    });
    const premiums = Object.fromEntries((Object.keys(PV) as Option[]).map((o) => [o, plan(reg, PV[o]).rules.find((r) => r.rule_type === "premium")!.value]));
    expect(premiums["ppo-standard"]).toEqual({
      basis: "EMPLOYEE_MONTHLY_CONTRIBUTION",
      tiers: [
        { coverage_tier: "EMPLOYEE_ONLY", cents: 1825 },
        { coverage_tier: "EMPLOYEE_SPOUSE", cents: 3650 },
        { coverage_tier: "EMPLOYEE_CHILDREN", cents: 3920 },
        { coverage_tier: "FAMILY", cents: 5840 },
      ],
    });
    for (const o of Object.keys(PV) as Option[]) {
      expect((premiums[o] as { tiers: { cents: number }[] }).tiers[0]!.cents).toBe(listed(o).premium_employee_only_cents);
    }
  });

  it("rule ids are unique across the registry, and a duplicate is reported", () => {
    const reg = registry();
    expect(registryRuleIdProblems(reg)).toEqual([]);
    const copy = structuredClone(reg);
    plan(copy, PV["ppo-value"]).rules.find((r) => r.rule_id === "deductible.value.2026")!.rule_id = "deductible.2026";
    expect(registryRuleIdProblems(copy)).toEqual(["rule id deductible.2026 is used by nwd-ppo-standard-2026, nwd-ppo-value-2026"]);
  });
});

describe("AT-22 PLAN-001 each option resolves only through its own key", () => {
  it("2026 dates resolve to the option's own version; 2027 never borrows Standard 2027", () => {
    const reg = registry();
    for (const option of Object.keys(PV) as Option[]) {
      const key = { ...fx.member().plan_key, plan_option_id: option };
      const r = benefits.resolvePlanVersion(reg, key, "2026-11-02");
      expect(r.ok && r.plan.plan_version_id).toBe(PV[option]);
      const next = benefits.resolvePlanVersion(reg, key, "2027-01-05");
      if (option === "ppo-standard") expect(next.ok && next.plan.plan_version_id).toBe("nwd-ppo-standard-2027");
      else {
        expect(next.ok).toBe(false);
        expect(next.issues.map((i) => i.code)).toContain("PLAN_NOT_FOUND");
      }
    }
  });

  it("a Standard result never cites a Value or Enhanced rule or its evidence", () => {
    const other = /\.(value|enhanced)\.\d{4}$/;
    const care = optimize();
    const ids = [
      ...care.alternatives.flatMap((a) => a.events.flatMap((e) => [...e.line_worst.applied_rule_ids, ...e.line_best.applied_rule_ids])),
      ...care.evidence.map((e) => e.rule_id),
    ];
    expect(ids.length).toBeGreaterThan(0);
    expect(ids.filter((id) => other.test(id))).toEqual([]);
    expect(care.evidence.every((e) => e.plan_version_id.startsWith("nwd-ppo-standard-"))).toBe(true);
    const run = sim(EVENTS, optionMember("ppo-standard"));
    expect(run.lines.flatMap((l) => l.applied_rule_ids).filter((id) => other.test(id))).toEqual([]);
  });
});

describe("AT-22 premium evidence comes from the group's enrollment guide", () => {
  it("each premium cites its own option's row; Standard 2027 premium is UNKNOWN, never a value", () => {
    const reg = registry();
    const guide = reg.sources.find((s) => s.source_id === "acme-2026-enrollment-guide")!;
    expect(guide.document_role).toBe("employer_summary");
    expect([...guide.plan_version_ids].sort()).toEqual(["nwd-ppo-enhanced-2026", PV2026, "nwd-ppo-value-2026"]);
    for (const option of Object.keys(PV) as Option[]) {
      const r = plan(reg, PV[option]).rules.find((x) => x.rule_type === "premium")!;
      expect(r.evidence.every((e) => e.source_id === guide.source_id && e.page === 1)).toBe(true);
      expect(r.evidence.some((e) => e.quote.startsWith(`| ${NAME[option]} |`))).toBe(true);
      expect(r.evidence.filter((e) => e.quote.startsWith("| PPO ")).every((e) => e.quote.startsWith(`| ${NAME[option]} |`))).toBe(true);
    }
    const p27 = plan(reg, "nwd-ppo-standard-2027").rules.find((x) => x.rule_type === "premium")!;
    expect([p27.status, p27.value, p27.evidence]).toEqual(["UNKNOWN", null, []]);
  });
});

describe("AT-22 §4.9 golden plan-option runs (expected.json → plan_options.runs)", () => {
  for (const run of PO.runs) {
    it(`${run.case}: lines, totals, remaining maximum and 2026 carryover`, () => {
      const option = run.plan_option_id as Option;
      const s = sim(EVENTS, optionMember(option, { effectiveFrom: run.coverage_effective_from }));
      expect(s.lines.map((l) => ({
        event_id: l.event_id,
        status: l.status,
        deductible_applied_cents: l.deductible_applied_cents,
        plan_pay_cents: l.plan_pay_cents,
        member_responsibility_cents: l.member_responsibility_cents,
      }))).toEqual(run.lines);
      expect(s.totals?.plan_pay_cents).toBe(run.plan_pay_cents);
      expect(s.totals?.member_responsibility_cents).toBe(run.member_cost_cents);
      expect(s.ledger_after.periods.find((p) => p.plan_version_id === PV[option])!.annual_max_remaining_cents).toBe(run.annual_max_remaining_after_cents);
      const o = outcome(s, PV[option]);
      expect(
        o && { status: o.status, next_plan_version_id: o.next_plan_version_id, qualifying_plan_paid: o.qualifying_plan_paid, final_bank: o.final_bank, issue_codes: o.issues.map((i) => i.code) },
      ).toEqual(run.rollover);
    });
  }
});

describe("AT-22 §14.1 #8 waiting period, exclusion and orthodontics on the new options", () => {
  const crown = EVENTS[1]!;
  it("a Value crown inside the 12-month Major waiting period is NOT_COVERED; after it, covered", () => {
    const inside = sim([crown], optionMember("ppo-value", { effectiveFrom: "2026-06-01" })).lines[0]!;
    expect(inside.status).toBe("NOT_COVERED");
    expect(inside.issues.find((i) => i.code === "WAITING_PERIOD")?.rule_id).toBe("waiting_period.major.value.2026");
    const after = sim([crown], optionMember("ppo-value", { effectiveFrom: "2025-06-01" })).lines[0]!;
    expect(after.status).toBe("OK");
    expect(after.applied_rule_ids).toContain("waiting_period.major.value.2026");
  });

  it("a Value implant (D6010) is NOT_COVERED as an excluded service", () => {
    const l = sim([{ ...crown, cdt_code: "D6010" }], optionMember("ppo-value")).lines[0]!;
    expect(l.status).toBe("NOT_COVERED");
    expect(l.plan_pay_cents).toBe(0);
    expect(l.issues.find((i) => i.code === "EXCLUDED_SERVICE")?.rule_id).toBe("exclusion.implants.value.2026");
  });

  it("an Enhanced orthodontic line blocks: the lifetime maximum is not modeled (non-goal), no payment is invented", () => {
    const l = sim([{ ...crown, cdt_code: "D8080", tooth: null }], optionMember("ppo-enhanced")).lines[0]!;
    expect(l.plan_pay_cents).toBeNull();
    expect(l.issues.find((i) => i.code === "RULE_TYPE_UNSUPPORTED")?.rule_id).toBe("lifetime_maximum.orthodontic.enhanced.2026");
  });
});

describe("AT-22 ROLL-003/004/006/007 the Enhanced carryover on shipped data", () => {
  it("shipped: the 2027 Enhanced plan is not in the registry → NEEDS_CONFIRMATION, nothing carried", () => {
    const o = outcome(sim([E1], optionMember("ppo-enhanced")), PV["ppo-enhanced"])!;
    expect(o.status).toBe("NEEDS_CONFIRMATION");
    expect(o.next_plan_version_id).toBeNull();
    expect(o.final_bank).toBeNull();
    expect(o.issues.map((i) => i.code)).toContain("ROLLOVER_NEXT_PLAN_UNKNOWN");
  });

  it("with a 2027 Enhanced version: base award plus in-network bonus, LTE boundary, cap", () => {
    const reg = withEnhanced2027();
    const pv = PV["ppo-enhanced"];
    const at = (o: { ytd?: number; carry?: number }, events: ClaimEvent[] = [E1]) => outcome(sim(events, optionMember("ppo-enhanced", o), reg), pv)!;
    const base = at({});
    expect([base.status, base.next_plan_version_id, base.final_bank]).toEqual(["CONDITIONAL", "nwd-ppo-enhanced-2027", { low_cents: 50000, high_cents: 50000 }]);
    // E1 pays $117: $583 + $117 = exactly $700 still qualifies ("$700 or less"); one cent more does not.
    expect(at({ ytd: 58300 }).qualifying_plan_paid).toEqual({ low_cents: 70000, high_cents: 70000 });
    expect(at({ ytd: 58300 }).status).toBe("CONDITIONAL");
    expect(at({ ytd: 58301 }).status).toBe("NOT_EARNED");
    const capped = at({ carry: 100000 });
    expect([capped.final_bank, capped.lost_to_cap_cents]).toEqual([{ low_cents: 125000, high_cents: 125000 }, 25000]);
    // Out-of-network only: no bonus.
    const oon: ClaimEvent = { ...E1, provider_id: P2, claim_route: "OUT_OF_NETWORK_CLAIM" };
    expect(at({}, [oon]).final_bank).toEqual({ low_cents: 35000, high_cents: 35000 });
  });

  it("Value has no carryover feature: no outcome and no unverified-rule warning", () => {
    const s = sim(EVENTS, optionMember("ppo-value"));
    expect(outcome(s, PV["ppo-value"])).toBeNull();
    expect(s.issues.map((i) => i.code)).not.toContain("RULE_UNVERIFIED");
  });
});

describe("AT-22 CONTRACT §3.10 POST /api/plan-options", () => {
  const api = createApiHandlers();
  const H = { "content-type": "application/json" };
  const call = async (body: unknown): Promise<ApiResponseLike> => api.plan_options({ method: "POST", headers: H, body });
  const item = (o: PlanOptionsResult["options"][number], id: string) => o.items.find((i) => i.item_id === id);

  it("lists the member's group options with engine values, rule ids and status (expected.json → plan_options.listing)", async () => {
    const res = await call({ as_of: PO.as_of, member: fx.member() });
    expect(res.status).toBe(200);
    const r = PlanOptionsResult.parse((res.body as { data: unknown }).data);
    expect(r.member_plan_version_id).toBe(PV2026);
    expect(r.issues).toEqual([]);
    expect(
      r.options.map((o) => ({
        plan_option_id: o.plan_option_id,
        plan_version_id: o.plan_version_id,
        is_member_plan: o.is_member_plan,
        premium_employee_only_cents: item(o, "premium.employee_only")?.value_cents,
        deductible_cents: item(o, "rules.deductible")?.value_cents,
        annual_maximum_cents: item(o, "rules.annual_maximum")?.value_cents,
        basic_in_network_bps: item(o, "coverage.in_network.basic")?.value_bps,
        orthodontic_lifetime_maximum_cents: item(o, "rules.orthodontic_lifetime_maximum")?.value_cents,
      })),
    ).toEqual(PO.listing);
    for (const o of r.options) {
      expect(o.adjudication_supported).toBe(true);
      for (const i of o.items) {
        expect(i.rule_ids, `${o.plan_option_id} ${i.item_id}`).toHaveLength(1);
        expect(i.rule_ids[0]!.endsWith(o.plan_version_id === PV2026 ? ".2026" : `.${o.plan_option_id.slice(4)}.2026`)).toBe(true);
        expect(i.source).toBe("PLAN_VERIFIED");
      }
    }
    // The Value Major wait is listed per class, never summarized as "No waiting periods".
    const value = r.options.find((o) => o.plan_option_id === "ppo-value")!;
    expect(item(value, "rules.waiting_period.major")?.value_text).toBe("12 months");
    expect(item(value, "rules.waiting_period")).toBeUndefined();
    expect(item(r.options.find((o) => o.plan_option_id === "ppo-enhanced")!, "rules.rollover")?.value_text).toBe(
      "Up to $350 (+$150 in-network bonus) next year if plan payments stay at or below $700; balance capped at $1,250",
    );
  });

  it("the member's own option shows the same rule items as the passport", async () => {
    const r = PlanOptionsResult.parse(((await call({ as_of: PO.as_of, member: fx.member() })).body as { data: unknown }).data);
    const own = r.options.find((o) => o.is_member_plan)!;
    const passport = benefits.passport(registry(), fx.member(), PO.as_of);
    const passportItems = passport.sections.filter((s) => s.section_id !== "balances" && s.section_id !== "funding").flatMap((s) => s.items);
    for (const p of passportItems) expect(item(own, p.item_id), p.item_id).toEqual(p);
  });

  it("2027: only Standard 2027 is effective; its premium needs confirmation and is never $0", async () => {
    const r = PlanOptionsResult.parse(((await call({ as_of: "2027-02-01T15:00:00Z", member: fx.member() })).body as { data: unknown }).data);
    expect(r.options.map((o) => o.plan_version_id)).toEqual(["nwd-ppo-standard-2027"]);
    const premium = item(r.options[0]!, "premium")!;
    expect([premium.source, premium.rule_status, premium.value_cents]).toEqual(["NEEDS_CONFIRMATION", "UNKNOWN", null]);
  });

  it("a member whose own plan does not resolve still gets the list, with an info PLAN_NOT_FOUND", async () => {
    const m = fx.member();
    m.plan_key.plan_option_id = "ppo-premier";
    const r = PlanOptionsResult.parse(((await call({ as_of: PO.as_of, member: m })).body as { data: unknown }).data);
    expect(r.member_plan_version_id).toBeNull();
    expect(r.options.map((o) => o.plan_option_id)).toEqual(["ppo-enhanced", "ppo-standard", "ppo-value"]);
    expect(r.options.every((o) => !o.is_member_plan)).toBe(true);
    expect(r.issues.map((i) => [i.code, i.severity])).toEqual([["PLAN_NOT_FOUND", "info"]]);
  });

  it("unknown request keys are rejected", async () => {
    expect((await call({ as_of: PO.as_of, member: fx.member(), plan_rules: [] })).status).toBe(400);
  });
});

describe("AT-22 passport stability (demo member on PPO Standard)", () => {
  it("the passport rules section is unchanged by the per-class waiting-period support", () => {
    const passport = benefits.passport(registry(), fx.member(), PO.as_of);
    const rules = passport.sections.find((s) => s.section_id === "rules")!.items;
    expect(rules.map((i) => [i.item_id, i.value_text])).toEqual([
      ["rules.benefit_period", null],
      ["rules.deductible", null],
      ["rules.annual_maximum", null],
      ["rules.waiting_period", "No waiting periods"],
      ["rules.rollover", "Up to $250 next year if plan payments stay below $500; balance capped at $1,000"],
      ["rules.claim_submission", "Allowed; paid services do not use your plan balances"],
    ]);
  });
});
