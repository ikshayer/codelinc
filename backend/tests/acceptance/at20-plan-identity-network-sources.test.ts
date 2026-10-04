/**
 * AT-20 (contract 1.4): exact plan identity (PLAN-001), network tier per plan and location
 * (PLAN-002), source authority (PLAN-003), cash-quote validity and price staleness (PRICE-002),
 * explicit same-day order (§6.5) and stable ranking (REC-006). PLANNER-OWNED, FROZEN.
 */
import { describe, expect, it } from "vitest";
import { ClaimEvent, SimulationResult, type CarePlanRequest, type MemberState, type PlanKey, type PlanRegistry, type ProviderOption } from "@/domain";
import {
  allLines,
  benefits,
  byLabel,
  eventFor,
  fx,
  mutateRule,
  optimize,
  P1,
  permute,
  POSTVISIT_AS_OF,
  procedure,
  provider,
  PV2026,
  PV2027,
  registry,
  registryExpectations,
  visitNavigator,
  visitRequest,
} from "./helpers";

const fill = (over: Partial<ClaimEvent> = {}): ClaimEvent => ({
  event_id: "evt-fill",
  procedure_id: "proc-fill-14",
  cdt_code: "D2392",
  tooth: "14",
  service_date: "2026-10-22",
  claim_date: null,
  provider_id: P1,
  claim_route: "IN_NETWORK_CLAIM",
  ...over,
});

function sim(events: ClaimEvent[], opts: { member?: MemberState; providers?: ProviderOption[]; reg?: PlanRegistry } = {}) {
  return SimulationResult.parse(
    benefits.simulate(opts.reg ?? registry(), {
      as_of: POSTVISIT_AS_OF,
      scenario: "worst_case",
      member: opts.member ?? fx.member(),
      providers: opts.providers ?? fx.providersPost(),
      events,
    }),
  );
}

const MONEY_FIELDS = ["modeled_charge_cents", "patient_charge_cents", "plan_pay_cents", "member_responsibility_cents"] as const;

function riveraWith(mutate: (p: ProviderOption) => void): ProviderOption[] {
  const ps = fx.providersPost();
  mutate(provider(ps, P1));
  return ps;
}

const filling = (q: CarePlanRequest) => {
  const f = procedure(q.procedures, "proc-fill-14");
  f.target_date = "2026-12-31";
  f.latest_safe_date = "2026-12-31";
};

describe("AT-20 PLAN-001 exact plan resolution", () => {
  const changes: [keyof PlanKey, string][] = [
    ["carrier_id", "other-carrier"],
    ["group_id", "other-group"],
    ["plan_option_id", "ppo-enhanced"],
    ["jurisdiction", "MD"],
    ["network_id", "other-net"],
  ];
  for (const [field, value] of changes) {
    it(`a different ${field} finds no plan and never borrows one`, () => {
      const member = fx.member();
      member.plan_key[field] = value;
      const r = sim([fill()], { member });
      expect(r.lines[0]!.status).toBe("NEEDS_CONFIRMATION");
      expect(r.lines[0]!.issues.map((i) => i.code)).toContain("PLAN_NOT_FOUND");
      expect(r.lines.every((l) => l.plan_version_id === null)).toBe(true);
    });
  }

  it("a service date outside every coverage period finds no plan", () => {
    const r = sim([fill({ service_date: "2028-01-03" })]);
    expect(r.lines[0]!.issues.map((i) => i.code)).toContain("PLAN_NOT_FOUND");
    expect(r.lines[0]!.plan_version_id).toBeNull();
  });
});

