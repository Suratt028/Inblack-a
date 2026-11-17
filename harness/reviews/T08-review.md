# T08 review — MCP server (backend-mcp, agent/backend @ 4f2eafe)

Reviewer: qa-reviewer, 2026-11-17. Step: 3.

## VERDICT: REJECT

The core works and scores match the independent scorer exactly. Rejected for three concrete defects
against the acceptance text ("one log line per call", "clear errors"/explain correctness, D-id citation).
All three are small fixes.

## How it was run

```
git archive agent/backend | tar -x -C <scratch>/be ; cd <scratch>/be ; npm ci ; npm test
  -> tests 68, pass 68, fail 0  (node v24.12.0)
node mcp/server.js            # stderr: {"event":"listening","url":"http://localhost:3000/mcp",...}
netstat: TCP 127.0.0.1:3000 LISTENING
```
Probe client: official SDK `Client` + `StreamableHTTPClientTransport` to `http://localhost:3000/mcp`
(scripts kept outside the repo, in the session scratchpad).

## What passes (evidence)

| Check | Result |
|---|---|
| initialize | `{"name":"inblack-a","version":"0.1.0"}`, capabilities `{"tools":{"listChanged":true}}` |
| ping | `{}` |
| tools/list | 3 tools, each with inputSchema and outputSchema |
| tools/call x3 | run_scenario, score_plan, explain_order all return structuredContent |
| Scores vs `harness/score.js --json` (seed-1, planner plan) | identical scorePct/total/maxProfit/totals/counts for paid, paid+strict, arrive, arrive+strict: 74.89290351603641 / 7325.2 (paid); 73.57400648202113 / 7196.2, overSla 24, slaPenalty 129 (arrive) |
| D1 sla_basis option | `paid` default, `arrive` works; `finish` rejected by schema (-32602) |
| D2 lateness at finish | O184 arrive basis: start 1150, finish 1155, deadline 1147 -> late 8, VIP x2 -> 16 |
| D6 | start 0 before paid -> BEFORE_PAID, -100, unprocessed 22 (5% of 440); start 1438 -> OUT_OF_DAY (D5) |
| D8 duplicate | plan with O002 twice -> total 0, scorePct 0, duplicates ["O002"]; explain_order mentions D8 |
| D9 | start_minute 20.5 -> BAD_MINUTE; `[null,5,"x"]` -> 3x BAD_INPUT |
| D14 | negative score reported as is (-38.21%) |
| scenario_path outside repo | `C:/Windows/win.ini`, `../plan1.json` -> "must point to a file inside the repository"; `.` / dir rejected |
| Bad inputs | two sources, no source, missing plan, bad shape, unknown strategy -> clear isError text |
| DNS rebinding | `Host: evil.example` -> 403 `Invalid Host` |
| GET /mcp | 405 JSON-RPC error |
| Logs | one JSON line on stderr per tool call incl. schema errors; scenario/plan summarized as `object(orders=N)`; no secrets |

## Defects (must fix)

### F1 — tools/call for an unknown tool produces no log line
Acceptance: "one log line per call"; `mcp/server.js:13-14` claims "every tools/call produces exactly one log line".
Probe: `callTool({name:'nope'})` -> client gets `MCP error -32602: Tool nope not found`, server stderr has
no line for it (the log jumps from the previous explain_order call straight to the next call).
Cause: SDK `server/mcp.js:157` throws ToolNotFound before `validateToolInput` (the only hook overridden at
`mcp/server.js:16`) and before `wrap()`. Fix: also log on this path (e.g. wrap the CallTool request handler, or
override the lookup) and add a test that asserts one log line for an unknown tool.

### F2 — explain_order gives contradictory text for an assigned unpaid order (D6)
Probe: seed-1 scenario, plan `[{order_id:"O010", supplier_id:"S1", start_minute:600}]` (O010 paid_minute null), explain O010:
```
penalties: {"sla":0,"unprocessed":0,"violation":100,"total":100}
reason: "unpaid (paid_minute null): never processed; no profit and no penalty. 1 rejected assignment(s): UNPAID (order is not paid) => violation penalty 100.00"
```
"no penalty" is wrong: D6 gives -100. Source: `mcp/tools/explain_order.js:71` writes "no penalty" without
checking `viol.length`. Fix: say "no SLA/unprocessed penalty" or only say "no penalty" when there are no violations; add a test.

### F3 — wrong D-id on the sla_basis schema description
`mcp/tools/common.js:31`: `'SLA clock basis (D2); default paid'`. The SLA basis option is D1
(DECISIONS_INPUT.md: "D1 | SLA clock default paid_minute; option slaBasis"); D2 is the lateness formula.
This text is shown to every MCP client in tools/list. Fix: cite D1 (and D2 for the formula if you like).

## Recommended (non-blocking)

- R1 path existence oracle: `mcp/tools/common.js:58-63` runs `realpathSync` before the containment check, so
  `../plan1.json` (exists) -> "must point inside the repository" but `../nope-zzz.json` -> "not found". A client
  can probe for file existence outside the repo. Check the lexical path first, then realpath (keep the symlink check).
- R2 JSON parse errors echo the first bytes of the file (`"# CLAUDE.m"... is not valid JSON`). Low risk (repo is
  public), but a generic "not valid JSON" is enough.
- R3 explain_order: unpaid order with `sla_basis:"arrive"` returns `slaDeadline: 149`
  (`explain_order.js:63`). An unpaid order has no SLA; return null like the paid basis.
- R4 `vip` type is not validated (`checkScenario`, `common.js:73-80`): `vip:"yes"` is accepted and reported as
  `vip:true`. Validate boolean (or undefined).

## Re-review

Send back with F1-F3 fixed and a test for F1 and F2. I will rerun `npm test`, the probe script and the
score.js comparison.
