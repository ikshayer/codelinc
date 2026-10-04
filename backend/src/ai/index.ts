/** Optional AI adapter boundary. Implement only when intake/explanation is enabled. */
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
