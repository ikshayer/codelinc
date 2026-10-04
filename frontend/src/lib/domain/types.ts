// Domain types reused verbatim from CAREWINDOW_ARCHITECTURE.md (§6, §9, §10).
// The financial engine and solver own these semantics; the frontend only
// renders records it is given. Intake/evidence types below them are the
// frontend's additions from FRONTEND_DESIGN.md §16.

export type Cents = number;
export type BasisPoints = number;
export type ISODate = string;
export type ProcedureId = string;
export type BenefitYearId = "y1" | "y2";
export type CoverageCategory = "preventive" | "basic" | "major";

export interface FactSource {
  kind: "userEntry" | "userReportedDentist" | "syntheticFixture" | "aiProposal";
  label: string;
  quote: string | null;
}

export interface ConfirmedFact<T> {
  fieldPath: string;
  value: T;
  source: FactSource;
  confirmedAtRevision: number;
}

export interface CoverageRule {
  category: CoverageCategory;
  insurerBasisPoints: BasisPoints;
  deductibleApplies: boolean;
  annualMaximumApplies: boolean;
}

export interface UtilizationState {
  priorInsurerPaymentsCents: Cents;
  priorDeductibleSatisfiedCents: Cents;
  pendingClaims: "none";
}

export interface BenefitYear {
  id: BenefitYearId;
  label: string;
  startsOn: ISODate;
  endsOn: ISODate;
  annualMaximumCents: Cents;
  deductibleCents: Cents;
  utilization: UtilizationState;
  rules: Record<CoverageCategory, CoverageRule>;
  ruleStatus: "suppliedConfirmed" | "assumedUnchangedConfirmed";
}

export interface Plan {
  id: "demo-ppo";
  type: "simplePPO";
  currency: "USD";
  network: "inNetwork";
  secondaryCoverage: false;
  rollover: false;
  years: [BenefitYear, BenefitYear];
}

export interface TreatmentWindow {
  benefitYearId: BenefitYearId;
  earliestDate: ISODate;
  latestDate: ISODate;
  source: FactSource;
}

export interface TreatmentDependency {
  beforeProcedureId: ProcedureId;
  afterProcedureId: ProcedureId;
  minGapDays: number;
  source: FactSource;
}

export interface Procedure {
  id: ProcedureId;
  label: string;
  category: CoverageCategory;
  contractedFeeCents: Cents;
  eligibilityConfirmed: true;
  anchorDate: ISODate;
  timingPermission: "dentistApproved" | "unknown";
  windows: TreatmentWindow[];
  deadline: ISODate | null;
}

export interface ConfirmedScenario {
  revision: number;
  plan: Plan;
  procedures: Procedure[];
  dependencies: TreatmentDependency[];
  facts: ConfirmedFact<unknown>[];
}

export type ValidatedScenario = ConfirmedScenario & { readonly __validated: true };

export interface ScheduleAssignment {
  procedureId: ProcedureId;
  benefitYearId: BenefitYearId;
  serviceDate: ISODate;
}

export interface Schedule {
  id: string;
  kind: "baseline" | "candidate";
  assignments: ScheduleAssignment[];
}

export interface DeductibleState {
  totalCents: Cents;
  satisfiedBeforeCents: Cents;
  remainingCents: Cents;
  appliedInScheduleCents: Cents;
}

export interface AnnualMaximumState {
  totalCents: Cents;
  usedBeforeCents: Cents;
  remainingCents: Cents;
  consumedInScheduleCents: Cents;
}

export interface ProcedureCalculation {
  procedureId: ProcedureId;
  benefitYearId: BenefitYearId;
  serviceDate: ISODate;
  processingIndex: number;
  feeCents: Cents;
  insurerBasisPoints: BasisPoints;
  deductibleApplies: boolean;
  annualMaximumApplies: boolean;
  deductibleBeforeCents: Cents;
  deductibleAppliedCents: Cents;
  deductibleAfterCents: Cents;
  eligibleAfterDeductibleCents: Cents;
  potentialInsurerCents: Cents;
  maximumBeforeCents: Cents;
  maximumConsumedCents: Cents;
  maximumAfterCents: Cents;
  insurerCents: Cents;
  patientCents: Cents;
  patientCoinsuranceCents: Cents;
  patientDueToMaximumCents: Cents;
  ruleFieldPaths: string[];
}

export interface BenefitYearLedger {
  benefitYearId: BenefitYearId;
  deductible: DeductibleState;
  maximum: AnnualMaximumState;
  procedures: ProcedureCalculation[];
  totalFeeCents: Cents;
  totalInsurerCents: Cents;
  totalPatientCents: Cents;
}

export interface CalculationRecord {
  id: string;
  engineVersion: "cw-1";
  inputRevision: number;
  schedule: Schedule;
  ledgers: [BenefitYearLedger, BenefitYearLedger];
  totalFeeCents: Cents;
  totalInsurerCents: Cents;
  totalPatientCents: Cents;
  assumptionFieldPaths: string[];
}

export interface CandidateRejection {
  assignmentKey: string;
  issueCodes: string[];
  procedureIds: ProcedureId[];
}

