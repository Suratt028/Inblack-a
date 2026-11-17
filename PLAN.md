# INBLACK GAMING — Project A — Checkpoint 1 Plan

Status: **WAITING FOR APPROVAL (Checkpoint 1)**. No implementation code has been written.
Sources read: `challenge.pdf` (13 pages, Thai; Project A = pages 2–6) and the Technical Lead prompt.

---

## 1. Requirement → implementation matrix

| # | Requirement (source) | Implementation | Owner | Task | Verified by |
|---|---|---|---|---|---|
| R1 | 1 staff, exactly 5 min per order (PDF rules) | validator: staff-minute occupancy array 0..1439 | backend-mcp | T03 | QA tests T04 |
| R2 | Start only after payment; unpaid never processed | validator rule `UNPAID`, `BEFORE_PAID` | backend-mcp | T03 | T04 |
| R3 | Start and finish within day 0–1440 | validator rule `OUT_OF_DAY` | backend-mcp | T03 | T04 boundary tests |
| R4 | Never exceed headcount / respect shifts | validator rule `OVER_STAFF` (per-minute capacity = sum of covering shifts) | backend-mcp | T03 | T04 |
| R5 | Supplier supports game, no outage, wallet enough, never overspent | validator rules `UNSUPPORTED_GAME`, `OUTAGE`, `WALLET` | backend-mcp | T03 | T04 |
| R6 | Never submit same order twice → whole run 0 | scorer `duplicates>0 ⇒ total=0` | backend-mcp | T03 | T04 |
| R7 | Scoring table + score % formula | `harness/scorer.js`, per-order breakdown | backend-mcp | T03 | T04 + Checkpoint 2 |
| R8 | One command shows score and where points were lost | `node harness/score.js scenario.json plan.json` | backend-mcp | T03 | T04 |
| R9 | Seeded generator, 10 scenarios × ~300 orders, VIP, games, outages, wallets, shifts, unpaid | `harness/generator.js --seed N` → `harness/scenarios/seed-N.json` | backend-mcp | T02 | T04 determinism test |
| R10 | `node src/planner.js scenario.json plan.json`; no harness imports | `src/planner.js` + `src/strategies/*` | strategy-optimizer | T05, T06 | T09 import-guard test |
| R11 | FCFS baseline + EDF, profit-aware, VIP, cheapest-supplier, hybrid + local search | `src/strategies/` | strategy-optimizer | T05, T06 | T07 benchmark |
| R12 | Median ≥ 65%, 0 dup, 0 violations on 10 seeds | `harness/benchmark.js` → `harness/benchmarks/*.json` | backend-mcp (runner) / strategy-optimizer (score) | T07, T06 | Checkpoint 3 |
| R13 | STRATEGY.md + 3 losing cases | `STRATEGY.md` | strategy-optimizer | T15 | T09 review |
| R14 | MCP server, official SDK, Streamable HTTP `localhost:3000/mcp`, 3 tools with schemas/validation/logging | `mcp/server.js`, `mcp/tools/{run_scenario,score_plan,explain_order}.js` | backend-mcp | T08 | real SDK client: initialize, ping, tools/list, tools/call ×3 |
| R15 | 2 Skills | `.claude/skills/game-queue-optimization/`, `.claude/skills/game-queue-quality-check/` | Lead | T10 | invoked in session, logged |
| R16 | Plugin (manifest) with hook that blocks completion when tests fail; real block ≥1 | `plugins/inblack-guard/.claude-plugin/plugin.json` + `hooks/hooks.json` (Stop event) + `.claude/hooks/run-tests.sh` | Lead | T11 | `AGENT_LOG/hook-events.md` |
| R17 | 3 sub-agents, separate worktrees, parallel, QA rejects ≥1 real change | `.claude/agents/*.md`, `harness/worktrees/<agent>`, branches `agent/<name>` | Lead | all | git history + `AGENT_LOG/rejected-work.md` |
| R18 | GitHub Actions; REST API called in Actions for per-commit chart | `.github/workflows/ci.yml`, `pages.yml`; `GET /repos/{o}/{r}/actions/runs` + artifacts with `GITHUB_TOKEN` | backend-mcp | T12 | workflow logs |
| R19 | Website 3 pages, real data, responsive, loading/error states, GitHub Pages | `site/index.html`, `replay.html`, `team.html` | Lead | T13 | open live site, compare numbers to benchmark JSON |
| R20 | Docs: HARNESS, STRATEGY, DECISIONS (user's), README, AGENT_SETUP, CLAUDE.md, AGENT_LOG | as named | Lead (DECISIONS.md = **you**) | T14 | checklist |
| R21 | No secrets in repo/logs | `GITHUB_TOKEN` only in Actions; secret-scan step in CI | backend-mcp / Lead | T12 | CI grep step |

---

## 2. Ambiguities — please answer (Section 3)

Each has my **recommended default** so you can just reply "accept all" or override by number. Answers go verbatim into `harness/DECISIONS_INPUT.md` and are cited by ID (`D1`…) in tests.

| ID | Question | Options | Recommended |
|---|---|---|---|
| D1 | SLA clock starts at | (a) `arrive_minute` (b) `paid_minute` | **(b) paid_minute** — we cannot legally start before payment, so a slow payer should not cost us SLA points |
| D2 | Lateness measured at | (a) start (b) finish = start+5 | **(b) finish**: `late = max(0, start+5 − (clock+sla))` |
| D3 | Max possible profit | (a) ignore staff, wallet, outages — just cheapest *supporting* supplier per paid order (b) staff-aware | **(a)** — literal PDF wording ("every paid order with the cheapest supplier, no penalties") |
| D3b | Paid order whose game no supplier supports at all | (a) excluded from max profit and from −5% (b) included in both | **(a)** excluded from both (impossible order); generator will make these rare |
| D4 | Wallet | deducted per order, shared across the whole day; amount deducted = ? (a) `value_thb × cost_pct` (b) `value_thb` | **shared for the day, deduct (a) cost**; never replenished |
| D4b | Wallet check order | assignments processed by `start_minute`, then `order_id`; the first one that would overspend is the violation | **as stated** |
| D5 | Finishing after 1440 | is a rule violation | **yes**: `OUT_OF_DAY` (−100) |
| D6 | Scoring of an invalid assignment | (a) −100 only, no profit, and the paid order *also* gets −5% not-done (b) −100 only | **(a)** — invalid work is not completed work |
| D7 | Does an invalid assignment consume staff/wallet for later checks? | (a) no — rejected items are removed before checking the rest (b) yes | **(a)** — one bad item does not cascade into many |
| D8 | Duplicate | same `order_id` appears ≥2 times in `assignments` (valid or not) ⇒ total score 0, score % 0 | **as stated** |
| D9 | Unknown `order_id` / unknown `supplier_id` / non-integer minute | rule violation −100 each | **yes** |
| D10 | Interval semantics | outages `[start,end)` half-open; shift `from..to` = `[from,to)`; order occupies `[s, s+5)` | **half-open everywhere**; order valid iff `[s,s+5)` ⊆ shift coverage and ∩ outage = ∅ |
| D11 | Overlapping shifts | capacity at minute m = sum of `count` of shifts covering m | **sum** |
| D12 | Start also ≥ `arrive_minute`? | yes / no | **yes** (`start ≥ max(arrive, paid)`); generator guarantees `paid ≥ arrive` |
| D13 | Tie-breaking (planner & scorer) | deterministic | **priority desc, then start asc, then supplier cost asc, then id lexicographic asc** |
| D14 | Negative score % | report as is / clamp at 0 | **report as is** |
| D15 | Generator difficulty | frozen at Checkpoint 2 **before** planner tuning, so we can't tune the data to the planner | **freeze params + commit hash in DECISIONS_INPUT.md** |

---

## 3. Team, ownership map, execution model

| Agent | Branch / worktree | Owns (exclusive write) |
|---|---|---|
| **strategy-optimizer** | `agent/strategy` · `harness/worktrees/strategy` | `src/**`, `STRATEGY.md` |
| **backend-mcp** | `agent/backend` · `harness/worktrees/backend` | `harness/generator.js`, `harness/validator.js`, `harness/scorer.js`, `harness/score.js`, `harness/benchmark.js`, `harness/lib/**`, `harness/scenarios/**`, `harness/benchmarks/**`, `harness/reports/**`, `mcp/**`, `.github/workflows/**`, `package.json` |
| **qa-reviewer** | `agent/qa` · `harness/worktrees/qa` | `harness/tests/**`, `harness/WRONG_CASES.md`, `harness/reviews/**` |
| **Lead (me)** | `main` | `CLAUDE.md`, `.mcp.json`, `.claude/**`, `plugins/**`, `site/**`, `HARNESS.md`, `README.md`, `AGENT_SETUP.md`, `AGENT_LOG/**`, `harness/DECISIONS_INPUT.md`, `PLAN.md` |
| **You** | — | `DECISIONS.md` (I only record your words verbatim, on request) |

Task files `harness/tasks/Txx.md`: only the task's owner edits its file; Lead edits `status` on merge/reject.

Collision rules: an agent touching a file outside its list = automatic rejection at merge (`git diff --name-only main...agent/x` checked against the map). Planner and scorer share **no code** (independent feasibility logic = cross-check).

Merge gate (Lead): branch rebased on `main` → full test suite green → QA review note in `harness/reviews/` → merge `--no-ff` (so parallel branches stay visible in history). QA "REJECT" → task back to `in_progress`, logged in `AGENT_LOG/rejected-work.md`.

"Which strategy is better" = higher **median score %** on the 10 frozen seeds, with 0 violations and 0 duplicates on every seed as a hard gate; ties broken by min score %.

---

## 4. Architecture

```
scenario.json ──► src/planner.js ──► plan.json
                  (strategies/, own feasibility model; no harness imports)
                                         │
harness/generator.js --seed N ──► harness/scenarios/seed-N.json
                                         ▼
                    harness/validator.js ─► harness/scorer.js ─► per-order report
                    harness/score.js  (CLI: total, %, where points were lost)
                    harness/benchmark.js (10 seeds × {fcfs, best}) ─► harness/benchmarks/<sha>.json
                                         │
mcp/server.js (SDK, Streamable HTTP :3000/mcp)
   run_scenario  → generator/load + spawn planner + scorer
   score_plan    → validator + scorer
   explain_order → planner trace (src emits `reasons` side-file) + scorer line
                                         │
GitHub Actions: test → benchmark → REST API (actions/runs + artifacts) → site/data/*.json → Pages
site/: index (score vs FCFS, KPIs, score-per-commit chart) · replay (queue / staff / supplier / reasons) · team (tasks/agents/rejections from harness/tasks + git)
Claude layer: .claude/agents (3), .claude/skills (2), plugins/inblack-guard (Stop hook → npm test; exit 2 blocks)
```

Planner approach (to be confirmed by benchmark, not promised): FCFS baseline → priority scheduling on a minute-slot capacity grid (EDF / profit-density / VIP weights) with cheapest-feasible-supplier and wallet reservation → insertion/swap local search optimising the official score (deterministic seed).

---

## 5. Task registry (see `harness/tasks/`)

| ID | Title | Owner | Depends on | Parallel wave |
|---|---|---|---|---|
| T01 | Repo scaffold, CLAUDE.md, .mcp.json, agents defs, ownership | Lead | CP1 | 0 |
| T02 | Seeded generator | backend-mcp | T01 | 1 |
| T03 | Validator + scorer + score CLI | backend-mcp | T01, D-answers | 1 |
| T04 | Independent scorer/validator tests from spec | qa-reviewer | T01, D-answers | 1 (parallel to T02/T03) |
| T05 | FCFS baseline planner + I/O | strategy-optimizer | T01 | 1 |
| — | **Checkpoint 2** (scorer + tests approved) | You | T02–T04 | |
| T07 | Benchmark runner (10 seeds) | backend-mcp | T02, T03 | 2 |
| T06 | Strategies + hybrid local search, ≥65% median | strategy-optimizer | CP2, T07 | 2 |
| T08 | MCP server + 3 tools + integration tests | backend-mcp | T03 | 2 (parallel to T06) |
| T09 | Planner review, edge cases, WRONG_CASES, ≥1 real rejection | qa-reviewer | T06 | 2 |
| T10 | Two skills | Lead | T03, T05 | 2 |
| T11 | Plugin + Stop hook + real block demo | Lead | T04 | 2 |
| T15 | STRATEGY.md + 3 losing cases | strategy-optimizer | T06 | 2 |
| — | **Checkpoint 3** (benchmark approved) | You | T06, T07, T09 | |
| T12 | GitHub Actions + REST API + Pages | backend-mcp | CP3 | 3 |
| T13 | Website 3 pages | Lead | T12 | 3 |
| T14 | Docs + AGENT_LOG + final report | Lead | all | 4 |

---

## 6. Implementation plan

1. **After CP1 approval**: T01 scaffold on `main`; write `harness/DECISIONS_INPUT.md` with your answers; create 3 worktrees; dispatch backend-mcp (T02+T03), qa-reviewer (T04) and strategy-optimizer (T05) **in parallel** as real subagents. QA writes tests from the spec + D-answers only, without reading the scorer.
2. Merge gate; run all tests; **Checkpoint 2** — show scorer formula, test output, generator params.
3. T07 benchmark, then T06 strategies (iterate on worst seeds, record before/after) ∥ T08 MCP ∥ T10/T11. QA T09 reviews planner and must reject when it finds a real defect.
4. **Checkpoint 3** — per-seed table, median/mean/min/max vs FCFS.
5. T12 Actions + Pages, T13 site, T14 docs, verify live site numbers vs benchmark JSON, final report + submission message.

---

## 7. Environment risks I need you to know now

| # | Issue | Impact | Proposed handling |
|---|---|---|---|
| E1 | I am running in a cloud workspace linked to your PC; your folder `C:\Users\pad\inblack-a` blocks file deletion by default, and **git needs to delete its own lock files** to commit/merge | commits/worktrees in your folder would fail | **Work in my cloud workspace (git + worktrees + subagents), push to GitHub, and mirror the repo into your folder** at each checkpoint. Alternative: you grant delete permission on that folder and I work there directly. |
| E2 | No working GitHub auth in my workspace, and your folder's VM has no `gh` | can't create repo, push, or run Actions | Please create the **public** repo `inblack-a` on your GitHub account (empty), then tell me the owner name; I'll attach it with push access through the session's GitHub connection (no token in any file). |
| E3 | Plugin Stop hook must fire in a real Claude Code session | I can build and test the hook, but whether this hosted session loads a repo plugin's Stop hook isn't guaranteed | I'll try here and log honestly. If it doesn't load here, the real block demo is: you run `claude` locally in the repo (2 minutes, I'll give exact steps) and the log is captured from that run. I will not fake it. |
| E4 | MCP on `localhost:3000` | runs in my workspace | verified there with the official SDK client; README gives you the command to run it locally too |
