'use strict';
// Seeded PRNG (mulberry32). Never use Math.random in the harness.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function createRng(seed) {
  const next = mulberry32(seed);
  const rng = {
    next,
    float: (lo, hi) => lo + (hi - lo) * next(),
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)), // inclusive
    chance: (p) => next() < p,
    normal: (mean, sd) => {
      let u = next(); if (u < 1e-12) u = 1e-12;
      return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * next());
    },
    pickWeighted: (items, weights) => {
      const tot = weights.reduce((s, w) => s + w, 0);
      let r = next() * tot;
      for (let i = 0; i < items.length; i++) { r -= weights[i]; if (r < 0) return items[i]; }
      return items[items.length - 1];
    },
    shuffle: (arr) => {
      const a = arr.slice();
      for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
      return a;
    },
  };
  return rng;
}

module.exports = { mulberry32, createRng };
