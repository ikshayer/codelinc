import { createHash } from "node:crypto";
import { EXPANDED_DEMO_DATASET_ID } from "./collections.js";

export const EXPANDED_DEMO_SEED = 20261003;
export const EXPANDED_REFERENCE_DATE = "2026-10-03";

type JsonObject = Record<string, unknown>;

export interface ExpandedDemoData {
  manifest: JsonObject;
  members: JsonObject[];
  providers: JsonObject[];
  priceQuotes: JsonObject[];
  claims: JsonObject[];
  appointments: JsonObject[];
  procedureCards: JsonObject[];
}

const procedures = [
  { cdt: "D0120", label: "Periodic oral evaluation", service_class: "preventive", min: 5_500, max: 9_500, specialties: ["general_dentistry"] },
  { cdt: "D0140", label: "Limited oral evaluation", service_class: "preventive", min: 7_500, max: 13_500, specialties: ["general_dentistry", "endodontics", "oral_surgery"] },
  { cdt: "D0210", label: "Complete series radiographs", service_class: "preventive", min: 14_000, max: 24_000, specialties: ["general_dentistry"] },
  { cdt: "D0274", label: "Four bitewing radiographs", service_class: "preventive", min: 7_000, max: 12_500, specialties: ["general_dentistry"] },
  { cdt: "D1110", label: "Adult prophylaxis", service_class: "preventive", min: 9_000, max: 16_000, specialties: ["general_dentistry"] },
  { cdt: "D1120", label: "Child prophylaxis", service_class: "preventive", min: 6_500, max: 11_500, specialties: ["general_dentistry", "pediatric_dentistry"] },
  { cdt: "D1206", label: "Fluoride varnish", service_class: "preventive", min: 3_500, max: 7_000, specialties: ["general_dentistry", "pediatric_dentistry"] },
  { cdt: "D1351", label: "Sealant per tooth", service_class: "preventive", min: 4_000, max: 8_000, specialties: ["general_dentistry", "pediatric_dentistry"] },
  { cdt: "D2391", label: "One-surface composite filling", service_class: "basic", min: 14_000, max: 25_000, specialties: ["general_dentistry"] },
  { cdt: "D2392", label: "Two-surface composite filling", service_class: "basic", min: 18_000, max: 33_000, specialties: ["general_dentistry"] },
  { cdt: "D2740", label: "Ceramic crown", service_class: "major", min: 110_000, max: 180_000, specialties: ["general_dentistry", "prosthodontics"] },
  { cdt: "D2950", label: "Core buildup", service_class: "major", min: 25_000, max: 48_000, specialties: ["general_dentistry", "prosthodontics"] },
  { cdt: "D3330", label: "Molar root canal", service_class: "basic", min: 90_000, max: 165_000, specialties: ["endodontics"] },
  { cdt: "D4341", label: "Scaling and root planing", service_class: "basic", min: 20_000, max: 38_000, specialties: ["general_dentistry", "periodontics"] },
  { cdt: "D7140", label: "Simple extraction", service_class: "basic", min: 14_000, max: 30_000, specialties: ["general_dentistry", "oral_surgery"] },
  { cdt: "D7210", label: "Surgical extraction", service_class: "basic", min: 30_000, max: 72_000, specialties: ["oral_surgery"] },
  { cdt: "D6010", label: "Implant placement", service_class: "major", min: 180_000, max: 310_000, specialties: ["oral_surgery", "periodontics"] },
  { cdt: "D6057", label: "Custom implant abutment", service_class: "major", min: 65_000, max: 115_000, specialties: ["prosthodontics", "general_dentistry"] },
  { cdt: "D6065", label: "Implant-supported ceramic crown", service_class: "major", min: 120_000, max: 195_000, specialties: ["prosthodontics", "general_dentistry"] },
  { cdt: "D8080", label: "Comprehensive orthodontic treatment", service_class: "orthodontic", min: 450_000, max: 700_000, specialties: ["orthodontics"] },
] as const;

