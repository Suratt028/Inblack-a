'use strict';
/**
 * Deterministic local search over the priority list (T06 hybrid).
 * Moves: swap two orders, insert (move one order to another position), toggle a
 * forced skip, change an order's preferred supplier (rotation of its cheapest-first list). Positions are drawn within a window (the list is roughly
 * time-ordered, so far moves rarely help). Accept if the decoded objective does
 * not get worse (plateau moves allowed). Fixed PRNG seed + fixed iteration
 * budget => same input gives the same plan; no wall-clock dependence.
 */
const { decode, rng } = require('./core');

function localSearch(ctx, perm0, { iters = 6000, seed = 20261117, window = 25, minGain = 0, skipRate = 0.1, prefRate = 0 } = {}) {
  const n = perm0.length;
  let perm = perm0.slice();
  const skip = new Uint8Array(ctx.P.length);
  const pref = new Int8Array(ctx.P.length);
  let best = decode(ctx, perm, { skip, pref, minGain });
  if (n < 2) return { perm, skip, res: best };
  const rand = rng(seed);
  const ri = k => Math.floor(rand() * k);
  for (let it = 0; it < iters; it++) {
    const r = rand();
    const i = ri(n);
    let j = i + ri(2 * window + 1) - window;
    if (j < 0) j = 0; if (j >= n) j = n - 1;
    let undo;
    if (r >= 1 - prefRate) {
      const o = perm[i], nc = ctx.P[o].cand.length;
      if (nc < 2) continue;
      const old = pref[o];
      pref[o] = (old + 1 + ri(nc - 1)) % nc;
      undo = () => { pref[o] = old; };
    } else if (r < skipRate) {
      const o = perm[i];
      skip[o] ^= 1;
      undo = () => { skip[o] ^= 1; };
    } else if (r < skipRate + (1 - skipRate - prefRate) / 2) {
      if (i === j) continue;
      const t = perm[i]; perm[i] = perm[j]; perm[j] = t;
      undo = () => { const u = perm[i]; perm[i] = perm[j]; perm[j] = u; };
    } else {
      if (i === j) continue;
      const v = perm[i];
      perm.splice(i, 1); perm.splice(j, 0, v);
      undo = () => { perm.splice(j, 1); perm.splice(i, 0, v); };
    }
    const res = decode(ctx, perm, { skip, pref, minGain });
    if (res.obj >= best.obj - 1e-9) best = res;
    else undo();
  }
  return { perm, skip, pref, res: best };
}

module.exports = { localSearch };
