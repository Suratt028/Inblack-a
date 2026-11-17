# rejected-work
_Real events only, appended as they happen._

## 2026-11-17 — T08 MCP server (backend-mcp, agent/backend 4f2eafe) REJECTED by qa-reviewer
Review: `harness/reviews/T08-review.md` on agent/qa (4896a07). Core protocol and scores matched `harness/score.js --json` exactly (seed 1, paid/arrive × default/strict), but:
- F1: unknown tool name → no log line (breaks "one log line per call"); SDK throws before the server's only logging hook (`mcp/server.js:13-16`).
- F2: `explain_order` says "never processed; no penalty" for an unpaid order the plan assigned, while showing violation penalty 100 (D6) (`mcp/tools/explain_order.js:71`).
- F3: `sla_basis` schema description cites D2 instead of D1 (`mcp/tools/common.js:31`).
Action: sent back to backend-mcp to fix on agent/backend with tests for F1/F2; re-review required before merge.

## 2026-11-17 — T06 strategies (strategy-optimizer, agent/strategy 211dd18..4a3692f) REJECTED by qa-reviewer
Review: `harness/reviews/T06-review.md` on agent/qa (b1e4232). Everything else verified (QA planner tests 265/265 on the branch; 20-seed gate clean), but:
- F1 (D4/D4b): wallet check `c > remaining + EPS` (`src/search/core.js:121`, `src/model/feasibility.js:59`) accepts an order when float `remaining` is a few ULPs below `cost`. Repro: S1 wallet 117, cost_pct 0.9, orders 51 + 79 → all six strategies (incl. fcfs) assign both; `harness/score.js` → `WALLET S1 remaining 71.10 < cost 71.10` (−100, −5%). Not hit by the 20 frozen seeds, but D4 says never overspent.
- QA added failing test `harness/tests/planner.edge.test.js` (W1), marked todo until fixed.
Action: sent back to strategy-optimizer to fix on agent/strategy; re-review required before merge.

## 2026-11-17 — T07 benchmark (backend-mcp, agent/backend 698e106/7c3efc7) REJECTED by qa-reviewer
Review: `harness/reviews/T07-review.md` on agent/qa (dd725a1). All 480 per-seed cells match `harness/score.js --json`, deterministic, lock b073430 intact, discovers all 6 strategies — but:
- `harness/benchmark.js:64` rounds each seed to 2 decimals before `summarize` (lines 81–85) takes median/mean → 9 of 24 median cells off by 0.01 (e.g. fcfs held-out paid true 59.16, committed 59.17).
Action: sent back to backend-mcp to aggregate unrounded values; re-review required.
