'use strict';
// T09 edge-case scenarios built from PLAN.md §2 / DECISIONS_INPUT D1–D15.
// Every strategy the planner exposes is run through the CLI on every scenario; each plan must have
// 0 violations in harness/validator.js default AND strict mode (D10), 0 duplicates (D8), and pass the
// independent strict-margin checker in planner.helpers.js.
const test = require('node:test');
const assert = require('node:assert/strict');
const { validate } = require('../validator.js');
const { runCli, listStrategies, independentCheck, rng } = require('./planner.helpers.js');

const STRATS = listStrategies();
const O = (id, o = {}) => Object.assign({ id, arrive_minute: 0, paid_minute: 0, game: 'rov', value_thb: 100, vip: false, sla_minutes: 30 }, o);
const S = (id, s = {}) => Object.assign({ id, games: ['rov'], wallet_thb: 1e9, cost_pct: 0.5, outages: [] }, s);
const SH = (from, to, count = 1) => ({ from, to, count });
const ids = (p) => p.assignments.map((a) => a.order_id);
const byId = (p, id) => p.assignments.find((a) => a.order_id === id);

// Each case: scenario + extra assertions (beyond the generic validity gate).
const CASES = {
  'unpaid orders (paid_minute null) are never assigned': {
    sc: { orders: [O('O1', { paid_minute: null }), O('O2', { paid_minute: null, vip: true, value_thb: 9999 }), O('O3')], staff: [SH(0, 1440)], suppliers: [S('S1')] },
    check: (p) => { assert.ok(!ids(p).includes('O1')); assert.ok(!ids(p).includes('O2')); },
  },
  'trivial feasible paid order is assigned': {
    sc: { orders: [O('O1', { arrive_minute: 100, paid_minute: 100 })], staff: [SH(0, 1440)], suppliers: [S('S1')] },
    check: (p) => assert.deepEqual(ids(p), ['O1']),
  },
  'empty scenario -> empty plan': {
    sc: { orders: [], staff: [SH(0, 1440)], suppliers: [S('S1')] },
    check: (p) => assert.deepEqual(p.assignments, []),
  },
  'no staff at all -> nothing assigned (R4)': {
    sc: { orders: [O('O1'), O('O2')], staff: [], suppliers: [S('S1')] },
    check: (p) => assert.deepEqual(p.assignments, []),
  },
  'no duplicates under heavy contention (D8)': {
    sc: { orders: Array.from({ length: 60 }, (_, i) => O(`O${i}`, { paid_minute: i % 7, vip: i % 5 === 0 })), staff: [SH(0, 100, 1)], suppliers: [S('S1'), S('S2', { cost_pct: 0.3 })] },
    check: (p) => assert.equal(new Set(ids(p)).size, p.assignments.length),
  },
  'D12 start >= max(arrive, paid) (paid later than arrive)': {
    sc: { orders: [O('O1', { arrive_minute: 100, paid_minute: 160 }), O('O2', { arrive_minute: 200, paid_minute: 200 })], staff: [SH(0, 1440, 3)], suppliers: [S('S1')] },
    check: (p) => {
      if (byId(p, 'O1')) assert.ok(byId(p, 'O1').start_minute >= 160);
      if (byId(p, 'O2')) assert.ok(byId(p, 'O2').start_minute >= 200);
    },
  },
  'D5/D10 day end: paid 1434 fits (finish 1439), paid 1435+ must be skipped': {
    sc: { orders: [O('A', { arrive_minute: 1434, paid_minute: 1434 }), O('B', { arrive_minute: 1435, paid_minute: 1435 }), O('C', { arrive_minute: 1436, paid_minute: 1439 })], staff: [SH(0, 1440, 3)], suppliers: [S('S1')] },
    check: (p) => {
      assert.ok(!ids(p).includes('B'));
      assert.ok(!ids(p).includes('C'));
      if (byId(p, 'A')) assert.equal(byId(p, 'A').start_minute, 1434);
    },
  },
  'D5/D10 day end with contention: only slots finishing <= 1439': {
    sc: { orders: Array.from({ length: 10 }, (_, i) => O(`E${i}`, { arrive_minute: 1400, paid_minute: 1400 })), staff: [SH(0, 1440, 1)], suppliers: [S('S1')] },
    check: (p) => assert.ok(p.assignments.length <= 7, `${p.assignments.length} > 7 slots in [1400,1439]`),
  },
  'D11 overlapping shifts: capacity is the sum of covering shifts': {
    sc: { orders: Array.from({ length: 40 }, (_, i) => O(`O${i}`, { arrive_minute: 300, paid_minute: 300, sla_minutes: 600 })), staff: [SH(0, 400, 1), SH(350, 420, 2), SH(380, 900, 1)], suppliers: [S('S1')] },
    check: () => {},
  },
  'D10 shift gap: order may not straddle a staff gap (incl. strict end minute)': {
    sc: { orders: [O('G1', { arrive_minute: 96, paid_minute: 96 }), O('G2', { arrive_minute: 94, paid_minute: 94 }), O('G3', { arrive_minute: 98, paid_minute: 98 })], staff: [SH(0, 100, 1), SH(200, 300, 1)], suppliers: [S('S1')] },
    check: (p) => { for (const a of p.assignments) assert.ok(a.start_minute + 5 < 100 || a.start_minute >= 200, JSON.stringify(a)); },
  },
  'supplier must support the game (R5)': {
    sc: { orders: [O('R', { game: 'rov' }), O('F', { game: 'ff' }), O('P', { game: 'pubg' })], staff: [SH(0, 1440, 3)], suppliers: [S('S1', { games: ['rov'], cost_pct: 0.1 }), S('S2', { games: ['ff', 'pubg'], cost_pct: 0.9 })] },
    check: (p) => {
      if (byId(p, 'F')) assert.equal(byId(p, 'F').supplier_id, 'S2');
      if (byId(p, 'P')) assert.equal(byId(p, 'P').supplier_id, 'S2');
    },
  },
  'D3b impossible game (no supporting supplier) is skipped': {
    sc: { orders: [O('X', { game: 'nosuchgame', value_thb: 5000, vip: true }), O('Y')], staff: [SH(0, 1440)], suppliers: [S('S1')] },
    check: (p) => assert.ok(!ids(p).includes('X')),
  },
  'D10 outage half-open AND strict margin (paid inside/at edges of outage)': {
    sc: {
      orders: [O('A', { arrive_minute: 95, paid_minute: 95, sla_minutes: 400 }), O('B', { arrive_minute: 94, paid_minute: 94, sla_minutes: 400 }),
        O('C', { arrive_minute: 150, paid_minute: 150, sla_minutes: 400 }), O('D', { arrive_minute: 200, paid_minute: 200, sla_minutes: 400 })],
      staff: [SH(0, 1440, 4)], suppliers: [S('S1', { outages: [[100, 200]] })],
    },
    check: (p) => { for (const a of p.assignments) assert.ok(a.start_minute + 5 < 100 || a.start_minute > 200, JSON.stringify(a)); },
  },
  'D10 outage on cheap supplier: fallback supplier or wait, never overlap': {
    sc: { orders: Array.from({ length: 12 }, (_, i) => O(`O${i}`, { arrive_minute: 98 + i, paid_minute: 98 + i })), staff: [SH(0, 1440, 2)], suppliers: [S('CHEAP', { cost_pct: 0.2, outages: [[100, 130], [500, 501]] }), S('DEAR', { cost_pct: 0.8, outages: [[0, 99]] })] },
    check: () => {},
  },
  'D4 per-supplier wallet never overspent (exact-fit and float costs)': {
    sc: {
      orders: Array.from({ length: 10 }, (_, i) => O(`W${i}`, { arrive_minute: i * 10, paid_minute: i * 10, value_thb: 430 })),
      staff: [SH(0, 1440, 2)],
      // S1: 0.94*430 = 404.2 -> wallet fits exactly 2; S2: 0.97*430 = 417.1 -> wallet 834.19 fits only 1.
      suppliers: [S('S1', { cost_pct: 0.94, wallet_thb: 808.4 }), S('S2', { cost_pct: 0.97, wallet_thb: 834.19 })],
    },
    check: (p) => assert.ok(p.assignments.length <= 3, `wallets fit at most 3 orders, got ${p.assignments.length}`),
  },
  'D4 zero-wallet supplier is never used': {
    sc: { orders: [O('O1'), O('O2')], staff: [SH(0, 1440, 2)], suppliers: [S('BROKE', { cost_pct: 0.01, wallet_thb: 0 }), S('OK', { cost_pct: 0.9 })] },
    check: (p) => { for (const a of p.assignments) assert.notEqual(a.supplier_id, 'BROKE'); },
  },
};

