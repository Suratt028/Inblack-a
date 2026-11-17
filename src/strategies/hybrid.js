'use strict';
// Hybrid (T06): VIP-weighted EDF priority + wallet-aware cheapest supplier +
// profit-aware skipping, best of several deterministic seed orderings, then
// insertion/swap/skip local search on the planner's own objective.
const { prepare, decode, emit, cmpId } = require('../search/core');
const { localSearch } = require('../search/local');
const { deadline, VIP_PULL } = require('./greedy');

const KEYS = [
  p => deadline(p) - (p.vip ? VIP_PULL : 0),            // VIP-weighted EDF
  p => p.o.paid_minute * 2000 + p.o.arrive_minute,       // FCFS
  p => deadline(p),                                      // EDF
];

function hybridWith(opts = {}) {
  const { slaBasis = 'blend', iters = 10000, window = 25, prefRate = 0.1, skipRate = 0.1, label = 'hybrid' } = opts;
  return model => {
    const ctx = prepare(model, { supplierRule: 'cheapest', walletAware: true, slaBasis });
    let best = null;
    for (const key of KEYS) {
      const perm = ctx.P.map(p => p.idx).sort((a, b) => {
        const pa = ctx.P[a], pb = ctx.P[b];
        return key(pa) - key(pb) || pa.e - pb.e || cmpId(pa.id, pb.id);
      });
      const res = decode(ctx, perm, { minGain: 0 });
      if (!best || res.obj > best.res.obj + 1e-9) best = { perm, res };
    }
    const ls = iters > 0 ? localSearch(ctx, best.perm, { iters, window, prefRate, skipRate }) : best;
    return emit(ctx, ls.res, label);
  };
}

module.exports = { hybrid: hybridWith(), hybridWith };
