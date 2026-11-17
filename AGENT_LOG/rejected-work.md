# rejected-work
_Real events only, appended as they happen._

## 2026-11-17 — T08 MCP server (backend-mcp, agent/backend 4f2eafe) REJECTED by qa-reviewer
Review: `harness/reviews/T08-review.md` on agent/qa (4896a07). Core protocol and scores matched `harness/score.js --json` exactly (seed 1, paid/arrive × default/strict), but:
- F1: unknown tool name → no log line (breaks "one log line per call"); SDK throws before the server's only logging hook (`mcp/server.js:13-16`).
- F2: `explain_order` says "never processed; no penalty" for an unpaid order the plan assigned, while showing violation penalty 100 (D6) (`mcp/tools/explain_order.js:71`).
- F3: `sla_basis` schema description cites D2 instead of D1 (`mcp/tools/common.js:31`).
Action: sent back to backend-mcp to fix on agent/backend with tests for F1/F2; re-review required before merge.
