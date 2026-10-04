/**
 * AT-02: Every displayed number and benefit claim has evidence or a clearly
 * labeled member/provider input. PLANNER-OWNED, FROZEN.
 */
import { describe, expect, it } from "vitest";
import { AdjudicationLine, BenefitPassport, parseFactId, PlanRegistry, SourceLabel } from "@/domain";
import {
  allLines,
  benefits,
  carePlanRequest,
  fx,
  mutateRule,
  optimize,
  POSTVISIT_AS_OF,
  PV2026,
  registry,
  visitNavigator,
  visitRequest,
} from "./helpers";

/** Every input_id present anywhere in a request object. */
function inputIds(value: unknown, out: Set<string> = new Set()): Set<string> {
  if (Array.isArray(value)) value.forEach((v) => inputIds(v, out));
  else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      if (k === "input_id" && typeof v === "string") out.add(v);
      else inputIds(v, out);
    }
  }
  return out;
}

function verifiedRuleIds(reg: PlanRegistry): Set<string> {
  return new Set(reg.plans.flatMap((p) => p.rules.filter((r) => r.status === "VERIFIED").map((r) => r.rule_id)));
}

/** Rules a calculation step may cite: VERIFIED, or NOT_APPLICABLE (explicitly excluded, still evidence-backed). */
function citableRuleIds(reg: PlanRegistry): Set<string> {
  return new Set(
    reg.plans.flatMap((p) => p.rules.filter((r) => r.status === "VERIFIED" || r.status === "NOT_APPLICABLE").map((r) => r.rule_id)),
  );
}

/** Money fields that must each be backed by a calculation step of the same line. */
const STEP_FOR_FIELD: [keyof AdjudicationLine, string][] = [
  ["patient_charge_cents", "patient_charge"],
  ["eligible_basis_cents", "eligible_basis"],
  ["deductible_applied_cents", "deductible"],
  ["preliminary_plan_pay_cents", "preliminary_plan_pay"],
  ["plan_pay_cents", "plan_pay"],
  ["member_responsibility_cents", "member_responsibility"],
  ["contractual_adjustment_cents", "contractual_adjustment"],
];

function checkLine(
  line: AdjudicationLine,
  allSteps: Set<string>,
  inputs: Set<string>,
  rules: Set<string>,
  citable: Set<string>,
) {
  expect(line.status === "OK" || line.status === "NOT_COVERED", `${line.line_id} status`).toBe(true);
  expect(line.steps.length, `${line.line_id} has steps`).toBeGreaterThan(0);
  for (const id of line.applied_rule_ids) expect(rules.has(id), `${line.line_id} applied ${id} is VERIFIED`).toBe(true);
  for (const id of line.input_ids) expect(inputs.has(id), `${line.line_id} input ${id} exists in request`).toBe(true);
  for (const step of line.steps) {
    expect(step.step_id.startsWith(`${line.line_id}.`), step.step_id).toBe(true);
    for (const op of step.operands) {
      const f = parseFactId(op.fact_id);
      expect(f, `${step.step_id} operand ${op.name} fact id ${op.fact_id}`).not.toBeNull();
      if (f!.kind === "rule") expect(citable.has(f!.ref), `${op.fact_id} is a VERIFIED or NOT_APPLICABLE rule`).toBe(true);
      if (f!.kind === "input") expect(inputs.has(f!.ref), `${op.fact_id} is a request input`).toBe(true);
      if (f!.kind === "calc") expect(allSteps.has(f!.ref), `${op.fact_id} is a step in this result`).toBe(true);
    }
  }
  if (line.claim_route === "SELF_PAY_NO_CLAIM") return;
  for (const [field, step] of STEP_FOR_FIELD) {
    const s = line.steps.find((x) => x.step_id === `${line.line_id}.${step}`);
    expect(s, `${line.line_id} has step ${step}`).toBeDefined();
    expect(s!.result_cents, `${line.line_id}.${step} equals ${String(field)}`).toBe(line[field]);
  }
  const rate = line.steps.find((x) => x.step_id === `${line.line_id}.coverage_rate`);
  expect(rate?.result_bps, `${line.line_id} coverage_rate step`).toBe(line.coverage_rate_bps);
}

