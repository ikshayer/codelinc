// ROOT CONFIG — Planner-owned. Tests live in tests/e2e/** (Reviewer).
// First run on a new machine: npx playwright install chromium
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  retries: 0,
  use: { baseURL: "http://localhost:3000", trace: "retain-on-failure" },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120_000,
    env: { AI_MODE: "synthetic", AI_ENABLED: "false" },
  },
});
