/** Explanation input (CONTRACT §6.2), template explainer (§6.3) and validator (§6.4). */
import {
  CONTRACT_VERSION,
  Explanation,
  formatDisplayDate,
  formatUsd,
  parseFactId,
  rolloverStepId,
  samePlanKey,
  URGENCY_LABEL,
  WORDING,
  type CarePlanResult,
  type ExplanationInput,
  type ExplanationValidation,
  type Issue,
  type RolloverOutcome,
  type RolloverStepName,
  type ScheduledEvent,
  type VisitNavigatorResult,
} from "@/domain";
import type { AiModule } from "@/domain/ports";

type Claim = Explanation["claims"][number];
type Violation = ExplanationValidation["violations"][number];

const MISSING_CODES = /^(INPUT_|RULE_|PROCEDURE_UNCONFIRMED$|OON_CHARGE_UNKNOWN$|ALLOWED_AMOUNT_UNKNOWN$|SELF_PAY_NOT_VERIFIED$|NETWORK_STATUS_UNKNOWN$|PRICE_QUOTE_EXPIRED$)/;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function focusOf(input: Pick<ExplanationInput, "care_plan" | "visit_navigator" | "focus_id">) {
  const cp = input.care_plan;
  const vn = input.visit_navigator;
  const alt = cp ? (cp.alternatives.find((a) => a.alternative_id === (input.focus_id ?? cp.recommended_alternative_id)) ?? null) : null;
  const option = vn ? (vn.options.find((o) => o.option_id === input.focus_id) ?? vn.options[0] ?? null) : null;
  const lines = alt ? alt.events.map((e) => e.line_worst) : (option?.lines ?? []);
  // (1.5) §6.4 rule 3: a closing year's carryover rule counts as used by the focus.
  const versions = new Set([
    ...lines.flatMap((l) => (l.plan_version_id ? [l.plan_version_id] : [])),
    ...(alt?.rollover.map((o) => o.closing_plan_version_id) ?? []),
  ]);
  return { alt, option, lines, versions };
}

// ---------------------------------------------------------------------------
// §6.2
// ---------------------------------------------------------------------------

export const buildExplanationInput: AiModule["buildExplanationInput"] = ({ registry, benefits, result, procedures, focusId }) => {
  const care_plan = result.kind === "care_plan" ? result.value : null;
  const visit_navigator = result.kind === "visit_navigator" ? result.value : null;
  const focus_id = focusId ?? care_plan?.recommended_alternative_id ?? visit_navigator?.options[0]?.option_id ?? null;
  const { alt, option, lines } = focusOf({ care_plan, visit_navigator, focus_id });

  const allLines = care_plan
    ? care_plan.alternatives.flatMap((a) => a.events.map((e) => e.line_worst))
    : (visit_navigator?.options.flatMap((o) => o.lines) ?? []);
  const usedVersions = new Set(allLines.flatMap((l) => (l.plan_version_id ? [l.plan_version_id] : [])));
  const keys = registry.plans.filter((p) => usedVersions.has(p.plan_version_id)).map((p) => p.key);
  const memberPlans = registry.plans.filter((p) => keys.some((k) => samePlanKey(k, p.key)));
  const rule_catalog = memberPlans
    .flatMap((p) => p.rules.map((r) => ({ rule_id: r.rule_id, plan_version_id: p.plan_version_id, status: r.status })))
    .sort((a, b) => (a.rule_id < b.rule_id ? -1 : 1));

  const applied = alt ? alt.applied_rule_ids : [...new Set(lines.flatMap((l) => l.applied_rule_ids))].sort();
  const evidence_passages = benefits
    .evidenceFor(registry, applied)
    .flatMap((e) => e.evidence.map((ev) => ({ rule_id: e.rule_id, plan_version_id: e.plan_version_id, quote: ev.quote })));

  const said = (s: string) => `${WORDING.dentist_attribution}: ${s}`;
  const confirmed_facts = [...procedures]
    .sort((a, b) => (a.procedure_id < b.procedure_id ? -1 : 1))
    .flatMap((p) => {
      const f = (field: string, text: string) => ({ fact_id: `proc:${p.procedure_id}.${field}`, text: said(text).slice(0, 300) });
      return [
        ...(p.cdt_code ? [f("cdt_code", `procedure ${p.cdt_code}.`)] : []),
        ...(p.tooth ? [f("tooth", `tooth ${p.tooth}.`)] : []),
        ...(p.urgency ? [f("urgency", `${URGENCY_LABEL[p.urgency]}.`)] : []),
        ...(p.earliest_safe_date ? [f("earliest_safe_date", `no earlier than ${formatDisplayDate(p.earliest_safe_date)}.`)] : []),
        ...(p.target_date ? [f("target_date", `aim for ${formatDisplayDate(p.target_date)}.`)] : []),
        ...(p.latest_safe_date ? [f("latest_safe_date", `no later than ${formatDisplayDate(p.latest_safe_date)}.`)] : []),
        ...(p.dependencies.length
          ? [
              f(
                "dependencies",
                p.dependencies
                  .map((d) => `at least ${d.min_gap_days} days${d.max_gap_days === null ? "" : ` and at most ${d.max_gap_days} days`} after ${d.depends_on}`)
                  .join("; ") + `; performed by ${p.allowed_specialties.join(" or ")}.`,
              ),
            ]
          : []),
      ];
    });

  const issues: Issue[] = care_plan ? care_plan.unresolved : [...(visit_navigator?.issues ?? []), ...(option?.issues ?? [])];
  const missing_fields = [
    ...new Set(issues.filter((i) => i.severity !== "info" && MISSING_CODES.test(i.code)).map((i) => i.message)),
  ];

  return {
    contract_version: CONTRACT_VERSION,
    result_kind: result.kind,
    care_plan,
    visit_navigator,
    focus_id,
    rule_catalog,
    evidence_passages,
    confirmed_facts,
    missing_fields,
  };
};

