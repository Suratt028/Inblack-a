# STRATEGY — planner vs first-come-first-served

Owner: strategy-optimizer (T15/T16). All numbers below come from real runs on branch `agent/strategy`
(base `af6eb55`, generator lock `b2a5da2`, intact). Rules: `PLAN.md` §2 and `harness/DECISIONS_INPUT.md` (D1–D15).

## Approach: `hybrid` (made the default of `node src/planner.js` / `plan()` by T16)
`src/planner.js` uses its own feasibility model (`src/model/feasibility.js`, no `harness/` import). That model
is more conservative than both checkers (D10): a 1-minute margin around shift and outage boundaries,
finish ≤ 1438, and a wallet check with a 1e-6 margin (D4/D4b).

`hybrid` (`src/strategies/hybrid.js`):
1. Builds 3 deterministic priority orders: VIP-weighted EDF, FCFS (paid, then arrive), plain EDF.
2. Decodes each one greedily. Every order goes to the earliest feasible start on the cheapest supplier that
   still has wallet for it. An order is skipped when serving it would not raise the objective.
3. Keeps the best decoding, then runs a fixed-iteration local search (insert / swap / skip, deterministic
   seeds) on the planner's own objective.
4. Output is deterministic: two runs on seed 1 give identical `plan.json` (checked with `cmp`).

`--strategy fcfs` is still there as the baseline. Strategies tried (all pass the gate):

| strategy | idea | held-out median paid / arrive |
|---|---|---|
| fcfs | order by paid time, first feasible supplier | 59.16 / 57.96 |
| edf | earliest SLA deadline first | 59.25 / 58.11 |
| vip | EDF with VIP pulled forward | 59.62 / 58.47 |
| cheapest | EDF + cheapest supplier with wallet | 71.58 / 68.65 |
| profit | cheapest + skip orders that lose money | 72.47 / 69.96 |
| **hybrid** | best of 3 orderings + local search | **73.77 / 72.57** |

## Result vs FCFS
Command: `node harness/benchmark.js --no-write --strategies fcfs,hybrid` (score % under the default checker;
viol/dup are totals over 10 seeds under default/strict).

| strategy | set | basis | median | mean | min | max | viol d/s | dup d/s | gate |
|---|---|---|---|---|---|---|---|---|---|
| fcfs | **held-out 1–10** | paid | 59.16 | 58.05 | 32.16 | 74.89 | 0/0 | 0/0 | PASS |
| fcfs | **held-out 1–10** | arrive | 57.96 | 56.06 | 31.04 | 73.57 | 0/0 | 0/0 | PASS |
| hybrid | **held-out 1–10** | paid | **73.77** | 70.57 | 46.61 | 86.36 | 0/0 | 0/0 | PASS |
| hybrid | **held-out 1–10** | arrive | **72.57** | 69.37 | 45.35 | 85.40 | 0/0 | 0/0 | PASS |
| fcfs | tuning 101–110 | paid | 66.33 | 65.08 | 46.80 | 84.96 | 0/0 | 0/0 | PASS |
| fcfs | tuning 101–110 | arrive | 62.43 | 61.27 | 39.81 | 82.34 | 0/0 | 0/0 | PASS |
| hybrid | tuning 101–110 | paid | 78.16 | 73.90 | 54.48 | 89.16 | 0/0 | 0/0 | PASS |
| hybrid | tuning 101–110 | arrive | 77.18 | 72.55 | 53.57 | 88.01 | 0/0 | 0/0 | PASS |

Held-out median gain over FCFS: +14.61 points (paid), +14.61 points (arrive).
Held-out medians are 4.4–4.6 points below the tuning medians (D15).

## Gate status
- Held-out median ≥ 65 % under both SLA bases: **met** (73.77 paid, 72.57 arrive).
- 0 duplicates, 0 violations under both default and strict on all 20 seeds: **met** (fcfs and hybrid).
- `npm test` on this branch: 347/349 pass. The 2 failures are in `mcp/test/mcp.test.js`. That test compares the
  CLI-default plan (now `hybrid`) with MCP's default, which `mcp/tools/*.js` still hard-codes as `'fcfs'`. The fix
  belongs to backend-mcp (T17: follow `DEFAULT_STRATEGY`).

