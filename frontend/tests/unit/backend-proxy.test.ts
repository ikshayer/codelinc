import { afterEach, describe, expect, it, vi } from "vitest";
import { backendUrl, proxyBackend } from "@/lib/server/backend";

afterEach(() => vi.unstubAllGlobals());

describe("backend proxy", () => {
  it.each(["http://127.0.0.1:3001", "http://127.0.0.1:3001/", " http://127.0.0.1:3001/// "])("normalizes base %s", (base) => {
    expect(backendUrl("/api/demo/members", base)).toBe("http://127.0.0.1:3001/api/demo/members");
  });

  it("does not accept a network-relative target", () => {
    expect(() => backendUrl("//other-host/path")).toThrow();
  });

  it("turns unreadable upstream JSON into an unavailable response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("upstream HTML", { status: 200 })));
    const response = await proxyBackend("/api/demo", {}, "http://backend/");
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: { code: "UNAVAILABLE" } });
  });

  it("normalizes a connection failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("connection failed")));
    const response = await proxyBackend("/api/demo", {}, "http://backend/");
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: { code: "UNAVAILABLE", retryable: true } });
  });
});