// ---------------------------------------------------------------------------
// §6.3
// ---------------------------------------------------------------------------

const range = (r: { low_cents: number; high_cents: number }) =>
  r.low_cents === r.high_cents ? formatUsd(r.high_cents) : `between ${formatUsd(r.low_cents)} and ${formatUsd(r.high_cents)}`;

/** (1.5) §6.3 carryover sentence: factual, conditional until the year closes; never "guaranteed". */
function rolloverClaim(o: RolloverOutcome, events: ScheduledEvent[]): Claim {
  const rule = `rule:${o.rule_id}`;
  const step = (name: RolloverStepName) => `calc:${rolloverStepId(o.closing_plan_version_id, name)}`;
  const threshold = formatUsd(o.threshold_cents);
  const below = o.threshold_comparison === "LT" ? "below" : "at or below";
  const over = o.threshold_comparison === "LT" ? "at or above" : "above";
  const paid = o.settled_plan_paid_cents === null ? null : `Your plan has paid ${formatUsd(o.settled_plan_paid_cents)} toward this year's maximum so far.`;
  switch (o.status) {
    case "CONDITIONAL":
      return {
        text: `${paid ?? ""} Under the verified plan rule, staying ${below} ${threshold} may add ${formatUsd(o.final_bank!.high_cents)} to next year's maximum.`.trim(),
        fact_ids: [rule, step("qualifying_low"), step("final_bank")],
      };
    case "EARNED":
      return { text: `Under the verified plan rule, ${formatUsd(o.final_bank!.low_cents)} is carried to next year's maximum.`, fact_ids: [rule, step("final_bank")] };
    case "UNCERTAIN":
      return { text: `Your carryover cannot be confirmed yet because a pending claim could put the total ${over} the ${threshold} threshold.`, fact_ids: [rule, step("qualifying_high"), step("final_bank")] };
    case "NEEDS_CONFIRMATION":
      return { text: "Your carryover needs confirmation before it can be estimated.", fact_ids: [rule] };
    case "NOT_EARNED": {
      const shifted = events.find((e) => e.rollover_shift?.closing_plan_version_id === o.closing_plan_version_id);
      if (shifted && paid) {
        const sh = shifted.rollover_shift!;
        const l = shifted.line_worst;
        const what = `${l.cdt_code}${l.tooth ? `, tooth ${l.tooth},` : ""}`;
        return {
          text: `${paid} Your flexible ${what} visit on ${formatDisplayDate(l.service_date)} is estimated to add ${formatUsd(sh.plan_pay_in_closing_period_cents)} of plan payment, which would put the total ${over} ${threshold}. Moving it to ${formatDisplayDate(sh.moved_to_date)} is optional, stays within your dentist's window, and changes your estimated cost by ${formatUsd(Math.abs(sh.member_cost_delta_cents))}.`,
          fact_ids: [rule, step("qualifying_low"), `calc:${l.line_id}.plan_pay`],
        };
      }
      if (o.issues.some((i) => i.code === "ROLLOVER_NEXT_PLAN_INELIGIBLE")) {
        return { text: "Your plan for next year does not accept this year's carryover, so no carryover is added.", fact_ids: [rule] };
      }
      if (o.qualifying_plan_paid === null || o.qualifying_plan_paid.high_cents === 0) {
        return { text: "No claim counting toward this year's maximum has been paid, so no carryover is earned.", fact_ids: [rule, step("eligible_claim")] };
      }
      const lost = o.forfeited_cents ? `, and your ${formatUsd(o.forfeited_cents)} carryover balance does not continue` : "";
      return {
        text: `Plan payments this year (${formatUsd(o.qualifying_plan_paid.high_cents)}) are not ${below} the ${threshold} carryover threshold, so no carryover is earned${lost}.`,
        fact_ids: [rule, step("qualifying_high")],
      };
    }
  }
}