const planDefinitions = {
  "demo-value-dppo-2026-2027-v1": { max: 100_000, inDed: 7_500, outDed: 10_000, shares: { preventive: [10_000, 8_000], basic: [7_000, 5_000], major: [4_000, 3_000], orthodontic: [0, 0] } },
  "demo-core-dppo-2026-2027-v1": { max: 150_000, inDed: 5_000, outDed: 7_500, shares: { preventive: [10_000, 8_000], basic: [8_000, 6_000], major: [5_000, 4_000], orthodontic: [5_000, 5_000] } },
  "demo-enhanced-dppo-2026-2027-v1": { max: 200_000, inDed: 2_500, outDed: 5_000, shares: { preventive: [10_000, 9_000], basic: [9_000, 7_000], major: [6_000, 5_000], orthodontic: [5_000, 5_000] } },
} as const;

const firstNames = ["Avery", "Jordan", "Morgan", "Taylor", "Cameron", "Riley", "Parker", "Casey", "Quinn", "Reese", "Skyler", "Drew", "Emerson", "Hayden", "Rowan", "Blake", "Sage", "Finley", "Harper", "Dakota"];
const lastNames = ["Adams", "Bennett", "Carter", "Diaz", "Ellis", "Foster", "Garcia", "Hughes", "Irwin", "Johnson", "Kim", "Lewis", "Morris", "Nguyen", "Owens", "Patel", "Reed", "Shah", "Turner", "Walker"];
const metros = [
  { city: "Richmond", state: "VA", postal: ["23219", "23220", "23221", "23223"] },
  { city: "Arlington", state: "VA", postal: ["22201", "22203", "22205", "22207"] },
  { city: "Norfolk", state: "VA", postal: ["23503", "23505", "23508", "23510"] },
  { city: "Roanoke", state: "VA", postal: ["24011", "24012", "24014", "24018"] },
] as const;
const practiceWords = ["Riverbend", "Commonwealth", "Oak Grove", "Blue Ridge", "Harbor", "Monument", "Cedar", "Parkside", "Bright", "Heritage", "Cardinal", "Piedmont"];
const providerProfiles = [
  { specialty: "general_dentistry", suffix: "Dental Care", count: 16 },
  { specialty: "pediatric_dentistry", suffix: "Pediatric Dentistry", count: 3 },
  { specialty: "endodontics", suffix: "Endodontics", count: 4 },
  { specialty: "periodontics", suffix: "Periodontics", count: 3 },
  { specialty: "oral_surgery", suffix: "Oral Surgery", count: 3 },
  { specialty: "orthodontics", suffix: "Orthodontics", count: 2 },
  { specialty: "prosthodontics", suffix: "Prosthodontics", count: 1 },
] as const;

function mulberry32(seed: number) {
  return () => {
    let value = seed += 0x6d2b79f5;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4_294_967_296;
  };
}

function choose<T>(random: () => number, values: readonly T[]): T {
  return values[Math.floor(random() * values.length)]!;
}

function weighted<T>(random: () => number, values: readonly { value: T; weight: number }[]): T {
  const target = random() * values.reduce((sum, item) => sum + item.weight, 0);
  let cursor = 0;
  for (const item of values) {
    cursor += item.weight;
    if (target < cursor) return item.value;
  }
  return values.at(-1)!.value;
}

function integer(random: () => number, min: number, max: number, step = 1): number {
  const slots = Math.floor((max - min) / step) + 1;
  return min + Math.floor(random() * slots) * step;
}

function isoDate(year: number, month: number, day: number): string {
  return new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10);
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function easternOffset(date: string): string {
  return date >= "2026-03-08" && date < "2026-11-01" ? "-04:00" : "-05:00";
}

function selectPlan(random: () => number): keyof typeof planDefinitions {
  return weighted(random, [
    { value: "demo-value-dppo-2026-2027-v1", weight: 30 },
    { value: "demo-core-dppo-2026-2027-v1", weight: 52 },
    { value: "demo-enhanced-dppo-2026-2027-v1", weight: 18 },
  ]);
}

function profileForIndex(index: number) {
  let cursor = index;
  for (const profile of providerProfiles) {
    if (cursor < profile.count) return profile;
    cursor -= profile.count;
  }
  return providerProfiles[0];
}

