# DECISIONS_INPUT — user answers to ambiguities (Section 3)

Recorded 2026-11-17 18:31 (Asia/Bangkok). Full wording of each D-item: PLAN.md section 2.
Tests must cite these IDs.

## User answer (verbatim)

```
1. D1–D3 accept, but make the SLA basis (arrive vs paid) a config option and
   report benchmark scores for both bases.
   D4–D15 accept, with two additions:
   - D10: scorer uses half-open [s,s+5) as default. Also run a strict checker
     that counts the end minute (outage/shift/day boundaries). The planner must
     have 0 violations under BOTH, and keep a 1-minute margin from boundaries.
   - D15: lock generator config at Checkpoint 2 with a commit hash. Tune on one
     seed set and report final scores on a separate held-out seed set, showing
     both results side by side.
```

## Resolved rules
| ID | Rule |
|---|---|
| D1 | SLA clock default `paid_minute`; option `slaBasis: "paid" \| "arrive"`; benchmark reports both |
| D2 | late = max(0, start+5 − (clock+sla)); penalty 1/min, VIP 2/min |
| D3 | max profit = Σ over paid orders of value × (1 − cheapest supporting supplier cost_pct); ignores staff/wallet/outage |
| D3b | paid orders with no supporting supplier excluded from max profit and from −5% |
| D4 | wallet shared all day, deduct value × cost_pct, no refill |
| D4b | wallet checked in order (start_minute, order_id); first overspend = violation |
| D5 | finish > 1440 = violation |
| D6 | invalid item: −100, no profit, and −5% if paid |
| D7 | invalid items removed before checking remaining items |
| D8 | any order_id ≥2 times ⇒ total 0, score % 0 |
| D9 | unknown order/supplier id or non-integer minute = violation |
| D10 | default half-open `[s,s+5)`, outages `[a,b)`, shifts `[from,to)`; **plus strict checker** counting end minutes; planner must have 0 violations under both, with 1-minute margin from boundaries |
| D11 | capacity = sum of covering shifts |
| D12 | start ≥ max(arrive, paid) |
| D13 | ties: priority desc, start asc, supplier cost asc, id asc |
| D14 | negative score % reported as is |
| D15 | generator config locked at Checkpoint 2 with commit hash; **tuning seed set** and separate **held-out seed set**, final report side by side |
