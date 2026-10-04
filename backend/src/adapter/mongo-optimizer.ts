import type { Document } from "mongodb";
import { z } from "zod";
import { MemberState } from "@/domain/member";
import { PlanRegistry } from "@/domain/plan";

/** Stable, optimizer-facing view of the MongoDB dental documents.
 * This is deliberately separate from the MongoDB collection shape so the
 * optimizer never depends on persistence field names. */
export const MongoOptimizerContext = z.object({
  member: z.object({ member_id: z.string(), plan_version_id: z.string(), observed_at: z.string(), benefit_state: z.record(z.string(), z.unknown()) }),
  plan: z.record(z.string(), z.unknown()),
  providers: z.array(z.object({ provider_id: z.string(), name: z.string(), specialties: z.array(z.string()), network: z.enum(["in_network", "out_of_network", "unknown"]), prices: z.array(z.object({ cdt_code: z.string(), charge_cents: z.number().int().nonnegative(), allowed_cents: z.number().int().nonnegative().nullable() })), slots: z.array(z.object({ appointment_id: z.string(), start: z.string(), duration_minutes: z.number().int().positive(), supported_cdts: z.array(z.string()) })) })),
  procedures: z.array(z.object({ procedure_id: z.string(), cdt_code: z.string(), description: z.string(), fee_cents: z.number().int().nonnegative(), specialty: z.string(), earliest_safe_date: z.string(), target_date: z.string(), latest_safe_date: z.string(), confirmed: z.boolean() })),
});
export type MongoOptimizerContext = z.infer<typeof MongoOptimizerContext>;

/** Converts the imported demo plan shape into the frozen PlanRegistry. */
export function adaptMongoPlanRegistry(input: { plans: unknown[]; sources?: unknown[] }): z.infer<typeof PlanRegistry> {
  const sourceId = "synthetic-demo-benefit-schedule-2026-v1";
  const source = { source_id: sourceId, title: "Synthetic Demo Benefit Schedule", path: "mongodb://source_documents/synthetic-demo-benefit-schedule-2026-v1", sha256: "0000000000000000000000000000000000000000000000000000000000000000", media_type: "text/markdown" as const, plan_version_id: "shared", retrieved_at: "2026-10-01T00:00:00Z", synthetic: true, pages: [{ page: 1, text: "Synthetic demonstration schedule." }] };
  const plans = input.plans.map((raw) => {
    const plan = asDocument(raw, "plan");
    const coverage = asDocument(plan.coverage, "plan.coverage");
    const deductible = asDocument(plan.deductible, "plan.deductible");
    const maximum = asDocument(plan.annual_maximum, "plan.annual_maximum");
    const period = (plan.coverage_period && typeof plan.coverage_period === "object" ? asDocument(plan.coverage_period, "plan.coverage_period") : { start: plan.effective_from, end: plan.effective_to });
    const option = String(plan.option_tier ?? "demo");
    const planVersionId = String(plan.plan_version_id);
    const rules: unknown[] = [];
    const evidence = (id: string) => [{ source_id: sourceId, page: 1, section: "demo schedule", locator: id, quote: "Synthetic demonstration schedule." }];
    const base = (ruleId: string, type: string, value: unknown) => ({ rule_id: ruleId, rule_type: type, status: "VERIFIED", effective_from: String(period.start ?? "2026-01-01"), effective_to: String(period.end ?? "2027-12-31"), applies_when: { network: null, service_class: null, cdt_codes: null }, evidence: evidence(ruleId), conflicts_with: [], note: null, value });
    rules.push(base(`${option}-benefit-period`, "benefit_period", { period_start: String(period.start ?? "2026-01-01"), period_end: String(period.end ?? "2027-12-31"), accumulator_basis: "service_date" }));
    const inNetworkDeductible = asDocument(deductible.in_network, "deductible.in_network");
    rules.push(base(`${option}-deductible`, "deductible", { individual_cents: Number(inNetworkDeductible.individual_cents ?? 0), applies_to_classes: ["basic", "major"], shared_across_networks: false }));
    rules.push(base(`${option}-annual-maximum`, "annual_maximum", { individual_cents: Number(maximum.individual_cents ?? 0), counts_classes: ["preventive", "basic", "major"], shared_across_networks: maximum.network_accumulation === "combined" }));
    for (const serviceClass of ["preventive", "basic", "major", "orthodontic"] as const) {
      const item = asDocument(coverage[serviceClass], `coverage.${serviceClass}`);
      rules.push(base(`${option}-${serviceClass}-share`, "plan_share", { rate_bps: Number(item.in_network_plan_share_bps ?? 0), basis: "allowed_amount_after_deductible" }));
    }
    return { plan_id: String(plan.plan_id), plan_version_id: planVersionId, plan_type: "DPPO", key: { carrier_id: "demo-carrier", group_id: "demo-group", plan_option_id: String(plan.plan_id), jurisdiction: "VA", network_id: "demo-network" }, carrier_name: String(plan.carrier ?? "Synthetic Demo Carrier"), plan_name: `Demo ${option} DPPO`, coverage_period: { start: String(period.start ?? "2026-01-01"), end: String(period.end ?? "2027-12-31") }, synthetic: true, source_documents: [{ source_id: sourceId, sha256: source.sha256 }], review: { status: "REVIEWED", reviewed_by: "demo-adapter", reviewed_at: "2026-10-01T00:00:00Z" }, rules };
  });
  return PlanRegistry.parse({ registry_version: "mongo-adapter-1", plans, sources: plans.map((plan) => ({ ...source, plan_version_id: plan.plan_version_id })) });
}

