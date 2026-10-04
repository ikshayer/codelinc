/**
 * Minimal node:http server for the API handlers (CONTRACT §7 wrapper checks).
 * Run: npm run serve   (PORT, default 4000; ALLOWED_ORIGINS=comma list, default http://localhost:3000 — the Next
 * dev proxy rewrites Host, so the page's Origin must be allow-listed; set ALLOWED_ORIGINS= to disable)
 * Logs route, status, duration and request id only — never bodies.
 */
import http from "node:http";
import { API_LIMITS, API_ROUTES, type ApiRouteId } from "@/domain";
import type { ApiResponseLike } from "@/domain/ports";
import { closeDatabase, getDatabase, migrateDatabase, MongoCareWindowRepository, type CareWindowRepository } from "@/db";
import { errorResponse, requestIdFrom } from "./index";
import { createRuntimeHandlers } from "./runtime";
import { calculateRequestWithMember } from "./calculate";
import { lookupMongoMember } from "./mongo-demo";

let repository: CareWindowRepository | null = null;

if (process.env.MONGODB_URI) {
  const db = getDatabase();
  await migrateDatabase(db);
  repository = new MongoCareWindowRepository(db);
}
const handlers = await createRuntimeHandlers(repository);

const routes = new Map<string, { id: ApiRouteId; method: "GET" | "POST" }>(Object.entries(API_ROUTES).map(([id, r]) => [r.path, { id: id as ApiRouteId, method: r.method }]));
const allowedOrigins = new Set((process.env.ALLOWED_ORIGINS ?? "http://localhost:3000").split(",").map((s) => s.trim()).filter(Boolean));

async function handle(req: http.IncomingMessage, headers: Record<string, string>, requestId: string): Promise<[string, ApiResponseLike]> {
  const pathname = new URL(req.url ?? "/", "http://localhost").pathname;
  const route = pathname === "/api/calculate" ? { id: "calculate" as const, method: "POST" as const } : routes.get(pathname);
  if (!route) return ["unknown", { ...errorResponse("INVALID_REQUEST", "Unknown route.", requestId), status: 404 }];
  if (req.method !== route.method) return [route.id, { ...errorResponse("INVALID_REQUEST", `Use ${route.method}.`, requestId), status: 405 }];
  const origin = headers.origin;
  if (origin && !allowedOrigins.has(origin)) {
    let originHost = "";
    try {
      originHost = new URL(origin).host;
    } catch {
      /* malformed origin → rejected below */
    }
    if (originHost !== headers.host) {
      return [route.id, errorResponse("INVALID_REQUEST", "cross-origin request", requestId)];
    }
  }
  let body: unknown;
  if (route.method === "POST") {
    if (!(headers["content-type"] ?? "").toLowerCase().startsWith("application/json")) {
      return [route.id, errorResponse("INVALID_REQUEST", "Content-Type must be application/json.", requestId)];
    }
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of req) {
      size += (chunk as Buffer).length;
      if (size > API_LIMITS.max_body_bytes) return [route.id, errorResponse("PAYLOAD_TOO_LARGE", "Request body is too large.", requestId)];
      chunks.push(chunk as Buffer);
    }
    try {
      body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      return [route.id, errorResponse("INVALID_REQUEST", "Request body is not valid JSON.", requestId)];
    }
  }
  if (route.id === "calculate") return [route.id, await calculateRequestWithMember(body, (identity) => lookupMongoMember(getDatabase(), identity))];
  return [route.id, await handlers[route.id]({ method: route.method, body, headers })];
}

const server = http.createServer(async (req, res) => {
  const started = performance.now();
  const headers = Object.fromEntries(
    Object.entries(req.headers).map(([k, v]) => [k.toLowerCase(), Array.isArray(v) ? v.join(", ") : (v ?? "")]),
  );
  const requestId = requestIdFrom(headers);
  headers["x-request-id"] = requestId;
  if (headers.origin && allowedOrigins.has(headers.origin)) {
    res.setHeader("access-control-allow-origin", headers.origin);
    res.setHeader("access-control-allow-headers", "content-type, x-request-id");
    res.setHeader("vary", "origin");
    if (req.method === "OPTIONS") return void res.writeHead(204).end();
  }
  const [route, out] = await handle(req, headers, requestId);
  res.writeHead(out.status, { "content-type": "application/json", "x-request-id": requestId }).end(JSON.stringify(out.body));
  if (out.status === 413) req.destroy();
  console.log(JSON.stringify({ route, status: out.status, ms: Math.round(performance.now() - started), request_id: requestId }));
});

const port = Number(process.env.PORT ?? 4000);
server.listen(port, () => console.log(`CareWindow API on http://localhost:${port} (${repository ? "mongodb" : "file fixtures"})`));

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    server.close(async (error) => {
      await closeDatabase();
      process.exitCode = error ? 1 : 0;
    });
  });
}
