#!/usr/bin/env node
'use strict';
// Deterministic seeded scenario generator (T02). Same seed + config => byte-identical JSON.
const fs = require('fs');
const path = require('path');
const { createRng } = require('./lib/rng');

const DEFAULT_CONFIG = JSON.parse(fs.readFileSync(path.join(__dirname, 'generator.config.json'), 'utf8'));
const r2 = (x) => Math.round(x * 100) / 100;

function generate(seed, config = DEFAULT_CONFIG) {
  const c = config;
  const rng = createRng(Number(seed) * 2654435761 + 12345);
  const games = Object.keys(c.games);
  const gameW = games.map((g) => c.games[g]);

  // --- orders ---
  const n = rng.int(c.orders.min, c.orders.max);
  const comps = c.arrival.components;
  const raw = [];
  for (let i = 0; i < n; i++) {
    const comp = rng.pickWeighted(comps, comps.map((x) => x.weight));
    let t = comp.type === 'normal' ? rng.normal(comp.mean, comp.sd) : rng.float(comp.from, comp.to);
    t = Math.max(0, Math.min(c.maxArriveMinute, Math.floor(t)));
    const vip = rng.chance(c.vipRate);
    const unpaid = rng.chance(c.unpaidRate);
    const delay = rng.int(c.paidDelay.min, c.paidDelay.max);
    const u = rng.next();
    let value = c.value.min - (c.value.mean - c.value.min) * Math.log(1 - u);
    value = Math.min(c.value.max, Math.round(value / c.value.roundTo) * c.value.roundTo);
    const [slo, shi] = vip ? c.sla.vip : c.sla.normal;
    raw.push({
      arrive_minute: t,
      paid_minute: unpaid ? null : Math.min(1439, t + delay),
      game: rng.pickWeighted(games, gameW),
      value_thb: value,
      vip,
      sla_minutes: rng.int(slo, shi),
      _k: i,
    });
  }
  raw.sort((a, b) => a.arrive_minute - b.arrive_minute || a._k - b._k);
  const width = Math.max(3, String(n).length);
  const orders = raw.map((o, i) => {
    const { _k, ...rest } = o;
    return { id: 'O' + String(i + 1).padStart(width, '0'), ...rest };
  });

  // --- staff ---
  const staff = c.staff.shifts
    .map((s) => ({ from: s.from, to: s.to, count: rng.int(s.countMin, s.countMax) }))
    .filter((s) => s.count > 0);

  // --- suppliers ---
  const sc = c.suppliers;
  const suppliers = [];
  for (let i = 0; i < sc.count; i++) {
    const k = rng.int(sc.gamesPerSupplier[0], Math.min(sc.gamesPerSupplier[1], games.length));
    const sg = rng.shuffle(games).slice(0, k);
    const nOut = rng.int(sc.outages.count[0], sc.outages.count[1]);
    const outages = [];
    for (let j = 0; j < nOut; j++) {
      const len = rng.int(sc.outages.length[0], sc.outages.length[1]);
      const a = rng.int(0, 1440 - len);
      outages.push([a, a + len]);
    }
    outages.sort((x, y) => x[0] - y[0]);
    suppliers.push({ id: 'S' + (i + 1), games: sg, wallet_thb: 0, cost_pct: r2(rng.float(sc.costPct[0], sc.costPct[1])), outages });
  }
  // coverage: every game supported by >=1 supplier, except optionally one (D3b exercise)
  const uncovered = rng.chance(sc.uncoveredGameProb) ? games[rng.int(0, games.length - 1)] : null;
  for (const g of games) {
    if (g === uncovered) { for (const s of suppliers) s.games = s.games.filter((x) => x !== g); continue; }
    if (!suppliers.some((s) => s.games.includes(g))) suppliers[rng.int(0, suppliers.length - 1)].games.push(g);
  }
  for (const s of suppliers) s.games.sort((a, b) => games.indexOf(a) - games.indexOf(b));

  // --- wallets ---
  const cheapest = {}; // game -> supplier (lowest cost_pct, then id)
  for (const g of games) {
    const sup = suppliers.filter((s) => s.games.includes(g)).sort((a, b) => a.cost_pct - b.cost_pct || (a.id < b.id ? -1 : 1));
    if (sup.length) cheapest[g] = sup[0];
  }
  const gameCost = {};
  let totalCost = 0;
  for (const o of orders) {
    if (o.paid_minute === null || !cheapest[o.game]) continue;
    const cost = o.value_thb * cheapest[o.game].cost_pct;
    gameCost[o.game] = (gameCost[o.game] || 0) + cost;
    totalCost += cost;
  }
  const totalWallet = totalCost * rng.float(c.wallet.totalFactor[0], c.wallet.totalFactor[1]);
  const caps = suppliers.map((s) => {
    const cg = games.filter((g) => cheapest[g] === s && gameCost[g] > 0);
    return cg.length ? c.wallet.cheapestCapFraction * Math.min(...cg.map((g) => gameCost[g])) : Infinity;
  });
  const w = suppliers.map(() => rng.float(0.5, 1.5));
  const alloc = suppliers.map(() => 0);
  let remaining = totalWallet;
  let open = suppliers.map((_, i) => i);
  for (let iter = 0; iter < suppliers.length + 1 && remaining > 1e-6 && open.length; iter++) {
    const ws = open.reduce((s, i) => s + w[i], 0);
    const next = [];
    let used = 0;
    for (const i of open) {
      const want = remaining * (w[i] / ws);
      const give = Math.min(want, caps[i] - alloc[i]);
      alloc[i] += give; used += give;
      if (alloc[i] < caps[i] - 1e-6) next.push(i);
    }
    remaining -= used;
    open = next;
  }
  suppliers.forEach((s, i) => { s.wallet_thb = Math.floor(alloc[i]); });

  return { orders, staff, suppliers };
}

function main(argv) {
  let seed = null, out = null, cfgPath = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--seed') seed = argv[++i];
    else if (argv[i] === '--out') out = argv[++i];
    else if (argv[i] === '--config') cfgPath = argv[++i];
  }
  if (seed === null || !/^-?\d+$/.test(String(seed))) {
    process.stderr.write('usage: node harness/generator.js --seed N [--out file] [--config file]\n');
    process.exit(2);
  }
  const cfg = cfgPath ? JSON.parse(fs.readFileSync(cfgPath, 'utf8')) : DEFAULT_CONFIG;
  const json = JSON.stringify(generate(Number(seed), cfg), null, 2) + '\n';
  if (out) fs.writeFileSync(out, json); else process.stdout.write(json);
}

if (require.main === module) main(process.argv.slice(2));
module.exports = { generate, DEFAULT_CONFIG };
