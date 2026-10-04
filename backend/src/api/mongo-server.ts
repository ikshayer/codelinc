import "../../scripts/load-env.js";
import { closeDatabase } from "../db/client.js";
import { createMongoServer } from "./mongo-http.js";

const port = Number(process.env.BACKEND_PORT ?? "3001");
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("BACKEND_PORT must be a valid TCP port");

const server = createMongoServer();

server.listen(port, "127.0.0.1", () => {
  console.log(`Dental data API listening on http://127.0.0.1:${port}`);
});

function shutdown() {
  server.close(() => void closeDatabase());
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