describe("AT-20 PLAN-002 network tier is verified per plan and office", () => {
  const unknownCases: [string, (p: ProviderOption) => void][] = [
    ["verified against another network", (p) => (p.network.network_id = "other-net")],
    ["not verified for any network", (p) => (p.network.network_id = null)],
    ["tier unknown", (p) => (p.network.tier = null)],
  ];
  for (const [name, mutate] of unknownCases) {
    it(`${name}: the claim line blocks with NETWORK_STATUS_UNKNOWN and no money`, () => {
      const r = sim([fill()], { providers: riveraWith(mutate) });
      const l = r.lines[0]!;
      expect(l.status).toBe("NEEDS_CONFIRMATION");
      expect(l.network_tier).toBeNull();
      expect(l.issues.map((i) => i.code)).toEqual(["NETWORK_STATUS_UNKNOWN"]);
      expect(l.issues[0]!.input_id).toBe(provider(fx.providersPost(), P1).network.input_id);
      for (const f of MONEY_FIELDS) expect(l[f], f).toBeNull();
      expect(r.totals).toBeNull();
    });
  }

  it("self-pay at an office of unknown network status blocks only when network offices must submit", () => {
    const providers = riveraWith((p) => (p.network.tier = null));
    const mustSubmit = mutateRule(registry(), PV2026, "claim_submission.2026", (r) => {
      if (r.rule_type === "claim_submission" && r.value) r.value.network_provider_must_submit = true;
      return r;
    });
    const blocked = sim([fill({ claim_route: "SELF_PAY_NO_CLAIM" })], { providers, reg: mustSubmit }).lines[0]!;
    expect(blocked.issues.map((i) => i.code)).toEqual(["NETWORK_STATUS_UNKNOWN"]);
    expect(blocked.member_responsibility_cents).toBeNull();
    // The 2026 plan lets any office take direct payment, so the network status does not matter there.
    const allowed = sim([fill({ claim_route: "SELF_PAY_NO_CLAIM" })], { providers }).lines[0]!;
    expect(allowed.status).toBe("OK");
    expect(allowed.network_tier).toBeNull();
  });

  it("a known tier with the wrong route still fails CLAIM_ROUTE_INVALID", () => {
    const r = sim([fill({ claim_route: "OUT_OF_NETWORK_CLAIM" })]);
    expect(r.lines[0]!.issues.map((i) => i.code)).toEqual(["CLAIM_ROUTE_INVALID"]);
    expect(r.lines[0]!.network_tier).toBe("in_network");
  });

  it("each line resolves its own plan version; only the unverified office blocks", () => {
    const providers = fx.providersPost();
    const other = structuredClone(provider(providers, P1));
    other.provider_id = "prov-unverified";
    other.network.network_id = "other-net";
    providers.push(other);
    const r = sim(
      [
        fill({ event_id: "e1", service_date: "2026-10-22" }),
        fill({ event_id: "e2", service_date: "2027-01-05", procedure_id: "proc-x", cdt_code: "D0220", tooth: null }),
        fill({ event_id: "e3", service_date: "2026-10-29", provider_id: "prov-unverified" }),
        fill({ event_id: "e4", service_date: "2027-01-12", provider_id: "prov-unverified", procedure_id: "proc-y", cdt_code: "D0220", tooth: null }),
      ],
      { providers },
    );
    const by = Object.fromEntries(r.lines.map((l) => [l.event_id, l]));
    expect(by.e1!.status).toBe("OK");
    expect(by.e1!.plan_version_id).toBe(PV2026);
    expect(by.e1!.network_tier).toBe("in_network");
    expect(by.e2!.status).toBe("OK");
    expect(by.e2!.plan_version_id).toBe(PV2027);
    for (const id of ["e3", "e4"]) {
      expect(by[id]!.status, id).toBe("NEEDS_CONFIRMATION");
      expect(by[id]!.issues.map((i) => i.code), id).toEqual(["NETWORK_STATUS_UNKNOWN"]);
    }
    expect(by.e3!.plan_version_id).toBe(PV2026);
    expect(by.e4!.plan_version_id).toBe(PV2027);
  });

  it("care plan: an unverified office is never priced; the gap is named, not hidden as no slot", () => {
    const result = optimize((q) => (provider(q.providers, P1).network.network_id = "other-net"));
    expect(allLines(result).some((l) => l.provider_id === P1)).toBe(false);
    const unknown = result.unresolved.filter((i) => i.code === "NETWORK_STATUS_UNKNOWN");
    expect(unknown.length).toBeGreaterThan(0);
    expect(unknown.every((i) => i.provider_id === P1)).toBe(true);
    expect(result.unresolved.map((i) => i.code)).not.toContain("NO_SLOT_IN_WINDOW");
  });

  it("care plan: with only an unverified office the result needs confirmation and names it", () => {
    const result = optimize((q) => {
      q.providers = [provider(q.providers, P1)];
      provider(q.providers, P1).network.network_id = "other-net";
    });
    expect(result.status).toBe("NEEDS_CONFIRMATION");
    expect(result.alternatives).toEqual([]);
    const codes = result.unresolved.filter((i) => i.severity === "blocking").map((i) => i.code);
    expect(codes).toContain("NETWORK_STATUS_UNKNOWN");
    expect(codes).not.toContain("NO_SLOT_IN_WINDOW");
  });

  it("visit navigator: an unverified office's option needs confirmation with an unknown tier", () => {
    const nav = visitNavigator().navigate(
      registry(),
      visitRequest((r) => {
        // Only Rivera, so its unpriced option is the soonest one and is shown (§4: NEEDS_CONFIRMATION options appear only as soonest).
        r.providers = [provider(r.providers, P1)];
        provider(r.providers, P1).network.network_id = "other-net";
      }),
    );
    const opts = nav.options.filter((o) => o.provider_id === P1);
    expect(opts.length).toBeGreaterThan(0);
    for (const o of opts) {
      expect(o.status).toBe("NEEDS_CONFIRMATION");
      expect(o.network_tier).toBeNull();
      expect(o.member_cost).toBeNull();
      expect(o.issues.map((i) => i.code)).toContain("NETWORK_STATUS_UNKNOWN");
    }
  });
});

