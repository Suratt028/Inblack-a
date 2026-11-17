'use strict';
/**
 * Wallet-aware supplier budget (D4: wallet per supplier, shared all day).
 * Fractional transportation problem solved as min-cost flow (successive
 * shortest paths, Bellman-Ford; graph is tiny: games x suppliers):
 *   game g --(demand D_g in THB of order value)--> supplier k (supports g)
 *   supplier k capacity = wallet_k / cost_pct_k  (value units it can pay for)
 *   unit cost on g->k = cost_pct_k - 1 - 0.05  (negative: serve as much value as
 *   possible, cheapest suppliers first; 0.05 = avoided not-done penalty, D6).
 * Returns budget[k][g] in wallet THB (= flow * cost_pct_k).
 */
function allocate(games, sups, demand) {
  const G = games.length, K = sups.length;
  const N = 2 + G + K, SRC = 0, SNK = 1;
  const gNode = g => 2 + g, kNode = k => 2 + G + k;
  const edges = []; // {to, cap, cost, rev}
  const adj = Array.from({ length: N }, () => []);
  const add = (u, v, cap, cost) => {
    adj[u].push(edges.length); edges.push({ u, v, cap, cost });
    adj[v].push(edges.length); edges.push({ u: v, v: u, cap: 0, cost: -cost });
  };
  const gk = [];
  for (let g = 0; g < G; g++) add(SRC, gNode(g), demand[g], 0);
  for (let g = 0; g < G; g++) for (let k = 0; k < K; k++) if (sups[k].games.includes(games[g])) {
    gk.push({ g, k, e: edges.length });
    add(gNode(g), kNode(k), Infinity, sups[k].cost_pct - 1.05);
  }
  for (let k = 0; k < K; k++) add(kNode(k), SNK, sups[k].wallet / sups[k].cost_pct, 0);
  const EPS = 1e-9;
  for (let iter = 0; iter < 200; iter++) {
    const dist = new Array(N).fill(Infinity), prev = new Array(N).fill(-1);
    dist[SRC] = 0;
    for (let r = 0; r < N; r++) {
      let ch = false;
      for (let ei = 0; ei < edges.length; ei++) {
        const e = edges[ei];
        if (e.cap > EPS && dist[e.u] + e.cost < dist[e.v] - 1e-12) { dist[e.v] = dist[e.u] + e.cost; prev[e.v] = ei; ch = true; }
      }
      if (!ch) break;
    }
    if (dist[SNK] === Infinity || dist[SNK] >= 0) break;
    let f = Infinity;
    for (let v = SNK; v !== SRC; v = edges[prev[v]].u) f = Math.min(f, edges[prev[v]].cap);
    if (!(f > EPS)) break;
    for (let v = SNK; v !== SRC; v = edges[prev[v]].u) { edges[prev[v]].cap -= f; edges[prev[v] ^ 1].cap += f; }
  }
  const budget = Array.from({ length: K }, () => new Float64Array(G));
  for (const { g, k, e } of gk) budget[k][g] = edges[e ^ 1].cap * sups[k].cost_pct;
  return budget;
}

module.exports = { allocate };
