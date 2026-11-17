# mcp-calls
_Real agent → MCP tool calls, appended as they happen._

## 2026-11-17 12:59Z — headless Claude Code session calls all 3 tools (session 5c220ee5-29eb-4d2e-a007-80f279c5e96b)
Server: `npm run mcp` on main ea8ea47 (T08 merged). `claude mcp list` → `inblack-queue: http://localhost:3000/mcp (HTTP) - ✔ Connected`; session `init` shows `inblack-queue` status `connected` (source: project `.mcp.json`).
Command: `claude -p "Using only the inblack-queue MCP tools: (1) run_scenario on seed 1 with sla_basis arrive, (2) explain_order for the order that lost the most points, (3) score_plan for seed 1 with a plan containing just one assignment: order O010, supplier S1, start 600. ..." --allowedTools mcp__inblack-queue__run_scenario mcp__inblack-queue__explain_order mcp__inblack-queue__score_plan`

Server log (one JSON line per call, verbatim):
```
{"ts":"2026-11-17T12:59:16.072Z","event":"listening","url":"http://localhost:3000/mcp","tools":["run_scenario","score_plan","explain_order"]}
{"ts":"2026-11-17T12:59:46.326Z","tool":"run_scenario","args":{"seed":1,"sla_basis":"arrive"},"duration_ms":20.1,"ok":true}
{"ts":"2026-11-17T12:59:48.474Z","tool":"explain_order","args":{"order_id":"O184","seed":1,"sla_basis":"arrive"},"duration_ms":7.9,"ok":true}
{"ts":"2026-11-17T12:59:49.055Z","tool":"score_plan","args":{"seed":1,"plan":"object(assignments=1)"},"duration_ms":4.12,"ok":true}
```
Agent's results: run_scenario 73.57% (7196.2 / 9780.9; done 267, overSla 24, paidNotDone 1, viol 0, dup 0) — equals `harness/score.js --sla-basis arrive --json`. explain_order O184: VIP, deadline 1147, finished 1155 → 8 min late ×2 = −16 (D2). score_plan O010@600: UNPAID −100 + unprocessed −3637.5 → −38.21% (D6). Session: 5 turns, 19 s.
