'use strict';
// Single-pass list-scheduling strategies (T06). Each orders the paid orders by a
// priority key, then decodes: earliest feasible start, supplier rule, optional skip.
const { prepare, decode, emit, cmpId } = require('../search/core');

/** Deadline under the strategy's SLA clock (blend = mean of paid and arrive deadlines). */
const deadline = p => p.alpha * p.dPaid + (1 - p.alpha) * p.dArrive;

function runList(model, { key, supplierRule, minGain, label, slaBasis, walletAware = false }) {
  const ctx = prepare(model, { supplierRule, slaBasis, walletAware });
  const perm = ctx.P.map(p => p.idx).sort((a, b) => {
    const pa = ctx.P[a], pb = ctx.P[b];
    return key(pa) - key(pb) || pa.e - pb.e || cmpId(pa.id, pb.id);
  });
  return emit(ctx, decode(ctx, perm, { minGain }), label);
}

// EDF: earliest SLA deadline first; first valid supplier (as FCFS); never skip.
const edf = model => runList(model, { key: deadline, supplierRule: 'first', minGain: -Infinity, label: 'EDF' });

// VIP weighting: EDF where VIP deadlines are pulled forward (VIP late cost is 2/min, D2).
const VIP_PULL = 15;
const vip = model => runList(model, { key: p => deadline(p) - (p.vip ? VIP_PULL : 0), supplierRule: 'first', minGain: -Infinity, label: 'VIP-EDF' });

// Cheapest feasible supplier with wallet awareness (min-cost-flow budget per game,
// src/search/alloc.js), FCFS order (paid, arrive, id).
const cheapest = model => runList(model, { key: p => p.o.paid_minute * 2000 + p.o.arrive_minute, supplierRule: 'cheapest', walletAware: true, minGain: -Infinity, label: 'cheapest' });

// Profit-aware: FCFS order, cheapest supplier, skip any order whose serving value
// (profit + avoided 5% not-done - SLA cost) is negative; frees staff for others.
const profit = model => runList(model, { key: p => p.o.paid_minute * 2000 + p.o.arrive_minute, supplierRule: 'cheapest', walletAware: true, minGain: 0, label: 'profit-aware' });

module.exports = { edf, vip, cheapest, profit, deadline, VIP_PULL };
