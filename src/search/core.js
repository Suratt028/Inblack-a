'use strict';
/**
 * Fast permutation decoder + own objective for the search strategies.
 * Same safety rules as src/model/feasibility.js (R-DAY, R-START, R-STAFF with
 * 1-minute shift margin, R-OUTAGE closed+margin, R-GAME, R-WALLET, R-DUP);
 * the planner re-verifies every decoded assignment through Model.commit.
 * Independent of harness/ (planner keeps its own model).
 *
 * Objective (planner's own estimate of the official score, D2/D3/D6):
 *   sum served (value*(1-cost_pct) - w*late) - sum paid-not-served 0.05*value
 *   late = max(0, s+5 - (clock+sla)), w = 2 for VIP else 1.
 *   clock = paid (D1 default) / arrive, or "blend" = mean of both lateness costs.
 */
const { DUR, DAY_END, MINUTES } = require('../model/feasibility');
const { allocate } = require('./alloc');
const EPS = 1e-9;
const NOT_DONE = 0.05;

const cmpId = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/** Late penalty of order o (prepared) when started at s. */
function lateCost(o, s) {
  const f = s + DUR;
  return o.w * (o.alpha * Math.max(0, f - o.dPaid) + (1 - o.alpha) * Math.max(0, f - o.dArrive));
}

/**
 * Prepare static data from a Model (normalized scenario).
 * opts.slaBasis: 'paid' | 'arrive' | 'blend' (default 'blend')
 * opts.supplierRule: 'cheapest' | 'first'
 */
function prepare(model, opts = {}) {
  const basis = opts.slaBasis || 'blend';
  const alpha = basis === 'paid' ? 1 : basis === 'arrive' ? 0 : (opts.alpha !== undefined ? opts.alpha : 0.5);
  const { orders, suppliers } = model.sc;
  const cap = Int32Array.from(model.cap);
  // shiftOK[s]: R-DAY + 1-minute shift margin on [s-1, s+DUR+1]
  const shiftOK = new Uint8Array(MINUTES);
  for (let s = 0; s + DUR <= DAY_END; s++) {
    let ok = 1;
    for (let m = Math.max(0, s - 1); m <= Math.min(MINUTES - 1, s + DUR + 1); m++) if (cap[m] <= 0) { ok = 0; break; }
    shiftOK[s] = ok;
  }
  const sups = suppliers.map((sp, k) => {
    const blocked = new Uint8Array(MINUTES);
    for (let s = 0; s < MINUTES; s++) for (const w of sp.outages) if (!(s + DUR <= w.start - 1 || s >= w.end + 1)) { blocked[s] = 1; break; }
    return { k, id: sp.id, cost_pct: sp.cost_pct, wallet: sp.wallet_thb, games: sp.games, blocked, ref: sp };
  });
  const supOrder = opts.supplierRule === 'first' ? sups.slice()
    : sups.slice().sort((a, b) => a.cost_pct - b.cost_pct || cmpId(a.id, b.id)); // D13 cost asc, id asc
  const seen = new Set();
  const P = [];   // schedulable (paid, supported, first occurrence of id)
  const skipped = [];
  for (const o of orders) {
    if (o.paid_minute === null) { skipped.push({ o, reason: 'unpaid: never scheduled' }); continue; }
    if (seen.has(o.id)) { skipped.push({ o, reason: 'duplicate id in input: scheduled once' }); continue; }
    seen.add(o.id);
    const cand = supOrder.filter(sp => sp.games.includes(o.game));
    if (!cand.length) { skipped.push({ o, reason: `no supplier supports game ${o.game}` }); continue; }
    const e = Math.max(0, o.arrive_minute, o.paid_minute);
    const minCost = Math.min(...cand.map(sp => sp.cost_pct));
    P.push({
      idx: P.length, o, id: o.id, e, value: o.value_thb, w: o.vip ? 2 : 1, vip: o.vip, alpha,
      dPaid: o.paid_minute + o.sla_minutes, dArrive: o.arrive_minute + o.sla_minutes,
      cand, costs: cand.map(sp => o.value_thb * sp.cost_pct),
      bestProfit: o.value_thb * (1 - minCost), notDone: NOT_DONE * o.value_thb,
    });
  }
  const games = [...new Set(P.map(p => p.o.game))].sort();
  for (const p of P) p.g = games.indexOf(p.o.game);
  let budget = null;
  if (opts.walletAware) {
    const demand = games.map(() => 0);
    for (const p of P) demand[p.g] += p.value;
    budget = allocate(games, sups.map(sp => ({ games: sp.games, cost_pct: sp.cost_pct, wallet: sp.wallet })), demand);
  }
  return { model, P, sups, cap, shiftOK, skipped, alpha, games, budget };
}

