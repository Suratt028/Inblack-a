# test-results
_Real events only, appended as they happen._

## 2026-11-17 18:41 — Lead: FCFS (T05) scored by harness (T03), held-out seeds 1–10
Command: `node src/planner.js harness/scenarios/seed-N.json /tmp/pN.json && node harness/score.js ... --json [--strict --sla-basis arrive]`
| seed | default+paid % | viol | dup | strict+arrive % | viol |
|---|---|---|---|---|---|
| 1 | 74.89 | 0 | 0 | 73.57 | 0 |
| 2 | 58.44 | 0 | 0 | 57.16 | 0 |
| 3 | 48.54 | 0 | 0 | 44.70 | 0 |
| 4 | 56.54 | 0 | 0 | 52.93 | 0 |
| 5 | 70.83 | 0 | 0 | 68.15 | 0 |
| 6 | 32.16 | 0 | 0 | 31.04 | 0 |
| 7 | 73.33 | 0 | 0 | 70.90 | 0 |
| 8 | 59.89 | 0 | 0 | 58.75 | 0 |
| 9 | 70.56 | 0 | 0 | 69.39 | 0 |
| 10 | 35.36 | 0 | 0 | 34.04 | 0 |
Result: 0 violations / 0 duplicates in all 20 runs. (Baseline only; no optimization yet.)

## 2026-11-17 18:42 — Lead: full suite on main after merging agent/qa
Command: `npm test` (= node --test harness/tests/*.test.js) · total 60 · passed 60 · failed 0 · 0.48 s
Earlier QA runs (from harness/tasks/T04.md): run 1 = 59/60 (test bug #45: start −1 is two-cause BEFORE_PAID+OUT_OF_DAY → test corrected), run 2 = 60/60.