describe("AT-20 PLAN-003 source authority and precedence", () => {
  it("the shipped registry declares roles and precedence and validates", () => {
    const reg = registry();
    for (const s of reg.sources) expect(s.document_role).not.toBe("educational");
    for (const p of reg.plans) {
      // (1.5) The 2026 rider governs its summary; precedence is the expectations' order over the plan's sources.
      const exp = registryExpectations.plans.find((e) => e.plan_version_id === p.plan_version_id)!;
      expect(p.source_precedence).toEqual("source_precedence" in exp ? exp.source_precedence : [exp.source_id]);
      expect([...p.source_precedence].sort()).toEqual(p.source_documents.map((d) => d.source_id).sort());
      expect(benefits.validatePlan(reg, p).ok).toBe(true);
    }
  });

  it("educational sources never back a VERIFIED rule", () => {
    const reg = registry();
    const plan = reg.plans.find((p) => p.plan_version_id === PV2026)!;
    const edu = plan.source_documents[0]!.source_id;
    reg.sources.find((s) => s.source_id === edu)!.document_role = "educational";
    const report = benefits.validatePlan(reg, plan);
    expect(report.ok).toBe(false);
    const flagged = report.issues.filter((i) => i.code === "SOURCE_NOT_AUTHORITATIVE").map((i) => i.rule_id);
    // (1.5) Every VERIFIED rule backed only by that source is flagged; rollover.2026 is also backed by the rider.
    const verified = plan.rules.filter((r) => r.status === "VERIFIED" && r.evidence.every((e) => e.source_id === edu)).map((r) => r.rule_id);
    expect(verified.length).toBeGreaterThan(20);
    expect(flagged).not.toContain("rollover.2026");
    expect([...flagged].sort()).toEqual([...verified].sort());
    expect(report.issues.every((i) => i.code !== "SOURCE_NOT_AUTHORITATIVE" || i.severity === "blocking")).toBe(true);
  });

  for (const [name, precedence] of [
    ["unknown source id", ["nwd-ppo-2026-summary", "not-a-source"]],
    ["missing source id", ["nwd-ppo-2027-summary"]],
    ["duplicated source id", ["nwd-ppo-2026-summary", "nwd-ppo-2026-summary"]],
  ] as const) {
    it(`precedence with an ${name} is rejected`, () => {
      const reg = registry();
      const plan = reg.plans.find((p) => p.plan_version_id === PV2026)!;
      plan.source_precedence = [...precedence];
      const report = benefits.validatePlan(reg, plan);
      expect(report.ok).toBe(false);
      expect(report.issues.map((i) => i.code)).toContain("SOURCE_PRECEDENCE_INVALID");
    });
  }
});

