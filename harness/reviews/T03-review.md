# T03 review — validator / scorer / score.js / generator (agent/backend @ 7fe812e)

Reviewer: qa-reviewer. Method: spec tests in harness/tests/ (T04), written from PLAN.md §2,
DECISIONS_INPUT D1–D15 and the CLAUDE.md I/O format, without reading the implementation. I copied
backend files into the QA worktree just for this run (`git checkout agent/backend -- ...`) and never committed them.

## Verdict: APPROVE (validator, scorer, score.js CLI, generator — the parts these tests cover)

## Evidence
Run 1 (fixtures fixed to the CLAUDE.md format), `node --test harness/tests/*.test.js`:
```
# tests 60  # pass 59  # fail 1
not ok 45 - D5 start 1436 OUT_OF_DAY (finish 1441 > 1440); negative start OUT_OF_DAY
  expected ['OUT_OF_DAY'], actual ['BEFORE_PAID']   (validator.spec.test.js:66, start = -1)
```
Classification: **TEST BUG**. With start −1 and paid_minute 0, OUT_OF_DAY and BEFORE_PAID both
apply, so this is a multi-cause case, and Lead ruled those out of scope. paid_minute ≥ 0 always,
so no negative start can ever be single-cause. I removed that assertion. The 1436 check stays and passes.

Run 2 (after the fix):
```
# tests 60  # pass 60  # fail 0
```

## Notes, not blocking
- Rule precedence: the implementation reports BEFORE_PAID ahead of OUT_OF_DAY for start < 0. No spec covers this. Record it if precedence ever becomes part of the contract.
- These tests do not check benchmark.js, MCP or wording of the report.
