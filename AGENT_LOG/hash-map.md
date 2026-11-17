# hash-map — commit hashes before / after the author-email rewrite

On 2026-11-17, before the first push to GitHub, the user chose to replace a personal e-mail in commit author/committer metadata with the GitHub noreply address (`git filter-branch --env-filter` on `main` only; trees unchanged — final tree identical).
Log files, reviews and task files written before that point cite the **old** short hashes. Use this table to find the commit on the published `main`.

| old | new | subject |
|---|---|---|
| `dbde10a` | `d672f9d` | T01: scaffold, plan, task registry, ownership, agent definitions, DECISIONS_INPUT |
| `b073430` | `46d1736` | T02: deterministic seeded scenario generator + 20 scenarios |
| `257c8d2` | `c087d07` | T03: validator, scorer and score CLI per DECISIONS_INPUT D1-D14 |
| `32850ca` | `a622ebc` | Lead: add authoritative I/O format to CLAUDE.md (gap found by strategy-optimizer) |
| `b963dde` | `6219065` | T05: FCFS baseline planner, own feasibility model with D10 margins, explain side file |
| `0e18b7d` | `834270b` | T04: spec tests for validator, scorer, generator, CLI (written from D1-D15 only) |
| `7fe812e` | `522efe0` | T03: fix npm test glob |
| `48b1cbd` | `658ead7` | T05: official scenario format only, per-supplier wallet, staff occupancy [s,s+5) |
| `8b7e030` | `4ff7fff` | Merge agent/backend: T02 generator, T03 validator+scorer+CLI |
| `f7b962d` | `abd2b0a` | Merge agent/strategy: T05 FCFS baseline planner |
| `cfca272` | `5823c08` | Lead: log merges and FCFS baseline scoring |
| `5cafbaa` | `159f99e` | T04: align fixtures to CLAUDE.md I/O format, run against backend 7fe812e, T03 review APPROVE |
| `d2bd804` | `bb11cd5` | Merge agent/qa: T04 independent spec tests + T03 review (APPROVE) |
| `428dda2` | `9246e0b` | Lead: Checkpoint 2 state — tasks T01-T05 done, test log |
| `08dc08b` | `d78fc70` | docs(harness): HARNESS.md team process + code-reviewer/committer commit gate |
| `0e56da2` | `cef66e5` | docs(log): session 2 restore, step 1 review rounds and test run |
| `b05a3de` | `d42f6d6` | chore(tasks): claim T08, T10, T11 for step 3 |
| `34bfe9b` | `c6f69ac` | feat(skills): game-queue-optimization + game-queue-quality-check |
| `662a6c0` | `0617987` | feat(plugin): inblack-guard Stop hook blocks finishing while npm test fails |
| `4f2eafe` | `065ab1e` | feat(mcp): Streamable HTTP MCP server with run_scenario, score_plan, explain_order |
| `4896a07` | `a235488` | docs(review): T08 MCP server review - REJECT (unlogged unknown-tool call, wrong explain text, D-id) |
| `25f97ac` | `94e647a` | fix(mcp): log every tools/call, correct explain_order unpaid reason, cite D1 |
| `5e89b35` | `85f79af` | docs(review): T08 round 2 - APPROVE (F1-F3, R1-R4 verified fixed at 25f97ac) |
| `fe928b3` | `aca6969` | Merge agent/backend: T08 MCP server (QA round 1 REJECT, round 2 APPROVE) |
| `ea8ea47` | `9ae8de8` | Merge agent/qa: T08 review (REJECT 4896a07, APPROVE 5e89b35) |
| `8003699` | `4a59cf5` | docs(log): step 3 evidence — real Stop-hook block, skill use, agent MCP calls, T08 rejection |
| `08795e6` | `89a2130` | docs(tasks): close T08, T10, T11; align plugin paths and skill rule wording |
| `ed4119b` | `7f0505e` | chore(tasks): Checkpoint 2 approved, lock generator at b073430; claim T06, T07, T09 |
| `a205aff` | `9893f8f` | test(planner): T09 spec tests for every planner strategy |
| `698e106` | `21c3545` | feat(bench): T07 benchmark runner for tuning and held-out seed sets |
| `7c3efc7` | `5d72ca9` | feat(bench): record fcfs benchmark output at 698e106, T07 to review |
| `211dd18` | `487cd7f` | feat(strategy): EDF, VIP, cheapest (wallet-aware), profit-aware list strategies |
| `dd6563a` | `c39ef01` | docs(tasks): T09 phase 1 evidence |
| `10d5630` | `336e2b2` | feat(strategy): hybrid with insertion/swap/skip/supplier local search |
| `4a3692f` | `840e4e8` | docs(tasks): T06 test evidence, per-strategy tuning and held-out results, status review |
| `b1e4232` | `6988010` | docs(review): T06 strategies review - REJECT (D4 wallet float overspend W1) |
| `024f753` | `892bf65` | fix(strategy): conservative per-supplier wallet margin (D4/D4b, QA F1) |
| `dd725a1` | `3008f11` | docs(review): T07 benchmark review - REJECT (medians from rounded values) |
| `43790e3` | `8600afc` | fix(bench): aggregate unrounded per-seed score % (T07 QA F1) |
| `78f386e` | `c545c41` | fix(bench): regenerate fcfs benchmark output at 43790e3, T07 back to review |
| `d7deeb1` | `74fc442` | docs(review): T06 round 2 - APPROVE (wallet margin fix 024f753) |
| `aa3abfa` | `65fe14c` | docs(review): T07 round 2 - APPROVE (unrounded aggregation 43790e3) |
| `7939561` | `272bb9b` | Merge agent/strategy: T06 strategies + hybrid local search (QA REJECT b1e4232 wallet float, APPROVE d7deeb1) |
| `b5a8be5` | `eba7ecb` | Merge agent/backend: T07 benchmark (QA REJECT dd725a1 median rounding, APPROVE aa3abfa) |
| `9ae146d` | `8133cca` | Merge agent/qa: T09 planner spec tests, T06/T07 reviews, WRONG_CASES |
| `85c7280` | `e84763d` | test(planner): make W1 wallet float-exhaust test a normal test |
| `60cb212` | `8f1b2ce` | Merge agent/qa: W1 wallet test now a normal test (85c7280) |
| `4c6215e` | `f4d3f2c` | docs(log): step 4 parallel wave — T06/T07 rejections, fixes, round-2 approvals, merges |
| `437fdf2` | `a0a875d` | docs(tasks): close T06, T07, T09 at merge |
