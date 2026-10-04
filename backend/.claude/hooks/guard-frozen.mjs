#!/usr/bin/env node
// PreToolUse hook: blocks Write/Edit to frozen contract files unless the Planner
// has created .claude/UNFREEZE (via Bash, which prompts) while applying an accepted change request.
// Fails CLOSED: any error exits 2 (block); exit 1 would let the tool run.
import fs from "node:fs";
import path from "node:path";

const block = (msg) => {
  process.stderr.write(`BLOCKED: ${msg}\n`);
  process.exit(2);
};

let raw = "";
process.stdin.on("data", (c) => (raw += c));
process.stdin.on("end", async () => {
  try {
    const input = JSON.parse(raw || "{}");
    const root = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
    const target = input?.tool_input?.file_path || input?.tool_input?.notebook_path;
    if (!target) process.exit(0);
    const rel = path.relative(root, path.resolve(root, target)).split(path.sep).join("/");
    if (rel.startsWith("..")) process.exit(0);
    // The marker can only be created by the Planner through Bash (a permission prompt), never by Write/Edit.
    if (rel.toLowerCase() === ".claude/unfreeze") block("agents may not create .claude/UNFREEZE.");
    const { isFrozen } = await import(path.join(root, "scripts", "frozen-files.mjs"));
    if (isFrozen(rel) && !fs.existsSync(path.join(root, ".claude", "UNFREEZE"))) {
      block(
        `${rel} is part of the frozen contract. Do not edit it. ` +
          `Put a change request in your handoff (docs/workflow.md); only the Planner can apply it.`,
      );
    }
    process.exit(0);
  } catch (err) {
    block(`frozen-file guard failed (${err?.message ?? err}); refusing the edit.`);
  }
});
