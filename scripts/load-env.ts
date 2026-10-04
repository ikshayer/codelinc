import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";

// Root .env takes precedence; retain support for the pre-merge local setup.
const rootEnv = new URL("../.env", import.meta.url);
const legacyEnv = new URL("../frontend/.env", import.meta.url);
if (existsSync(rootEnv)) loadEnvFile(rootEnv);
else if (existsSync(legacyEnv)) loadEnvFile(legacyEnv);
