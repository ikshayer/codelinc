/**
 * Fact-id namespace. FROZEN (contract v1).
 *
 * Every number shown to a member, and every claim in an explanation, must cite
 * at least one fact id. Fact ids are strings with a typed prefix:
 *
 *   rule:<rule_id>               a plan rule (must be VERIFIED and in the applied plan version)
 *   input:<input_id>             a labeled input (SourcedMoney.input_id, budget.input_id, ...)
 *   calc:<step_id>               a calculation step in an AdjudicationLine or allocation
 *   proc:<procedure_id>.<field>  a confirmed clinical fact (e.g. proc:proc-crown-30.latest_safe_date)
 *   result:<path>                a field of the final engine result (e.g. result:alt-1.totals.member_cost)
 */
import { CONFIRMABLE_FIELDS, type ConfirmableField } from "./procedure";

export type FactKind = "rule" | "input" | "calc" | "proc" | "result";

export const factId = {
  rule: (ruleId: string) => `rule:${ruleId}`,
  input: (inputId: string) => `input:${inputId}`,
  calc: (stepId: string) => `calc:${stepId}`,
  proc: (procedureId: string, field: ConfirmableField) => `proc:${procedureId}.${field}`,
  result: (path: string) => `result:${path}`,
} as const;

const FACT_RE = /^(rule|input|calc|proc|result):([a-z0-9][a-z0-9._:\-[\]]*)$/;

export function parseFactId(id: string): { kind: FactKind; ref: string } | null {
  const m = FACT_RE.exec(id);
  if (!m) return null;
  const kind = m[1] as FactKind;
  const ref = m[2] as string;
  if (kind === "proc") {
    const dot = ref.lastIndexOf(".");
    if (dot <= 0) return null;
    const field = ref.slice(dot + 1);
    if (!(CONFIRMABLE_FIELDS as readonly string[]).includes(field)) return null;
  }
  return { kind, ref };
}

/** Calculation step id convention: `<line_id>.<step>` where step is one of these. */
export const CALC_STEPS = [
  "plan_version",
  "service_class",
  "coverage_checks",
  "patient_charge",
  "eligible_basis",
  "deductible",
  "coverage_rate",
  "preliminary_plan_pay",
  "cap",
  "plan_pay",
  "member_responsibility",
  "contractual_adjustment",
  "state_update",
] as const;
export type CalcStepName = (typeof CALC_STEPS)[number];
export const calcStepId = (lineId: string, step: CalcStepName) => `${lineId}.${step}`;
