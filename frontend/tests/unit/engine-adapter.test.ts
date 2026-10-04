import { afterEach, describe, expect, it, vi } from "vitest";

import { engine, unwrapEnvelope } from "@/lib/adapters/live/engine";

const meta = { request_id: "r1", generated_by: "engine", synthetic_data: true };

function respond(status: number, body: unknown) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

describe("engine adapter", () => {
  it("unwraps the success envelope to data", async () => {
    const fetchMock = respond(200, { contract_version: "1.2.0", ok: true, data: { scenario_id: "demo" }, meta });
    const result = await engine.scenario();
    expect(result).toEqual({ ok: true, value: { scenario_id: "demo" }, metadata: { contract_version: "1.2.0", ...meta } });
    expect(fetchMock).toHaveBeenCalledWith("/api/engine/scenario", expect.objectContaining({ method: "GET" }));
  });

  it("surfaces the engine error message and first issue field", async () => {
    respond(400, {
      contract_version: "1.2.0",
      ok: false,
      error: { code: "INVALID_REQUEST", message: "The request does not match the expected shape.", retryable: false, issues: [{ code: "SCHEMA_INVALID", field: "as_of" }] },
      meta,
    });
    const result = await engine.passport({} as never);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toBe("The request does not match the expected shape.");
      expect(result.error.fieldPath).toBe("as_of");
      expect(result.error.retryable).toBe(false);
    }
  });

  it("rejects a 200 body that isn't an ok envelope", () => {
    expect(unwrapEnvelope({ ok: false }).ok).toBe(false);
    expect(unwrapEnvelope({ data: {} }).ok).toBe(false);
  });

  it("checks engine health through the same-origin proxy and preserves synthetic identity", async () => {
    const health = { contract_version: "1.8.0", ai_mode: "template", registry_version: "demo", plan_version_ids: ["demo-2026"] };
    const fetchMock = respond(200, { contract_version: "1.8.0", ok: true, data: health, meta });
    expect(await engine.health()).toEqual({ ok: true, value: health, metadata: { contract_version: "1.8.0", ...meta } });
    expect(fetchMock).toHaveBeenCalledWith("/api/engine/health", expect.objectContaining({ method: "GET" }));
  });
});