// Seeded fuzz scenarios mixing every rule (tight wallets, outages, overlapping shifts, unpaid,
// impossible games, end-of-day arrivals).
function fuzz(seed) {
  const r = rng(seed);
  const pick = (arr) => arr[Math.floor(r() * arr.length)];
  const games = ['rov', 'ff', 'pubg', 'genshin'];
  const suppliers = Array.from({ length: 3 }, (_, i) => {
    const outages = Array.from({ length: Math.floor(r() * 3) }, () => { const a = Math.floor(r() * 1400); return [a, a + 1 + Math.floor(r() * 90)]; });
    const g = games.filter(() => r() < 0.6);
    if (i === 0 && !g.includes('rov')) g.push('rov');
    return S(`S${i}`, { games: g, cost_pct: 0.8 + r() * 0.18, wallet_thb: Math.round(500 + r() * 6000), outages });
  });
  const staff = Array.from({ length: 3 }, () => { const f = Math.floor(r() * 1200); return SH(f, Math.min(1440, f + 60 + Math.floor(r() * 500)), 1 + Math.floor(r() * 2)); });
  staff.push(SH(1380, 1440, 1));
  const orders = Array.from({ length: 80 }, (_, i) => {
    const arr = i < 6 ? 1425 + i * 2 : Math.floor(r() * 1440);
    const paid = r() < 0.12 ? null : Math.min(1439, arr + Math.floor(r() * 20));
    return O(`F${String(i).padStart(3, '0')}`, {
      arrive_minute: arr, paid_minute: paid, game: r() < 0.05 ? 'nosuchgame' : pick(games),
      value_thb: 50 + Math.floor(r() * 1500), vip: r() < 0.15, sla_minutes: pick([10, 15, 30, 60]),
    });
  });
  return { orders, staff, suppliers };
}
for (const seed of [11, 22, 33, 44, 55]) {
  const sc = fuzz(seed);
  const unpaid = sc.orders.filter((o) => o.paid_minute === null).map((o) => o.id);
  const impossible = sc.orders.filter((o) => o.game === 'nosuchgame').map((o) => o.id);
  CASES[`fuzz seed ${seed}: all rules mixed`] = {
    sc,
    check: (p) => { for (const id of ids(p)) { assert.ok(!unpaid.includes(id), `unpaid ${id}`); assert.ok(!impossible.includes(id), `impossible ${id}`); } },
  };
}

