/** Deterministic Visit Navigator and exact-enumeration Care Plan Optimizer. */
import type { BenefitEngine, CarePlanOptimizer, OptimizerModule, VisitNavigator } from "@/domain/ports";
import { makeCarePlanOptimizer } from "./care-plan";
import { makeVisitNavigator } from "./navigator";

export function createVisitNavigator(benefits: BenefitEngine): VisitNavigator {
  return makeVisitNavigator(benefits);
}

export function createCarePlanOptimizer(benefits: BenefitEngine): CarePlanOptimizer {
  return makeCarePlanOptimizer(benefits);
}

export const optimizerModule = { createVisitNavigator, createCarePlanOptimizer } satisfies OptimizerModule;
