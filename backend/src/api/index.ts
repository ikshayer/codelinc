/**
 * Framework-agnostic API handlers. src/app/api/<route>/route.ts files are thin Next.js wrappers.
 * OWNER: UX/API/AI agent.
 *
 * PLANNER STUB — replace the bodies, keep the exported names and signatures
 * (contract v1: src/domain/ports.ts → ApiModule; envelopes in src/domain/api.ts).
 */
import { NotImplementedError } from "@/domain";
import type { DemoScenario } from "@/domain";
import type { ApiDeps, ApiHandlers, ApiModule } from "@/domain/ports";
export { readMongoDemo } from "./mongo-demo";

export function createApiHandlers(deps?: Partial<ApiDeps>): ApiHandlers {
  void deps;
  throw new NotImplementedError("api.createApiHandlers");
}

export function loadDemoScenario(): DemoScenario {
  throw new NotImplementedError("api.loadDemoScenario");
}

export const apiModule = { createApiHandlers, loadDemoScenario } satisfies ApiModule;
