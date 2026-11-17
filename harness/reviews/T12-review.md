# T12 review — GitHub Actions + REST API + Pages site data (backend-mcp)

- Reviewed: `agent/backend` 42bc2db on main 3879efb (6 files: `harness/reports/build-site-data.js`, `harness/reports/unzip.js`, `harness/reports/build-site-data.test.js`, `.github/workflows/pages.yml`, `package.json` test glob, `harness/tasks/T12.md`). All files are inside backend-mcp's scope (PLAN §3).
- Brief step 6: "Deploy on GitHub Pages; use the GitHub REST API in Actions to fetch workflow results for the chart." PLAN R18/R19.
- Method: `git archive agent/backend` into a scratch dir, `npm ci`, run everything there. My comparison scripts live in a separate scratch dir and call the real `src/planner.js` and `harness/score.js --json` as subprocesses.

## VERDICT: APPROVE

No blocking findings. Non-blocking notes for backend-mcp (N1–N5) and site notes for Lead (S1–S6) are below.

## Evidence

### 1. Tests
`npm test` on 42bc2db: **tests 361, pass 361, fail 0** (the glob now includes `harness/reports/*.test.js`, 10 new tests).

### 2. Builder output compared with the benchmark JSON and score.js
`node harness/reports/build-site-data.js --out <scratch>/data --no-api` ran in 4.3 s and wrote summary.json, history.json, team.json, bench-summary.json, replay/index.json and replay/seed-1..10.json.

Independent comparison script:
- `summary.medians` and `summary.perSeed` against `harness/benchmarks/latest.json` (acb18ec), all 6 strategies × heldout/tuning × paid/arrive, median plus every per-seed cell: **264 cells, 0 mismatches**. `defaultStrategy` = hybrid, `commit` = acb18ec.
- `summary.kpis` against sums of `harness/score.js --json` over seeds 1–10, with plans from `src/planner.js --strategy hybrid|fcfs`: exactly equal.
  - hybrid: profit 65852.3, overSla 1, paidNotDone 89, violations 0, duplicates 0, total 64773.3, maxProfit 92343.7
  - fcfs: profit 56736.1, overSla 44, paidNotDone 215, 0/0, total 53098.1
- `replay/seed-N.json` against score.js, all 10 seeds: scorePct equal; order count equal to the scenario; each order's status, supplier_id, start and profit match. Status mapping (done→done, not_done→paidNotDone, penalty>0→violation, otherwise unpaid/impossible) matches the scorer rows on all 3011 orders: done 2581, unpaid 299, paidNotDone 89, impossible 42. Per-order rows add up to scorePct. `used_thb` ≤ `wallet_thb` for every supplier. **0 mismatches.**
- `team.json`: 17 tasks (T01–T17) with owner, status, branch and dependencies parsed. All 3 headings in `AGENT_LOG/rejected-work.md` were parsed: T08 (backend-mcp, 4896a07), T06 (strategy-optimizer, b1e4232) and T07 (backend-mcp, dd725a1), each with reviewer qa-reviewer, date 2026-11-17 and a review link.
- `history.json` with `--no-api`: 1 point (acb18ec, 73.77 / 72.57, fcfs 59.16 / 57.96), identical to bench-summary.json.

### 3. REST API, token handling, fail-soft (my own mocks, not the branch's tests)
- Calls made, in order:
  - `GET /repos/o/r/actions/workflows/pages.yml/runs?branch=main&status=success&per_page=30`
  - `GET /repos/o/r/actions/runs/{id}/artifacts?name=bench-summary`
  - `GET {archive_download_url}` with `redirect: 'manual'`, then the 302 Location is fetched without Authorization.
  - The endpoints and Accept/X-GitHub-Api-Version headers are correct. The current run (GITHUB_RUN_ID) is skipped.
- Mocked blob host (`*.blob.core.windows.net`): **0 requests carried Authorization**.
- Real Node 24 `fetch` against two local HTTP servers (not mocked): the API server received `Bearer …` and the blob server received `authorization: null`. Body downloaded correctly.
- Fail-soft:
  - A corrupt zip on one run and HTTP 500 on another each produce one warning line and are skipped. The good run's point is kept.
  - Whole-API failures ("fetch failed" thrown, or HTTP 403 "Resource not accessible by integration") produce a warning, and history.json is still written with the current point. The process does not fail.
- Token check: across all captured console output, the fake token string appears **0 times**. Error messages contain only the API path.

