import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadBackendEnvironment } from "../../scripts/env-files.js";

let fixture: string | undefined;
afterEach(() => {
  vi.unstubAllEnvs();
  if (fixture) {
    if (path.dirname(fixture) !== path.resolve(tmpdir()) || !path.basename(fixture).startsWith("carewindow-env-")) throw new Error("Unexpected environment fixture path");
    rmSync(fixture, { recursive: true, force: true });
    fixture = undefined;
  }
});

function setup() {
  fixture = mkdtempSync(path.join(tmpdir(), "carewindow-env-"));
  const backend = path.join(fixture, "backend");
  const frontend = path.join(fixture, "frontend");
  mkdirSync(backend);
  mkdirSync(frontend);
  writeFileSync(path.join(backend, ".env.local"), "CAREWINDOW_ENV_TEST_PRIORITY=local\n");
  writeFileSync(path.join(backend, ".env"), "CAREWINDOW_ENV_TEST_PRIORITY=standard\nCAREWINDOW_ENV_TEST_DEFAULT=default\n");
  writeFileSync(path.join(frontend, ".env.local"), "CAREWINDOW_ENV_TEST_PRIORITY=legacy\nCAREWINDOW_ENV_TEST_LEGACY=legacy\n");
  for (const key of ["CAREWINDOW_ENV_TEST_PRIORITY", "CAREWINDOW_ENV_TEST_DEFAULT", "CAREWINDOW_ENV_TEST_LEGACY"]) vi.stubEnv(key, undefined);
  return pathToFileURL(`${backend}${path.sep}`);
}

describe("backend environment files", () => {
  it("loads .env.local first and fills missing defaults from lower-priority files", () => {
    loadBackendEnvironment(setup());
    expect(process.env.CAREWINDOW_ENV_TEST_PRIORITY).toBe("local");
    expect(process.env.CAREWINDOW_ENV_TEST_DEFAULT).toBe("default");
    expect(process.env.CAREWINDOW_ENV_TEST_LEGACY).toBe("legacy");
  });

  it("preserves settings supplied by the launching process", () => {
    const root = setup();
    vi.stubEnv("CAREWINDOW_ENV_TEST_PRIORITY", "shell");
    loadBackendEnvironment(root);
    expect(process.env.CAREWINDOW_ENV_TEST_PRIORITY).toBe("shell");
  });
});
