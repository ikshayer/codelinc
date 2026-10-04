#!/usr/bin/env node
// Fails if any frozen file was added, removed or changed since the last `npm run freeze`.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { listFrozen, MANIFEST } from "./frozen-files.mjs";

const root = path.resolve(import.meta.dirname, "..");
const manifestPath = path.join(root, MANIFEST);
if (!fs.existsSync(manifestPath)) {
  console.error(`missing ${MANIFEST}; the Planner must run npm run freeze`);
  process.exit(1);
}
const expected = new Map(
  fs
    .readFileSync(manifestPath, "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => {
      const [hash, ...rest] = l.split("  ");
      return [rest.join("  "), hash];
    }),
);
const actual = new Map(
  listFrozen(root).map((rel) => [rel, crypto.createHash("sha256").update(fs.readFileSync(path.join(root, rel))).digest("hex")]),
);
const problems = [];
for (const [rel, hash] of expected) {
  if (!actual.has(rel)) problems.push(`removed: ${rel}`);
  else if (actual.get(rel) !== hash) problems.push(`changed: ${rel}`);
}
for (const rel of actual.keys()) if (!expected.has(rel)) problems.push(`added:   ${rel}`);
if (problems.length) {
  console.error("Frozen contract files differ from docs/contracts/FROZEN.sha256:");
  for (const p of problems) console.error(`  ${p}`);
  console.error("Only the Planner may change these, through a change request (docs/workflow.md).");
  process.exit(1);
}
console.log(`frozen files OK (${actual.size})`);
