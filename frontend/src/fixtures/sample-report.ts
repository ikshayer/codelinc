import { PLAN_FIELDS, carePaths, timingPaths } from "@/lib/domain/fields";
import type { CoverageCategory, IntakeEvidence, IntakeProposal, ProcedureId } from "@/lib/domain/types";
import type { IntakeExtraction } from "@/lib/adapters/types";

// Synthetic data only. Describes public/samples/sample-dentist-report.pdf: a
// two-page text report from a fictional practice. Every literal quote below is
// exact text from that PDF. A text-only dentist report omits plan limits and
// usage, so none are proposed. Dentist timing permission and eligibility are
// never proposed: a person affirms those separately.

export const SAMPLE_REPORT_URL = "/samples/sample-dentist-report.pdf";
export const SAMPLE_REPORT_FILE_NAME = "sample-dentist-report.pdf";
export const SAMPLE_REPORT_SIZE_BYTES = 9210;
export const SAMPLE_REPORT_PAGE_COUNT = 2;
/** SHA-256 of the bundled sample PDF; lets demo mode recognize the labeled sample even if re-uploaded. */
export const SAMPLE_REPORT_SHA256 = "2aea5124d967041176702456d4b3f6546abd309e39cf66f54ede8b121619be5a";
export const SAMPLE_REPORT_PATIENT_NAME = "Sam Rivera";

interface SampleProcedureRow {
  id: ProcedureId;
  label: string;
  category: CoverageCategory;
  /** Draft text value, as typed in the field. */
  fee: string;
  /** Fee as printed in the PDF. */
  feeQuote: string;
  date: string;
}

const PROCEDURE_ROWS: readonly SampleProcedureRow[] = [
  { id: "p1", label: "Cleaning", category: "preventive", fee: "150", feeQuote: "$150", date: "2026-10-15" },
  { id: "p2", label: "Filling A", category: "basic", fee: "200", feeQuote: "$200", date: "2026-10-16" },
  { id: "p3", label: "Filling B", category: "basic", fee: "200", feeQuote: "$200", date: "2026-10-17" },
  { id: "p4", label: "Crown", category: "major", fee: "1,500", feeQuote: "$1,500", date: "2026-11-15" },
];

const QUOTES = {
  p1Timing: "Cleaning: schedule on 2026-10-15.",
  p2Timing: "Filling A: schedule on 2026-10-16.",
  p3Timing: "Filling B: schedule on 2026-10-17.",
  crownWindow: "Crown: may be done 2026-11-15 to 2026-12-15.",
  crownDeferred: "Crown: or deferred to 2027-01-08 to 2027-01-31.",
  crownDeadline: "Crown: no later than 2027-01-31.",
  crownAfter: "Crown: after both fillings, with at least 1 day between.",
  patient: "Patient: Sam Rivera",
} as const;

const POINT_WINDOW_QUOTES: Record<"p1" | "p2" | "p3", { quote: string; date: string }> = {
  p1: { quote: QUOTES.p1Timing, date: "2026-10-15" },
  p2: { quote: QUOTES.p2Timing, date: "2026-10-16" },
  p3: { quote: QUOTES.p3Timing, date: "2026-10-17" },
};

export interface SampleReportSource {
  reportId: string;
  fileName: string;
  receivedAt: string;
}

/** The extraction the demo returns for the labeled sample report. */
export function buildSampleReportExtraction({ reportId, fileName, receivedAt }: SampleReportSource): IntakeExtraction {
  const evidence: IntakeEvidence[] = [];
  const proposals: IntakeProposal[] = [];

  const quote = (key: string, pageNumber: number, literalQuote: string): string => {
    const id = `${reportId}:${key}`;
    evidence.push({ id, kind: "pdf", sourceId: reportId, sourceLabel: fileName, pageNumber, literalQuote, receivedAt });
    return id;
  };
  const propose = (fieldPath: string, value: string, evidenceId: string) => proposals.push({ fieldPath, value, evidenceId });

  for (const row of PROCEDURE_ROWS) {
    propose(carePaths.label(row.id), row.label, quote(`${row.id}-label`, 1, row.label));
    propose(carePaths.category(row.id), row.category, quote(`${row.id}-category`, 1, row.category));
    propose(carePaths.fee(row.id), row.fee, quote(`${row.id}-fee`, 1, row.feeQuote));
    propose(carePaths.anchorDate(row.id), row.date, quote(`${row.id}-date`, 1, row.date));
  }

  for (const id of ["p1", "p2", "p3"] as const) {
    const { quote: text, date } = POINT_WINDOW_QUOTES[id];
    const evidenceId = quote(`${id}-timing`, 2, text);
    propose(timingPaths.windowEarliest(id, "y1"), date, evidenceId);
    propose(timingPaths.windowLatest(id, "y1"), date, evidenceId);
    // "Schedule on <date>" is a single permitted date, so it is also the latest allowed date.
    propose(timingPaths.deadline(id), date, evidenceId);
  }

  const windowId = quote("p4-window", 2, QUOTES.crownWindow);
  propose(timingPaths.windowEarliest("p4", "y1"), "2026-11-15", windowId);
  propose(timingPaths.windowLatest("p4", "y1"), "2026-12-15", windowId);

  const deferredId = quote("p4-deferred", 2, QUOTES.crownDeferred);
  propose(timingPaths.windowEarliest("p4", "y2"), "2027-01-08", deferredId);
  propose(timingPaths.windowLatest("p4", "y2"), "2027-01-31", deferredId);

  propose(timingPaths.deadline("p4"), "2027-01-31", quote("p4-deadline", 2, QUOTES.crownDeadline));

  const afterId = quote("p4-after", 2, QUOTES.crownAfter);
  propose(timingPaths.after("p4"), "p2,p3", afterId);
  propose(timingPaths.minGapDays("p4"), "1", afterId);

  const identityId = quote("identity", 1, QUOTES.patient);

  return {
    proposals,
    evidence,
    overflow: [],
    identity: { name: SAMPLE_REPORT_PATIENT_NAME, evidenceId: identityId },
    missingFieldPaths: PLAN_FIELDS.map((field) => field.path),
    // Dentist timing language is quoted for review; it can't set permission by itself.
    reviewNotes: [
      { message: QUOTES.crownDeferred, evidenceId: deferredId },
      { message: QUOTES.crownAfter, evidenceId: afterId },
    ],
  };
}