describe("AT-20 PRICE-002 cash-quote validity and price staleness", () => {
  const selfPay = fill({ claim_route: "SELF_PAY_NO_CLAIM" });

  it("a quote valid through the service date is priced", () => {
    const l = sim([selfPay]).lines[0]!;
    expect(l.status).toBe("OK");
    expect(l.member_responsibility_cents).toBe(15000);
  });

  it("an expired quote blocks with PRICE_QUOTE_EXPIRED", () => {
    const providers = riveraWith((p) => (p.pricing.find((x) => x.cdt_code === "D2392")!.cash_quote_valid_through = "2026-10-21"));
    const l = sim([selfPay], { providers }).lines[0]!;
    expect(l.status).toBe("NEEDS_CONFIRMATION");
    expect(l.issues.map((i) => i.code)).toEqual(["PRICE_QUOTE_EXPIRED"]);
    expect(l.issues[0]!.input_id).toBe("provider.prov-rivera.price.d2392.cash");
    expect(l.member_responsibility_cents).toBeNull();
  });

  it("a quote with no validity date is not verified", () => {
    const providers = riveraWith((p) => (p.pricing.find((x) => x.cdt_code === "D2392")!.cash_quote_valid_through = null));
    const l = sim([selfPay], { providers }).lines[0]!;
    expect(l.issues.map((i) => i.code)).toEqual(["SELF_PAY_NOT_VERIFIED"]);
    expect(l.issues[0]!.input_id).toBe("provider.prov-rivera.price.d2392.cash");
  });

  it("care plan: an expired quote is never chosen and is named in the comparison", () => {
    const result = optimize((q) => {
      filling(q);
      provider(q.providers, P1).pricing.find((x) => x.cdt_code === "D2392")!.cash_quote_valid_through = "2026-10-21";
    });
    for (const alt of result.alternatives) expect(alt.events.every((e) => e.claim_route !== "SELF_PAY_NO_CLAIM"), alt.alternative_id).toBe(true);
    const rc = eventFor(byLabel(result, "lowest_total_cost"), "proc-fill-14").route_comparison!;
    expect(rc.cash_total_cents).toBeNull();
    expect(rc.missing.map((i) => i.code)).toContain("PRICE_QUOTE_EXPIRED");
    expect(rc.missing.every((i) => i.severity === "warning")).toBe(true);
  });

  it("a price older than the policy limit warns INPUT_STALE without changing status or money", () => {
    const fresh = sim([fill()]).lines[0]!;
    const stale = sim([fill()], {
      providers: riveraWith((p) => {
        const row = p.pricing.find((x) => x.cdt_code === "D2392")!;
        row.provider_charge.observed_at = "2026-07-16T20:00:00Z"; // 91 days before as_of
      }),
    }).lines[0]!;
    expect(stale.status).toBe(fresh.status);
    for (const f of MONEY_FIELDS) expect(stale[f], f).toBe(fresh[f]);
    const warn = stale.issues.filter((i) => i.code === "INPUT_STALE");
    expect(warn).toHaveLength(1);
    expect(warn[0]!.severity).toBe("warning");
    expect(warn[0]!.input_id).toBe(provider(fx.providersPost(), P1).pricing.find((x) => x.cdt_code === "D2392")!.provider_charge.input_id);
    expect(fresh.issues.some((i) => i.code === "INPUT_STALE")).toBe(false);
  });
});

describe("AT-20 §6.5 / REC-006 explicit, stable order", () => {
  const sameDay = (a: string, b: string): ClaimEvent[] => [
    fill({ event_id: a, service_date: "2026-11-05" }),
    fill({ event_id: b, service_date: "2026-11-05", procedure_id: "proc-pa", cdt_code: "D0220", tooth: null }),
  ];

  it("same-day claims follow event_id, not input order", () => {
    const a = sim(sameDay("evt-1", "evt-2"));
    expect(JSON.stringify(sim(permute(sameDay("evt-1", "evt-2"))))).toBe(JSON.stringify(a));
    expect(a.lines.map((l) => l.cdt_code)).toEqual(["D2392", "D0220"]);
    // Swapping the ids swaps the adjudication order: the sequence is the explicit event_id.
    const b = sim(sameDay("evt-2", "evt-1"));
    expect(b.lines.map((l) => l.cdt_code)).toEqual(["D0220", "D2392"]);
    expect(a.lines[0]!.state_before).toEqual(b.lines[0]!.state_before);
    expect(a.lines[1]!.state_before).toEqual(a.lines[0]!.state_after);
    expect(b.lines[1]!.state_before).toEqual(b.lines[0]!.state_after);
    expect(a.lines[1]!.state_before).not.toEqual(b.lines[1]!.state_before);
  });

  it("the golden care plan ranks alternatives identically across runs and input permutations", () => {
    const keys = (r: ReturnType<typeof optimize>) => r.alternatives.map((a) => [a.alternative_id, a.schedule_key, a.labels.join(",")]);
    const base = keys(optimize());
    for (let i = 0; i < 2; i += 1) expect(keys(optimize())).toEqual(base);
    expect(keys(optimize((q) => (q.providers = permute(q.providers))))).toEqual(base);
    expect(keys(optimize((q) => (q.procedures = permute(q.procedures))))).toEqual(base);
  });
});