export function templateExplain(input: ExplanationInput): Explanation {
  const { alt, option } = focusOf(input);
  const ruleFor = (prefix: string, version: string | null) =>
    input.rule_catalog.find((r) => r.rule_id.startsWith(`${prefix}.`) && r.plan_version_id === version && r.status === "VERIFIED")?.rule_id;
  const claims: Claim[] = [];
  let summary: string;

  if (input.care_plan) {
    if (!alt) {
      summary = "No schedule can be priced yet. Please review the missing information below.";
    } else {
      const done = alt.objective.completion_date;
      summary = `Estimated member cost is ${range(alt.totals.member_cost)}${done ? `, with care complete by ${formatDisplayDate(done)}` : ""}.`;
      for (const e of alt.events) {
        const l = e.line_worst;
        const what = `${l.cdt_code}${l.tooth ? `, tooth ${l.tooth}` : ""}`;
        claims.push({
          text: `${what} on ${formatDisplayDate(l.service_date)}: plan pays ${formatUsd(l.plan_pay_cents ?? 0)}, you pay ${formatUsd(l.member_responsibility_cents ?? 0)}.`,
          fact_ids: [`calc:${l.line_id}.plan_pay`, `calc:${l.line_id}.member_responsibility`],
        });
        const max = ruleFor("annual_maximum", l.plan_version_id);
        if (l.cap_applied === "annual_maximum" && max) {
          claims.push({ text: `The plan's annual maximum limits what the plan pays for ${what}.`, fact_ids: [`rule:${max}`, `calc:${l.line_id}.plan_pay`] });
        }
        const period = ruleFor("benefit_period", l.plan_version_id);
        if (e.reasons.includes("AFTER_PLAN_RESET") && period) {
          claims.push({ text: `${what} is planned after your plan year resets, when new balances apply.`, fact_ids: [`rule:${period}`] });
        }
        for (const f of e.funding) {
          if (f.source_type === "FSA" || f.source_type === "HRA") {
            claims.push({ text: `${formatUsd(f.amount_cents)} of ${what} is paid from your ${f.source_type} before its funds run out.`, fact_ids: [`input:${f.input_id}`] });
          }
        }
        const cs = ruleFor("claim_submission", l.plan_version_id);
        if (l.claim_route === "SELF_PAY_NO_CLAIM" && cs) {
          claims.push({
            text: `${what} is paid directly at the office's verified cash price instead of filing a claim.`,
            fact_ids: [`rule:${cs}`, ...l.input_ids.map((id) => `input:${id}`)],
          });
        }
      }
      claims.push(...alt.rollover.map((o) => rolloverClaim(o, alt.events)));
    }
  } else {
    const vn = input.visit_navigator!;
    const cost = option?.member_cost;
    summary = !option
      ? "No appointment option is available yet. Please review the missing information below."
      : cost
        ? `Estimated member cost for the visit on ${formatDisplayDate(option.slot.date)} is ${range(cost)}.`
        : `The visit on ${formatDisplayDate(option.slot.date)} needs confirmation before it can be priced.`;
    for (const o of vn.options) {
      const date = formatDisplayDate(o.slot.date);
      const where =
        o.network_tier === null
          ? `The option on ${date} (network status unconfirmed)`
          : `The ${o.network_tier === "in_network" ? "in-network" : "out-of-network"} option on ${date}`;
      if (!o.member_cost || !o.plan_pay) {
        claims.push({ text: `${where} needs confirmation before it can be priced.`, fact_ids: [`result:${o.option_id}.status`] });
        continue;
      }
      const oon = o.network_tier === "out_of_network" ? ruleFor("oon_allowance_schedule", o.lines[0]?.plan_version_id ?? null) : undefined;
      claims.push({
        text: `${where}: plan pays ${range(o.plan_pay)}, you pay ${range(o.member_cost)}.`,
        fact_ids: [
          ...o.lines.flatMap((l) => [`calc:${l.line_id}.plan_pay`, `calc:${l.line_id}.member_responsibility`]),
          ...(oon ? [`rule:${oon}`] : []),
        ],
      });
    }
  }
  return { summary: summary.slice(0, 600), claims, missing_data: [...input.missing_fields] };
}

