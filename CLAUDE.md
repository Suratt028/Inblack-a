# CLAUDE.md — inblack-a (INBLACK GAMING, Project A)

## Overview
Planner that decides which paid game top-up order runs, when it starts, and which supplier serves it, maximizing the official score. Plus MCP tools, Claude Code skills/plugin, and a 3-page GitHub Pages site.

## Architecture
- `src/planner.js` — `node src/planner.js scenario.json plan.json`. Strategy modules in `src/strategies/`. MUST NOT import from `harness/`.
- `harness/generator.js` — seeded scenarios. `harness/validator.js` + `harness/scorer.js` — independent rule check and score. `harness/score.js` — one-command report. `harness/benchmark.js` — tuning seeds 101–110, held-out seeds 1–10.
- `mcp/server.js` — MCP (official SDK, Streamable HTTP, `http://localhost:3000/mcp`), tools `run_scenario`, `score_plan`, `explain_order`.
- `.claude/agents/` (3 subagents), `.claude/skills/` (2 skills), `plugins/inblack-guard/` (Stop hook runs tests).
- `site/` — `index.html`, `replay.html`, `team.html`; data from Actions (REST API).

## Rules
Authoritative business rules and interpretations: `PLAN.md` §2 and `harness/DECISIONS_INPUT.md` (D1–D15). Never change them silently.

## Commands
- `npm test` — all tests (node:test)
- `node harness/generator.js --seed 1 > harness/scenarios/seed-1.json`
- `node src/planner.js harness/scenarios/seed-1.json /tmp/plan.json`
- `node harness/score.js harness/scenarios/seed-1.json /tmp/plan.json [--sla-basis arrive] [--strict]`
- `npm run bench`
- `npm run mcp` — start MCP server on :3000

## Security
Public repo. No tokens/passwords in any file, commit or log. Actions use `GITHUB_TOKEN` only.

## Agent ownership
See `PLAN.md` §3. One owner per file; touching another agent's files = rejection at merge. Tasks: `harness/tasks/Txx.md`.

## Completion criteria
`npm test` green; held-out median score % ≥ 65 under both SLA bases; 0 duplicates and 0 violations (default and strict) on every seed; MCP initialize/ping/tools/list/tools/call pass; site pages show numbers equal to benchmark output.