const money = (id: string, centsValue: number, observedAt: string, source: "CLAIM_EOB" | "MEMBER_CONFIRMED" = "CLAIM_EOB") => ({ input_id: id, value: { kind: "exact" as const, cents: centsValue }, source, observed_at: observedAt });

/** Maps an expanded member snapshot into the frozen MemberState contract. */
export function adaptMongoMember(value: unknown): z.infer<typeof MemberState> {
  const member = asDocument(value, "member");
  const observedAt = String(member.observed_at);
  const benefit = (member.benefit_state ?? {}) as Document;
  const financial = (member.financial_state ?? {}) as Document;
  const deductible = (benefit.deductible_remaining_cents ?? {}) as Document;
  const planVersionId = String(member.plan_version_id);
  const year = Number(benefit.benefit_year ?? Number(observedAt.slice(0, 4)));
  const periodStart = `${year}-01-01`;
  const periodEnd = `${year}-12-31`;
  const histories = Array.isArray(member.procedure_history) ? member.procedure_history : [];
  return MemberState.parse({
    member_id: String(member.member_id), display_name: String(member.display_name), time_zone: "America/New_York",
    plan_key: { carrier_id: "demo-carrier", group_id: "demo-group", plan_option_id: planVersionId, jurisdiction: String(member.jurisdiction ?? "VA"), network_id: "demo-network" },
    coverage_effective_from: String(member.coverage_effective_from), observed_at: observedAt,
    accumulators: [{ plan_version_id: planVersionId, period_start: periodStart, period_end: periodEnd,
      deductible_remaining: money(`mongo:${member.member_id}:deductible`, Number(deductible.in_network ?? 0), observedAt),
      annual_max_remaining: money(`mongo:${member.member_id}:annual-max`, Number(benefit.annual_maximum_remaining_cents ?? 0), observedAt),
      plan_paid_ytd: money(`mongo:${member.member_id}:plan-paid`, Number(benefit.plan_paid_ytd_cents ?? 0), observedAt) }],
    pending_claims: Array.isArray(benefit.pending_claims) ? benefit.pending_claims.map((claim) => { const c = asDocument(claim, "pending claim"); return { claim_id: String(c.claim_id), plan_version_id: planVersionId, service_date: String(c.service_date ?? periodStart), cdt_code: String(c.cdt ?? "D0000"), tooth: c.tooth == null ? null : String(c.tooth), estimated_plan_pay: money(`mongo:${c.claim_id}:pay`, Number(c.projected_plan_payment_cents ?? 0), observedAt), estimated_deductible_applied: money(`mongo:${c.claim_id}:deductible`, 0, observedAt) }; }) : [],
    procedure_history: histories.map((entry) => { const h = asDocument(entry, "procedure history"); return { cdt_code: String(h.cdt ?? h.cdt_code), tooth: h.tooth == null ? null : String(h.tooth), service_date: String(h.service_date), source: "CLAIM_EOB" as const, claimed: h.claim_status !== "self_pay" }; }),
    secondary_coverage: null, funding_accounts: [],
    budget: { input_id: `mongo:${member.member_id}:budget`, hard_monthly_limit_cents: Number(financial.hard_monthly_payment_limit_cents ?? 0), preferred_monthly_limit_cents: Number(financial.preferred_monthly_payment_limit_cents ?? 0), source: "MEMBER_CONFIRMED", observed_at: observedAt },
    availability: { input_id: `mongo:${member.member_id}:availability`, weekly: [{ weekday: "monday", start_time: "08:00", end_time: "18:00" }, { weekday: "tuesday", start_time: "08:00", end_time: "18:00" }, { weekday: "wednesday", start_time: "08:00", end_time: "18:00" }, { weekday: "thursday", start_time: "08:00", end_time: "18:00" }, { weekday: "friday", start_time: "08:00", end_time: "18:00" }], unavailable: [], source: "MEMBER_CONFIRMED", observed_at: observedAt },
    travel: { input_id: `mongo:${member.member_id}:travel`, hard_max_miles: Number((member.travel_preferences as Document | undefined)?.hard_maximum_miles ?? 25), preferred_max_miles: Number((member.travel_preferences as Document | undefined)?.preferred_maximum_miles ?? 10), source: "MEMBER_CONFIRMED", observed_at: observedAt },
  });
}

