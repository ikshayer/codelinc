/**
 * DEFECT (P2, dental-uxapi, src/api/server.ts:27): the cross-origin check compares the Origin host
 * with a client-supplied X-Forwarded-Host, so any caller can satisfy it. CONTRACT §7 compares with Host.
 * Also checks: oversized body → 413, error bodies never echo submitted values, log lines carry no body.
 */
import { spawn, type ChildProcess } from "node:child_process";
import http from "node:http";
import { createRequire } from "node:module";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const ROOT = path.resolve(import.meta.dirname, "../..");
const PORT = 4000 + Math.floor(Math.random() * 1000) + 600;
let server: ChildProcess;
let logs = "";

function post(pathname: string, body: string, headers: Record<string, string>) {
  return new Promise<{ status: number; body: string }>((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port: PORT, path: pathname, method: "POST", headers: { "content-type": "application/json", ...headers } }, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => resolve({ status: res.statusCode!, body: data }));
    });
    req.on("error", reject);
    req.end(body);
  });
}

beforeAll(async () => {
  // Run tsx's CLI with this Node binary: `spawn("npx", …)` has no shell and cannot start npx.cmd on Windows.
  const tsxCli = createRequire(import.meta.url).resolve("tsx/cli");
  server = spawn(process.execPath, [tsxCli, "src/api/server.ts"], { cwd: ROOT, env: { ...process.env, PORT: String(PORT), ALLOWED_ORIGINS: "" } });
  server.stdout!.on("data", (c) => (logs += c));
  server.stderr!.on("data", (c) => (logs += c));
  for (let i = 0; i < 100 && !logs.includes("CareWindow API"); i++) await new Promise((r) => setTimeout(r, 100));
}, 20_000);
afterAll(() => void server?.kill());

describe("API server wrapper", () => {
  it("rejects a foreign Origin even when X-Forwarded-Host is spoofed", async () => {
    const r = await post("/api/passport", '{"as_of":"x"}', { origin: "https://evil.example", "x-forwarded-host": "evil.example" });
    expect(r.status).toBe(400);
    expect(r.body).toContain("cross-origin request");
  });

  it("rejects bodies over the byte limit with 413", async () => {
    const r = await post("/api/passport", JSON.stringify({ pad: "a".repeat(300_000) }), {});
    expect(r.status).toBe(413);
  });

  it("never echoes submitted values or logs bodies", async () => {
    const secret = "member-SECRET-4242";
    const r = await post("/api/passport", JSON.stringify({ as_of: secret, member: { member_id: secret } }), {});
    expect(r.status).toBe(400);
    expect(r.body).not.toContain(secret);
    expect(logs).not.toContain(secret);
  });
});
