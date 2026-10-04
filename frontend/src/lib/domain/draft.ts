import { MAX_PROCEDURES, PROCEDURE_IDS, getFieldDefinition, isKnownFieldPath, procedureIdOf } from "./fields";
import type { DraftFact, EvidenceKind, FactCandidate, FieldValue, IntakeEvidence, IntakeProposal, ProcedureId } from "./types";

// Pure operations on the shared intake draft. PDF, voice, sample and manual
// input all pass through applyProposals/editFact, so every source obeys the
// same rules: proposals never confirm, edits are never silently overwritten,
// and disagreements become explicit conflicts.

export interface OverflowItem {
  label: string;
  evidenceId: string | null;
}

export interface IntakeDraft {
  revision: number;
  procedureIds: ProcedureId[];
  facts: Record<string, DraftFact>;
  evidence: Record<string, IntakeEvidence>;
  /** Care beyond the supported four events — explained, never silently dropped. */
  overflow: OverflowItem[];
}

export function emptyDraft(): IntakeDraft {
  return { revision: 0, procedureIds: [], facts: {}, evidence: {}, overflow: [] };
}

export type FactDisplayStatus = "missing" | "needsReview" | "conflict" | "confirmed";

export function factDisplayStatus(fact: DraftFact | undefined): FactDisplayStatus {
  if (!fact || fact.value === null || fact.value === "") return fact?.status === "conflict" ? "conflict" : "missing";
  if (fact.status === "conflict") return "conflict";
  if (fact.status === "confirmed") return "confirmed";
  return "needsReview";
}

function sameValue(a: FieldValue, b: FieldValue): boolean {
  if (typeof a === "string" && typeof b === "string") return normalizeText(a) === normalizeText(b);
  return a === b;
}

function normalizeText(value: string): string {
  return value.trim().replace(/[$,\s]/g, "").toLowerCase();
}

function sourceIdsOf(draft: IntakeDraft, evidenceIds: readonly string[]): Set<string> {
  return new Set(evidenceIds.map((id) => draft.evidence[id]?.sourceId).filter((id): id is string => Boolean(id)));
}

function withProcedure(draft: IntakeDraft, procedureId: ProcedureId): ProcedureId[] {
  if (draft.procedureIds.includes(procedureId)) return draft.procedureIds;
  return [...draft.procedureIds, procedureId].sort((a, b) => PROCEDURE_IDS.indexOf(a) - PROCEDURE_IDS.indexOf(b));
}

/**
 * Merges source-linked proposals into the draft.
 * - Unknown field paths are rejected loudly (programming error in an adapter).
 * - Untouched fields from the same source are refreshed.
 * - Fields a person edited, confirmed, or that came from a different source
 *   become conflicts showing both values instead of being replaced.
 */
export function applyProposals(
  draft: IntakeDraft,
  proposals: readonly IntakeProposal[],
  evidence: readonly IntakeEvidence[],
  overflow: readonly OverflowItem[] = [],
): IntakeDraft {
  const nextRevision = draft.revision + 1;
  const evidenceMap = { ...draft.evidence };
  for (const item of evidence) evidenceMap[item.id] = item;
  const next: IntakeDraft = { ...draft, revision: nextRevision, evidence: evidenceMap, facts: { ...draft.facts }, overflow: [...draft.overflow, ...overflow] };

  for (const proposal of proposals) {
    if (!isKnownFieldPath(proposal.fieldPath)) throw new Error(`Proposal targets unknown field ${proposal.fieldPath}`);
    const proposalEvidence = evidenceMap[proposal.evidenceId];
    if (!proposalEvidence) throw new Error(`Proposal for ${proposal.fieldPath} references missing evidence ${proposal.evidenceId}`);

    const procedureId = procedureIdOf(proposal.fieldPath);
    // Field paths exist only for p1–p4, so the four-procedure cap holds by construction.
    if (procedureId) next.procedureIds = withProcedure(next, procedureId);

    const existing = next.facts[proposal.fieldPath];
    const candidate: FactCandidate = { value: proposal.value, origin: proposalEvidence.kind, evidenceIds: [proposal.evidenceId] };

    if (!existing || (existing.value === null && existing.status !== "conflict")) {
      next.facts[proposal.fieldPath] = {
        fieldPath: proposal.fieldPath,
        value: proposal.value,
        origin: proposalEvidence.kind,
        evidenceIds: [proposal.evidenceId],
        status: "proposed",
        userEdited: false,
        editedAtRevision: nextRevision,
        confirmedAtRevision: null,
        candidates: [],
      };
      continue;
    }

    if (existing.status === "conflict") {
      const match = existing.candidates.find((c) => sameValue(c.value, proposal.value));
      next.facts[proposal.fieldPath] = {
        ...existing,
        candidates: match
          ? existing.candidates.map((c) => (c === match ? { ...c, evidenceIds: [...c.evidenceIds, proposal.evidenceId] } : c))
          : [...existing.candidates, candidate],
      };
      continue;
    }

    if (sameValue(existing.value, proposal.value)) {
      // Corroborating evidence; keep the person's value and status.
      next.facts[proposal.fieldPath] = { ...existing, evidenceIds: [...new Set([...existing.evidenceIds, proposal.evidenceId])] };
      continue;
    }

    const existingSources = sourceIdsOf(next, existing.evidenceIds);
    const refreshFromSameSource =
      !existing.userEdited && existing.status === "proposed" && existingSources.size === 1 && existingSources.has(proposalEvidence.sourceId);

    if (refreshFromSameSource) {
      next.facts[proposal.fieldPath] = { ...existing, value: proposal.value, evidenceIds: [proposal.evidenceId], editedAtRevision: nextRevision };
      continue;
    }

    next.facts[proposal.fieldPath] = {
      ...existing,
      status: "conflict",
      confirmedAtRevision: null,
      editedAtRevision: nextRevision,
      candidates: [{ value: existing.value, origin: existing.origin, evidenceIds: existing.evidenceIds }, candidate],
    };
  }
  return next;
}