/**
 * Decode a priority list (array of P indices) into a schedule.
 * Each order takes its earliest feasible start (staff, margins, some supplier
 * free of outage with wallet); supplier = first in cand order (cheapest) that fits.
 * If serving would be worth less than minGain (profit + avoided 5% - late cost), it is skipped.
 * skip: optional Uint8Array of forced skips. pref: optional Int8Array preferred
 * supplier index offset (rotate cand list) per order.
 * Returns { obj, starts:Int32Array(-1 = not served), supIdx:Int32Array }.
 */
function decode(ctx, perm, { skip = null, pref = null, minGain = 0, useBudget = true } = {}) {
  const { P, sups, cap, shiftOK } = ctx;
  const budget = useBudget ? ctx.budget : null;
  const brem = budget ? budget.map(b => Float64Array.from(b)) : null;
  const bsum = budget ? brem.map(b => b.reduce((x, y) => x + y, 0)) : null;
  const used = new Int32Array(MINUTES);
  const wallet = new Float64Array(sups.length);
  for (const sp of sups) wallet[sp.k] = sp.wallet;
  const n = P.length;
  const starts = new Int32Array(n).fill(-1), supIdx = new Int32Array(n).fill(-1);
  let obj = 0;
  for (const i of perm) {
    const p = P[i];
    if (skip && skip[i]) { obj -= p.notDone; continue; }
    const gainMax = p.bestProfit + p.notDone;
    let done = false;
    const nc = p.cand.length;
    const off = pref ? pref[i] % nc : 0;
    for (let s = p.e; s + DUR <= DAY_END; s++) {
      if (!shiftOK[s]) continue;
      const lc = lateCost(p, s);
      if (gainMax - lc < minGain) break; // only gets worse
      let free = true;
      for (let m = s; m < s + DUR; m++) if (used[m] >= cap[m]) { free = false; break; }
      if (!free) continue;
      // pass 0: within wallet budget for this game (wallet-aware), pass 1: unbudgeted slack, pass 2: any wallet
      for (let pass = budget ? 0 : 2; pass < 3 && !done; pass++) {
        for (let t = 0; t < nc; t++) {
          const ci = (t + off) % nc;
          const sp = p.cand[ci];
          if (sp.blocked[s]) continue;
          const c = p.costs[ci];
          if (c > wallet[sp.k] + EPS) continue;
          if (pass === 0 && c > brem[sp.k][p.g] + EPS) continue;
          if (pass === 1 && c > wallet[sp.k] - bsum[sp.k] + EPS) continue;
          const gain = p.value - c + p.notDone - lc;
          if (gain < minGain) continue;
          for (let m = s; m < s + DUR; m++) used[m]++;
          wallet[sp.k] -= c;
          if (budget) { const d = Math.min(c, brem[sp.k][p.g]); brem[sp.k][p.g] -= d; bsum[sp.k] -= d; }
          starts[i] = s; supIdx[i] = ci;
          obj += p.value - c - lc;
          done = true; break;
        }
      }
      if (done) break;
    }
    if (!done) obj -= p.notDone;
  }
  return { obj, starts, supIdx };
}

/** Deterministic PRNG (mulberry32). */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Convert a decoded result into planner output, re-verified through Model.commit. */
function emit(ctx, res, label) {
  const { model, P, skipped } = ctx;
  const assignments = [], reasons = {};
  for (const { o, reason } of skipped) if (!reasons[o.id]) reasons[o.id] = { skipped: true, reason };
  const order = P.map(p => p.idx).filter(i => res.starts[i] >= 0)
    .sort((a, b) => res.starts[a] - res.starts[b] || cmpId(P[a].id, P[b].id));
  for (const i of order) {
    const p = P[i], s = res.starts[i], sp = p.cand[res.supIdx[i]];
    const r = model.check(p.o, sp.ref, s);
    if (r) { reasons[p.id] = { skipped: true, reason: `dropped by model re-check: ${r}` }; continue; }
    model.commit(p.o, sp.ref, s);
    assignments.push({ order_id: p.id, supplier_id: sp.id, start_minute: s });
    reasons[p.id] = { start_minute: s, supplier_id: sp.id, reason: `${label}: start ${s} (ready ${p.e}, waited ${s - p.e} min); supplier ${sp.id} cost_pct ${sp.cost_pct}` };
  }
  for (const p of P) if (!reasons[p.id]) reasons[p.id] = { skipped: true, reason: `${label}: not scheduled (no feasible slot, or serving would lose more than the 5% not-done penalty)` };
  return { assignments, reasons };
}

module.exports = { prepare, decode, emit, rng, lateCost, cmpId, NOT_DONE };
