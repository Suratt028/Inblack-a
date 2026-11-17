---
name: game-queue-optimization
description: Improve the INBLACK top-up queue planner (src/planner.js, src/strategies/) against the official score. Use when asked to raise the score %, add or tune a strategy, or compare a strategy with the FCFS baseline on the tuning/held-out seeds.
---

# Game queue optimization (Project A)

Goal: raise **held-out median score %** (seeds 1–10) under both SLA bases, with **0 duplicates and 0 violations** on every seed in default and `--strict` mode. A strategy that breaks the gate loses, whatever its score.

## Rules you must respect (read before changing code)
- Business rules: `PLAN.md` §2 and `harness/DECISIONS_INPUT.md` D1–D15. Key ones:
  - one order = 1 staff for exactly 5 minutes, occupying `[s, s+5)` (D10); start ≥ max(arrive, paid) (D12); `paid_minute: null` is never processed.
  - supplier must support the game, be outside its outages, and have wallet for `value_thb × cost_pct` (wallet per supplier, D4).
  - keep a **1-minute margin** from shift, outage and day boundaries so the strict checker also passes (D10).
  - SLA lateness is measured at finish (D2): `late = max(0, start+5 − (clock+sla))`, VIP costs 2/min.
  - paid-not-done costs 5% of `value_thb`; a violation costs 100 and earns nothing (D6).
- `src/` must **not** import from `harness/` — the planner keeps its own feasibility model (`src/model/feasibility.js`) so the scorer cross-checks it.
- Only `strategy-optimizer` writes `src/**` and `STRATEGY.md`, in its worktree on `agent/strategy`.

## Loop
1. Baseline: `node src/planner.js harness/scenarios/seed-N.json $TMP/p.json` then
   `node harness/score.js harness/scenarios/seed-N.json $TMP/p.json [--sla-basis arrive] [--strict]`.
   Or call MCP `run_scenario {seed: N, strategy}` when the `inblack-queue` server is running (`npm run mcp`).
2. Find where points go: the score report's "Top 10 orders where points were lost", or MCP `explain_order` for one order.
3. Classify the loss: late (queue order / staff capacity), not done (no capacity, no supplier with wallet, outage), violation (planner bug — fix first).
4. Change **one** idea at a time in a strategy module; select it with `plan(scenario, { strategy })`.
5. Tune on seeds **101–110** only. Check held-out **1–10** only to report — never tune on them (D15).
6. Record before/after per seed (both SLA bases, default + strict) in `STRATEGY.md`; keep the 3 cases where the strategy still loses points.

## Ideas that usually pay off
- Earliest-deadline-first with VIP weight, instead of arrival order.
- Profit-aware choice when capacity is short: value of serving = profit + avoided 5% penalty − expected SLA cost.
- Cheapest feasible supplier, but reserve wallet of a cheap supplier for games only it supports.
- Local search (swap/insert) on the official score with a fixed seed for determinism.