const stepsOf = (lines: AdjudicationLine[]) => new Set(lines.flatMap((l) => l.steps.map((s) => s.step_id)));

describe("AT-02 traceability of every number", () => {
  it("care plan: every line, rule and funding source traces to verified rules or labeled inputs", () => {
    const reg = registry();
    const request = carePlanRequest();
    const result = optimize();
    const inputs = inputIds(request);
    const rules = verifiedRuleIds(reg);
    expect(result.status).toBe("OK");
    const lines = allLines(result);
    const steps = stepsOf(lines);
    for (const line of lines) checkLine(line, steps, inputs, rules, citableRuleIds(reg));
    const evidenceIds = new Set(result.evidence.map((e) => e.rule_id));
    for (const alt of result.alternatives) {
      for (const id of alt.applied_rule_ids) {
        expect(rules.has(id), `${id} VERIFIED`).toBe(true);
        expect(evidenceIds.has(id), `${id} has evidence in result.evidence`).toBe(true);
      }
      for (const ev of alt.events) {
        for (const f of ev.funding) expect(inputs.has(f.input_id), `funding ${f.allocation_id} input`).toBe(true);
      }
    }
    for (const e of result.evidence) expect(e.evidence.length).toBeGreaterThan(0);
  });

  it("visit navigator: every priced option traces to verified rules or labeled inputs", () => {
    const reg = registry();
    const request = visitRequest();
    const result = visitNavigator().navigate(reg, request);
    const inputs = inputIds(request);
    const rules = verifiedRuleIds(reg);
    const priced = result.options.filter((o) => o.status === "OK");
    expect(priced.length).toBeGreaterThan(0);
    const steps = stepsOf(priced.flatMap((o) => o.lines));
    for (const opt of priced) {
      expect(opt.lines.length).toBe(request.visit.expected_codes.length);
      for (const line of opt.lines) checkLine(line, steps, inputs, rules, citableRuleIds(reg));
    }
  });

  it("benefit passport: every item is labeled and cites a rule or an input", () => {
    const reg = registry();
    const member = fx.member();
    const passport = BenefitPassport.parse(benefits.passport(reg, member, POSTVISIT_AS_OF));
    const inputs = inputIds(member);
    const allRules = new Set(reg.plans.flatMap((p) => p.rules.map((r) => r.rule_id)));
    const items = passport.sections.flatMap((s) => s.items);
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      expect(SourceLabel.options).toContain(item.source);
      expect(item.rule_ids.length + item.input_ids.length, item.item_id).toBeGreaterThan(0);
      for (const r of item.rule_ids) expect(allRules.has(r), `${item.item_id} rule ${r}`).toBe(true);
      for (const i of item.input_ids) expect(inputs.has(i), `${item.item_id} input ${i}`).toBe(true);
      if (item.source === "PLAN_VERIFIED") expect(["VERIFIED", "NOT_APPLICABLE"]).toContain(item.rule_status);
    }
    // (1.5) The carryover rule is now VERIFIED by the rider and shown from the rule value.
    const carry = items.find((i) => i.rule_ids.includes("rollover.2026"));
    expect(carry, "rollover.2026 is shown").toBeDefined();
    expect(carry!.rule_status).toBe("VERIFIED");
    expect(carry!.source).toBe("PLAN_VERIFIED");
    expect(carry!.value_text).toBe("Up to $250 next year if plan payments stay below $500; balance capped at $1,000");
    // An UNVERIFIED carryover rule is displayed for confirmation, never as a verified value.
    const unverified = mutateRule(registry(), PV2026, "rollover.2026", (r) => ({ ...r, status: "UNVERIFIED" }));
    const shown = BenefitPassport.parse(benefits.passport(unverified, member, POSTVISIT_AS_OF))
      .sections.flatMap((s) => s.items)
      .find((i) => i.rule_ids.includes("rollover.2026"))!;
    expect(shown.rule_status).toBe("UNVERIFIED");
    expect(shown.source).toBe("NEEDS_CONFIRMATION");
    expect(shown.value_text).toBe("Needs confirmation with the plan");
  });
});
