/**
 * Builds data/plans/** from fixtures/golden/registry-expectations.json (rule values) and
 * data/sources/** (evidence quotes). Run: npx tsx data/tools/build-registry.ts
 * Every quote is checked to be a literal substring of its cited page; the build fails otherwise.
 */
import fs from "node:fs";
import path from "node:path";
import { formatUsd } from "../../src/domain/money";
import { registryRuleIdProblems, splitSourcePages } from "../../src/domain/plan";
import expectations from "../../fixtures/golden/registry-expectations.json";
import manifest from "../../data/sources/manifest.json";
import member from "../../fixtures/synthetic/member.json";

const ROOT = path.resolve(import.meta.dirname, "../..");
const OUT = path.join(ROOT, "data/plans");

/**
 * [section, quote, source_id?] per rule id stem (the rule id minus the plan's `rule_id_suffix`);
 * `${Y}` is replaced by the plan year. source_id defaults to the plan's summary (`exp.source_id`).
 * QUOTES holds the PPO Standard text; PLAN_QUOTES overrides a stem for one plan version.
 */
type Cite = [section: string, quote: string, sourceId?: string];
const RIDER_2026 = "nwd-ppo-2026-carryover-rider";
const GUIDE_2026 = "acme-2026-enrollment-guide";
const QUOTES: Record<string, Cite[]> = {
  benefit_period: [
    ["Benefit Period", "The benefit period is the calendar year: January 1, ${Y} through December 31, ${Y}."],
    ["Benefit Period", "Benefits are applied based on the date of service."],
  ],
  deductible: [
    ["Deductible and Maximums", "Individual deductible: $50 per member per benefit period."],
    ["Deductible and Maximums", "The deductible applies to Basic and Major services."],
    ["Deductible and Maximums", "The deductible is combined for in-network and out-of-network services."],
  ],
  annual_maximum: [
    ["Deductible and Maximums", "Annual maximum: $1,500 per member per benefit period, combined for in-network and out-of-network services."],
    ["Deductible and Maximums", "Plan payments for Basic and Major services count toward the annual maximum."],
  ],
  "lifetime_maximum.orthodontic": [["Deductible and Maximums", "Orthodontic lifetime maximum: Not applicable."]],
  "plan_share.in_network.preventive": [
    ["Coverage Levels", "| Diagnostic & Preventive | 100% | 80% |"],
    ["Coverage Levels", "In-network coinsurance is applied to the network dentist's contracted fee (allowed amount) after any deductible."],
  ],
  "plan_share.in_network.basic": [
    ["Coverage Levels", "| Basic | 80% | 60% |"],
    ["Coverage Levels", "In-network coinsurance is applied to the network dentist's contracted fee (allowed amount) after any deductible."],
  ],
  "plan_share.in_network.major": [
    ["Coverage Levels", "| Major | 50% | 40% |"],
    ["Coverage Levels", "In-network coinsurance is applied to the network dentist's contracted fee (allowed amount) after any deductible."],
  ],
  "plan_share.out_of_network.preventive": [
    ["Coverage Levels", "| Diagnostic & Preventive | 100% | 80% |"],
    ["Coverage Levels", "Out-of-network coinsurance is applied to the plan's Out-of-Network Allowance after any deductible."],
  ],
  "plan_share.out_of_network.basic": [
    ["Coverage Levels", "| Basic | 80% | 60% |"],
    ["Coverage Levels", "Out-of-network coinsurance is applied to the plan's Out-of-Network Allowance after any deductible."],
  ],
  "plan_share.out_of_network.major": [
    ["Coverage Levels", "| Major | 50% | 40% |"],
    ["Coverage Levels", "Out-of-network coinsurance is applied to the plan's Out-of-Network Allowance after any deductible."],
  ],
  "service_class_map.preventive": [
    ["Service Classifications", "| Diagnostic & Preventive | D0120, D0140, D0150, D0210, D0220, D0274, D1110 |"],
  ],
  "service_class_map.basic": [
    ["Service Classifications", "| Basic | D2140, D2391, D2392, D3330 |"],
    ["Service Classifications", "Endodontic therapy (D3330) is classified as a Basic service under this plan."],
  ],
  "service_class_map.major": [["Service Classifications", "| Major | D2740, D2750, D2950, D6010 |"]],
  "waiting_period.all": [["Waiting Periods", "There are no waiting periods for any service class under this plan."]],
  "frequency_limit.evaluations": [
    ["Limitations", "| D0120, D0140, D0150 (oral evaluations) | 2 per member per benefit period, combined |"],
  ],
  "frequency_limit.prophylaxis": [["Limitations", "| D1110 (prophylaxis) | 2 per member per benefit period |"]],
  "frequency_limit.fmx": [["Limitations", "| D0210 (full-mouth radiographs) | 1 per member per 60 months |"]],
  "frequency_limit.crowns": [["Limitations", "| D2740, D2750 (crowns) | 1 per tooth per 60 months |"]],
  "frequency_limit.crowns_note_4": [["Limitations", "Note 4: Crowns (D2740, D2750) are limited to 1 per tooth per 84 months."]],
  "exclusion.cosmetic": [["Exclusions", "Cosmetic services, including D9972 external bleaching, are not covered."]],
  "alternate_benefit.posterior_composite": [
    ["Alternate Benefits", "This plan does not apply an alternate benefit to posterior composite (tooth-colored) restorations."],
  ],
  "sublimit.all": [["Sublimits", "No service-specific sublimits apply under this plan."]],
  limitations_index: [
    ["Limitations", "This section lists every frequency limitation that applies under this plan."],
    ["Exclusions", "This section lists every exclusion that applies under this plan."],
    ["Alternate Benefits", "No other alternate benefit provisions apply."],
    ["Sublimits", "No service-specific sublimits apply under this plan."],
  ],
  oon_allowance_schedule: [
    ["Out-of-Network Allowance Schedule", "| Procedure code | Out-of-Network Allowance |"],
    [
      "Out-of-Network Allowance Schedule",
      "Out-of-network dentists may bill the member for the difference between their charge and the plan's payment (balance billing).",
    ],
  ],
  claim_submission: [
    ["Claim Submission and Direct Payment", "A member may ask a network dentist not to submit a claim and pay the dentist directly."],
    [
      "Claim Submission and Direct Payment",
      "Services paid without a claim are not recorded by the plan: they do not reduce the deductible or annual maximum and do not count toward frequency limitations.",
    ],
    ["Claim Submission and Direct Payment", "The network fee schedule does not apply to services paid without a claim"],
  ],
  // (1.5) The rider governs the 2026 carryover; the summary defers to it.
  rollover: [
    [
      "Earning a Carryover",
      "A carryover is earned for the 2026 benefit period when plan payments for services incurred in that benefit period that count toward the annual maximum total less than $500.",
      RIDER_2026,
    ],
    ["Earning a Carryover", "A total of exactly $500 does not earn a carryover.", RIDER_2026],
    ["Earning a Carryover", "Services are assigned to a benefit period by date of service, including claims processed after the benefit period ends.", RIDER_2026],
    ["Earning a Carryover", "At least one claim with a plan payment that counts toward the annual maximum must be paid for services in the benefit period.", RIDER_2026],
    ["Earning a Carryover", "The carryover earned is $250. There is no additional in-network bonus.", RIDER_2026],
    ["Carryover Balance", "The carryover earned is added to the member's carryover balance.", RIDER_2026],
    ["Carryover Balance", "The carryover balance may not exceed $1,000; any amount above $1,000 is not carried over.", RIDER_2026],
    ["Carryover Balance", "If no carryover is earned for a benefit period, the carryover balance does not continue into the next benefit period.", RIDER_2026],
    ["Carryover Balance", "The carryover balance is added to the annual maximum of the next benefit period.", RIDER_2026],
    [
      "Next Benefit Period",
      "A carryover earned for the 2026 benefit period applies only if the member is enrolled on January 1, 2027 in the Northwind Mutual Dental PPO Standard plan for the 2027 benefit period (plan version nwd-ppo-standard-2027).",
      RIDER_2026,
    ],
    [
      "Maximum Carryover",
      "Members may be eligible to carry over $250 of unused annual maximum into the next benefit period when plan payments in a benefit period are below $500, up to a total carryover of $1,000.",
    ],
  ],
  pretreatment_estimate: [
    ["Pre-Treatment Estimates", "A pre-treatment estimate is recommended when planned treatment is expected to exceed $300."],
  ],
  coordination_of_benefits: [
    [
      "Coordination of Benefits",
      "When a member is covered by more than one dental plan, benefits are coordinated using the standard method.",
    ],
  ],
};

