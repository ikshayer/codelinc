/**
 * AT-00 (supports AT-01, AT-02, AT-17): the normalized Plan Registry matches the
 * immutable synthetic sources exactly, and every rule is evidence-backed.
 * PLANNER-OWNED, FROZEN.
 */
import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import { PlanRegistry, ruleStructuralProblems, samePlanKey, splitSourcePages } from "@/domain";
import manifest from "../../data/sources/manifest.json";
import { benefits, fx, mutateRule, PV2026, readText, registry, registryExpectations } from "./helpers";

const sortDeep = (v: unknown): unknown => {
  if (Array.isArray(v)) {
    const mapped = v.map(sortDeep);
    return mapped.every((x) => typeof x === "string") ? [...(mapped as string[])].sort() : mapped;
  }
  if (v && typeof v === "object") {
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, sortDeep(x)]));
  }
  return v;
};

describe("AT-00 plan registry grounding", () => {
  it("loads a schema-valid registry with exactly the four synthetic DPPO versions", () => {
    const reg = registry();
    expect(() => PlanRegistry.parse(reg)).not.toThrow();
    const ids = reg.plans.map((p) => p.plan_version_id).sort();
    // (1.6) PLAN-004: PPO Value and PPO Enhanced 2026 join the member's PPO Standard 2026/2027.
    expect(ids).toEqual(["nwd-ppo-enhanced-2026", "nwd-ppo-standard-2026", "nwd-ppo-standard-2027", "nwd-ppo-value-2026"]);
    const own = fx.member().plan_key;
    for (const plan of reg.plans) {
      expect(plan.plan_type).toBe("DPPO");
      expect(plan.synthetic).toBe(true);
      // Same carrier, group, state and network; only the member's own option shares the full key.
      expect(samePlanKey(plan.key, { ...own, plan_option_id: plan.key.plan_option_id })).toBe(true);
      expect(samePlanKey(plan.key, own)).toBe(plan.plan_id === "nwd-ppo-standard");
    }
  });

  it("matches every required rule exactly, with no extra rules", () => {
    const reg = registry();
    for (const exp of registryExpectations.plans) {
      const plan = reg.plans.find((p) => p.plan_version_id === exp.plan_version_id)!;
      expect(plan, exp.plan_version_id).toBeDefined();
      expect(plan.coverage_period).toEqual(exp.coverage_period);
      expect(plan.rules.map((r) => r.rule_id).sort()).toEqual(exp.rules.map((r) => r.rule_id).sort());
      for (const er of exp.rules) {
        const r = plan.rules.find((x) => x.rule_id === er.rule_id)!;
        expect(r.rule_type, er.rule_id).toBe(er.rule_type);
        expect(r.status, er.rule_id).toBe(er.status);
        expect(sortDeep(r.applies_when), er.rule_id).toEqual(sortDeep(er.applies_when));
        expect(sortDeep(r.value), er.rule_id).toEqual(sortDeep(er.value));
        expect([...r.conflicts_with].sort(), er.rule_id).toEqual([...er.conflicts_with].sort());
        expect(r.effective_from, er.rule_id).toBe(exp.coverage_period.start);
        expect(r.effective_to, er.rule_id).toBe(exp.coverage_period.end);
        expect(ruleStructuralProblems(r), er.rule_id).toEqual([]);
        if (er.evidence_page !== null) {
          // (1.5) A rule may name its cited source (the 2026 carryover rider); otherwise the plan summary.
          const source = "evidence_source_id" in er ? er.evidence_source_id : exp.source_id;
          expect(
            r.evidence.some((e) => e.page === er.evidence_page && e.source_id === source),
            `${er.rule_id} cites page ${er.evidence_page} of ${source}`,
          ).toBe(true);
        }
      }
    }
  });

  it("every evidence quote is a literal substring of the cited source page", () => {
    const reg = registry();
    for (const src of reg.sources) {
      const pages = splitSourcePages(readText(src.path));
      expect(src.pages).toEqual(pages);
    }
    for (const plan of reg.plans) {
      for (const r of plan.rules) {
        for (const e of r.evidence) {
          const src = reg.sources.find((s) => s.source_id === e.source_id);
          expect(src, `${r.rule_id} source ${e.source_id}`).toBeDefined();
          // (1.6) A source may belong to several plan versions, but only of the citing plan's own group.
          expect(src!.plan_version_ids, `${r.rule_id} cites a source of its own plan version`).toContain(plan.plan_version_id);
          for (const pv of src!.plan_version_ids) {
            const k = reg.plans.find((p) => p.plan_version_id === pv)!.key;
            expect([k.carrier_id, k.group_id, k.jurisdiction], `${e.source_id} belongs to one group`).toEqual([plan.key.carrier_id, plan.key.group_id, plan.key.jurisdiction]);
          }
          const page = src!.pages.find((p) => p.page === e.page);
          expect(page, `${r.rule_id} page ${e.page}`).toBeDefined();
          expect(page!.text.includes(e.quote), `${r.rule_id} quote: ${e.quote}`).toBe(true);
        }
      }
    }
  });

  it("sources are the immutable seeded files (checksums match the manifest and the bytes)", () => {
    const reg = registry();
    expect(reg.sources.map((s) => s.source_id).sort()).toEqual(manifest.sources.map((s) => s.source_id).sort());
    for (const m of manifest.sources) {
      const actual = crypto.createHash("sha256").update(readText(m.path)).digest("hex");
      expect(actual, m.path).toBe(m.sha256);
      expect(reg.sources.find((s) => s.source_id === m.source_id)!.sha256).toBe(m.sha256);
      for (const pv of m.plan_version_ids) {
        const plan = reg.plans.find((p) => p.plan_version_id === pv)!;
        expect(plan.source_documents).toContainEqual({ source_id: m.source_id, sha256: m.sha256 });
      }
    }
  });

  it("validatePlan accepts both plans and rejects a fabricated quote", () => {
    const reg = registry();
    for (const plan of reg.plans) {
      const report = benefits.validatePlan(reg, plan);
      expect(report.ok, JSON.stringify(report.issues)).toBe(true);
    }
    const tampered = mutateRule(reg, PV2026, "annual_maximum.2026", (r) => ({
      ...r,
      evidence: r.evidence.map((e) => ({ ...e, quote: "Annual maximum: $10,000 per member." })),
    }));
    const plan = tampered.plans.find((p) => p.plan_version_id === PV2026)!;
    const report = benefits.validatePlan(tampered, plan);
    expect(report.ok).toBe(false);
    expect(report.issues.some((i) => i.code === "RULE_EVIDENCE_MISSING" && i.rule_id === "annual_maximum.2026")).toBe(
      true,
    );
  });
});
