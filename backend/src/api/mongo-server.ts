import { createServer } from "node:http";
import "../../scripts/load-env.js";
import { closeDatabase, getDatabase } from "../db/client.js";
import { readMongoDemo } from "./mongo-demo.js";

const port = Number(process.env.BACKEND_PORT ?? "3001");
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("BACKEND_PORT must be a valid TCP port");

const server = createServer(async (request, response) => {
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  if (request.method !== "GET") {
    response.writeHead(405, { Allow: "GET" });
    response.end(JSON.stringify({ error: "Method not allowed." }));
    return;
  }
  try {
    const path = new URL(request.url ?? "/", "http://localhost").pathname;
    const result = await readMongoDemo(getDatabase(), path);
    response.writeHead(result.status);
    response.end(JSON.stringify(result.body));
  } catch {
    response.writeHead(503);
    response.end(JSON.stringify({ error: "Backend data service is unavailable." }));
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Dental data API listening on http://127.0.0.1:${port}`);
});

function shutdown() {
  server.close(() => void closeDatabase());
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