// ---------------------------------------------------------------------------
// §6.4
// ---------------------------------------------------------------------------

function walk(v: unknown, visit: (key: string, value: unknown) => void): void {
  if (Array.isArray(v)) v.forEach((x) => walk(x, visit));
  else if (v && typeof v === "object") {
    for (const [k, x] of Object.entries(v)) {
      visit(k, x);
      walk(x, visit);
    }
  }
}

/** §6.4 (1.3): NFKC, strip format chars (zero-width, soft hyphen), collapse all whitespace. */
export const normalizeText = (s: string) => s.normalize("NFKC").replace(/\p{Cf}/gu, "").replace(/\s+/g, " ");

const NUM = String.raw`\d+(?:,\d+)*(?:\.\d+)?`;
const CENTS = String.raw`(?:\s*(?:and\s+)?(\d+)\s*cents?\b)?`;
/** "$X", "$ X", "USD X", "X dollars", "X USD", each optionally "and N cents"; a bare "N cents"; or a trailing-symbol "X$". */
const MONEY = new RegExp(String.raw`(?:\$|\bUSD\b)\s*(${NUM})${CENTS}|\b(${NUM})\s*(?:dollars?|USD)\b${CENTS}|\b(\d+)\s*cents?\b|\b(\d[\d.,]*)\s*\$`, "gi");
const WELL_FORMED = /^(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{2})?$/;

/** Cents for each money expression; null when malformed ("$1,99", "$1,372.999", "75 cents" ≥ 100). */
function amountsIn(text: string): { raw: string; cents: number | null }[] {
  return [...text.matchAll(MONEY)].map((m) => {
    const num = m[1] ?? m[3];
    const extra = m[2] ?? m[4];
    if (m[6] !== undefined) return { raw: m[0], cents: WELL_FORMED.test(m[6]) ? toCents(m[6]) : null };
    if (num === undefined) return { raw: m[0], cents: Number(m[5]) };
    if (!WELL_FORMED.test(num) || (extra !== undefined && (num.includes(".") || Number(extra) > 99))) return { raw: m[0], cents: null };
    return { raw: m[0], cents: toCents(num) + Number(extra ?? 0) };
  });
}

function toCents(num: string): number {
  const [whole, frac = "0"] = num.replace(/,/g, "").split(".");
  return Number(whole) * 100 + Number(frac);
}

const MONTH_RE = String.raw`(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)`;
const DISPLAY_DATE = new RegExp(String.raw`\b${MONTH_RE}\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b`, "gi");
const DAY_MONTH_DATE = new RegExp(String.raw`\b(\d{1,2})(?:st|nd|rd|th)?\s+${MONTH_RE}\.?,?\s+(\d{4})\b`, "gi");
const US_DATE = /\b(\d{1,2})\/(\d{1,2})\/(\d{4}|\d{2})\b/g;
const YMD_SLASH_DATE = /\b(\d{4})\/(\d{1,2})\/(\d{1,2})\b/g;
const ISO_DATE = /\b\d{4}-\d{2}-\d{2}\b/g;
const pad = (n: string | number) => String(n).padStart(2, "0");

function datesIn(text: string): string[] {
  return [
    ...[...text.matchAll(DISPLAY_DATE)].map((m) => `${m[3]}-${pad(MONTHS.findIndex((x) => m[1]!.toLowerCase().startsWith(x.toLowerCase())) + 1)}-${pad(m[2]!)}`),
    ...[...text.matchAll(DAY_MONTH_DATE)].map((m) => `${m[3]}-${pad(MONTHS.findIndex((x) => m[2]!.toLowerCase().startsWith(x.toLowerCase())) + 1)}-${pad(m[1]!)}`),
    ...[...text.matchAll(US_DATE)].map((m) => `${m[3]!.length === 2 ? `20${m[3]}` : m[3]}-${pad(m[1]!)}-${pad(m[2]!)}`),
    ...[...text.matchAll(YMD_SLASH_DATE)].map((m) => `${m[1]}-${pad(m[2]!)}-${pad(m[3]!)}`),
    ...(text.match(ISO_DATE) ?? []),
  ];
}

