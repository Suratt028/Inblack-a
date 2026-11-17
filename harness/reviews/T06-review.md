# T06 review — strategies + hybrid local search (agent/strategy)

| Field | Value |
|---|---|
| reviewer | qa-reviewer (T09) |
| branch / commits | agent/strategy `211dd18`, `10d5630`, `4a3692f` on main `ed4119b` |
| date | 2026-11-17 |
| **VERDICT** | **REJECT** (round 1) — one real D4/D4b defect (F1); everything else verified |

## F1 (blocking) — per-supplier wallet can be overspent by float rounding (D4, D4b)

The planner accepts an order when `cost <= remaining + 1e-9`:

- `src/search/core.js:121` — `if (c > wallet[sp.k] + EPS) continue;` (decoder used by edf/vip/cheapest/profit/hybrid)
- `src/model/feasibility.js:59` — `if (c > this.supWallet.get(sup.id) + EPS) return 'WALLET';` (re-check in `emit`, `src/search/core.js:162`, and fcfs)

The tolerance is on the wrong side. The official rule (D4b) deducts `value × cost_pct` sequentially in
(start_minute, order_id) order and the first assignment with `remaining < cost` is a violation. When the
costs exactly exhaust a wallet in decimal arithmetic, binary floats can leave `remaining` a few ULPs
below `cost`; the planner accepts it, the validator scores −100 and −5%.

Realistic reproduction (integer wallet, integer values, generator-like cost_pct):
`S1 wallet_thb 117, cost_pct 0.9`, orders `A value 51 paid 10`, `B value 79 paid 20` → 45.9 + 71.1 = 117,
but `117 − 45.9 = 71.1 < 71.10000000000001`.

```
$ node src/planner.js w1.json w1-plan.json --strategy hybrid
{"assignments":[{"order_id":"A","supplier_id":"S1","start_minute":10},{"order_id":"B","supplier_id":"S1","start_minute":20}]}
$ node harness/score.js w1.json w1-plan.json --json            (and --strict, same)
total -98.85 pct -760.38 {"done":1,"overSla":0,"paidNotDone":1,"violations":1,"duplicates":0,"impossible":0} ["WALLET S1 remaining 71.10 < cost 71.10"]
```

All six strategies (fcfs, edf, vip, cheapest, profit, hybrid) produce the same violation. A brute-force
count over values 50..1999 and cost_pct 0.90..0.98 found 301,948 integer-wallet pairs where this happens.
The 20 frozen seeds do not hit it, but the completion criterion "0 violations on every seed" and D4
"never overspent" are hard rules, and the fix is small.

Failing test (committed as `todo` so `npm test` stays green on main until fixed):
`harness/tests/planner.edge.test.js` — `[<strategy>] D4/D4b wallet float exhaust (W1): no WALLET violation`

```
$ node --test harness/tests/planner.edge.test.js     (tests copied onto git archive 4a3692f)
✖ [hybrid] D4/D4b wallet float exhaust (W1): no WALLET violation # T06 REJECT W1: ...
    actual: [ 'WALLET B @20: S1 remaining 71.10 < cost 71.10' ]
ℹ tests 132  ℹ pass 126  ℹ fail 0  ℹ todo 6
```

Required fix (suggestion): make the wallet check conservative in both places, e.g.
`if (c > remaining - 1e-6) reject` (or exact `c > remaining` with deductions applied in D4b order,
which `emit` already uses). Then the `todo` flag on the W1 test is removed (QA) and it must pass for
every strategy.

## Verified (no defect)

1. **QA planner tests on agent/strategy** (git archive `4a3692f` + `harness/tests/planner.*` from agent/qa):
   strategies discovered dynamically = `cheapest, edf, fcfs, hybrid, profit, vip` (via exported `STRATEGIES`).
   ```
   node --test harness/tests/planner.*.test.js   -> ℹ tests 265  ℹ pass 265  ℹ fail 0   (before W1 was added)
   npm test (with NODE_PATH to repo node_modules) -> ℹ tests 336  ℹ pass 336  ℹ fail 0
   ```
   Covers import guard, CLI contract, unknown strategy rejected, determinism (byte-identical twice on
   seed-1 per strategy), 16 edge scenarios + 5 fuzz scenarios, 20 frozen seeds, all with
   `harness/validator.js` default + strict and an independent strict-margin checker.
