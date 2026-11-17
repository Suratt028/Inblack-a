'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { validate } = require('../validator.js');
const { order, supplier, shift, scenario, a, plan, rules } = require('./fixtures.js');

const V = (sc, p, strict = false) => validate(sc, p, { strict });

test('R7 normal: valid single assignment accepted with cost value×cost_pct (D4)', () => {
  const r = V(scenario(), plan(a('O1', 'S1', 0)));
  assert.equal(r.violations.length, 0);
  assert.equal(r.accepted.length, 1);
  assert.equal(r.accepted[0].order_id, 'O1');
  assert.ok(Math.abs(r.accepted[0].cost - 10) < 1e-6); // 100 × 0.1
  assert.deepEqual(r.duplicates, []);
});

test('BAD_INPUT: plan without assignments array throws', () => {
  assert.throws(() => V(scenario(), {}));
  assert.throws(() => V(scenario(), { assignments: 'x' }));
});

test('BAD_INPUT: assignment missing fields', () => {
  const r = V(scenario(), plan({ order_id: 'O1', start_minute: 0 }));
  assert.deepEqual(rules(r), ['BAD_INPUT']);
  assert.equal(r.accepted.length, 0);
});

test('D9 BAD_MINUTE: non-integer start minute', () => {
  for (const s of [1.5, '10', NaN]) {
    const r = V(scenario(), plan(a('O1', 'S1', s)));
    assert.equal(r.accepted.length, 0, `start ${s}`);
    assert.ok(['BAD_MINUTE', 'BAD_INPUT'].includes(rules(r)[0]), `start ${s}: ${rules(r)}`);
  }
  assert.deepEqual(rules(V(scenario(), plan(a('O1', 'S1', 1.5)))), ['BAD_MINUTE']);
});

test('D9 UNKNOWN_ORDER and UNKNOWN_SUPPLIER', () => {
  assert.deepEqual(rules(V(scenario(), plan(a('NOPE', 'S1', 0)))), ['UNKNOWN_ORDER']);
  assert.deepEqual(rules(V(scenario(), plan(a('O1', 'NOPE', 0)))), ['UNKNOWN_SUPPLIER']);
});

test('R2 UNPAID: unpaid order submitted', () => {
  const sc = scenario({ orders: [order({ paid_minute: null })] });
  assert.deepEqual(rules(V(sc, plan(a('O1', 'S1', 10)))), ['UNPAID']);
});

test('R2/D12 BEFORE_PAID: start before paid_minute; start == paid OK', () => {
  const sc = scenario({ orders: [order({ arrive_minute: 5, paid_minute: 20 })] });
  assert.deepEqual(rules(V(sc, plan(a('O1', 'S1', 19)))), ['BEFORE_PAID']);
  assert.equal(V(sc, plan(a('O1', 'S1', 20))).violations.length, 0);
});

test('D5/R3 minute 0 start is valid', () => {
  assert.equal(V(scenario(), plan(a('O1', 'S1', 0))).violations.length, 0);
});

test('D5/D10 start 1435 (finish 1440) OK default, OUT_OF_DAY strict', () => {
  assert.equal(V(scenario(), plan(a('O1', 'S1', 1435))).violations.length, 0);
  assert.deepEqual(rules(V(scenario(), plan(a('O1', 'S1', 1435)), true)), ['OUT_OF_DAY']);
  assert.equal(V(scenario(), plan(a('O1', 'S1', 1434)), true).violations.length, 0); // 1434+5=1439 not >1439
});

test('D5 start 1436 OUT_OF_DAY (finish 1441 > 1440)', () => {
  assert.deepEqual(rules(V(scenario(), plan(a('O1', 'S1', 1436)))), ['OUT_OF_DAY']);
  // negative start removed: always also BEFORE_PAID (paid>=0) → multi-cause, out of scope per Lead
});

test('R5 UNSUPPORTED_GAME', () => {
  const sc = scenario({ suppliers: [supplier({ games: ['PUBG'] })] });
  assert.deepEqual(rules(V(sc, plan(a('O1', 'S1', 0)))), ['UNSUPPORTED_GAME']);
});

test('D10 outage: start at outage end b OK default, OUTAGE strict', () => {
  const sc = scenario({ suppliers: [supplier({ outages: [{ start: 100, end: 200 }] })] });
  assert.equal(V(sc, plan(a('O1', 'S1', 200))).violations.length, 0); // 200<200 false
  assert.deepEqual(rules(V(sc, plan(a('O1', 'S1', 200)), true)), ['OUTAGE']); // 200<=200
  assert.equal(V(sc, plan(a('O1', 'S1', 201)), true).violations.length, 0);
});

test('D10 outage: order ending at outage start a OK default, OUTAGE strict', () => {
  const sc = scenario({ suppliers: [supplier({ outages: [{ start: 100, end: 200 }] })] });
  assert.equal(V(sc, plan(a('O1', 'S1', 95))).violations.length, 0); // 95+5=100 > 100 false
  assert.deepEqual(rules(V(sc, plan(a('O1', 'S1', 95)), true)), ['OUTAGE']); // 100>=100
  assert.equal(V(sc, plan(a('O1', 'S1', 94)), true).violations.length, 0);
});

test('D10 outage: overlap inside outage is OUTAGE (default)', () => {
  const sc = scenario({ suppliers: [supplier({ outages: [{ start: 100, end: 200 }] })] });
  assert.deepEqual(rules(V(sc, plan(a('O1', 'S1', 96)))), ['OUTAGE']);
  assert.deepEqual(rules(V(sc, plan(a('O1', 'S1', 199)))), ['OUTAGE']);
});