## 3 cases where `hybrid` still loses points

### Case 1 — VIP order at a shift start (W2, 1-minute margin)
- **Scenario (hand-made):** staff `[100,200)` ×1; one VIP order `rov`, value 500, arrive = paid = 100, SLA 5;
  S1 cost 0.9.
- **What happens:** the planner starts it at 101. Score 48.00 / 50.00 (96.00 %): −2.00 SLA for 1 late minute.
  A hand-written plan starting at 100 passes `--strict` with 0 violations and scores 50.00.
- **Root cause:** the model requires staff capacity at `s−1` (the D10 1-minute margin), so minute 100 counts as
  too close to the shift start.
- **Possible improvement:** apply the margin only on the sides the strict checker actually tests (the start of a
  shift needs no `s−1` minute). This would recover the SLA minute.
- **Trade-off:** it weakens the "1-minute margin from boundaries" in D10. The user chose on 2026-11-17 to keep the
  margin, so the loss is accepted.

### Case 2 — order paid in the last minutes of the day (W3, end-of-day margin)
- **Scenario (hand-made):** staff `[0,1440)` ×1; order `rov`, value 500, arrive = paid = 1434, SLA 30; S1 cost 0.9.
- **What happens:** the planner skips it. Score −25.00 (unprocessed penalty, 5 % of 500). A plan starting at
  1434 (finish 1439) passes `--strict` with 0 violations and scores +50.00, a 75-point difference.
- **Root cause:** `DAY_END = 1438` in the model (finish ≤ 1438 keeps a 2-minute buffer to 1440), so no start
  ≥ 1434 is feasible.
- **Possible improvement:** allow finish ≤ 1439 (1-minute margin, which is exactly D10).
- **Trade-off:** it is safe under both checkers, but it removes the extra buffer the user decided to keep on
  2026-11-17. On the 20 frozen seeds, `hybrid` leaves 10 paid orders undone whose earliest start is ≥ 1434
  (seeds 1, 4, 103, 104, 108, 109). For all 10 the earliest start is 1436–1439, so they cannot finish by 1440
  under any rule. None falls in the 1434–1435 window this margin blocks, so on these seeds the gain would be 0.

### Case 3 — supplier wallets run out (W4, held-out seed 10; also seed 6)
- **Scenario:** `harness/scenarios/seed-10.json`, default planner.
- **What happens:** score 46.61 % (paid) / 45.35 % (arrive). All 266 paid orders are done, with 0 late and
  0 violations, but profit is 3534.40 against the D3 max of 7582.60. The cheap wallets are used up: S5 (0.89)
  has 8.7 left, S3 (0.94) 3.0, S1 (0.96) 7.6. The remaining work goes to S4 (0.97, 10951.3 used).
- **Root cause:** D3 max profit uses the cheapest supplier for each game and ignores wallets. A relaxed bound that
  fills wallets cheapest-first and ignores games, staff and time gives at most 3540.1 profit, about 46.69 %. The
  planner reaches 99.8 % of that bound, so this gap comes from the scenario, not the search. On seed 6 (47.01 %)
  the same thing costs penalties instead: 58 paid `rov` orders are not done (−847.50). S3 is the only `rov`
  supplier, its wallet is 5950 (enough for ≤ 7000 THB of order value at 0.85), and the planner served 6990.
- **Possible improvement:** score per order cannot be raised much. Profit and the skip penalty are both linear in
  value, so each THB of wallet is worth the same whatever the order size. The remaining gain is a global
  supplier-allocation step (min-cost flow over wallets per game) for the last few THB, plus reporting a
  wallet-aware bound next to the D3 score % so these seeds are not mistaken for planner failures.
- **Trade-off:** a flow step adds code and run time for under 0.1 % on these seeds. A wallet-aware bound is
  only for reporting, because D3 defines the official score.