export interface ScenarioComparison {
  inputRevision: number;
  baseline: CalculationRecord;
  best: CalculationRecord;
  cheaperAlternative: CalculationRecord | null;
  patientReductionCents: Cents;
  feasibleRecords: CalculationRecord[];
  rejectedCandidates: CandidateRejection[];
  status: "cheaperPermittedAlternative" | "baselineBest" | "equalCost";
}

export interface ValidationIssue {
  code: string;
  fieldPath: string;
  message: string;
  severity: "blocking" | "notice";
}

export interface UnsupportedConfiguration {
  code:
    | "PLAN_TYPE"
    | "SECONDARY"
    | "FAMILY_DEDUCTIBLE"
    | "ROLLOVER"
    | "ORTHODONTIC_LIMIT"
    | "OUT_OF_NETWORK"
    | "EXTRA_EVENTS"
    | "PENDING_CLAIMS"
    | "OTHER_POLICY_RULE";
  fieldPath: string;
  message: string;
}

export type ValidationResult =
  | { ok: true; scenario: ValidatedScenario; notices: ValidationIssue[] }
  | { ok: false; issues: ValidationIssue[]; unsupported: UnsupportedConfiguration[] };

export interface ProposedFact {
  targetKind: "plan" | "category" | "procedure";
  field:
    | "annualMaximum"
    | "alreadyUsed"
    | "deductible"
    | "deductibleSatisfied"
    | "benefitYearStart"
    | "benefitYearEnd"
    | "insurerPercent"
    | "deductibleApplies"
    | "maximumApplies"
    | "fee"
    | "category"
    | "label";
  year: "current" | "next" | null;
  category: CoverageCategory | null;
  procedureIndex: number | null;
  rawValue: string;
  unit: "USD" | "PERCENT" | "BOOLEAN" | "DATE" | "TEXT";
  sourceQuote: string;
}

export interface ExtractionResult {
  proposedFacts: ProposedFact[];
  ambiguities: { code: string; question: string; sourceQuote: string }[];
  missingFields: string[];
}

export interface InterpretRequest {
  requestId: string;
  draftRevision: number;
  text: string;
  syntheticDataAcknowledged: true;
}

export interface InterpretResponse {
  requestId: string;
  draftRevision: number;
  mode: "bedrock";
  extraction: ExtractionResult;
}

// ---------------------------------------------------------------------------
// Frontend intake layer (FRONTEND_DESIGN.md §16). Evidence lives here; only
// confirmed values are mapped into ConfirmedScenario provenance.
// ---------------------------------------------------------------------------

export type EvidenceKind = "manual" | "pdf" | "voice" | "sample";

export interface IntakeEvidence {
  id: string;
  kind: EvidenceKind;
  /** Report ID, voice session ID, "manual" or the sample fixture name. */
  sourceId: string;
  /** Human-readable source, e.g. a filename or "Sample treatment". */
  sourceLabel: string;
  pageNumber?: number;
  turnId?: string;
  literalQuote?: string;
  receivedAt: string;
}

/** null means unknown. Unknown is never treated as zero. */
export type FieldValue = string | boolean | null;

export interface FactCandidate {
  value: FieldValue;
  origin: EvidenceKind;
  evidenceIds: string[];
}

export type DraftFactStatus = "proposed" | "conflict" | "confirmed";

export interface DraftFact {
  fieldPath: string;
  value: FieldValue;
  origin: EvidenceKind;
  evidenceIds: string[];
  status: DraftFactStatus;
  /** A person typed or chose this value; new extraction never overwrites it. */
  userEdited: boolean;
  editedAtRevision: number;
  confirmedAtRevision: number | null;
  /** Competing values when status is "conflict"; the current value is included. */
  candidates: FactCandidate[];
}

/** A source-linked value proposed by PDF, voice, typed or sample intake. */
export interface IntakeProposal {
  fieldPath: string;
  value: FieldValue;
  evidenceId: string;
}

export interface PatientDetails {
  displayName: string;
  fullName?: string;
  /** ISO date; optional for the benefits demo and never sent to calculation. */
  dateOfBirth?: string;
  /** Optional guest contact. Separate from any Google account email. */
  contactEmail?: string;
}

export interface PatientProfile extends PatientDetails {
  id: string;
  accountEmail?: string;
}

export type ServiceMode = "demo" | "live";

export type CalculationSourceMode = "fixturePreview" | "live";

export interface AnalysisSnapshot {
  id: string;
  analysisId: string;
  version: number;
  title: string;
  patientDisplayName: string;
  createdAt: string;
  confirmedAt: string;
  savedAt: string;
  engineVersion: CalculationRecord["engineVersion"];
  sourceMode: CalculationSourceMode;
  /** Named fixture when sourceMode is fixturePreview. */
  fixtureName: string | null;
  scenario: ConfirmedScenario;
  comparison: ScenarioComparison;
  evidence: IntakeEvidence[];
  inputKinds: EvidenceKind[];
  /** Procedure labels by ID at confirmation time. */
  procedureLabels: Record<ProcedureId, string>;
}
