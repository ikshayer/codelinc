import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, appendFileSync } from "node:fs";
import { parseEnv } from "node:util";

const path = new URL("../.env.local", import.meta.url);
const content = existsSync(path) ? readFileSync(path, "utf8") : "";
if (parseEnv(content).AUTH_SECRET?.trim()) {
  console.log("AUTH_SECRET is already configured; left it unchanged.");
} else {
  appendFileSync(path, `${content && !content.endsWith("\n") ? "\n" : ""}\n# Server-only Auth.js session encryption secret\nAUTH_SECRET=${randomBytes(32).toString("base64url")}\n`);
  console.log("Configured AUTH_SECRET in frontend/.env.local. Its value was not printed.");
}
