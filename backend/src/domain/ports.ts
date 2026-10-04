/**
 * Module ports — the public surface each implementation agent must export.
 * FROZEN (contract v1). Acceptance tests import ONLY these entry points:
 *
 *   src/benefits/index.ts   → BenefitsModule   (Plan & Benefits agent)
 *   src/optimizer/index.ts  → OptimizerModule  (Optimizer agent)
 *   src/ai/index.ts         → AiModule         (UX/API/AI agent)
 *   src/api/index.ts        → ApiModule        (UX/API/AI agent)
 *
 * Each entry file must export `<name>Module = {...} satisfies <Port>` (benefitsModule, optimizerModule, aiModule, apiModule)
 * plus the named exports below. Internals are free; these signatures are not.
 */
import type {
  AiMode,
  Explanation,
  ExplanationInput,
  ExplanationValidation,
  ExtractionRequest,
  ExtractionResult,
} from "./ai";
import type { ApiRouteId, DemoScenario } from "./api";
import type {
  BenefitLedger,
  BenefitPassport,
  PlanResolution,
  PlanValidationReport,
  SimulationRequest,
  SimulationResult,
} from "./benefits";
import type { Issue } from "./issues";
import type { MemberState } from "./member";
import type {
  CarePlanRequest,
  CarePlanResult,
  EvidenceIndexEntry,
  VisitNavigatorRequest,
  VisitNavigatorResult,
} from "./optimizer";
import type { PlanDefinition, PlanKey, PlanRegistry, PlanType } from "./plan";
import type { IsoDate, IsoDateTime, Scenario } from "./primitives";
import type { ProcedureRecommendation } from "./procedure";

// ---------------------------------------------------------------------------
// Benefits (src/benefits/index.ts)
// ---------------------------------------------------------------------------

export interface BenefitEngine {
  readonly engine_id: string;
  /** Only "DPPO" returns true in v1. */
  supportsPlanType(planType: PlanType): boolean;
  /** Structural + evidence + checksum validation of one plan version. Pure. */
  validatePlan(registry: PlanRegistry, plan: PlanDefinition): PlanValidationReport;
  /** Exact identity + service date → one plan version, or issues. Never borrows from similar plans. */
  resolvePlanVersion(registry: PlanRegistry, key: PlanKey, serviceDate: IsoDate): PlanResolution;
  /** Initial ledger from the member snapshot for every period that has a snapshot. */
  openLedger(
    registry: PlanRegistry,
    member: MemberState,
    asOf: IsoDateTime,
    scenario: Scenario,
  ): { ledger: BenefitLedger; issues: Issue[] };
  /** Chronological adjudication of events. Pure and deterministic. */
  simulate(registry: PlanRegistry, request: SimulationRequest): SimulationResult;
  /** Benefit Passport for the member's current period (demo step 1). */
  passport(registry: PlanRegistry, member: MemberState, asOf: IsoDateTime): BenefitPassport;
  /** Evidence for already-selected rule ids (never searches across plans). */
  evidenceFor(registry: PlanRegistry, ruleIds: readonly string[]): EvidenceIndexEntry[];
}

export interface BenefitsModule {
  benefitEngine: BenefitEngine;
  /** Loads data/plans/** + data/sources/manifest.json via static imports. Synchronous, no I/O at call time. */
  loadRegistry(): PlanRegistry;
}

// ---------------------------------------------------------------------------
// Optimizer (src/optimizer/index.ts) — consumes BenefitEngine, never re-implements adjudication
// ---------------------------------------------------------------------------

export interface VisitNavigator {
  readonly engine_id: string;
  navigate(registry: PlanRegistry, request: VisitNavigatorRequest): VisitNavigatorResult;
}

export interface CarePlanOptimizer {
  readonly engine_id: string;
  optimize(registry: PlanRegistry, request: CarePlanRequest): CarePlanResult;
}

export interface OptimizerModule {
  /** Factories take the benefit engine so tests can inject it; production passes benefits.benefitEngine. */
  createVisitNavigator(benefits: BenefitEngine): VisitNavigator;
  createCarePlanOptimizer(benefits: BenefitEngine): CarePlanOptimizer;
}

// ---------------------------------------------------------------------------
// AI (src/ai/index.ts)
// ---------------------------------------------------------------------------

export interface ProcedureExtractor {
  readonly mode: AiMode;
  /** Returns UNVERIFIED procedures only. Must not throw on hostile input. */
  extract(request: ExtractionRequest): Promise<ExtractionResult>;
}

export interface Explainer {
  readonly mode: "template" | "live";
  explain(input: ExplanationInput): Promise<Explanation>;
}

export interface AiAdapters {
  readonly mode: AiMode;
  extractor: ProcedureExtractor;
  /** live (Bedrock) when enabled, else the template explainer. */
  explainer: Explainer;
  /** Deterministic, offline; always passes validateExplanation for valid input. */
  templateExplainer: Explainer;
}

export interface AiModule {
  /** mode defaults to env AI_MODE, else "synthetic". Synthetic mode makes zero network calls. */
  createAiAdapters(options?: { mode?: AiMode }): AiAdapters;
  /** Spec §9 rejection rules. Pure. `explanation` is unknown so schema failures are reported, not thrown. */
  validateExplanation(explanation: unknown, input: ExplanationInput): ExplanationValidation;
  /** Assemble the only data the explainer may see. */
  buildExplanationInput(args: {
    registry: PlanRegistry;
    benefits: BenefitEngine;
    result: { kind: "care_plan"; value: CarePlanResult } | { kind: "visit_navigator"; value: VisitNavigatorResult };
    procedures: readonly ProcedureRecommendation[];
    focusId: string | null;
  }): ExplanationInput;
}

// ---------------------------------------------------------------------------
// API (src/api/index.ts) — framework-agnostic; src/app/api/<route>/route.ts files are thin wrappers
// ---------------------------------------------------------------------------

export interface ApiRequestLike {
  method: "GET" | "POST";
  /** Parsed JSON body (POST) or undefined (GET). Raw size is checked by the route wrapper. */
  body: unknown;
  /** Lower-cased header names. */
  headers: Record<string, string>;
}

export interface ApiResponseLike {
  status: number;
  /** An okEnvelope(...) or ErrorEnvelope from domain/api.ts. */
  body: unknown;
}

export type ApiHandler = (request: ApiRequestLike) => Promise<ApiResponseLike>;
export type ApiHandlers = Record<ApiRouteId, ApiHandler>;

export interface ApiDeps {
  registry: PlanRegistry;
  benefits: BenefitEngine;
  visitNavigator: VisitNavigator;
  carePlanOptimizer: CarePlanOptimizer;
  ai: AiAdapters;
  scenario: DemoScenario;
}

export interface ApiModule {
  /** Any dep not supplied is built from the production modules in synthetic mode. */
  createApiHandlers(deps?: Partial<ApiDeps>): ApiHandlers;
  /** The synthetic demo scenario assembled from fixtures/synthetic/**. */
  loadDemoScenario(): DemoScenario;
}