const IN_BASIS = "In-network coinsurance is applied to the network dentist's contracted fee (allowed amount) after any deductible.";
const OON_BASIS = "Out-of-network coinsurance is applied to the plan's Out-of-Network Allowance after any deductible.";
const deductibleCites = (dollars: string): Cite[] => [
  ["Deductible and Maximums", `Individual deductible: $${dollars} per member per benefit period.`],
  ...QUOTES.deductible!.slice(1),
];
const maximumCites = (dollars: string): Cite[] => [
  ["Deductible and Maximums", `Annual maximum: $${dollars} per member per benefit period, combined for in-network and out-of-network services.`],
  ...QUOTES.annual_maximum!.slice(1),
];
const shareCites = (row: string, basis: string): Cite[] => [
  ["Coverage Levels", row],
  ["Coverage Levels", basis],
];
const premiumCites = (row: string): Cite[] => [
  ["Monthly Premiums", row, GUIDE_2026],
  ["Monthly Premiums", "Amounts are the employee's monthly contribution for the 2026 plan year.", GUIDE_2026],
];
const ENHANCED_CARRYOVER = [
  "A carryover is earned for the 2026 benefit period when plan payments for services incurred in that benefit period that count toward the annual maximum total $700 or less.",
  "Services are assigned to a benefit period by date of service, including claims processed after the benefit period ends.",
  "At least one claim with a plan payment that counts toward the annual maximum must be paid for services in the benefit period.",
  "The carryover earned is $350. An additional in-network bonus of $150 is earned when at least one claim for services in the benefit period is paid to a network dentist.",
  "The carryover earned is added to the member's carryover balance.",
  "The carryover balance may not exceed $1,250; any amount above $1,250 is not carried over.",
  "If no carryover is earned for a benefit period, the carryover balance does not continue into the next benefit period.",
  "The carryover balance is added to the annual maximum of the next benefit period.",
  "A carryover earned for the 2026 benefit period applies only if the member is enrolled on January 1, 2027 in the Northwind Mutual Dental PPO Enhanced plan for the 2027 benefit period (plan version nwd-ppo-enhanced-2027).",
];