### 4. Workflow `.github/workflows/pages.yml`
- Permissions are exactly `contents: read`, `actions: read`, `pages: write`, `id-token: write`. Triggers: push to main and workflow_dispatch. Concurrency: `pages`, no cancel.
- The only credential is `secrets.GITHUB_TOKEN`, scoped to the builder step's `env`. It is never echoed.
- Step order: checkout (fetch-depth 0, needed by the benchmark lock diff) → `npm ci` → `npm test` → secret scan → `benchmark.js --out-dir $RUNNER_TEMP/bench` (flag exists, benchmark.js:160) → builder with `--bench` pointing at that fresh output → assemble `_site` → upload `bench-summary` artifact (single file, so the zip root holds `bench-summary.json`, which is what `fetchHistory` looks for) → `upload-pages-artifact@v3` → `deploy-pages@v4`.
- Secret scan, run with the step script extracted verbatim, on a `git init` copy of the branch:
  - Clean tree: `secret scan: clean`, exit 0.
  - Each of 5 planted fake patterns in a tracked file (`ghp_…`, `AKIA…`, `sk-ant-…`, `github_pat_…`, `-----BEGIN RSA PRIVATE KEY-----`) produces `::error::possible secret found`, exit 1.

## Non-blocking notes (backend-mcp)
- **N1 (secret scan):**
  - (a) `pages.yml` is excluded from the scan. A `ghp_…` line I planted in it passed as `secret scan: clean`, exit 0. You could build the regex from pieces (`'gh''p_'`) and drop the exclusion.
  - (b) `git grep -n` prints the matching line, so a real secret would be written to the public Actions log (GitHub masks only registered secrets). Use `git grep -lIE` to print file names only.
- **N2 (replayStatus precedence):** `violationPenalty > 0` wins over `not_done`, and `done` wins over violation. On a plan with rejected assignments, the replay `paidNotDone` count is then lower than scorer `counts.paidNotDone`, and a done order that also has a violation is shown only as done. No effect on current data (0 violations on all seeds). Consider a separate `violation` flag next to the status.
- **N3 (assemble order):** `cp -R site/. _site/` runs after the builder wrote `_site/data`. A committed `site/data/` would overwrite the fresh data and REST history. This is safe only because Lead's uncommitted `.gitignore` adds `site/data/`. Either build data after the copy or exclude `data/` in the copy.
- **N4:** Not yet run on GitHub. Pages "Source" must be set to "GitHub Actions" for `deploy-pages`. PLAN R18 also names `ci.yml`, which does not exist; `pages.yml` covers tests, benchmark and REST API, so either update R18 or add it.
- **N5:** `per_page=30` with no pagination, so the chart shows at most the last 30 successful runs. This is fine; document it if more history is wanted.

## Site notes for Lead (uncommitted `site/`, not edited)
Method:
- Copied `site/` to scratch and replaced `data/` with fresh builder output.
- Ran each page's real inline script plus `assets/common.js` in a Node `vm` with a minimal fake DOM and a `fetch` that reads the data files.
- Compared the rendered text with the JSON and score.js. Lead's current `site/data/summary.json` equals the builder output except `generatedAt`.

Results:
- **index.html:** matches.
  - KPI cards: 73.77% / FCFS 59.16% (+14.61), 72.57% / 57.96% (+14.61), profit 65,852.30 / 56,736.10, overSla 1 / 44, paidNotDone 89 / 215, 0/0 / 0/0. All equal the kpis and medians.
  - Median table: all 6 strategies × 4 cells equal latest.json.
  - Per-seed table: seeds 1–10 hybrid/fcfs paid/arrive equal perSeed (2 dp).
  - History chart: 1 point acb18ec.
- **replay.html:** for **all 10 seeds**, the page's (score %, FCFS %, done, over SLA, paidNotDone, violations, profit) equals score.js `--json` (e.g. seed 3: 69.93 / 48.54 / 268 / 0 / 11 / 0 / 7738.10). Supplier order counts add up to the done count. `?seed=N` selection works.
- **team.html:** 4 agent cards. Rejection counts: backend-mcp 2 (T07, T08), strategy-optimizer 1 (T06), others 0. The rejection table lists T08/T06/T07 with reasons and review links. Tasks T06/T07/T08 carry the "เคยถูกตีกลับ" (previously rejected) badge. 17 task rows.

Issues for Lead:
- **S1:** The per-seed "ต่าง" (difference) column uses unrounded values. Seed 10 shows `46.61% − 35.36%` next to `+11.26`, while the shown numbers give 11.25. To meet "numbers equal", round both values before subtracting.
- **S2:** The replay "ชำระแล้วแต่ไม่ได้ทำ" (paid but not done) and "ผิดกติกา" (rule violation) KPIs count `status`. They inherit N2: if any assignment is rejected, they differ from the scorer counts. Currently equal.
- **S3 (R19 loading/error states):**
  - index.html: `#medians` and `#perseed` have no loading or error state of their own; a summary.json failure shows only in `#kpis`.
  - team.html: `load()` covers `#tasks` only, so `#agents` and `#rejected` stay blank on error.
- **S4:** Rejection reasons render markdown backticks literally. Cosmetic.
- **S5:** The footer always says "ข้อมูลสร้างโดย GitHub Actions" (data generated by GitHub Actions), even for locally generated data. Cosmetic.
- **S6:** Commit `.gitignore` (`site/data/`, `_site/`) together with `site/`, otherwise N3 applies.
