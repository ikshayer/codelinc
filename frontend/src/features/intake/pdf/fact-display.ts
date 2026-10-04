import { formatIsoDate } from "@/lib/domain/dates";
import { CATEGORY_LABELS, getFieldDefinition, isKnownFieldPath, procedureIdOf } from "@/lib/domain/fields";
import { formatCents, parseDollarsToCents } from "@/lib/domain/money";
import type { CoverageCategory, FieldValue, ProcedureId } from "@/lib/domain/types";

// Display-only formatting of proposed values. Money is parsed to integer
// cents and formatted; nothing is added, subtracted or compared.

export type ProcedureLabels = Partial<Record<ProcedureId, string>>;

function isCategory(value: string): value is CoverageCategory {
  return value in CATEGORY_LABELS;
}

export function formatProposedValue(fieldPath: string, value: FieldValue, labels: ProcedureLabels = {}): string {
  if (value === null || value === "") return "Not found";
  if (!isKnownFieldPath(fieldPath)) return String(value);
  const { kind } = getFieldDefinition(fieldPath);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  switch (kind) {
    case "money": {
      const cents = parseDollarsToCents(value);
      return cents.ok ? formatCents(cents.value) : value;
    }
    case "date":
      return formatIsoDate(value);
    case "category":
      return isCategory(value) ? CATEGORY_LABELS[value] : value;
    case "percent":
      return `${value}%`;
    case "days":
      return value === "1" ? "1 day" : `${value} days`;
    case "procedureList":
      return value
        .split(",")
        .map((id) => labels[id.trim() as ProcedureId] ?? id.trim())
        .join(", ");
    default:
      return value;
  }
}

/** "Crown: Earliest next year" for procedure fields, the plain label otherwise. */
export function describeField(fieldPath: string, labels: ProcedureLabels = {}): string {
  if (!isKnownFieldPath(fieldPath)) return fieldPath;
  const { label } = getFieldDefinition(fieldPath);
  const procedureId = procedureIdOf(fieldPath);
  const procedure = procedureId ? labels[procedureId] : undefined;
  return procedure ? `${procedure}: ${label}` : label;
}

/** Procedure names found among the given values, e.g. { p4: "Crown" }. */
export function procedureLabelsOf(values: Iterable<{ fieldPath: string; value: FieldValue }>): ProcedureLabels {
  const labels: ProcedureLabels = {};
  for (const { fieldPath, value } of values) {
    const match = /^care\.(p\d)\.label$/.exec(fieldPath);
    if (match && typeof value === "string" && value) labels[match[1] as ProcedureId] = value;
  }
  return labels;
}