/** (1.6) Per-plan-version overrides of QUOTES, keyed by stem. */
const PLAN_QUOTES: Record<string, Record<string, Cite[]>> = {
  "nwd-ppo-standard-2026": {
    premium: premiumCites("| PPO Standard | $18.25 | $36.50 | $39.20 | $58.40 |"),
  },
  "nwd-ppo-standard-2027": {
    deductible: deductibleCites("75"),
    rollover: [["Maximum Carryover", "No maximum carryover feature applies for the 2027 benefit period."]],
  },
  "nwd-ppo-value-2026": {
    deductible: deductibleCites("100"),
    annual_maximum: maximumCites("1,000"),
    "plan_share.in_network.basic": shareCites("| Basic | 70% | 50% |", IN_BASIS),
    "plan_share.in_network.major": shareCites("| Major | 40% | 30% |", IN_BASIS),
    "plan_share.out_of_network.basic": shareCites("| Basic | 70% | 50% |", OON_BASIS),
    "plan_share.out_of_network.major": shareCites("| Major | 40% | 30% |", OON_BASIS),
    "waiting_period.preventive": [["Waiting Periods", "There are no waiting periods for Diagnostic & Preventive or Basic services."]],
    "waiting_period.basic": [["Waiting Periods", "There are no waiting periods for Diagnostic & Preventive or Basic services."]],
    "waiting_period.major": [["Waiting Periods", "Major services have a waiting period of 12 months from the member's coverage effective date."]],
    "exclusion.implants": [["Exclusions", "Implants (D6010) are classified as Major services but are not covered under this plan."]],
    rollover: [["Maximum Carryover", "No maximum carryover feature applies for the 2026 benefit period."]],
    premium: premiumCites("| PPO Value | $9.80 | $19.60 | $21.10 | $31.40 |"),
  },
  "nwd-ppo-enhanced-2026": {
    annual_maximum: maximumCites("2,500"),
    "lifetime_maximum.orthodontic": [
      ["Deductible and Maximums", "Orthodontic lifetime maximum: $1,500 per member."],
      [
        "Deductible and Maximums",
        "Plan payments for Orthodontic services count only toward the orthodontic lifetime maximum and do not count toward the annual maximum.",
      ],
    ],
    "plan_share.in_network.preventive": shareCites("| Diagnostic & Preventive | 100% | 100% |", IN_BASIS),
    "plan_share.in_network.basic": shareCites("| Basic | 90% | 80% |", IN_BASIS),
    "plan_share.in_network.major": shareCites("| Major | 60% | 50% |", IN_BASIS),
    "plan_share.in_network.orthodontic": shareCites("| Orthodontics | 50% | 50% |", IN_BASIS),
    "plan_share.out_of_network.preventive": shareCites("| Diagnostic & Preventive | 100% | 100% |", OON_BASIS),
    "plan_share.out_of_network.basic": shareCites("| Basic | 90% | 80% |", OON_BASIS),
    "plan_share.out_of_network.major": shareCites("| Major | 60% | 50% |", OON_BASIS),
    "plan_share.out_of_network.orthodontic": shareCites("| Orthodontics | 50% | 50% |", OON_BASIS),
    "service_class_map.orthodontic": [["Service Classifications", "| Orthodontic | D8080 |"]],
    rollover: ENHANCED_CARRYOVER.map((q): Cite => ["Maximum Carryover", q]),
    premium: premiumCites("| PPO Enhanced | $31.60 | $63.20 | $67.90 | $101.10 |"),
  },
  "nwd-ppo-value-2027": {
    deductible: deductibleCites("75"),
    annual_maximum: maximumCites("1,200"),
    "plan_share.in_network.basic": shareCites("| Basic | 70% | 50% |", IN_BASIS),
    "plan_share.in_network.major": shareCites("| Major | 40% | 30% |", IN_BASIS),
    "plan_share.out_of_network.basic": shareCites("| Basic | 70% | 50% |", OON_BASIS),
    "plan_share.out_of_network.major": shareCites("| Major | 40% | 30% |", OON_BASIS),
    rollover: [["Maximum Carryover", "No maximum carryover feature applies for the 2027 benefit period."]],
  },
  "nwd-ppo-enhanced-2027": {
    deductible: deductibleCites("25"),
    annual_maximum: maximumCites("2,000"),
    "plan_share.in_network.preventive": shareCites("| Diagnostic & Preventive | 100% | 90% |", IN_BASIS),
    "plan_share.in_network.basic": shareCites("| Basic | 90% | 70% |", IN_BASIS),
    "plan_share.in_network.major": shareCites("| Major | 60% | 50% |", IN_BASIS),
    "plan_share.out_of_network.preventive": shareCites("| Diagnostic & Preventive | 100% | 90% |", OON_BASIS),
    "plan_share.out_of_network.basic": shareCites("| Basic | 90% | 70% |", OON_BASIS),
    "plan_share.out_of_network.major": shareCites("| Major | 60% | 50% |", OON_BASIS),
    rollover: [["Maximum Carryover", "No maximum carryover feature applies for the 2027 benefit period."]],
  },
};