export const validateExplanation: AiModule["validateExplanation"] = (explanation, input) => {
  const parsed = Explanation.safeParse(explanation);
  if (!parsed.success) {
    return {
      ok: false,
      violations: parsed.error.issues.slice(0, 20).map((e) => ({
        code: "SCHEMA_INVALID" as const,
        detail: `Invalid at ${e.path.join(".") || "(root)"}`.slice(0, 300),
        claim_index: -1,
      })),
    };
  }
  const expl = parsed.data;
  const result: CarePlanResult | VisitNavigatorResult | null = input.care_plan ?? input.visit_navigator;
  const cents = new Set<number>();
  const inputs = new Set<string>();
  const steps = new Set<string>();
  walk(result, (k, v) => {
    if (k.endsWith("_cents") && typeof v === "number") cents.add(v);
    if (k === "input_id" && typeof v === "string") inputs.add(v);
    if (k === "input_ids" && Array.isArray(v)) v.forEach((x) => inputs.add(String(x)));
    if (k === "fact_id" && typeof v === "string" && v.startsWith("input:")) inputs.add(v.slice(6));
    if (k === "step_id" && typeof v === "string") steps.add(v);
  });
  const dates = new Set([...datesIn(JSON.stringify(result)), ...input.confirmed_facts.flatMap((f) => datesIn(f.text))]);
  const facts = new Map(input.confirmed_facts.map((f) => [f.fact_id, f.text]));
  const resultIds = input.care_plan
    ? input.care_plan.alternatives.map((a) => a.alternative_id)
    : (input.visit_navigator?.options.map((o) => o.option_id) ?? []);
  const { versions } = focusOf(input);
  const violations: Violation[] = [];
  const add = (code: Violation["code"], detail: string, claim_index: number) => violations.push({ code, detail: detail.slice(0, 300), claim_index });

  const texts: [string, number][] = [[expl.summary, -1], ...expl.claims.map((c, i): [string, number] => [c.text, i])];
  for (const [raw, idx] of texts) {
    const text = normalizeText(raw);
    for (const a of amountsIn(text)) {
      if (a.cents === null || !cents.has(a.cents)) add("DOLLAR_AMOUNT_NOT_IN_RESULT", `${a.raw} is not in the result`, idx);
    }
    for (const d of datesIn(text)) if (!dates.has(d)) add("DATE_NOT_IN_RESULT", `${d} is not in the result`, idx);
    for (const phrase of WORDING.forbidden_phrases) {
      if (text.toLowerCase().includes(normalizeText(phrase).toLowerCase())) add("FORBIDDEN_PHRASE", `uses "${phrase}"`, idx);
    }
  }

  expl.claims.forEach((c, idx) => {
    for (const id of c.fact_ids) {
      const f = parseFactId(id);
      if (!f) {
        add("UNKNOWN_FACT_ID", `unparseable fact id ${id}`, idx);
        continue;
      }
      if (f.kind === "rule") {
        const r = input.rule_catalog.find((x) => x.rule_id === f.ref);
        if (!r) add("UNKNOWN_FACT_ID", `unknown rule ${f.ref}`, idx);
        else if (r.status !== "VERIFIED") add("UNVERIFIED_RULE_CITED", `rule ${f.ref} is ${r.status}`, idx);
        else if (!versions.has(r.plan_version_id)) add("WRONG_PLAN_VERSION", `rule ${f.ref} is not in the explained plan version`, idx);
      } else if (f.kind === "input" && !inputs.has(f.ref)) add("UNKNOWN_FACT_ID", `unknown input ${f.ref}`, idx);
      else if (f.kind === "calc" && !steps.has(f.ref)) add("UNKNOWN_FACT_ID", `unknown step ${f.ref}`, idx);
      else if (f.kind === "result" && !resultIds.some((r) => f.ref === r || f.ref.startsWith(`${r}.`))) add("UNKNOWN_FACT_ID", `unknown result ${f.ref}`, idx);
      else if (f.kind === "proc") {
        const fact = facts.get(id);
        if (fact === undefined) add("UNKNOWN_FACT_ID", `unknown clinical fact ${id}`, idx);
        else if (id.endsWith(".urgency")) {
          const confirmed = Object.values(URGENCY_LABEL).find((l) => fact.includes(l));
          const changed = Object.values(URGENCY_LABEL).some((l) => l !== confirmed && c.text.toLowerCase().includes(l.toLowerCase()));
          if (changed) add("URGENCY_CHANGED", `urgency differs from ${id}`, idx);
        }
      }
    }
  });

  for (const m of input.missing_fields) if (!expl.missing_data.includes(m)) add("MISSING_DATA_OMITTED", `missing: ${m}`, -1);
  return { ok: violations.length === 0, violations };
};
