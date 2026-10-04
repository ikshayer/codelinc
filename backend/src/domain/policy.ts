/**
 * Fixed policy constants. FROZEN (contract v1).
 * Thresholds are product decisions (docs/decision-log.md), not plan rules.
 */

/** Inputs older than these (at `as_of`) produce an INPUT_STALE warning (not blocking). */
export const STALENESS_HOURS = {
  network_status: 24 * 30,
  appointment_slots: 24 * 2,
  prices: 24 * 90,
  accumulators: 24 * 30,
  funding_balances: 24 * 30,
} as const;

/** Search bounds for the exact optimizer (spec §7.6). Exceeding them is INVALID_INPUT. */
export const SEARCH_LIMITS = {
  max_procedures: 8,
  max_providers: 6,
  max_slots_per_provider: 60,
  max_alternatives: 3,
  /**
   * Checked BEFORE searching (CONTRACT §5.1): if Π over procedures of (candidates + 1)
   * exceeds this, return INVALID_INPUT instead of running. The golden case is 6 × 6 × 26 = 936.
   */
  max_schedules_evaluated: 50_000,
} as const;

/** Visit Navigator "best overall" cost tolerance (decision D-012). */
export const BEST_OVERALL_COST_TOLERANCE = {
  min_cents: 2_500,
  share_bps: 1_000,
} as const;

/** Red-flag symptoms that trigger the safety gate (spec §5). */
export const RED_FLAG_SYMPTOMS = ["severe_pain", "swelling", "trauma", "bleeding", "fever"] as const;
export type RedFlagSymptom = (typeof RED_FLAG_SYMPTOMS)[number];

/** Request size limits for API routes (bytes / characters). */
export const API_LIMITS = {
  max_body_bytes: 256 * 1024,
  max_text_chars: 20_000,
  /** Live mode only — deferred in v1.1 (image intake returns AI_UNAVAILABLE in synthetic mode). */
  max_image_bytes: 5 * 1024 * 1024,
  ai_timeout_ms: 8_000,
} as const;

/** Wording rules for member-facing text (spec §6, §10). */
export const WORDING = {
  dentist_attribution: "Your dentist said",
  forbidden_phrases: ["AI determined", "benefits expire", "guaranteed", "in-system", "out-of-system"],
  trust_statement:
    "AI can extract and explain, but only verified plan rules calculate. Every recommendation traces to the exact plan, clause, effective date, and dentist-confirmed constraint.",
  pretreatment_disclaimer: "A pre-treatment estimate can improve confidence, but it is not a guarantee of payment.",
} as const;
