import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";

// Backend-owned configuration, with fallbacks for existing local installs.
const candidates = [
  new URL("../.env", import.meta.url),
  new URL("../../frontend/.env", import.meta.url),
  new URL("../../.env", import.meta.url),
];
for (const candidate of candidates) {
  if (existsSync(candidate)) {
    loadEnvFile(candidate);
    break;
  }
}
