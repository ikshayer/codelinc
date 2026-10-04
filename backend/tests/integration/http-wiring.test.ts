import { once } from "node:events";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createMongoServer } from "../../src/api/mongo-http.js";
import { proxyBackend } from "../../../frontend/src/lib/server/backend.js";
import { originalScenario } from "../analysis/helpers";

describe("frontend proxy to backend HTTP boundary", () => {
  let server: Server;
  let base: string;
  const members = { synthetic_demo: true, members: [{ member_id: "SYN-MEMBER-0001", display_name: "Synthetic test member" }] };

  beforeAll(async () => {
    server = createMongoServer({ readDemo: async (path) => {
      if (path === "/api/demo/health") throw new Error("Simulated database connection failure");
      return { status: 200, body: members };
    }, lookupMember: async (identity) => {
      if (identity.dateOfBirth === "1990-01-01") throw new Error("Private database connection failure");
      if (!("displayName" in identity) || identity.displayName.toLowerCase() !== "parker patel" || identity.dateOfBirth !== "1974-08-19") return { status: 200, body: { matched: false } };
      return { status: 200, body: { synthetic_demo: true, member: { member_id: "SYN-MEMBER-0021", display_name: "Parker Patel", date_of_birth: "1974-08-19" }, procedure_card: null } };
    } });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
      server.closeAllConnections();
    });
  });

  it("forwards member data through the actual proxy helper with a trailing-slash base", async () => {
    const response = await proxyBackend("/api/demo/members", {}, `${base}/`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(members);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("also treats repeated leading slashes as a path at the backend", async () => {
    const response = await fetch(`${base}//api/demo/members`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(members);
  });

  it("rejects an incomplete calculation scenario", async () => {
    const response = await proxyBackend("/api/calculate", { method: "POST", body: JSON.stringify({ requestId: "test", analysisId: "test-analysis", revision: 0, scenario: {} }) }, `${base}/`);
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ error: { code: "INVALID", retryable: false } });
  });

  it("prices the original confirmed sample through the HTTP proxy", async () => {
    const response=await proxyBackend("/api/calculate",{method:"POST",body:JSON.stringify({requestId:"test",analysisId:"original",revision:0,scenario:originalScenario()})},`${base}/`);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({baseline:{totalPatientCents:150000},best:{totalPatientCents:85500},patientReductionCents:64500,planning:{syntheticData:true}});
  });

  it("looks up the required name and DOB through the same HTTP proxy without fabricating treatment", async () => {
    const response = await proxyBackend("/api/demo/member-lookup", { method: "POST", body: JSON.stringify({ displayName: "Parker Patel", dateOfBirth: "1974-08-19" }) }, base);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ member: { member_id: "SYN-MEMBER-0021" }, procedure_card: null });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("gives the same generic no-match response for wrong DOB and unknown name", async () => {
    const responses = await Promise.all([{ displayName: "Parker Patel", dateOfBirth: "1974-08-18" }, { displayName: "Unknown Member", dateOfBirth: "1974-08-19" }].map(async (body) => {
      const response = await proxyBackend("/api/demo/member-lookup", { method: "POST", body: JSON.stringify(body) }, base);
      return { status: response.status, body: await response.json() };
    }));
    expect(responses[0]).toEqual({ status: 200, body: { matched: false } }); expect(responses[1]).toEqual(responses[0]);
  });

  it("rejects invalid lookup dates and unknown identity properties and separates a database failure from invalid JSON", async () => {
    for (const body of [{ displayName: "Parker Patel", dateOfBirth: "1974-02-30" }, { displayName: "Parker Patel", dateOfBirth: "1974-08-19", editedBalance: 0 }]) {
      const response = await proxyBackend("/api/demo/member-lookup", { method: "POST", body: JSON.stringify(body) }, base);
      expect(response.status).toBe(422);
    }
    const failed = await proxyBackend("/api/demo/member-lookup", { method: "POST", body: JSON.stringify({ displayName: "Parker Patel", dateOfBirth: "1990-01-01" }) }, base);
    expect(failed.status).toBe(503);
    expect(await failed.json()).toMatchObject({ error: { code: "UNAVAILABLE", retryable: true } });
  });

  it("preserves a validation error rather than turning it into method-not-allowed", async () => {
    const response = await proxyBackend("/api/calculate", { method: "POST", body: "{}" }, `${base}/`);
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ error: { code: "INVALID", fieldPath: "requestId" } });
  });

  it("rejects malformed JSON", async () => {
    const response = await fetch(`${base}/api/calculate`, { method: "POST", body: "not JSON" });
    expect(response.status).toBe(422);
  });

  it.each([null, "invalid", []])("rejects a non-object scenario: %j", async (scenario) => {
    const response = await fetch(`${base}/api/calculate`, { method: "POST", body: JSON.stringify({ requestId: "test", analysisId: "test-analysis", revision: 0, scenario }) });
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ error: { fieldPath: "scenario" } });
  });

  it("returns a distinct payload-too-large response", async () => {
    const response = await fetch(`${base}/api/calculate`, { method: "POST", body: JSON.stringify({ data: "x".repeat(1_000_001) }) });
    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({ error: { code: "TOO_LARGE" } });
  });

  it("reports the allowed calculation method", async () => {
    const response = await fetch(`${base}/api/calculate`);
    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("POST");
  });

  it("preserves a database-unavailable response", async () => {
    const response = await proxyBackend("/api/demo/health", {}, base);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "Backend data service is unavailable." });
  });

  it("returns an unknown-route 404 without loading the database", async () => {
    const noDatabase = createMongoServer({ readDemo: async () => { throw new Error("Should not be called"); } });
    noDatabase.listen(0, "127.0.0.1");
    await once(noDatabase, "listening");
    try {
      const response = await fetch(`http://127.0.0.1:${(noDatabase.address() as AddressInfo).port}/api/unknown`);
      expect(response.status).toBe(404);
    } finally {
      await new Promise<void>((resolve) => { noDatabase.close(() => resolve()); noDatabase.closeAllConnections(); });
    }
  });
});
