import type { IntakeExtraction } from "@/lib/adapters/types";
import { CATEGORIES, CATEGORY_LABELS, carePaths, getFieldDefinition, isKnownFieldPath, procedureIdOf } from "@/lib/domain/fields";
import { isValidIsoDate, formatIsoDate } from "@/lib/domain/dates";
import { formatBasisPoints, formatCents, parseDollarsToCents, parsePercentToBasisPoints } from "@/lib/domain/money";
import type { DraftFact, FieldValue } from "@/lib/domain/types";

// Everything a conversation proposes is checked here before it reaches the
// shared draft. Voice can propose plan rules and prescribed care; it can never
// set dentist timing permission or eligibility.

const FORBIDDEN_PATH = /^(?:timing\.p\d\.permission|care\.p\d\.eligibilityConfirmed)$/;

export interface ProposedValue {
  fieldPath: string;
  value: FieldValue;
}

export interface SanitizedExtraction {
  extraction: IntakeExtraction;
  hasContent: boolean;
}

/** Keeps only known, permitted fields whose evidence is present and voice-sourced. */
export function sanitizeExtraction(extraction: IntakeExtraction): SanitizedExtraction {
  const evidence = extraction.evidence.filter((item) => item.kind === "voice");
  const evidenceIds = new Set(evidence.map((item) => item.id));
  const proposals = extraction.proposals.filter(
    (proposal) => isKnownFieldPath(proposal.fieldPath) && !FORBIDDEN_PATH.test(proposal.fieldPath) && evidenceIds.has(proposal.evidenceId),
  );
  if (proposals.length !== extraction.proposals.length) {
    console.warn(`Dropped ${extraction.proposals.length - proposals.length} proposal(s) that were unknown, not permitted or missing voice evidence.`);
  }
  const overflow = extraction.overflow.filter((item) => item.evidenceId === null || evidenceIds.has(item.evidenceId));
  return {
    extraction: { ...extraction, proposals, evidence, overflow },
    hasContent: proposals.length > 0 || overflow.length > 0,
  };
}

export function formatProposedValue(fieldPath: string, value: FieldValue): string {
  if (value === null) return "Unknown";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  switch (getFieldDefinition(fieldPath).kind) {
    case "money": {
      const cents = parseDollarsToCents(value);
      return cents.ok ? formatCents(cents.value) : value;
    }
    case "percent": {
      const basisPoints = parsePercentToBasisPoints(value);
      return basisPoints.ok ? formatBasisPoints(basisPoints.value) : value;
    }
    case "date":
      return isValidIsoDate(value) ? formatIsoDate(value) : value;
    case "category": {
      const category = CATEGORIES.find((candidate) => candidate === value);
      return category ? CATEGORY_LABELS[category] : value;
    }
    case "days":
      return `${value} days`;
    default:
      return value;
  }
}

export interface DescribedValue {
  fieldPath: string;
  label: string;
  value: string;
  isMoney: boolean;
}

/** Field labels, prefixed with the procedure's name where several procedures share a label. */
export function describeValues(values: readonly ProposedValue[], facts: Readonly<Record<string, DraftFact>>): DescribedValue[] {
  const names = new Map<string, string>();
  for (const { fieldPath, value } of values) {
    const procedureId = procedureIdOf(fieldPath);
    if (procedureId && fieldPath === carePaths.label(procedureId) && typeof value === "string") names.set(procedureId, value);
  }
  return values.map(({ fieldPath, value }) => {
    const definition = getFieldDefinition(fieldPath);
    const procedureId = procedureIdOf(fieldPath);
    let label = definition.label;
    if (procedureId && fieldPath !== carePaths.label(procedureId)) {
      const known = facts[carePaths.label(procedureId)]?.value;
      const name = names.get(procedureId) ?? (typeof known === "string" && known !== "" ? known : `Procedure ${procedureId.slice(1)}`);
      label = `${name}: ${definition.label}`;
    }
    return { fieldPath, label, value: formatProposedValue(fieldPath, value), isMoney: definition.kind === "money" };
  });
}