function cents(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) throw new Error("Expected non-negative integer cents");
  return value;
}

function asDocument(value: unknown, label: string): Document {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} is not an object`);
  return value as Document;
}

/** Converts expanded MongoDB documents into a validated, persistence-agnostic context. */
export function adaptMongoDocuments(input: { member: unknown; plan: unknown; providers: unknown[]; quotes: unknown[]; appointments: unknown[]; procedureCard?: unknown }): MongoOptimizerContext {
  const member = asDocument(input.member, "member");
  const plan = asDocument(input.plan, "plan");
  const quotes = input.quotes.map((value) => asDocument(value, "price quote"));
  const appointments = input.appointments.map((value) => asDocument(value, "appointment"));
  const quoteByProvider = new Map<string, Document[]>();
  for (const quote of quotes) {
    const providerId = String(quote.provider_id ?? "");
    quoteByProvider.set(providerId, [...(quoteByProvider.get(providerId) ?? []), quote]);
  }
  const appointmentByProvider = new Map<string, Document[]>();
  for (const appointment of appointments) {
    const providerId = String(appointment.provider_id ?? "");
    appointmentByProvider.set(providerId, [...(appointmentByProvider.get(providerId) ?? []), appointment]);
  }
  const providers = input.providers.map((value) => {
    const provider = asDocument(value, "provider");
    const providerId = String(provider.provider_id);
    const status = provider.network_status_by_plan && typeof provider.network_status_by_plan === "object"
      ? String((provider.network_status_by_plan as Document)[String(member.plan_version_id)] ?? "unknown")
      : "unknown";
    const network = status === "in_network" || status === "out_of_network" ? status : "unknown";
    return {
      provider_id: providerId,
      name: String(provider.display_name ?? providerId),
      specialties: Array.isArray(provider.specialties) ? provider.specialties.map(String) : [],
      network,
      prices: (quoteByProvider.get(providerId) ?? []).map((quote) => ({
        cdt_code: String(quote.cdt), charge_cents: cents(quote.provider_charge_cents),
        allowed_cents: quote.in_network_allowed_cents == null ? null : cents(quote.in_network_allowed_cents),
      })),
      slots: (appointmentByProvider.get(providerId) ?? []).filter((slot) => slot.status === "available").map((slot) => ({
        appointment_id: String(slot.appointment_id), start: String(slot.start), duration_minutes: Number(slot.duration_minutes),
        supported_cdts: Array.isArray(slot.supported_cdts) ? slot.supported_cdts.map(String) : [],
      })),
    };
  });
  const card = input.procedureCard ? asDocument(input.procedureCard, "procedure card") : null;
  const procedures = card && Array.isArray(card.procedures) ? card.procedures.map((value) => {
    const procedure = asDocument(value, "procedure");
    return {
      procedure_id: String(procedure.procedure_id), cdt_code: String(procedure.cdt), description: String(procedure.label ?? procedure.cdt),
      fee_cents: cents(procedure.dentist_estimated_fee_cents), specialty: String(procedure.required_specialty ?? "general"),
      earliest_safe_date: String(procedure.earliest_safe_date), target_date: String(procedure.target_by_date), latest_safe_date: String(procedure.latest_safe_date),
      confirmed: String(procedure.confirmation_status).includes("CONFIRMED"),
    };
  }) : [];
  return MongoOptimizerContext.parse({ member: { member_id: String(member.member_id), plan_version_id: String(member.plan_version_id), observed_at: String(member.observed_at), benefit_state: member.benefit_state ?? {} }, plan, providers, procedures });
}
