# Kickoff — running the build in Claude Code

Contract **v1.1.0** is frozen (pre-build review applied: `docs/review/contract-review-v1.md`). The Planner phase is done: contracts, fixtures, acceptance tests, ownership, agent definitions and briefs are in the repo. This file is what you paste into Claude Code (the CLI) to run the rest.

## Before you start (once, in Terminal)

```bash
cd ~/Desktop/codelinc
git checkout contract-v1      # the branch the Planner prepared
# .claude/ (agents, frozen-file hook, settings) is already installed and committed
npm install
npm run check:frozen && npm run typecheck && npm run test:contracts   # all green
npm run test:acceptance                                              # red: NOT_IMPLEMENTED (expected)
claude
```

Inside Claude Code, run `/agents` once to confirm the four project agents are listed: `dental-benefits`, `dental-optimizer`, `dental-uxapi`, `dental-reviewer`.

## Prompt 1 — Planner step 0 and contract review (paste into Claude Code)

```text
You are the Planner/Integrator. Read CLAUDE.md, docs/workflow.md, docs/ownership.md and docs/contracts/CONTRACT-v1.md.

Step 0 (root config, you own it; needs network): run `npx shadcn@4.21.1 init` accepting the defaults for an existing Next.js project with Tailwind v4 and src/, then `npx shadcn@4.21.1 add button card badge alert input label textarea separator tabs`. This writes package.json, components.json, src/lib/utils.ts and globals.css — do it BEFORE phase 2 so the UX agent never needs root config. If the registry is unreachable, skip shadcn: the UX agent uses plain Tailwind v4 (record it in docs/decision-log.md). Then run `npm run typecheck && npm run test:contracts && npm run check:frozen` and fix only root config if anything broke.

Step 1 (contract review) is DONE — contract 1.1.0 is the result. Skip to Prompt 2.
```

## Prompt 2 — Parallel implementation (workflow phase 2)

```text
Launch dental-benefits, dental-optimizer and dental-uxapi IN PARALLEL in build mode. Tell each: "Implement your brief in docs/briefs/. Write only in your owned paths. dental-optimizer: unit-test against a fake BenefitEngine until benefits lands. dental-uxapi: build the UI against fixtures/mock-responses first. Finish with the exact handoff from docs/workflow.md." When all three return, summarize their handoffs for me (files, test results, CRs) and resolve any CRs.
```

## Prompt 3 — Integration (phase 3)

```text
Integrate. Run npm run test:acceptance. For every failing test, identify the owning agent from docs/acceptance.md and send that agent the failing test name, the assertion and the error, asking for a fix within its owned paths only. Repeat until the acceptance suite is green. Then wire the UI to the real API (dental-uxapi), run `npm run demo:cli` and start `npm run dev` in the background, and walk the spec §15 demo narrative end to end.
```

## Prompt 4 — Independent review (phase 4)

```text
Launch dental-reviewer: "Follow docs/briefs/reviewer.md. Never edit production code." When it returns, route every P0/P1 defect in docs/review/REVIEW.md to its owning agent, then have the reviewer re-run its suite.
```

## Prompt 5 — Ship (phases 5–6)

```text
Feature freeze. Run npm run verify. Fix only defects. Then rehearse the synthetic demo offline (AI_MODE=synthetic) and list anything still unresolved.
```

## Tips

- Commit after each phase (`git add -A && git commit -m "phase N: ..."`) so every agent's work is reviewable.
- If parallel agents are unavailable, run the same prompts one agent at a time; keep the ownership rules and the separate reviewer pass.
- The PreToolUse hook in `.claude/settings.json` blocks edits to frozen files. If an agent hits it, that is the system working: it should file a change request.