2. **Gate on all 20 seeds** with `harness/score.js --json` (paid/arrive × default/strict), own script:
   | strategy | held-out median paid | held-out median arrive | tuning median paid | tuning median arrive | v+d (20 seeds × 4 modes) |
   |---|---|---|---|---|---|
   | fcfs | 59.16 | 57.96 | 66.33 | 62.43 | 0 |
   | edf | 59.25 | 58.11 | 67.61 | 64.43 | 0 |
   | vip | 59.62 | 58.47 | 67.58 | 64.59 | 0 |
   | cheapest | 71.58 | 68.65 | 72.99 | 66.84 | 0 |
   | profit | 72.47 | 69.96 | 76.95 | 73.54 | 0 |
   | hybrid | **73.77** | **72.57** | 78.22 | 77.23 | 0 |

   Matches every number claimed in `harness/tasks/T06.md` exactly. Hybrid 350–941 ms per seed. Default
   score = strict score on every seed (no plan relies on a half-open boundary).
3. **Spec read of the diff** (`git diff ed4119b 4a3692f -- src`):
   - D12: `core.js:60` `e = max(0, arrive, paid)`; unpaid skipped `core.js:55`; unsupported game skipped `core.js:59`; duplicate input ids scheduled once `core.js:56`.
   - D10 strict + margin: outages `core.js:46` block `s` unless `s+5 <= a-1 || s >= b+1` (= strict closed-interval check); shifts `core.js:41` require staff on `[s-1, s+6]`; day `DAY_END = 1438` (`feasibility.js:22`).
   - D11: per-minute `used[m] < cap[m]` over `[s, s+5)` `core.js:112`; cap from the model.
   - D2 late cost, VIP ×2 `core.js:22-25`; D13 supplier tie cost asc, id asc `core.js:50`.
   - Determinism: fixed PRNG seed `local.js:12`, fixed iteration count, no `Math.random`/`Date.now` in `src/` (`git grep` empty).
   - Every decoded assignment is re-verified through `Model.check/commit` in (start, id) order `core.js:158-164`.
   - Import guard: `git grep harness 4a3692f -- src` only matches two comments.
   - Ownership: diff touches only `src/**` and `harness/tasks/T06.md` (owner's task file).

## Non-blocking notes (points lost by design → harness/WRONG_CASES.md W2–W4)

- W2: shift margin `[s-1, s+6]` forbids starting at the first minute of a shift; a VIP order paid at
  shift start with SLA 5 gets 1 late minute (score 48 instead of 50).
- W3: `DAY_END = 1438` skips an order paid at 1434 although finish 1439 passes `--strict` (−5 instead of +50).
  Both are a reading of the user's "keep a 1-minute margin from boundaries" (D10); Lead may want the user
  to confirm whether the margin is on top of the strict checker or equal to it.
- W4: wallet-bound seeds (2, 6, 10, 103, 108, 110) stay below 65% for every strategy.
- CLI/plan() default is still `fcfs` (`planner.js:16`); benchmark must pass `--strategy hybrid`
  (exported `RECOMMENDED_STRATEGY`). Acceptable, documented in T06.md.

## Commands used
```
git archive 4a3692f | tar -x -C <scratch>/strat ; cp harness/tests/planner.* <scratch>/strat/harness/tests/
NODE_PATH=<repo>/node_modules npm test
node --test harness/tests/planner.*.test.js
node <scratch>/gate.js <scratch>/strat <strategy>      # planner per seed + score.js --json, 4 modes
node <scratch>/eps.js <scratch>/strat                  # W1 probe, all strategies, validator
```