export function generateExpandedDemoData(seed = EXPANDED_DEMO_SEED): ExpandedDemoData {
  const random = mulberry32(seed);
  const generatedAt = "2026-10-03T21:30:00-04:00";
  const providers: JsonObject[] = [];
  const priceQuotes: JsonObject[] = [];
  const appointments: JsonObject[] = [];

  for (let index = 0; index < 32; index += 1) {
    const profile = profileForIndex(index);
    const metro = metros[index % metros.length]!;
    const providerId = `SYN-PROVIDER-${String(index + 1).padStart(3, "0")}`;
    const locationId = `${providerId}-LOC-01`;
    const specialties = profile.specialty === "general_dentistry" && random() < 0.22 ? [profile.specialty, "prosthodontics"] : [profile.specialty];
    const supported = procedures.filter((procedure) => procedure.specialties.some((specialty) => specialties.includes(specialty)));
    const networkStatus = Object.fromEntries(Object.keys(planDefinitions).map((planId) => [planId, weighted(random, [
      { value: "in_network", weight: profile.specialty === "general_dentistry" ? 84 : 72 },
      { value: "out_of_network", weight: 23 },
      { value: "unknown", weight: 5 },
    ])]));
    const status = index === 30 ? "STALE_DEMO" : index === 31 ? "UNVERIFIED_DEMO"
      : random() < 0.91 ? "VERIFIED_DEMO" : random() < 0.7 ? "STALE_DEMO" : "UNVERIFIED_DEMO";

    providers.push({
      provider_id: providerId, location_id: locationId, synthetic_provider_registry_id: `SYN-REG-${String(100000 + index).padStart(6, "0")}`,
      display_name: `${practiceWords[index % practiceWords.length]} ${profile.suffix}`, specialties,
      supported_cdts: supported.map(({ cdt }) => cdt), accepting_new_patients: random() < 0.78,
      languages: random() < 0.24 ? ["English", choose(random, ["Spanish", "Vietnamese", "Korean", "Arabic"])] : ["English"],
      accessibility: { wheelchair_accessible: random() < 0.88, sensory_accommodations: random() < 0.3 },
      address: { city: metro.city, state: metro.state, postal_code: choose(random, metro.postal) }, network_status_by_plan: networkStatus,
      network_verified_at: status === "VERIFIED_DEMO" ? `2026-09-${String(integer(random, 12, 30)).padStart(2, "0")}T15:00:00-04:00` : "2026-05-15T15:00:00-04:00",
      network_source_status: status, source: { type: "synthetic_provider_directory", generated: true }, synthetic_demo: true,
    });

    for (const procedure of supported) {
      const charge = integer(random, procedure.min, procedure.max, 100);
      const allowed = Math.round(charge * integer(random, 62, 84) / 100 / 100) * 100;
      const quoteId = `SYN-QUOTE-${providerId.slice(-3)}-${procedure.cdt}`;
      priceQuotes.push({
        price_quote_id: quoteId, provider_id: providerId, location_id: locationId, cdt: procedure.cdt,
        procedure_label: procedure.label, service_class: procedure.service_class, provider_charge_cents: charge,
        in_network_allowed_cents: allowed,
        out_of_network_plan_allowance_cents: Math.round(charge * integer(random, 52, 72) / 100 / 100) * 100,
        verified_cash_quote_cents: Math.round(charge * integer(random, 70, 92) / 100 / 100) * 100,
        observed_at: "2026-09-28T16:00:00-04:00", valid_through: random() < 0.9 ? "2026-12-31" : "2026-09-30",
        verification_status: random() < 0.9 ? "VERIFIED_DEMO" : "STALE_DEMO", synthetic_demo: true,
      });
    }

    const slotCount = integer(random, 10, 24);
    for (let slot = 0; slot < slotCount; slot += 1) {
      const date = addDays("2026-10-05", integer(random, 0, 88));
      const hour = choose(random, [8, 9, 10, 11, 13, 14, 15, 16]);
      appointments.push({
        appointment_id: `SYN-APPT-${String(index + 1).padStart(3, "0")}-${String(slot + 1).padStart(3, "0")}`,
        provider_id: providerId, location_id: locationId, start: `${date}T${String(hour).padStart(2, "0")}:00:00${easternOffset(date)}`,
        duration_minutes: choose(random, [30, 45, 60, 90, 120]),
        supported_cdts: supported.slice(0, integer(random, 1, Math.min(4, supported.length))).map(({ cdt }) => cdt),
        status: weighted(random, [{ value: "available", weight: 88 }, { value: "held", weight: 8 }, { value: "waitlist_only", weight: 4 }]),
        observed_at: generatedAt, synthetic_demo: true,
      });
    }
  }

  const providersByCode = new Map<string, JsonObject[]>();
  for (const provider of providers) for (const cdt of provider.supported_cdts as string[]) providersByCode.set(cdt, [...(providersByCode.get(cdt) ?? []), provider]);
  const quoteByProviderCode = new Map(priceQuotes.map((quote) => [`${quote.provider_id}:${quote.cdt}`, quote]));
  const members: JsonObject[] = [];
  const claims: JsonObject[] = [];
  const procedureCards: JsonObject[] = [];

  for (let index = 0; index < 200; index += 1) {
    const memberId = `SYN-MEMBER-${String(index + 1).padStart(4, "0")}`;
    const planVersionId = selectPlan(random);
    const plan = planDefinitions[planVersionId];
    const metro = metros[index % metros.length]!;
    const age = weighted(random, [
      { value: integer(random, 4, 17), weight: 18 }, { value: integer(random, 18, 34), weight: 24 },
      { value: integer(random, 35, 54), weight: 34 }, { value: integer(random, 55, 74), weight: 24 },
    ]);
    const enrollmentTier = weighted(random, [
      { value: "employee_only", weight: 44 }, { value: "employee_spouse", weight: 20 },
      { value: "employee_children", weight: 15 }, { value: "family", weight: 21 },
    ]);
    const enrollmentStatus = weighted(random, [
      { value: "on_time_enrollee", weight: 94 }, { value: "late_enrollee", weight: 4 }, { value: "continuation_coverage", weight: 2 },
    ]);
    const deductibleRemaining: Record<"in_network" | "out_of_network", number> = { in_network: plan.inDed, out_of_network: plan.outDed };
    let planPaidYtd = 0;
    const memberClaims: JsonObject[] = [];
    const procedureHistory: JsonObject[] = [];
    const claimCount = weighted(random, [
      { value: 0, weight: 14 }, { value: 1, weight: 20 }, { value: 2, weight: 24 }, { value: 3, weight: 20 },
      { value: 4, weight: 12 }, { value: 5, weight: 7 }, { value: 6, weight: 3 },
    ]);
    const serviceDates = Array.from({ length: claimCount }, () => isoDate(2026, integer(random, 1, 9), integer(random, 1, 28))).sort();

    for (let claimIndex = 0; claimIndex < claimCount; claimIndex += 1) {
      const eligibleProcedures = age < 18 ? procedures.filter((p) => p.cdt !== "D1110") : procedures.filter((p) => !["D1120", "D1206", "D1351"].includes(p.cdt));
      const procedure = weighted(random, eligibleProcedures.map((value) => ({ value, weight: value.service_class === "preventive" ? 52 : value.service_class === "basic" ? 31 : value.service_class === "major" ? 14 : 3 })));
      const provider = choose(random, providersByCode.get(procedure.cdt)!);
      const quote = quoteByProviderCode.get(`${provider.provider_id}:${procedure.cdt}`)!;
      const networkStatus = (provider.network_status_by_plan as Record<string, string>)[planVersionId];
      const networkTier: "in_network" | "out_of_network" = networkStatus === "in_network" ? "in_network" : "out_of_network";
      const claimStatus = weighted(random, [
        { value: "paid", weight: 79 }, { value: "denied", weight: 9 }, { value: "pending", weight: 10 }, { value: "reversed", weight: 2 },
      ]);
      const serviceDate = serviceDates[claimIndex]!;
      const charge = quote.provider_charge_cents as number;
      const eligible = networkTier === "in_network" ? quote.in_network_allowed_cents as number : quote.out_of_network_plan_allowance_cents as number;
      let deductibleApplied = 0;
      let planPayment = 0;
      let denialReason: string | null = null;
      if (claimStatus === "paid") {
        if (!["preventive", "orthodontic"].includes(procedure.service_class)) {
          deductibleApplied = Math.min(eligible, deductibleRemaining[networkTier]);
          deductibleRemaining[networkTier] -= deductibleApplied;
        }
        const shares = plan.shares[procedure.service_class];
        const potential = Math.floor((eligible - deductibleApplied) * shares[networkTier === "in_network" ? 0 : 1] / 10_000);
        planPayment = Math.min(potential, Math.max(0, plan.max - planPaidYtd));
        planPaidYtd += planPayment;
        procedureHistory.push({ cdt: procedure.cdt, service_date: serviceDate, tooth: ["D2740", "D2391", "D2392", "D3330"].includes(procedure.cdt) ? String(integer(random, 1, 32)) : null, claim_status: "settled" });
      } else if (claimStatus === "denied") {
        denialReason = choose(random, ["frequency_limit", "waiting_period", "non_covered_service", "missing_information"]);
      }
      const claimId = `SYN-CLAIM-${String(index + 1).padStart(4, "0")}-${String(claimIndex + 1).padStart(2, "0")}`;
      const claim = {
        claim_id: claimId, member_id: memberId, plan_version_id: planVersionId, provider_id: provider.provider_id,
        price_quote_id: quote.price_quote_id, cdt: procedure.cdt, service_class: procedure.service_class, service_date: serviceDate,
        submitted_at: (() => { const date = addDays(serviceDate, integer(random, 1, 8)); return `${date}T10:00:00${easternOffset(date)}`; })(),
        adjudicated_at: ["paid", "denied", "reversed"].includes(claimStatus) ? (() => { const date = addDays(serviceDate, integer(random, 9, 28)); return `${date}T12:00:00${easternOffset(date)}`; })() : null,
        status: claimStatus, network_tier: networkTier, provider_charge_cents: charge, eligible_amount_cents: eligible,
        deductible_applied_cents: deductibleApplied, plan_payment_cents: planPayment, member_responsibility_cents: charge - planPayment,
        balance_bill_cents: networkTier === "out_of_network" ? Math.max(0, charge - eligible) : 0, denial_reason: denialReason,
        source: { type: "synthetic_claim_feed", adjudication_version: "demo-1.0" }, synthetic_demo: true,
      };
      memberClaims.push(claim);
      claims.push(claim);
    }

    const pendingClaims = memberClaims.filter((claim) => claim.status === "pending").map((claim) => ({
      claim_id: claim.claim_id,
      projected_plan_payment_cents: Math.min(Math.floor((claim.eligible_amount_cents as number) * 0.6), Math.max(0, plan.max - planPaidYtd)),
    }));
    const snapshotStatus = weighted(random, [{ value: "VERIFIED_DEMO", weight: 90 }, { value: "STALE_DEMO", weight: 7 }, { value: "UNVERIFIED_DEMO", weight: 3 }]);
    const hardMonthlyLimit = integer(random, 15_000, 80_000, 5_000);
    const preferredMonthlyLimit = integer(random, 10_000, Math.min(50_000, hardMonthlyLimit), 5_000);
    const hsaAvailable = integer(random, 10_000, 300_000, 10_000);
    const hsaReserve = integer(random, 0, Math.min(100_000, hsaAvailable), 10_000);
    members.push({
      member_snapshot_id: `${memberId}-2026-10-03-v1`, member_id: memberId,
      household_id: `SYN-HOUSEHOLD-${String(Math.floor(index / 2) + 1).padStart(4, "0")}`,
      display_name: `${choose(random, firstNames)} ${choose(random, lastNames)}`,
      date_of_birth: isoDate(2026 - age, integer(random, 1, 12), integer(random, 1, 28)), jurisdiction: "VA",
      home_market: metro.city, postal_code: choose(random, metro.postal), plan_version_id: planVersionId,
      enrollment_tier: enrollmentTier, coverage_effective_from: enrollmentStatus === "late_enrollee" ? "2026-06-01" : "2026-01-01",
      enrollment_status: enrollmentStatus, observed_at: snapshotStatus === "STALE_DEMO" ? "2026-07-01T09:00:00-04:00" : generatedAt,
      benefit_state: {
        benefit_year: 2026, annual_maximum_total_cents: plan.max, plan_paid_ytd_cents: planPaidYtd,
        annual_maximum_remaining_cents: plan.max - planPaidYtd, deductible_remaining_cents: deductibleRemaining,
        rollover_bank_cents: integer(random, 0, 4) * 10_000,
        orthodontic_lifetime_remaining_cents: planVersionId.includes("value") ? 0 : planVersionId.includes("enhanced") ? 150_000 : 100_000,
        pending_claims: pendingClaims,
        source: { type: "synthetic_member_portal_snapshot", status: snapshotStatus, as_of: snapshotStatus === "STALE_DEMO" ? "2026-07-01T09:00:00-04:00" : generatedAt },
      },
      procedure_history: procedureHistory,
      financial_state: {
        hard_monthly_payment_limit_cents: hardMonthlyLimit,
        preferred_monthly_payment_limit_cents: preferredMonthlyLimit,
        fsa: random() < 0.48 ? { available_cents: integer(random, 0, 150_000, 5_000), eligible_through: "2026-12-31", source_status: "MEMBER_CONFIRMED_DEMO" } : null,
        hsa: random() < 0.38 ? { available_cents: hsaAvailable, member_desired_reserve_cents: hsaReserve, source_status: "MEMBER_CONFIRMED_DEMO" } : null,
      },
      travel_preferences: { hard_maximum_miles: choose(random, [10, 15, 20, 25, 35]), preferred_maximum_miles: choose(random, [5, 8, 10, 15]) },
      communication_preferences: { language: random() < 0.86 ? "English" : choose(random, ["Spanish", "Vietnamese", "Korean", "Arabic"]), channel: choose(random, ["email", "sms", "portal"]) },
      synthetic_demo: true,
    });

    if (random() < 0.58) {
      const cardId = `SYN-CARD-${String(index + 1).padStart(4, "0")}`;
      const template = weighted(random, [
        { value: "routine", weight: 24 }, { value: "restorative", weight: 28 }, { value: "endo_crown", weight: 20 },
        { value: "periodontal", weight: 12 }, { value: "surgical", weight: 10 }, { value: "implant", weight: 6 },
      ]);
      const codes = template === "routine" ? ["D0120", age < 18 ? "D1120" : "D1110"] : template === "restorative" ? ["D2392"]
        : template === "endo_crown" ? ["D3330", "D2740"] : template === "periodontal" ? ["D4341", "D4341"]
        : template === "surgical" ? ["D7210"] : ["D6010", "D6057", "D6065"];
      const cardProcedures = codes.map((cdt, procedureIndex) => {
        const definition = procedures.find((item) => item.cdt === cdt)!;
        const earliest = addDays(EXPANDED_REFERENCE_DATE, procedureIndex * 21 + integer(random, 2, 14));
        return {
          procedure_id: `${cardId}-PROC-${procedureIndex + 1}`, cdt, label: definition.label,
          tooth: ["D2392", "D2740", "D3330", "D6010", "D6057", "D6065"].includes(cdt) ? String(integer(random, 1, 32)) : null,
          dentist_estimated_fee_cents: integer(random, definition.min, definition.max, 100), required_specialty: definition.specialties[0],
          earliest_safe_date: earliest, target_by_date: addDays(earliest, template === "routine" ? 60 : 30),
          latest_safe_date: addDays(earliest, template === "routine" ? 120 : 60),
          urgency: template === "endo_crown" && procedureIndex === 0 ? "urgent" : template === "routine" ? "routine" : "time_bounded",
          dependencies: procedureIndex === 0 ? [] : [{ procedure_id: `${cardId}-PROC-${procedureIndex}`, minimum_gap_days: template === "implant" ? 60 : 7, maximum_gap_days: template === "implant" ? 240 : 120 }],
          confirmation_status: random() < 0.9 ? "DENTIST_AND_MEMBER_CONFIRMED_DEMO" : "UNVERIFIED_AI_EXTRACTION_DEMO",
        };
      });
      procedureCards.push({
        procedure_card_id: cardId, member_id: memberId,
        dentist_source: { source_type: "synthetic_written_treatment_card", recorded_at: generatedAt }, procedures: cardProcedures,
        unanswered_questions: cardProcedures.some((item) => item.confirmation_status !== "DENTIST_AND_MEMBER_CONFIRMED_DEMO") ? ["Confirm clinical timing with treating dentist"] : [],
        synthetic_demo: true,
      });
    }
  }

  const payload = { members, providers, priceQuotes, claims, appointments, procedureCards };
  const checksum = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
  const manifest: JsonObject = {
    schema_version: "2.0", dataset_id: EXPANDED_DEMO_DATASET_ID, synthetic_demo: true, generated_at: generatedAt,
    reference_date: EXPANDED_REFERENCE_DATE, generator_seed: seed, generator_version: "2.0.0", checksum_sha256: checksum,
    disclaimer: "Entirely synthetic demonstration data. Not derived from real members, providers, claims, or carrier records.",
    counts: Object.fromEntries(Object.entries(payload).map(([key, value]) => [key, value.length])),
    procedure_catalog: procedures.map(({ cdt, label, service_class }) => ({ cdt, label, service_class, classification_source: "synthetic_plan_schedule" })),
  };
  return { manifest, ...payload };
}

