# T07 review — benchmark runner (agent/backend)

| Field | Value |
|---|---|
| reviewer | qa-reviewer (T09) |
| branch / commits | agent/backend `698e106` (code + tests), `7c3efc7` (fcfs output + T07.md) on main `ed4119b` |
| date | 2026-11-17 |
| **VERDICT** | **REJECT** (round 1) — summary statistics are computed from rounded per-seed values (F1) |

## F1 (blocking) — median/mean are not the median/mean of the real score %

`harness/benchmark.js:64` rounds every per-seed `scorePct` to 2 decimals (`r2(r.scorePct)`), and
`summarize` (`harness/benchmark.js:81-85`) then takes the median and mean **of the rounded values**.
The median of rounded values is not the rounded median: when the two middle seeds both round up or
down, the reported median is off by 0.01, and it can even move in the wrong direction.

Evidence: combined scratch tree (agent/strategy `4a3692f` + agent/backend `7c3efc7` benchmark files),
`node harness/benchmark.js --out-dir <scratch>/bench1`, then recomputing every number with
`node harness/score.js <seed> <plan> --json` (own script `cmp.js`):

```
per-seed cells checked 480, mismatches 0          <- per-seed scorePct/total/violations/duplicates are correct
median differs: fcfs tuning paid: exact 66.3310 -> 66.33, benchmark 66.34
median differs: fcfs heldout paid: exact 59.1634 -> 59.16, benchmark 59.17
median differs: cheapest tuning paid: exact 72.9945 -> 72.99, benchmark 73
median differs: cheapest tuning arrive: exact 66.8439 -> 66.84, benchmark 66.85
median differs: cheapest heldout paid: exact 71.5835 -> 71.58, benchmark 71.59
median differs: edf tuning arrive: exact 64.4340 -> 64.43, benchmark 64.44
median differs: profit tuning paid: exact 76.9452 -> 76.95, benchmark 76.94
median differs: profit tuning arrive: exact 73.5443 -> 73.54, benchmark 73.55
median differs: vip heldout arrive: exact 58.4735 -> 58.47, benchmark 58.48
```

9 of 24 median cells are wrong, including the committed fcfs numbers in `harness/benchmarks/698e106.json`,
`latest.json` and `harness/tasks/T07.md` (held-out paid 59.17, true 59.16). The benchmark JSON is the
source of truth for Checkpoint 3 (median ≥ 65 decision) and for the site ("site numbers equal benchmark
output"), and T06.md already reports the correct values (e.g. profit tuning paid 76.95), so the two
artifacts disagree for the same plans. `mean` has the same issue.

Required fix: keep unrounded `scorePct`/`total` per seed for aggregation (round only for display or store
both), compute median/mean/min/max from the unrounded values, and add a unit test where rounding first
gives a different median (e.g. `[66.335, 66.3349]` style values or the real seed-101..110 fcfs list).

## Verified (no defect)

- **D15 seed sets / lock**: `SEED_SETS` tuning 101–110, held-out 1–10 (`benchmark.js:19-22`); scenarios read
  from `harness/scenarios`, never regenerated (`benchmark.js:48,108`). `git diff --name-only b073430 agent/backend --
  harness/generator.js harness/generator.config.json harness/scenarios` -> empty (lock untouched); same for agent/strategy.
  Lock intact flag computed with `git diff b073430` (`benchmark.js:169`).
- **D1/D10**: both bases × default/strict scored per seed (`benchmark.js:58-68`); gate requires 0 violations and
  0 duplicates in default AND strict (`benchmark.js:91-92`).
- **Strategy discovery with new strategies**: in the combined tree it found
  `fcfs,cheapest,edf,hybrid,profit,vip` (exported `STRATEGIES`), ran all 6 through the real CLI; unknown strategy:
  `error: unknown strategy nope; available: fcfs,cheapest,edf,hybrid,profit,vip`, exit 2.
- **Per-seed numbers equal score.js --json**: 480/480 cells (6 strategies × 20 seeds × 2 bases × 2 modes).
- **Determinism**: two full runs into separate dirs -> `runs equal except timestamp: true`.
- **Tests**: combined tree `npm test` -> `ℹ tests 347 ℹ pass 341 ℹ fail 0 ℹ todo 6` (the 6 todo are QA's T06 W1
  wallet test, unrelated to T07); all 5 T07 tests pass.
- **Ownership**: diff touches only `harness/benchmark.js`, `harness/benchmarks/**`, `harness/tasks/T07.md`, `package.json`
  (all backend-mcp). `package.json` test glob adds `harness/benchmarks/*.test.js` — correct.

## Non-blocking notes

- The table column/line "gate" means only "0 dup, 0 viol"; fcfs shows `PASS` with held-out median 59.
  The completion criterion also needs held-out median ≥ 65 under both bases. Consider a separate
  `targetPass` (median ≥ 65, both bases, held-out) so CP3 readers are not misled.
- Outside a git checkout `commit=nogit` and `generatorLockIntact=false` (expected; just noting for CI).
- Summary min/max/median use the default checker only; strict scorePct is per seed only (equal on all
  current seeds, so no impact today).

## Commands used
```
git archive 4a3692f | tar -x -C <scratch>/combo
git archive 7c3efc7 harness/benchmark.js harness/benchmarks package.json | tar -x -C <scratch>/combo
cp harness/tests/planner.* <scratch>/combo/harness/tests/
NODE_PATH=<repo>/node_modules npm test
node harness/benchmark.js --out-dir <scratch>/bench1 ; node harness/benchmark.js --out-dir <scratch>/bench2
node <scratch>/cmp.js <scratch>/combo <scratch>/bench1/latest.json <scratch>
```
