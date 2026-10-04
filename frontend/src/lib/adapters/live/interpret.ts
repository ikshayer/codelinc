import { proposalsFromExtraction } from "@/lib/domain/proposals";
import type { InterpretRequest, InterpretResponse } from "@/lib/domain/types";
import { adapterError, requestJson } from "../shared";
import type { AdapterResult, InterpretAdapter, IntakeExtraction, RequestScope } from "../types";

// POST /api/interpret — the existing architecture contract. The response is
// accepted only for the same requestId and draftRevision.

export const liveInterpretAdapter: InterpretAdapter = {
  mode: "live",
  async interpret(text: string, scope: RequestScope): Promise<AdapterResult<IntakeExtraction>> {
    const body: InterpretRequest = { requestId: scope.requestId, draftRevision: scope.revision, text, syntheticDataAcknowledged: true };
    const result = await requestJson<InterpretResponse>("/api/interpret", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: scope.signal,
      timeoutMs: 10000,
    });
    if (!result.ok) {
      if (result.error.code === "NOT_FOUND") return { ok: false, error: adapterError("UNAVAILABLE", "AI interpretation isn't connected. Enter the values yourself.") };
      return result;
    }
    if (result.value.requestId !== scope.requestId || result.value.draftRevision !== scope.revision) {
      return { ok: false, error: adapterError("CONFLICT", "That reply was for an earlier message and was ignored.", true) };
    }
    const mapped = proposalsFromExtraction(result.value.extraction, {
      kind: "voice",
      sourceId: `typed:${scope.requestId}`,
      sourceLabel: "Typed message",
      turnId: scope.requestId,
      receivedAt: new Date().toISOString(),
    });
    return { ok: true, value: { ...mapped, missingFieldPaths: [] } };
  },
};
