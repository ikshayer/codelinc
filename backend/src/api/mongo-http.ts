import { createServer } from "node:http";
import { getDatabase } from "../db/client.js";
import { readMongoDemo } from "./mongo-demo.js";
import { BodyTooLargeError, calculateRequest, readJsonBody } from "./calculate.js";

type DemoReply = Awaited<ReturnType<typeof readMongoDemo>>;
type Dependencies = { readDemo?: (path: string) => Promise<DemoReply> };

/** HTTP boundary. Injecting the data reader allows tests without an Atlas connection. */
export function createMongoServer({ readDemo = (path) => readMongoDemo(getDatabase(), path) }: Dependencies = {}) {
  return createServer(async (request, response) => {
    response.setHeader("Content-Type", "application/json; charset=utf-8");
    response.setHeader("Cache-Control", "no-store");
    // Request targets are paths; a repeated slash must not turn into a URL hostname.
    const path = new URL(`http://localhost${(request.url ?? "/").replace(/^\/+/, "/")}`).pathname;
    if (path === "/api/calculate") {
      if (request.method !== "POST") {
        response.writeHead(405, { Allow: "POST" });
        response.end(JSON.stringify({ error: "Method not allowed." }));
        return;
      }
      try {
        const result = calculateRequest(await readJsonBody(request));
        response.writeHead(result.status);
        response.end(JSON.stringify(result.body));
      } catch (error) {
        const tooLarge = error instanceof BodyTooLargeError;
        response.writeHead(tooLarge ? 413 : 422);
        response.end(JSON.stringify({ error: { code: tooLarge ? "TOO_LARGE" : "INVALID", message: tooLarge ? "Calculation request is too large." : "Invalid JSON request.", retryable: false } }));
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
