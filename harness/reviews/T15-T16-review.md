# Review — T15 (STRATEGY.md) + T16 (planner default = hybrid)

Reviewer: qa-reviewer · Step 5 · Date: 2026-11-18
Branch reviewed: `agent/strategy` at `7c1d2ac` (cec8188, dec03c8 merge of main 643a6bf, 14fb7ee, 7c1d2ac)
Method: `git archive agent/strategy` into a scratch dir, `npm install`, every command below run there. I did not edit the branch.

## VERDICT: APPROVE

## 1. Scope
`git diff --name-only main...agent/strategy` gives `STRATEGY.md`, `harness/tasks/T15.md`, `harness/tasks/T16.md`, `src/planner.js`. All four are owned by strategy-optimizer. No `harness/scenarios/*.json` changed. `src/` has no `require` of `harness/`. No secrets found in the changed files.

## 2. T16 — planner default (D10 gate, D15)
| check | result |
|---|---|
| `node src/planner.js seed-1.json a.json` (no flag) | stderr `planner: strategy=hybrid assigned=267 skipped=32` |
| no-flag plan vs `--strategy hybrid` plan | `cmp` identical |
| two no-flag runs | `cmp` identical (deterministic) |
| `--strategy fcfs` | runs, plan differs from hybrid, seed 1 = 74.89 % (paid) |
| `--strategy bogus` | throws `unknown strategy bogus; available: fcfs,edf,vip,cheapest,profit,hybrid`, rc=1 |
| exports | `DEFAULT_STRATEGY='hybrid'`, `RECOMMENDED_STRATEGY='hybrid'` (alias), `STRATEGY_NAMES` lists 6 |
| `npm test` (scratch copy of 7c1d2ac) | `tests 350, pass 350, fail 0` |

The diff is small: `plan()` defaults to `DEFAULT_STRATEGY`, the CLI label uses it, and the old trailing `RECOMMENDED_STRATEGY` constant became an alias. Nothing else in the planner changed.

## 3. Gate: all 20 seeds, both bases, default + strict
For each seed I ran the no-flag CLI, then `harness/score.js` 4 times (`--sla-basis paid|arrive`, with and without `--strict`).
- All 80 runs: `violations=0 duplicates=0`. Default and strict score % are the same on every seed.
- Held-out paid, sorted: 46.61, 47.01, 62.09, 66.85, 69.93 | 77.60, 81.06, 81.87, 86.33, 86.36. Median = **73.77** (≥ 65).
- Held-out arrive, sorted: 45.35, 46.39, 61.03, 65.44, 68.48 | 76.66, 80.06, 80.06, 84.83, 85.40. Median = **72.57** (≥ 65).
- `node harness/benchmark.js --no-write --strategies fcfs,edf,vip,cheapest,profit,hybrid` gives `Gate ... fcfs=PASS edf=PASS vip=PASS cheapest=PASS profit=PASS hybrid=PASS`.

## 4. STRATEGY.md numbers vs real runs
- **Strategies-tried table** (held-out median paid/arrive): fcfs 59.16/57.96, edf 59.25/58.11, vip 59.62/58.47, cheapest 71.58/68.65, profit 72.47/69.96, hybrid 73.77/72.57. All match the benchmark output.
- **Result vs FCFS table** (8 rows: median/mean/min/max, viol, dup, gate): every cell matches the benchmark output.
- Gain +14.61 / +14.61 is correct (73.77−59.16, 72.57−57.96). "Held-out 4.4–4.6 below tuning" is also correct (78.16−73.77 = 4.39, 77.18−72.57 = 4.61).
- Gate section, npm test 350/350: reproduced.

## 5. The 3 losing cases (exactly 3, each with scenario / what happens / root cause / improvement / trade-off)
**W2 — VIP at shift start.** I built the scenario as described (staff [100,200)×1, VIP rov 500, arrive=paid=100, SLA 5, S1 0.9).
- The planner starts at 101 and scores total 48.00, 96.00 %, SLA −2.00 (default and strict).
- A hand plan starting at 100 scores 50.00 with 0 violations under default and `--strict`.
- Reproduced.

**W3 — end of day.** I built the scenario as described (staff [0,1440)×1, rov 500, arrive=paid=1434, SLA 30).
- The planner returns `assignments: []` and scores −25.00 (unprocessed −25.00).
- A hand plan starting at 1434 scores +50.00 with 0 violations under both checkers.
- Frozen-seed claim, checked with my own script: 350 paid orders are undone across the 20 seeds. 10 of them have earliest start ≥ 1434: seed 1 O299@1439; seed 4 O317, O318 @1439; seed 103 O306@1439; seed 104 O282@1437; seed 108 O289, O290 @1436; seed 109 O303@1437, O304@1438, O305@1437. That covers seeds {1,4,103,104,108,109}, range 1436–1439, and none falls in 1434–1435. Reproduced exactly.

**W4 — wallets exhausted (seeds 10 and 6).** Checked with my own script from the scenario and plan files.
- Seed 10: 266 paid, 266 assigned, `overSla=0 violations=0`, profit 3534.40, maxProfit 7582.60, 46.61 % / 45.35 %. Wallet left: S5 8.7, S3 3.0, S1 7.6. S4 used 10951.3. The relaxed cheapest-first wallet bound is 3540.14, which is 46.69 % of D3 max. The planner reaches **99.84 %** of that bound ("99.8 %" is correct).
- Seed 6: 47.01 %, 58 paid rov orders undone (value 16950, penalty −847.50). S3 is the only rov supplier: wallet 5950 at cost 0.85, so it can serve 7000 of value. Served value is **6990, all rov**. 10 THB of capacity is left, and the smallest undone rov order is 50. Reproduced, and the root cause holds: no non-rov spend on S3 crowds out rov.

All claims in STRATEGY.md and T15/T16 test evidence reproduce. I could not falsify any of them.

## Non-blocking notes
1. STRATEGY.md header says "base `af6eb55`", but the reviewed head is 7c1d2ac (after merging main 643a6bf). The numbers are the same on 7c1d2ac, so this is cosmetic.
2. No test pins "no-flag CLI == hybrid". After merge, QA should add a planner CLI test (D10/T16). It cannot go on agent/qa now because main still defaults to fcfs and the test would turn `npm test` red.
3. W4's relaxed bound ignores games. On seed 6 it is 6297.39 (62.12 % of D3 max), and the planner reaches 89.14 % of it. STRATEGY.md quotes the 99.8 % figure only for seed 10, which is correct as written.
