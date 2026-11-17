# hash-map — commit hashes before / after the metadata rewrite

Before the first push to GitHub (2026-11-17/18), the user chose to (1) replace a personal e-mail with the GitHub noreply address and (2) replace a personal author name with `surat` in commit metadata (`git filter-branch --env-filter` on `main` only, excluding the GitHub-created Initial commit; file trees unchanged — final tree identical).
Log files, reviews and task files written before that cite the **old** short hashes. Use this table to find the commit on the published `main`.

## Original hash → published hash

| old | published | subject |
|---|---|---|
| `dbde10a` | `5d04dc2` | T01: scaffold, plan, task registry, ownership, agent definitions, DECISIONS_INPUT |
| `b073430` | `b2a5da2` | T02: deterministic seeded scenario generator + 20 scenarios |
| `257c8d2` | `91d9fab` | T03: validator, scorer and score CLI per DECISIONS_INPUT D1-D14 |
| `32850ca` | `c84710c` | Lead: add authoritative I/O format to CLAUDE.md (gap found by strategy-optimizer) |
| `b963dde` | `14b4bf7` | T05: FCFS baseline planner, own feasibility model with D10 margins, explain side file |
| `0e18b7d` | `540589b` | T04: spec tests for validator, scorer, generator, CLI (written from D1-D15 only) |
| `7fe812e` | `d370f23` | T03: fix npm test glob |
| `48b1cbd` | `c7481a5` | T05: official scenario format only, per-supplier wallet, staff occupancy [s,s+5) |
| `8b7e030` | `d7f0fae` | Merge agent/backend: T02 generator, T03 validator+scorer+CLI |
| `f7b962d` | `3364344` | Merge agent/strategy: T05 FCFS baseline planner |
| `cfca272` | `9d616c9` | Lead: log merges and FCFS baseline scoring |
| `5cafbaa` | `6efbfa4` | T04: align fixtures to CLAUDE.md I/O format, run against backend 7fe812e, T03 review APPROVE |
| `d2bd804` | `773ca37` | Merge agent/qa: T04 independent spec tests + T03 review (APPROVE) |
| `428dda2` | `f2e55b1` | Lead: Checkpoint 2 state — tasks T01-T05 done, test log |
| `08dc08b` | `d5fd510` | docs(harness): HARNESS.md team process + code-reviewer/committer commit gate |
| `0e56da2` | `17ed797` | docs(log): session 2 restore, step 1 review rounds and test run |
| `b05a3de` | `5ec8e80` | chore(tasks): claim T08, T10, T11 for step 3 |
| `34bfe9b` | `fa6b7f1` | feat(skills): game-queue-optimization + game-queue-quality-check |
| `662a6c0` | `f13794e` | feat(plugin): inblack-guard Stop hook blocks finishing while npm test fails |
| `4f2eafe` | `484663d` | feat(mcp): Streamable HTTP MCP server with run_scenario, score_plan, explain_order |
| `4896a07` | `a7c7702` | docs(review): T08 MCP server review - REJECT (unlogged unknown-tool call, wrong explain text, D-id) |
| `25f97ac` | `890e1f5` | fix(mcp): log every tools/call, correct explain_order unpaid reason, cite D1 |
| `5e89b35` | `885e956` | docs(review): T08 round 2 - APPROVE (F1-F3, R1-R4 verified fixed at 25f97ac) |
| `fe928b3` | `654e997` | Merge agent/backend: T08 MCP server (QA round 1 REJECT, round 2 APPROVE) |
| `ea8ea47` | `6dcb6a9` | Merge agent/qa: T08 review (REJECT 4896a07, APPROVE 5e89b35) |
| `8003699` | `2200326` | docs(log): step 3 evidence — real Stop-hook block, skill use, agent MCP calls, T08 rejection |
| `08795e6` | `05174c6` | docs(tasks): close T08, T10, T11; align plugin paths and skill rule wording |
| `ed4119b` | `c67f66c` | chore(tasks): Checkpoint 2 approved, lock generator at b073430; claim T06, T07, T09 |
| `a205aff` | `51bb3ef` | test(planner): T09 spec tests for every planner strategy |
| `698e106` | `f8e9aea` | feat(bench): T07 benchmark runner for tuning and held-out seed sets |
| `7c3efc7` | `b696577` | feat(bench): record fcfs benchmark output at 698e106, T07 to review |
| `211dd18` | `676a054` | feat(strategy): EDF, VIP, cheapest (wallet-aware), profit-aware list strategies |
| `dd6563a` | `16cd2e4` | docs(tasks): T09 phase 1 evidence |
| `10d5630` | `9114d35` | feat(strategy): hybrid with insertion/swap/skip/supplier local search |
| `4a3692f` | `6fc1efa` | docs(tasks): T06 test evidence, per-strategy tuning and held-out results, status review |
| `b1e4232` | `9f0ff92` | docs(review): T06 strategies review - REJECT (D4 wallet float overspend W1) |
| `024f753` | `8a39c15` | fix(strategy): conservative per-supplier wallet margin (D4/D4b, QA F1) |
| `dd725a1` | `9312911` | docs(review): T07 benchmark review - REJECT (medians from rounded values) |
| `43790e3` | `6cf17eb` | fix(bench): aggregate unrounded per-seed score % (T07 QA F1) |
| `78f386e` | `1eafc7a` | fix(bench): regenerate fcfs benchmark output at 43790e3, T07 back to review |
| `d7deeb1` | `ecd3269` | docs(review): T06 round 2 - APPROVE (wallet margin fix 024f753) |
| `aa3abfa` | `a30be7d` | docs(review): T07 round 2 - APPROVE (unrounded aggregation 43790e3) |
| `7939561` | `2218269` | Merge agent/strategy: T06 strategies + hybrid local search (QA REJECT b1e4232 wallet float, APPROVE d7deeb1) |
| `b5a8be5` | `bc75581` | Merge agent/backend: T07 benchmark (QA REJECT dd725a1 median rounding, APPROVE aa3abfa) |
| `9ae146d` | `cde87ee` | Merge agent/qa: T09 planner spec tests, T06/T07 reviews, WRONG_CASES |
| `85c7280` | `d8ab6f6` | test(planner): make W1 wallet float-exhaust test a normal test |
| `60cb212` | `c26457c` | Merge agent/qa: W1 wallet test now a normal test (85c7280) |
| `4c6215e` | `c2c7898` | docs(log): step 4 parallel wave — T06/T07 rejections, fixes, round-2 approvals, merges |
| `437fdf2` | `e6767ee` | docs(tasks): close T06, T07, T09 at merge |

## Commits made between the two rewrites (never published)

| intermediate | published | subject |
|---|---|---|
| `6770c31` | `35b6f3a` | chore: merge GitHub Initial commit (README) into main |
| `d5e429a` | `dfce04f` | docs(log): author-email rewrite before first push, old→new hash map, lock hash note |
| `a7a5c17` | `ee173ef` | Merge agent/backend: generator lock hash 46d1736 after author-email rewrite |
| `39ec713` | `cdbf337` | fix(bench): update generator lock hash b073430 -> 46d1736 after author-email rewrite |

Note: between the two rewrites the T02 generator commit was briefly `46d1736` (cited in DECISIONS_INPUT.md and T07.md); its published hash is `b2a5da2`.
