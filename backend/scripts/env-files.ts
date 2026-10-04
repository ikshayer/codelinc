import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";

/** Higher-priority files load first; existing process variables always win. */
export function loadBackendEnvironment(root = new URL("../", import.meta.url)): void {
  const candidates = [".env.local", ".env", "../frontend/.env.local", "../frontend/.env", "../.env.local", "../.env"];
  for (const relative of candidates) {
    const candidate = new URL(relative, root);
    if (existsSync(candidate)) loadEnvFile(candidate);
  }
}
