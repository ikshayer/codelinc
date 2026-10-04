#!/usr/bin/env node
// PLANNER-ONLY. Records sha256 of every frozen file. Run after an accepted contract change.
import fs from "node:fs";
import path from "node:path";
import { frozenDigest, listFrozen, MANIFEST } from "./frozen-files.mjs";

const root = path.resolve(import.meta.dirname, "..");
const version = /CONTRACT_VERSION = "([^"]+)"/.exec(fs.readFileSync(path.join(root, "src/domain/version.ts"), "utf8"))?.[1];
const lines = listFrozen(root).map((rel) => `${frozenDigest(root, rel)}  ${rel}`);
const header = `# Frozen files for contract ${version}. Regenerate only with \`npm run freeze\` after an accepted change request.\n`;
fs.writeFileSync(path.join(root, MANIFEST), header + lines.join("\n") + "\n");
console.log(`froze ${lines.length} files for contract ${version} -> ${MANIFEST}`);