const sources = manifest.sources.map((s) => ({
  ...s,
  pages: splitSourcePages(fs.readFileSync(path.join(ROOT, s.path), "utf8")),
}));

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, "sources.generated.json"), JSON.stringify(sources, null, 2) + "\n");

const plans = expectations.plans.map((exp) => {
  const src = sources.find((s) => s.source_id === exp.source_id)!;
  // The plan's own summary title: "# Northwind Mutual Dental — PPO Standard — 2026 Summary…".
  const [carrierName, planName] = src.pages[0]!.text.split("\n")[0]!.replace(/^# /, "").split(" — ") as [string, string];
  const year = exp.coverage_period.start.slice(0, 4);
  const rules = exp.rules.map((r) => {
    if (!r.rule_id.endsWith(exp.rule_id_suffix)) throw new Error(`${r.rule_id} does not end in ${exp.rule_id_suffix}`);
    const stem = r.rule_id.slice(0, -exp.rule_id_suffix.length);
    const cites = r.evidence_page === null ? [] : (PLAN_QUOTES[exp.plan_version_id]?.[stem] ?? QUOTES[stem]);
    if (!cites) throw new Error(`no quote for ${r.rule_id}`);
    // (1.6) A premium row from the group's shared enrollment guide must name this plan's own option.
    if (r.rule_type === "premium" && cites.length > 0 && !cites.some(([, q]) => q.startsWith(`| ${planName} |`))) {
      throw new Error(`${r.rule_id}: premium row does not name ${planName}`);
    }
    // Each OON allowance row used is quoted literally (review P1-2): "| D0140 | $65 |".
    const rows: Cite[] =
      stem === "oon_allowance_schedule"
        ? (r.value as { allowances: { cdt_code: string; cents: number }[] }).allowances.map((x) => ["Out-of-Network Allowance Schedule", `| ${x.cdt_code} | ${formatUsd(x.cents)} |`])
        : [];
    const evidence = [...cites, ...rows].map(([section, q, sourceId]) => {
      const quote = q.replaceAll("${Y}", year);
      const cited = sourceId ? sources.find((s) => s.source_id === sourceId)! : src;
      const page = cited.pages.find((p) => p.text.includes(quote))?.page;
      if (page === undefined) throw new Error(`${r.rule_id}: quote not in ${cited.source_id}: ${quote}`);
      return { source_id: cited.source_id, page, section, locator: `page ${page}, ${section}`, quote };
    });
    const pageSource = "evidence_source_id" in r ? r.evidence_source_id : src.source_id;
    if (r.evidence_page !== null && !evidence.some((e) => e.page === r.evidence_page && e.source_id === pageSource)) {
      throw new Error(`${r.rule_id}: no evidence on page ${r.evidence_page} of ${pageSource}`);
    }
    return {
      rule_id: r.rule_id,
      rule_type: r.rule_type,
      status: r.status,
      effective_from: exp.coverage_period.start,
      effective_to: exp.coverage_period.end,
      applies_when: r.applies_when,
      value: r.value,
      evidence,
      conflicts_with: r.conflicts_with,
      note: r.status === "UNKNOWN" ? "Not addressed in the plan document." : null,
    };
  });
  return {
    plan_id: exp.plan_id,
    plan_version_id: exp.plan_version_id,
    plan_type: exp.plan_type,
    key: { ...member.plan_key, plan_option_id: exp.plan_option_id },
    carrier_name: carrierName,
    plan_name: planName,
    coverage_period: exp.coverage_period,
    synthetic: true,
    source_documents: sources.filter((s) => s.plan_version_ids.includes(exp.plan_version_id)).map((s) => ({ source_id: s.source_id, sha256: s.sha256 })),
    source_precedence: "source_precedence" in exp ? exp.source_precedence : [src.source_id],
    review: { status: "REVIEWED", reviewed_by: "dental-benefits", reviewed_at: "2026-10-03T00:00:00Z" },
    rules,
  };
});
const duplicates = registryRuleIdProblems({ plans });
if (duplicates.length) throw new Error(duplicates.join("; "));
for (const plan of plans) fs.writeFileSync(path.join(OUT, `${plan.plan_version_id}.json`), JSON.stringify(plan, null, 2) + "\n");
console.log(`wrote ${expectations.plans.length} plans + sources to ${path.relative(ROOT, OUT)}`);
