/**
 * Plan & Benefits module entry point.
 * OWNER: Plan & Benefits agent (src/benefits/**, data/** except data/sources/**, tests/benefits/**).
 *
 * PLANNER STUB — replace the bodies, keep the exported names and signatures
 * (contract v1: src/domain/ports.ts → BenefitsModule). Until implemented, every
 * call throws NotImplementedError so acceptance tests fail loudly, never silently.
 */
import { ENGINE_IDS, NotImplementedError } from "@/domain";
import type { PlanRegistry } from "@/domain";
import type { BenefitEngine, BenefitsModule } from "@/domain/ports";

const todo = (name: string) => (): never => {
  throw new NotImplementedError(`benefits.${name}`);
};

export const benefitEngine: BenefitEngine = {
  engine_id: ENGINE_IDS.benefits,
  supportsPlanType: todo("supportsPlanType"),
  validatePlan: todo("validatePlan"),
  resolvePlanVersion: todo("resolvePlanVersion"),
  openLedger: todo("openLedger"),
  simulate: todo("simulate"),
  passport: todo("passport"),
  evidenceFor: todo("evidenceFor"),
};

export function loadRegistry(): PlanRegistry {
  throw new NotImplementedError("benefits.loadRegistry");
}

export const benefitsModule = { benefitEngine, loadRegistry } satisfies BenefitsModule;