export function validateExpandedDemoData(data: ExpandedDemoData): string[] {
  const errors: string[] = [];
  const unique = (documents: JsonObject[], key: string) => {
    const values = documents.map((document) => document[key]);
    if (values.some((value) => typeof value !== "string" || value.length === 0)) errors.push(`${key} must be present on every document`);
    if (new Set(values).size !== values.length) errors.push(`${key} values must be unique`);
    return new Set(values);
  };
  const memberIds = unique(data.members, "member_id");
  const providerIds = unique(data.providers, "provider_id");
  const quoteIds = unique(data.priceQuotes, "price_quote_id");
  unique(data.claims, "claim_id"); unique(data.appointments, "appointment_id"); unique(data.procedureCards, "procedure_card_id");
  const planIds = new Set(Object.keys(planDefinitions));

  for (const member of data.members) {
    if (!planIds.has(member.plan_version_id as keyof typeof planDefinitions)) errors.push(`Member ${member.member_id} references an unknown plan`);
    const benefit = member.benefit_state as Record<string, number>;
    if (benefit.annual_maximum_total_cents - benefit.plan_paid_ytd_cents !== benefit.annual_maximum_remaining_cents) errors.push(`Member ${member.member_id} annual maximum does not reconcile`);
    const claimTotal = data.claims.filter((claim) => claim.member_id === member.member_id && claim.status === "paid").reduce((sum, claim) => sum + (claim.plan_payment_cents as number), 0);
    if (claimTotal !== benefit.plan_paid_ytd_cents) errors.push(`Member ${member.member_id} claim payments do not reconcile`);
    const financial = member.financial_state as { hard_monthly_payment_limit_cents: number; preferred_monthly_payment_limit_cents: number; hsa: { available_cents: number; member_desired_reserve_cents: number } | null };
    if (financial.preferred_monthly_payment_limit_cents > financial.hard_monthly_payment_limit_cents) errors.push(`Member ${member.member_id} preferred limit exceeds hard limit`);
    if (financial.hsa && financial.hsa.member_desired_reserve_cents > financial.hsa.available_cents) errors.push(`Member ${member.member_id} HSA reserve exceeds balance`);
  }
  for (const quote of data.priceQuotes) if (!providerIds.has(quote.provider_id)) errors.push(`Quote ${quote.price_quote_id} references an unknown provider`);
  for (const claim of data.claims) {
    if (!memberIds.has(claim.member_id)) errors.push(`Claim ${claim.claim_id} references an unknown member`);
    if (!providerIds.has(claim.provider_id)) errors.push(`Claim ${claim.claim_id} references an unknown provider`);
    if (!quoteIds.has(claim.price_quote_id)) errors.push(`Claim ${claim.claim_id} references an unknown quote`);
    for (const field of ["provider_charge_cents", "eligible_amount_cents", "deductible_applied_cents", "plan_payment_cents", "member_responsibility_cents", "balance_bill_cents"]) {
      if (!Number.isInteger(claim[field]) || (claim[field] as number) < 0) errors.push(`Claim ${claim.claim_id} has invalid ${field}`);
    }
    if ((claim.plan_payment_cents as number) + (claim.member_responsibility_cents as number) !== claim.provider_charge_cents) errors.push(`Claim ${claim.claim_id} does not balance`);
  }
  for (const appointment of data.appointments) if (!providerIds.has(appointment.provider_id)) errors.push(`Appointment ${appointment.appointment_id} references an unknown provider`);
  for (const card of data.procedureCards) if (!memberIds.has(card.member_id)) errors.push(`Card ${card.procedure_card_id} references an unknown member`);
  return errors;
}
