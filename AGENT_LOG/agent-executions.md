# agent-executions
_Real events only, appended as they happen._

| Time (UTC+7) | Agent | Worktree / branch | Task | Event |
|---|---|---|---|---|
| 2026-11-17 18:38 | backend-mcp | harness/worktrees/backend · agent/backend | T02+T03 generator, validator, scorer, CLI | dispatched (background, parallel) |
| 2026-11-17 18:38 | qa-reviewer | harness/worktrees/qa · agent/qa | T04 spec tests (no access to implementation) | dispatched (background, parallel) |
| 2026-11-17 18:38 | strategy-optimizer | harness/worktrees/strategy · agent/strategy | T05 FCFS baseline + own feasibility model | dispatched (background, parallel) |
| 2026-11-17 18:40 | backend-mcp | agent/backend | T02+T03 | completed: commits b073430, 257c8d2; 9 spec gaps reported (to Checkpoint 2) |
| 2026-11-17 18:40 | strategy-optimizer | agent/strategy | T05 | completed 7935684 → Lead review CHANGES REQUESTED (wrong scenario format: shifts/day-wallet; 6-min occupancy); resumed |
| 2026-11-17 18:41 | qa-reviewer | agent/qa | T04 | completed 1d5c16a (60 tests) → Lead review CHANGES REQUESTED (fixture field names off-spec); resumed to fix + run against backend impl |
| 2026-11-17 18:41 | backend-mcp | agent/backend | T03 | resumed: fix npm test glob (found by QA) |
| 2026-11-17 18:42 | qa-reviewer | agent/qa | T04 + T03 review | completed 0e18b7d, 5cafbaa: 60/60 pass vs backend impl; verdict APPROVE |
| 2026-11-17 18:42 | Lead | main | merge | agent/backend, agent/strategy, agent/qa merged --no-ff; npm test 60/60 |
| 2026-11-17 (session 2) | Lead | main | restore | main + agent/backend, agent/qa, agent/strategy restored from inblack-a.bundle (HEAD 428dda2) into local repo |
| 2026-11-17 (session 2) | Lead | main | step 1 | added code-reviewer + committer sub-agents, commit gate in CLAUDE.md, HARNESS.md |
| 2026-11-17 19:2x | code-reviewer | main (read-only) | step 1 review | round 1 FAIL (HARNESS ownership table vs PLAN §3; contradictory claim rule) → fixed → round 2 PASS. Could not run commands (Bash tool broken: "Top-level not found: C:\Program Files\Git\bin"); relied on Lead's logged npm test run |
| 2026-11-17 | Lead (acting as committer) | main | step 1 commit | committer sub-agent has only the Bash tool, which is broken in this environment (stub folder C:\Program Files\Git); Lead committed via PowerShell following committer.md rules exactly |
| 2026-11-17 | qa-reviewer | agent/qa | T08 review | REJECT (F1–F3) → 4896a07 |
| 2026-11-17 | backend-mcp | agent/backend | T08 | resumed to fix F1–F3 |
| 2026-11-17 | code-reviewer | main (read-only) | T08 merge gate | PASS: merged both branches in scratch worktree, npm test 71/71, MCP smoke test |
| 2026-11-17 | Lead | main | merge | agent/backend (fe928b3) + agent/qa (ea8ea47) merged --no-ff; npm test 71/71 |
| 2026-11-17 12:56Z | headless Claude Code (`claude -p`) | demo/hook-block worktree | T10 + T11 demo | used skill game-queue-quality-check; Stop blocked by inblack-guard (9/60 failing, planted bug); agent restored D6 value, 60/60, stop allowed — see hook-events.md |
| 2026-11-17 12:59Z | headless Claude Code (`claude -p`) | main | T08 demo | called run_scenario, explain_order, score_plan via inblack-queue MCP — see mcp-calls.md |
| 2026-11-17 | User | — | Checkpoint 2 | approved; generator locked at b073430 (D15) |
| 2026-11-17 | backend-mcp | agent/backend | T07 | completed 698e106, 7c3efc7: benchmark, npm test 76/76; fcfs held-out median 59.17 paid / 57.96 arrive |
| 2026-11-17 | strategy-optimizer | agent/strategy | T06 | completed 211dd18, 10d5630, 4a3692f: edf, vip, cheapest, profit, hybrid; claims hybrid held-out 73.77 / 72.57 |
| 2026-11-17 | qa-reviewer | agent/qa | T09 | phase 1 a205aff, dd6563a: planner spec tests; T06 review REJECT (F1 wallet float) b1e4232 |
| 2026-11-17 | strategy-optimizer | agent/strategy | T06 | resumed to fix F1 |
| 2026-11-17 | qa-reviewer | agent/qa | T07 review | REJECT (median of rounded values) dd725a1 |
| 2026-11-17 | backend-mcp | agent/backend | T07 | resumed to fix median rounding |
| 2026-11-17 | strategy-optimizer | agent/strategy | T06 | F1 fixed 024f753; sent to QA round 2 |
| 2026-11-17 | backend-mcp | agent/backend | T07 | fix 43790e3, 78f386e (unrounded aggregation), npm test 78/78 |
| 2026-11-17 | qa-reviewer | agent/qa | T06 + T07 round 2 | APPROVE d7deeb1 (T06), aa3abfa (T07) |
| 2026-11-17 | code-reviewer | main (read-only) | step 4 merge gate | PASS: 3 branches merged in scratch, npm test 343 pass / 0 fail / 6 todo, benchmark hybrid held-out 73.77 / 72.57 |
| 2026-11-17 | Lead | main | merge | agent/strategy 7939561, agent/backend b5a8be5, agent/qa 9ae146d (--no-ff); npm test 343 pass / 0 fail / 6 todo |
| 2026-11-17 | Lead | main | history rewrite | user chose noreply e-mail before first push: `git filter-branch --env-filter` on main (49 commits, trees unchanged); backup branch backup/pre-email-rewrite + bundle; old→new hashes in AGENT_LOG/hash-map.md |
| 2026-11-18 | Lead | main | history rewrite 2 | user chose to replace the session-1 personal author name with surat before first push: filter-branch on main ^origin/main (keeps GitHub-signed Initial commit), trees unchanged; backup branch backup/pre-name-rewrite; hash-map regenerated original→published; generator lock now b2a5da2 |
| 2026-11-18 | strategy-optimizer | agent/strategy | T15 + T16 | STRATEGY.md cec8188/7c1d2ac; hybrid default 14fb7ee (held T16 commit until T17 phase 1 merged: npm test would fail) |
| 2026-11-18 | backend-mcp | agent/backend | T17 | phase 1 604cb06 (MCP default follows DEFAULT_STRATEGY); phase 2 72ed90f benchmark of main acb18ec, all 6 strategies |
| 2026-11-18 | qa-reviewer | agent/qa | T17 + T15/T16 reviews | APPROVE 6ed2862 (T17 ph1), a54cdd3 (T15/T16: every STRATEGY.md number and all 3 losing cases reproduced) |
| 2026-11-18 | Lead | main | merges | 643a6bf (T17 ph1), acb18ec (T15/T16); npm test 350/350; CLI default = hybrid |
| 2026-11-18 | qa-reviewer | agent/qa | T17 phase 2 review | APPROVE 9402642 (fresh bench = committed JSON except timestamp; 480 cells 0/0) + CLI default test |
| 2026-11-18 | Lead | main | merges | d1a1032 (T17 phase 2 benchmark), 0741c66 (T17 phase 2 review + CLI default test); npm test 351/351 |
| 2026-11-18 | User | — | Checkpoint 3 | approved benchmark acb18ec; GitHub Pages enabled (Actions source) by Lead with user approval |