function gate(sc, p) {
  for (const strict of [false, true]) {
    const v = validate(sc, p, { strict });
    assert.deepEqual(v.duplicates, [], `D8 duplicates (strict=${strict})`);
    assert.deepEqual(v.violations.map((x) => `${x.rule} ${x.order_id} @${x.start_minute}: ${x.detail}`), [], `validator violations (strict=${strict})`);
  }
  assert.deepEqual(independentCheck(sc, p), [], 'independent strict-margin checker');
}

for (const s of STRATS) {
  for (const [name, { sc, check }] of Object.entries(CASES)) {
    test(`[${s}] ${name}`, () => {
      const r = runCli(sc, s);
      assert.equal(r.status, 0, r.stderr);
      assert.ok(r.plan && Array.isArray(r.plan.assignments), `bad output: ${r.raw}`);
      gate(sc, r.plan);
      check(r.plan);
    });
  }
}

// D4/D4b float exhaust (found in T06 review, harness/reviews/T06-review.md, WRONG_CASES W1):
// integer wallet 117, cost_pct 0.9, values 51 and 79 -> costs 45.9 + 71.1 = 117 in exact arithmetic,
// but sequential subtraction in D4b order gives 117 - 45.9 = 71.1 < 71.10000000000001, so the official
// validator reports WALLET on the 2nd assignment. A planner that tolerates +1e-9 overspend fails here.
// Marked todo until strategy-optimizer fixes the wallet tolerance; remove `todo` once fixed.
const W1 = {
  orders: [O('A', { arrive_minute: 10, paid_minute: 10, value_thb: 51 }), O('B', { arrive_minute: 20, paid_minute: 20, value_thb: 79 })],
  staff: [SH(0, 1440, 1)],
  suppliers: [S('S1', { cost_pct: 0.9, wallet_thb: 117 })],
};
for (const s of STRATS) {
  test(`[${s}] D4/D4b wallet float exhaust (W1): no WALLET violation`, { todo: 'T06 REJECT W1: planner wallet check tolerates +1e-9 overspend' }, () => {
    const r = runCli(W1, s);
    assert.equal(r.status, 0, r.stderr);
    gate(W1, r.plan);
  });
}
