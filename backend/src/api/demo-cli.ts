/** Prints the golden demo story through the API handlers (offline). Run: npm run demo:cli */
import { formatUsd, type CarePlanResult, type ExplainOutcome, type ExtractionResult, type ProcedureRecommendation, type VisitNavigatorResult } from "@/domain";
import { createApiHandlers, loadDemoScenario } from "./index";

const api = createApiHandlers();
const sc = loadDemoScenario();
const H = { "content-type": "application/json" };
const call = async <T>(id: keyof typeof api, body?: unknown): Promise<T> => {
  const res = await api[id]({ method: body === undefined ? "GET" : "POST", body, headers: H });
  const env = res.body as { ok: boolean; data: T; error?: unknown };
  if (!env.ok) throw new Error(`${id} failed: ${JSON.stringify(env.error)}`);
  return env.data;
};
const usd = (r: { high_cents: number } | null) => (r ? formatUsd(r.high_cents) : "needs confirmation");

const visit = await call<VisitNavigatorResult>("visit_navigator", {
  as_of: sc.previsit_as_of,
  member: sc.member,
  providers: sc.providers_previsit,
  visit: {
    intent: sc.visit_defaults.intent,
    expected_codes: sc.visit_defaults.expected_codes_by_intent[sc.visit_defaults.intent],
    symptoms: { severe_pain: false, swelling: false, trauma: false, bleeding: false, fever: false },
  },
  known_procedures: [],
  max_options: 3,
});
console.log(`Before the visit (${visit.status}):`);
for (const o of visit.options) console.log(`  ${o.provider_id} ${o.slot.date} ${o.slot.start_time} [${o.labels.join(", ")}] you pay ${usd(o.member_cost)}`);

const card = sc.documents.find((d) => d.kind === "card_photo")!;
const extracted = await call<ExtractionResult>("intake_extract", {
  as_of: sc.postvisit_as_of,
  document_id: card.document_id,
  kind: card.kind,
  text: card.text,
  image: null,
  consent: { recording_consent: false, retain_audio: false },
});
const { procedures } = await call<{ procedures: ProcedureRecommendation[] }>("intake_confirm", {
  as_of: sc.postvisit_as_of,
  confirmed_by: "member",
  procedures: extracted.procedures,
});
console.log(`\nCard: ${procedures.map((p) => `${p.cdt_code} #${p.tooth}`).join(", ")} (confirmed)`);

const request = {
  as_of: sc.postvisit_as_of,
  member: sc.member,
  providers: sc.providers_postvisit,
  procedures,
  planning_horizon_end: sc.planning_horizon_end,
  max_alternatives: 3,
};
const plan = await call<CarePlanResult>("care_plan", request);
console.log(`\nCare plan (${plan.status}):`);
for (const a of plan.alternatives) {
  console.log(`  ${a.alternative_id} [${a.labels.join(", ")}] total ${usd(a.totals.member_cost)}`);
  for (const e of a.events) console.log(`    ${e.service_date} ${e.line_worst.cdt_code} ${e.provider_id} ${e.claim_route} you pay ${usd(e.member_cost)}`);
}

const why = await call<ExplainOutcome>("explain", { result_kind: "care_plan", request, focus_id: null });
console.log(`\nWhy this plan? ${why.explanation.summary} (validated: ${why.validation.ok})`);
for (const c of why.explanation.claims) console.log(`  - ${c.text}`);
