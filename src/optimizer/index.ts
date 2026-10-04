/**
 * Optimizer module entry point (Visit Navigator + Care Plan Optimizer).
 * OWNER: Optimizer agent (src/optimizer/**, tests/optimizer/**).
 *
 * PLANNER STUB — replace the bodies, keep the exported names and signatures
 * (contract v1: src/domain/ports.ts → OptimizerModule). Every dollar comes from the
 * injected BenefitEngine. Until implemented, every call throws NotImplementedError
 * so acceptance tests fail loudly, never silently.
 */
import { ENGINE_IDS, NotImplementedError } from "@/domain";
import type { BenefitEngine, CarePlanOptimizer, OptimizerModule, VisitNavigator } from "@/domain/ports";

export function createVisitNavigator(benefits: BenefitEngine): VisitNavigator {
  void benefits;
  return {
    engine_id: ENGINE_IDS.optimizer,
    navigate: () => {
      throw new NotImplementedError("optimizer.visitNavigator.navigate");
    },
  };
}

export function createCarePlanOptimizer(benefits: BenefitEngine): CarePlanOptimizer {
  void benefits;
  return {
    engine_id: ENGINE_IDS.optimizer,
    optimize: () => {
      throw new NotImplementedError("optimizer.carePlan.optimize");
    },
  };
}

export const optimizerModule = { createVisitNavigator, createCarePlanOptimizer } satisfies OptimizerModule;
