/**
 * AI adapters entry point (extraction, explanation, guardrails).
 * OWNER: UX/API/AI agent (src/ai/**, src/api/**, src/ui/**, src/app/**, src/components/**, src/lib/**).
 *
 * PLANNER STUB — replace the bodies, keep the exported names and signatures
 * (contract v1: src/domain/ports.ts → AiModule). Synthetic mode must make zero
 * network calls. The Bedrock adapter must live in a *.server.ts file.
 */
import { NotImplementedError } from "@/domain";
import type { AiAdapters, AiModule } from "@/domain/ports";

export const createAiAdapters: AiModule["createAiAdapters"] = (): AiAdapters => {
  throw new NotImplementedError("ai.createAiAdapters");
};

export const validateExplanation: AiModule["validateExplanation"] = () => {
  throw new NotImplementedError("ai.validateExplanation");
};

export const buildExplanationInput: AiModule["buildExplanationInput"] = () => {
  throw new NotImplementedError("ai.buildExplanationInput");
};

export const aiModule = { createAiAdapters, validateExplanation, buildExplanationInput } satisfies AiModule;
