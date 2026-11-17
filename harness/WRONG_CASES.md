# WRONG_CASES — where the planner still loses points or misbehaves

Owner: qa-reviewer (T09). Every entry comes from a real run (commit, command, output). Scores from
`node harness/score.js <scenario> <plan> --json` (D1 paid basis unless stated).

| ID | Found | Strategy | Scenario | Planner output | Score | Expected | Status |
|---|---|---|---|---|---|---|---|
| W1 | T06 review, agent/strategy 4a3692f | all 6 (fcfs, edf, vip, cheapest, profit, hybrid) | S1 wallet 117, cost_pct 0.9; A value 51 paid 10; B value 79 paid 20 | both assigned on S1 (10, 20) | **WALLET violation**, total −98.85 (default and `--strict`) | serve only one of them (or wallet check conservative): 0 violations (D4, D4b) | **fixed** in agent/strategy 024f753 (wallet margin 1e-6); `planner.edge.test.js` W1 passes for all 6 on 024f753 (T06 round 2); todo flag removed once the fix is on main |
| W2 | T06 review | hybrid (planner model margin) | staff [100,200) ×1; VIP order paid/arrive 100, SLA 5 | start 101 | 48 (1 late minute ×2) | start 100 passes `--strict` → 50 | known loss: 1-minute D10 margin beyond strict, kept by user decision 2026-11-17 |
| W3 | T06 review | hybrid (planner model `DAY_END=1438`) | staff all day; order paid/arrive 1434, SLA 30 | not assigned | −5 | start 1434, finish 1439 passes `--strict` → 50 | known loss: 1-minute D10 margin beyond strict, kept by user decision 2026-11-17 |
| W4 | T06 review | hybrid (best) | frozen seeds 2, 6, 10 (held-out) and 103, 108, 110 (tuning) | 0 violations | 62.09, 47.04, 46.61 / 56.63, 63.34, 54.48 (paid) | ≥ 65 | structural: wallets of cheap suppliers run out (seed 10: every paid order done, 0 penalties, profit 3534.4 vs D3 max 7582.6; seed 6: 54 paid orders not done, −847). D3 max ignores wallets. |

## Reproduction (W1–W3)
Scenario files are built inline in `harness/tests/planner.edge.test.js` (W1) and in the T06 review
(`harness/reviews/T06-review.md`). Run e.g.
```
node src/planner.js w1.json plan.json --strategy hybrid
node harness/score.js w1.json plan.json --json --strict
```
