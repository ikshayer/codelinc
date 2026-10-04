// PLANNER-OWNED. The set of frozen paths for the current contract version.
import fs from "node:fs";
import path from "node:path";

export const FROZEN_DIRS = ["src/domain", "fixtures", "tests/acceptance", "tests/contracts", "data/sources", "docs/spec"];
export const FROZEN_FILES = [
  "docs/contracts/CONTRACT-v1.md",
  "docs/contracts/golden-scenario.md",
  "docs/acceptance.md",
  "vitest.config.ts",
  // The guard itself (1.1.0): tampering with it shows up in `npm run check:frozen`.
  ".claude/hooks/guard-frozen.mjs",
  ".claude/settings.json",
  "scripts/frozen-files.mjs",
  "scripts/check-frozen.mjs",
  "scripts/freeze.mjs",
  "scripts/golden-check.mjs",
];
export const MANIFEST = "docs/contracts/FROZEN.sha256";

export function isFrozen(relPath) {
  // Case-insensitive: macOS (APFS) resolves SRC/Domain/plan.ts to src/domain/plan.ts.
  const p = relPath.split(path.sep).join("/").toLowerCase();
  return (
    p === MANIFEST.toLowerCase() || // guarded by the hook; it cannot list its own hash
    FROZEN_FILES.some((f) => f.toLowerCase() === p) ||
    FROZEN_DIRS.some((d) => p === d.toLowerCase() || p.startsWith(`${d.toLowerCase()}/`))
  );
}

export function listFrozen(root) {
  const out = [];
  const walk = (rel) => {
    const abs = path.join(root, rel);
    if (!fs.existsSync(abs)) return;
    const st = fs.statSync(abs);
    if (st.isDirectory()) {
      for (const name of fs.readdirSync(abs).sort()) {
        if (name === ".DS_Store") continue;
        walk(path.posix.join(rel, name));
      }
    } else out.push(rel);
  };
  for (const d of FROZEN_DIRS) walk(d);
  for (const f of FROZEN_FILES) if (fs.existsSync(path.join(root, f))) out.push(f);
  return [...new Set(out)].sort();
}
