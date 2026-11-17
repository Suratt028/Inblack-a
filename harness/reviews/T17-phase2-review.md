# T17 phase 2 review — benchmark of main acb18ec (hybrid default)

- Reviewer: qa-reviewer (agent/qa)
- Under review: agent/backend `72ed90f` (parent = main `acb18ec`)
- Date: 2026-11-18

## VERDICT: APPROVE

## Scope
`git diff --stat acb18ec 72ed90f`: only `harness/benchmarks/acb18ec.json` (new), `harness/benchmarks/latest.json`, `harness/tasks/T17.md`. All are owned by backend-mcp (T17 "files owned"). Single commit, no other paths touched.

## Reproduction
1. `git archive acb18ec` into scratch, `npm ci`, `node harness/benchmark.js --no-write` → exit 0. The table matches, but the header says `commit=nogit (intact=false)` because an archive has no `.git`. That is expected, and it means an archive alone cannot check the commit/lock fields.
2. So I also made a local `git clone` in scratch, ran `git checkout --detach acb18ec` and `npm ci` (the tree is clean), then `node harness/benchmark.js --out-dir <scratch>/out` → `Benchmark commit=acb18ec generatorLock=b2a5da2 (intact=true)`.
3. Deep JSON diff of committed `acb18ec.json` against fresh `out/acb18ec.json`: **1 difference, `.timestamp` only** (`2026-11-17T18:25:47.585Z` vs `18:27:31.793Z`). Committed `acb18ec.json` and `latest.json` are byte-identical (`cmp` = 0). Fresh `acb18ec.json` and `latest.json` are also identical.

## Header fields (committed JSON)
commit `acb18ec`, commitFull `acb18ec67008b7a51bffb69affe474708b1b336c`, dirty `false`, generatorLock `b2a5da2`, generatorLockIntact `true`. seedSets: tuning 101–110, heldout 1–10 (D15). bases `[paid, arrive]`, modes `[default, strict]`.

## Coverage, violations and duplicates
results has 6 strategies (fcfs, cheapest, edf, hybrid, profit, vip). Each strategy has 2 sets × 10 seeds × 2 bases × 2 modes, so 480 cells in total. **Every cell has violations = 0 and duplicates = 0.** Every set has 10 seeds.

## Hybrid held-out median (recomputed from perSeed, default checker)
paid 73.7655 → **73.77**; arrive 72.5720 → **72.57**. Both are ≥ 65 (completion criterion). The fcfs deltas in T17.md (+14.61 / +14.61) are correct: 73.77−59.16 and 72.57−57.96.

## Per-seed cells against `harness/score.js --json` (generator → planner → score.js in the acb18ec clone)
| strategy | seed | basis/mode | JSON scorePct / total | score.js scorePct / total |
|---|---|---|---|---|
| hybrid | 3 | paid/default | 69.92960905104947 / 7639.599999999999 | identical |
| hybrid | 3 | arrive/default | 68.48334508041411 / 7481.599999999999 | identical |
| hybrid | 3 | paid/strict | 69.92960905104947 / 7639.599999999999 | identical |
| hybrid | 107 | paid / arrive / strict | 83.3667 / 81.7968 / 83.3667 | identical (full precision) |
| fcfs | 9 | paid / arrive / strict | 70.5629 / 69.3945 / 70.5629 | identical (full precision) |
| profit | 1 | paid / arrive / strict | 85.7355 / 84.4166 / 85.7355 | identical (full precision) |

The no-flag CLI plan for seed 3 is byte-identical to the `--strategy hybrid` plan (`cmp` = 0).

## T17.md
Status moved from in_progress to review. The phase 2 evidence table matches the fresh benchmark output exactly, for all 24 rows.

## Added test (QA scope)
`harness/tests/planner.cli.test.js`: "T16 CLI default (no --strategy) uses exported DEFAULT_STRATEGY (hybrid) — byte-identical plan on seed-1". It checks that the export exists, equals `hybrid`, and is a listed strategy. It then checks that the no-flag plan equals the `--strategy DEFAULT_STRATEGY` plan byte for byte, and that it differs from the fcfs plan, so the test can tell the two apart.
- Mutation check (scratch clone only): with `DEFAULT_STRATEGY = 'fcfs'` the test fails (pass 17 / fail 1).
- `npm test` on agent/qa: tests 351, pass 351, fail 0.

## Notes (non-blocking)
- `--no-write` on an archive cannot verify commit/dirty/lock fields, so reproducing those needs a git checkout. This is a limitation of how the tool is used, not a defect in T17.
