---
name: game-queue-quality-check
description: Verify a planner change or a plan.json for INBLACK Project A before review or merge — 0 duplicates, 0 violations (default and strict), both SLA bases, tests green, src/ not importing harness/. Use before handing work to code-reviewer, before a merge, or when asked "is this plan valid?".
---

# Game queue quality check (Project A)

Run every check and paste the real output. Never report a result you did not run.

## 1. Tests
```bash
npm test
```
Must be all pass. (The `inblack-guard` plugin's Stop hook runs the same command and blocks finishing when it fails.)

## 2. Import boundary
```bash
grep -rnE "require\(['\"][./]*harness|from ['\"][./]*harness" src/ && echo "FAIL: src imports harness" || echo "OK: no harness imports"
```

## 3. Every seed, both bases, both checkers
For each seed in tuning `101..110` and held-out `1..10`:
```bash
node src/planner.js harness/scenarios/seed-$N.json ${TMP:-/tmp}/p$N.json
node harness/score.js harness/scenarios/seed-$N.json ${TMP:-/tmp}/p$N.json --json
node harness/score.js harness/scenarios/seed-$N.json ${TMP:-/tmp}/p$N.json --json --strict --sla-basis arrive
```
From each JSON read `scorePct`, `counts.violations`, `counts.duplicates`.
Gate: **duplicates = 0 and violations = 0 in all runs.** Any non-zero → FAIL, list `violations[]` (rule + detail).
MCP alternative: `score_plan` / `run_scenario` on the `inblack-queue` server return the same numbers.

## 4. Score
Report a table per seed (paid %, arrive %, strict viol) plus held-out median/min, and compare with FCFS (`strategy: 'fcfs'`). Target: held-out median ≥ 65% under both SLA bases.

## 5. Spot-check reasons
Pick the 3 orders that lost the most points and run MCP `explain_order` (or read the scorer's per-order line). Each loss must have a stated cause (late N min, not done, violation rule).

## Output
```
QUALITY: PASS | FAIL
tests: <n pass / n fail>
boundary: OK | FAIL
gate: dup=<sum> viol=<sum> (default) / viol=<sum> (strict)
held-out median: paid <x>% · arrive <y>%  (FCFS <a>% · <b>%)
```
