import { carePaths, getFieldDefinition, isKnownFieldPath, procedureIdOf } from "@/lib/domain/fields";
import type { FieldValue, IntakeEvidence, IntakeProposal, ProcedureId } from "@/lib/domain/types";
import { formatProposedValue, procedureLabelsOf, type ProcedureLabels } from "./fact-display";

// Turns a report's proposals into the Ready summary: procedures and fees
// grouped by the page they came from. Display only; no calculation.

export interface SummaryItem {
  fieldPath: string;
  label: string;
  value: string;
}

export interface SummaryRow {
  key: string;
  heading: string;
  items: SummaryItem[];
}

export interface PageGroup {
  /** null when the source didn't say which page. */
  pageNumber: number | null;
  rows: SummaryRow[];
  evidenceIds: string[];
}

export interface ReportSummary {
  groups: PageGroup[];
  procedureCount: number;
  labels: ProcedureLabels;
}

export function summarizeReport(proposals: readonly IntakeProposal[], evidence: readonly IntakeEvidence[]): ReportSummary {
  const evidenceById = new Map(evidence.map((item) => [item.id, item]));
  const labels = procedureLabelsOf(proposals);
  const pages = new Map<number | null, { rows: Map<string, SummaryRow>; evidenceIds: Set<string> }>();

  for (const proposal of proposals) {
    if (!isKnownFieldPath(proposal.fieldPath)) continue;
    const page = evidenceById.get(proposal.evidenceId)?.pageNumber ?? null;
    const group = pages.get(page) ?? { rows: new Map<string, SummaryRow>(), evidenceIds: new Set<string>() };
    pages.set(page, group);
    group.evidenceIds.add(proposal.evidenceId);

    const procedureId = procedureIdOf(proposal.fieldPath);
    const key = procedureId ?? "plan";
    const row = group.rows.get(key) ?? { key, heading: headingFor(procedureId, labels), items: [] };
    group.rows.set(key, row);
    if (procedureId && proposal.fieldPath === carePaths.label(procedureId)) continue; // the name is the row heading
    row.items.push({
      fieldPath: proposal.fieldPath,
      label: getFieldDefinition(proposal.fieldPath).label,
      value: formatProposedValue(proposal.fieldPath, proposal.value, labels),
    });
  }

  const groups: PageGroup[] = [...pages.entries()]
    .sort(([a], [b]) => (a ?? Number.MAX_SAFE_INTEGER) - (b ?? Number.MAX_SAFE_INTEGER))
    .map(([pageNumber, group]) => ({ pageNumber, rows: [...group.rows.values()], evidenceIds: [...group.evidenceIds] }));

  return { groups, procedureCount: Object.keys(labels).length, labels };
}

function headingFor(procedureId: ProcedureId | null, labels: ProcedureLabels): string {
  if (!procedureId) return "Plan details";
  return labels[procedureId] ?? `Procedure ${procedureId.slice(1)}`;
}

/** Proposals from the draft that cite the given report, for when the live extraction is no longer in memory. */
export function reportProposalsFromDraft(
  facts: Record<string, { fieldPath: string; value: FieldValue; evidenceIds: string[] }>,
  evidence: Record<string, IntakeEvidence>,
  reportId: string,
): IntakeProposal[] {
  const proposals: IntakeProposal[] = [];
  for (const fact of Object.values(facts)) {
    const evidenceId = fact.evidenceIds.find((id) => evidence[id]?.sourceId === reportId);
    if (evidenceId) proposals.push({ fieldPath: fact.fieldPath, value: fact.value, evidenceId });
  }
  return proposals;
}