test('D10/D11 shift: start exactly at shift from is OK', () => {
  const sc = scenario({ shifts: [shift({ from: 480, to: 960 })] });
  assert.equal(V(sc, plan(a('O1', 'S1', 480))).violations.length, 0);
  assert.equal(V(sc, plan(a('O1', 'S1', 480)), true).violations.length, 0);
  assert.deepEqual(rules(V(sc, plan(a('O1', 'S1', 479)))), ['OVER_STAFF']); // minute 479 cap 0
});

test('D10 shift: order ending exactly at shift to OK default, OVER_STAFF strict', () => {
  const sc = scenario({ shifts: [shift({ from: 480, to: 960 })] });
  assert.equal(V(sc, plan(a('O1', 'S1', 955))).violations.length, 0); // [955,960) covered
  assert.deepEqual(rules(V(sc, plan(a('O1', 'S1', 955)), true)), ['OVER_STAFF']); // cap(960)=0
  assert.equal(V(sc, plan(a('O1', 'S1', 954)), true).violations.length, 0);
  assert.deepEqual(rules(V(sc, plan(a('O1', 'S1', 956)))), ['OVER_STAFF']);
});

test('R1/R4 OVER_STAFF: count 1, two overlapping orders → second rejected', () => {
  const sc = scenario({ orders: [order({ order_id: 'O1' }), order({ order_id: 'O2' })] });
  const r = V(sc, plan(a('O2', 'S1', 12), a('O1', 'S1', 10)));
  assert.deepEqual(r.accepted.map(x => x.order_id), ['O1']); // sorted by start: O1@10 first
  assert.deepEqual(r.violations.map(v => [v.order_id, v.rule]), [['O2', 'OVER_STAFF']]);
});

test('R1/D10 adjacent orders [s,s+5) and [s+5,..) share one staff OK', () => {
  const sc = scenario({ orders: [order({ order_id: 'O1' }), order({ order_id: 'O2' })] });
  const r = V(sc, plan(a('O1', 'S1', 10), a('O2', 'S1', 15)));
  assert.equal(r.violations.length, 0);
  assert.equal(r.accepted.length, 2);
});

test('D11 overlapping shifts sum capacity', () => {
  const sc = scenario({
    orders: [order({ order_id: 'O1' }), order({ order_id: 'O2' })],
    shifts: [shift({ from: 0, to: 600, count: 1 }), shift({ from: 0, to: 600, count: 1 })],
  });
  assert.equal(V(sc, plan(a('O1', 'S1', 10), a('O2', 'S1', 10))).violations.length, 0);
});

test('D4/D4b WALLET: shared wallet, second order (by start then id) rejected', () => {
  // wallet 15; each order cost 100×0.1 = 10 → first fits (15−10=5), second 5<10 → WALLET
  const sc = scenario({
    orders: [order({ order_id: 'O1' }), order({ order_id: 'O2' })],
    suppliers: [supplier({ wallet_thb: 15 })],
    shifts: [shift({ count: 2 })],
  });
  const r = V(sc, plan(a('O2', 'S1', 10), a('O1', 'S1', 10))); // same start → id asc
  assert.deepEqual(r.accepted.map(x => x.order_id), ['O1']);
  assert.deepEqual(r.violations.map(v => [v.order_id, v.rule]), [['O2', 'WALLET']]);
  const r2 = V(sc, plan(a('O1', 'S1', 50), a('O2', 'S1', 20))); // O2 earlier start wins
  assert.deepEqual(r2.accepted.map(x => x.order_id), ['O2']);
  assert.deepEqual(r2.violations.map(v => [v.order_id, v.rule]), [['O1', 'WALLET']]);
});

test('D4 wallet exactly equal to cost is enough', () => {
  const sc = scenario({ suppliers: [supplier({ wallet_thb: 10 })] }); // cost 10
  assert.equal(V(sc, plan(a('O1', 'S1', 0))).violations.length, 0);
});

test('D7 rejected item does not consume wallet', () => {
  // O1 rejected (BEFORE_PAID); O2 and O3 each cost 10, wallet 20 → both accepted
  const sc = scenario({
    orders: [order({ order_id: 'O1', paid_minute: 100 }), order({ order_id: 'O2' }), order({ order_id: 'O3' })],
    suppliers: [supplier({ wallet_thb: 20 })],
    shifts: [shift({ count: 3 })],
  });
  const r = V(sc, plan(a('O1', 'S1', 0), a('O2', 'S1', 10), a('O3', 'S1', 20)));
  assert.deepEqual(rules(r), ['BEFORE_PAID']);
  assert.deepEqual(r.accepted.map(x => x.order_id).sort(), ['O2', 'O3']);
});

test('D7 rejected item does not consume staff', () => {
  const sc = scenario({ orders: [order({ order_id: 'O1', paid_minute: 100 }), order({ order_id: 'O2' })] });
  const r = V(sc, plan(a('O1', 'S1', 10), a('O2', 'S1', 10)));
  assert.deepEqual(rules(r), ['BEFORE_PAID']);
  assert.deepEqual(r.accepted.map(x => x.order_id), ['O2']);
});

test('D8 duplicates listed once', () => {
  const r = V(scenario(), plan(a('O1', 'S1', 0), a('O1', 'S1', 100), a('O1', 'S1', 200)));
  assert.deepEqual(r.duplicates, ['O1']);
});

test('violation entries carry index/order_id/supplier_id/start_minute/rule/detail', () => {
  const r = V(scenario(), plan(a('O1', 'S1', 0), a('NOPE', 'S1', 7)));
  const v = r.violations[0];
  assert.equal(v.index, 1);
  assert.equal(v.order_id, 'NOPE');
  assert.equal(v.supplier_id, 'S1');
  assert.equal(v.start_minute, 7);
  assert.equal(v.rule, 'UNKNOWN_ORDER');
  assert.equal(typeof v.detail, 'string');
});
