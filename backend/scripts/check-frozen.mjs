#!/usr/bin/env node
// Fails if any frozen file was added, removed or changed since the last `npm run freeze`.
import fs from "node:fs";
import path from "node:path";
import { frozenDigest, listFrozen, MANIFEST, parseFrozenManifest } from "./frozen-files.mjs";

const root = path.resolve(process.argv[2] ?? path.join(import.meta.dirname, ".."));
const manifestPath = path.join(root, MANIFEST);
if (!fs.existsSync(manifestPath)) {
  console.error(`missing ${MANIFEST}; the Planner must run npm run freeze`);
  process.exit(1);
}
const expected = parseFrozenManifest(fs.readFileSync(manifestPath, "utf8"));
const actual = new Map(listFrozen(root).map((rel) => [rel, frozenDigest(root, rel)]));
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
