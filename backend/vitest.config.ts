// ROOT CONFIG — Planner-owned. Request changes through a handoff.
import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const root = import.meta.dirname;

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": path.resolve(root, "src") } },
  test: {
    passWithNoTests: true,
    environment: "node",
    // Determinism: no retries, no randomized order.
    retry: 0,
    sequence: { shuffle: false },
    projects: [
      { extends: true, test: { name: "contracts", include: ["tests/contracts/**/*.test.ts"] } },
      {
        extends: true,
        test: {
          name: "unit",
          include: ["tests/{benefits,optimizer,api,ai}/**/*.test.ts", "tests/ui/**/*.test.{ts,tsx}"],
        },
      },
      { extends: true, test: { name: "acceptance", include: ["tests/acceptance/**/*.test.ts"] } },
      { extends: true, test: { name: "integration", include: ["tests/integration/**/*.test.ts"] } },
    ],
  },
});