/** A person typed a value. It replaces the field, clears confirmation and any conflict. */
export function editFact(draft: IntakeDraft, fieldPath: string, value: FieldValue): IntakeDraft {
  getFieldDefinition(fieldPath);
  const existing = draft.facts[fieldPath];
  if (existing && existing.status !== "conflict" && existing.userEdited && sameValue(existing.value, value) && typeof existing.value === typeof value) {
    return draft;
  }
  const nextRevision = draft.revision + 1;
  const procedureId = procedureIdOf(fieldPath);
  return {
    ...draft,
    revision: nextRevision,
    procedureIds: procedureId ? withProcedure(draft, procedureId) : draft.procedureIds,
    facts: {
      ...draft.facts,
      [fieldPath]: {
        fieldPath,
        value,
        origin: "manual",
        evidenceIds: existing?.evidenceIds ?? [],
        status: "proposed",
        userEdited: true,
        editedAtRevision: nextRevision,
        confirmedAtRevision: null,
        candidates: [],
      },
    },
  };
}

/** A person chose one of the conflicting values. Their choice counts as an edit. */
export function resolveConflict(draft: IntakeDraft, fieldPath: string, candidate: FactCandidate): IntakeDraft {
  const existing = draft.facts[fieldPath];
  if (!existing || existing.status !== "conflict") throw new Error(`No conflict to resolve at ${fieldPath}`);
  const nextRevision = draft.revision + 1;
  return {
    ...draft,
    revision: nextRevision,
    facts: {
      ...draft.facts,
      [fieldPath]: {
        ...existing,
        value: candidate.value,
        origin: candidate.origin,
        evidenceIds: candidate.evidenceIds,
        status: "proposed",
        userEdited: true,
        editedAtRevision: nextRevision,
        confirmedAtRevision: null,
        candidates: [],
      },
    },
  };
}

export function addProcedure(draft: IntakeDraft): IntakeDraft {
  const free = PROCEDURE_IDS.find((id) => !draft.procedureIds.includes(id));
  if (!free || draft.procedureIds.length >= MAX_PROCEDURES) return draft;
  return { ...draft, revision: draft.revision + 1, procedureIds: withProcedure(draft, free) };
}

export function removeProcedure(draft: IntakeDraft, procedureId: ProcedureId): IntakeDraft {
  const facts = Object.fromEntries(Object.entries(draft.facts).filter(([path]) => procedureIdOf(path) !== procedureId));
  return { ...draft, revision: draft.revision + 1, procedureIds: draft.procedureIds.filter((id) => id !== procedureId), facts };
}

/**
 * Removes a source (e.g. a replaced or removed PDF). Its evidence disappears;
 * values only it supplied are removed unless a person edited or confirmed them.
 */
export function removeSource(draft: IntakeDraft, sourceId: string): IntakeDraft {
  const removed = new Set(Object.values(draft.evidence).filter((e) => e.sourceId === sourceId).map((e) => e.id));
  if (removed.size === 0) return draft;
  const evidence = Object.fromEntries(Object.entries(draft.evidence).filter(([id]) => !removed.has(id)));
  const facts: Record<string, DraftFact> = {};
  for (const [path, fact] of Object.entries(draft.facts)) {
    const remainingEvidence = fact.evidenceIds.filter((id) => !removed.has(id));
    if (fact.status === "conflict") {
      const candidates = fact.candidates
        .map((c) => ({ ...c, evidenceIds: c.evidenceIds.filter((id) => !removed.has(id)) }))
        .filter((c) => c.evidenceIds.length > 0 || c.origin === "manual");
      if (candidates.length >= 2) facts[path] = { ...fact, candidates };
      else if (candidates.length === 1) {
        const [only] = candidates;
        facts[path] = { ...fact, value: only.value, origin: only.origin, evidenceIds: only.evidenceIds, status: "proposed", candidates: [] };
      }
      continue;
    }
    const onlyFromRemoved = fact.evidenceIds.length > 0 && remainingEvidence.length === 0;
    if (onlyFromRemoved && !fact.userEdited && fact.status !== "confirmed") continue;
    facts[path] = { ...fact, evidenceIds: remainingEvidence };
  }
  const overflow = draft.overflow.filter((item) => !item.evidenceId || !removed.has(item.evidenceId));
  return { ...draft, revision: draft.revision + 1, evidence, facts, overflow };
}

/** Marks the given leaves confirmed at the draft's current revision. */
export function markConfirmed(draft: IntakeDraft, fieldPaths: readonly string[]): IntakeDraft {
  const facts = { ...draft.facts };
  for (const path of fieldPaths) {
    const fact = facts[path];
    if (!fact || fact.status === "conflict" || fact.value === null) continue;
    facts[path] = { ...fact, status: "confirmed", confirmedAtRevision: draft.revision };
  }
  return { ...draft, facts };
}

export function evidenceKindsOf(draft: IntakeDraft): EvidenceKind[] {
  const kinds = new Set<EvidenceKind>(Object.values(draft.evidence).map((e) => e.kind));
  if (Object.values(draft.facts).some((f) => f.origin === "manual")) kinds.add("manual");
  return [...kinds];
}

export function factValue(draft: IntakeDraft, fieldPath: string): FieldValue {
  return draft.facts[fieldPath]?.value ?? null;
}
