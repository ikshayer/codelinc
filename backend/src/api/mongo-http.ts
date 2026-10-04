import { createServer } from "node:http";
import { getDatabase } from "../db/client.js";
import { lookupMongoMember, readMongoDemo } from "./mongo-demo.js";
import { BodyTooLargeError, calculateRequestWithMember, readJsonBody, type MemberLookupReader } from "./calculate.js";
import { MemberLookupIdentity } from "../analysis/member-identity.js";

type DemoReply = Awaited<ReturnType<typeof readMongoDemo>>;
type Dependencies = { readDemo?: (path: string) => Promise<DemoReply>; lookupMember?: (identity: import("../analysis/member-identity.js").MemberLookupIdentity) => ReturnType<MemberLookupReader> };

/** HTTP boundary. Injecting the data reader allows tests without an Atlas connection. */
export function createMongoServer({ readDemo = (path) => readMongoDemo(getDatabase(), path), lookupMember = (identity) => lookupMongoMember(getDatabase(), identity) }: Dependencies = {}) {
  return createServer(async (request, response) => {
    response.setHeader("Content-Type", "application/json; charset=utf-8");
    response.setHeader("Cache-Control", "no-store");
    // Request targets are paths; a repeated slash must not turn into a URL hostname.
    const path = new URL(`http://localhost${(request.url ?? "/").replace(/^\/+/, "/")}`).pathname;
    if (path === "/api/calculate" || path === "/api/demo/member-lookup") {
      if (request.method !== "POST") {
        response.writeHead(405, { Allow: "POST" });
        response.end(JSON.stringify({ error: "Method not allowed." }));
        return;
      }
      let body;
      try { body = await readJsonBody(request); }
      catch (error) {
        const tooLarge = error instanceof BodyTooLargeError;
        response.writeHead(tooLarge ? 413 : 422);
        response.end(JSON.stringify({ error: { code: tooLarge ? "TOO_LARGE" : "INVALID", message: tooLarge ? "Request is too large." : "Invalid JSON request.", retryable: false } }));
        return;
      }
      try {
        let result;
        if (path === "/api/calculate") result = await calculateRequestWithMember(body, lookupMember);
        else {
          const parsed = MemberLookupIdentity.safeParse(body);
          result = parsed.success ? await lookupMember(parsed.data) : { status: 422, body: { error: { code: "INVALID", message: "Enter a name and a valid date of birth.", retryable: false } } };
        }
        response.writeHead(result.status);
        response.end(JSON.stringify(result.body));
      } catch {
        response.writeHead(503);
        response.end(JSON.stringify({ error: { code: "UNAVAILABLE", message: "Authoritative member data could not be loaded.", retryable: true } }));
      }
      return;
    }
    const isDemoRoute = ["/api/demo", "/api/demo/health", "/api/demo/providers", "/api/demo/members"].includes(path)
      || /^\/api\/demo\/members\/(DEMO-ALEX-001|SYN-MEMBER-\d{4})$/.test(path);
    if (!isDemoRoute) {
      response.writeHead(404);
      response.end(JSON.stringify({ error: "Synthetic demo record not found." }));
      return;
    }
    if (request.method !== "GET") {
      response.writeHead(405, { Allow: "GET" });
      response.end(JSON.stringify({ error: "Method not allowed." }));
      return;
    }
    try {
      const result = await readDemo(path);
      response.writeHead(result.status);
      response.end(JSON.stringify(result.body));
    } catch {
      response.writeHead(503);
      response.end(JSON.stringify({ error: "Backend data service is unavailable." }));
    }
  });
}
