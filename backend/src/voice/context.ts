import { getDatabase } from "../db/client.js";
import { readMongoDemo } from "../api/mongo-demo.js";
import { COLLECTIONS, DEMO_DATASET_ID } from "../db/collections.js";
import { intakeFields } from "./contracts.js";
import { VoiceFailure } from "./gemini.js";

export type VoiceContext = { facts: Record<string, unknown>; missingFields: string[]; records?: Record<string, unknown> };
export async function loadVoiceContext(input: { memberId?: string; facts?: Record<string, { value: string | boolean | null; status: string }> }): Promise<VoiceContext> {
  const facts = Object.fromEntries(Object.entries(input.facts ?? {}).filter(([path]) => path in intakeFields));
  const context: VoiceContext = { facts, missingFields: Object.keys(intakeFields).filter((path) => !facts[path] || facts[path].value === null || facts[path].value === "") };
  if (!input.memberId) return context;
  try {
    const db = getDatabase();
    const result = await readMongoDemo(db, `/api/demo/members/${input.memberId}`);
    if (result.status !== 200) throw new VoiceFailure(result.status, result.status === 404 ? "NOT_FOUND" : "UNAVAILABLE", "Could not load the selected member's records.");
    const member = result.body.member as Record<string, unknown>;
    const sources = await db.collection(COLLECTIONS.sourceDocuments).find({ dataset_id: DEMO_DATASET_ID }, { projection: { _id: 0, source_id: 1, content: 1 } }).limit(5).toArray();
    context.records = {
      synthetic: true, observedAt: member.observed_at, planVersionId: member.plan_version_id,
      enrollmentStatus: member.enrollment_status, coverageEffectiveFrom: member.coverage_effective_from,
      benefits: member.benefit_state, financialState: member.financial_state, procedureHistory: member.procedure_history,
      plan: result.body.plan, treatmentCard: result.body.procedure_card,
      claims: (result.body.claims as Record<string, unknown>[]).slice(0, 30).map(({ cdt, status, service_date, network_tier, plan_payment_cents, deductible_applied_cents, denial_reason }) => ({ cdt, status, service_date, network_tier, plan_payment_cents, deductible_applied_cents, denial_reason })),
      sources: sources.map((s) => ({ sourceId: s.source_id, text: typeof s.content === "string" ? s.content.slice(0, 16000) : "" })),
    };
    return context;
  } catch (error) {
    if (error instanceof VoiceFailure) throw error;
    throw new VoiceFailure(503, "UNAVAILABLE", "The selected member's database context is unavailable. Check MongoDB and retry.", true);
  }
}
