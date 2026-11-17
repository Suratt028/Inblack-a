# T17 review (phase 1) — MCP default strategy follows planner DEFAULT_STRATEGY

- Reviewer: qa-reviewer (agent/qa)
- Subject: agent/backend `604cb06` on top of main `af6eb55`
- Date: 2026-11-18

## VERDICT: APPROVE

## Scope
`git diff --stat af6eb55 604cb06`: `harness/tasks/T17.md`, `mcp/test/mcp.test.js`, `mcp/tools/common.js`,
`mcp/tools/explain_order.js`, `mcp/tools/run_scenario.js`. Everything is inside mcp/** + T17.md. No changes to src/, validator, scorer,
generator or other agents' files.

## Fallback logic (`mcp/tools/common.js:10`)
`DEFAULT_STRATEGY = typeof planner.DEFAULT_STRATEGY === 'string' && planner.DEFAULT_STRATEGY ? planner.DEFAULT_STRATEGY : 'fcfs'`.
Exported and used in the schema `.default(...)`, in the description, and in the runtime fallback `args.strategy || c.DEFAULT_STRATEGY`
in both tools. I checked it by overriding `planner.DEFAULT_STRATEGY` before requiring common.js (scratch tree a):

| planner.DEFAULT_STRATEGY | MCP DEFAULT_STRATEGY |
|---|---|
| (not exported, main as is) | fcfs |
| `""` | fcfs |
| `42` | fcfs |
| `null` | fcfs |
| `"edf"` | edf |

## Test runs (scratch dirs from `git archive 604cb06`, not in any worktree)
- (a) agent/backend as is (planner has no DEFAULT_STRATEGY export): `npm test` exit 0, `tests 350 / pass 350 / fail 0`.
- (b) same tree with `src/planner.js` copied from the uncommitted T16 strategy worktree (sha256 `8dfd68a0…0eb46`,
  `DEFAULT_STRATEGY = 'hybrid'`, `plan()` + CLI default = hybrid): `npm test` exit 0, `tests 350 / pass 350 / fail 0`.
- The new test `T17: default strategy follows planner DEFAULT_STRATEGY (fallback fcfs)` passes in both states.

## tools/list + tools/call probe (live server, official SDK client, port 0)
| state | tool | inputSchema.strategy.default | description | call result |
|---|---|---|---|---|
| a | run_scenario | fcfs | "Planner strategy (default: planner default, currently fcfs)" | seed 1 -> strategy=fcfs, scorePct 74.89 |
| a | explain_order | fcfs | "...used when no plan is given (default: planner default, currently fcfs)" | O001 ok, planSource=planner, start 20 |
| b | run_scenario | hybrid | "Planner strategy (default: planner default, currently hybrid)" | seed 1 -> strategy=hybrid, scorePct 86.36 |
| b | explain_order | hybrid | "...used when no plan is given (default: planner default, currently hybrid)" | O001 ok, planSource=planner, start 17 |

Default and description match in both states. The new test also checks that MCP default assignments equal the CLI planner's default plan,
so MCP and CLI cannot drift.

## Notes (non-blocking)
1. common.js does not check that `planner.DEFAULT_STRATEGY` is in `STRATEGY_NAMES`. A bad value would show up as a planner
   "unknown strategy" error on call, not at startup. The new test asserts `STRATEGY_NAMES.includes(expected)`, so CI catches it.
2. The description is computed once at module load, which is fine because the planner default is a constant.
3. T17 phase 2 (bench on clean main after the T16 merge) is still pending. This review does not cover it.
