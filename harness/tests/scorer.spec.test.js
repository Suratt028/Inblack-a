'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { score } = require('../scorer.js');
const { order, supplier, shift, scenario, a, plan, near } = require('./fixtures.js');

const S = (sc, p, opts = {}) => score(sc, p, Object.assign({ slaBasis: 'paid', strict: false }, opts));
const byId = (r, id) => r.orders.find(o => o.order_id === id);

test('R7 normal single order: profit = value − value×cost_pct', () => {
  const r = S(scenario(), plan(a('O1', 'S1', 0)));
  // 100 − 100×0.1 = 90; finish 5 ≤ 0+30 → no late
  assert.ok(near(r.totals.profit, 90));
  assert.ok(near(r.total, 90));
  assert.ok(near(r.maxProfit, 90));
  assert.ok(near(r.scorePct, 100));
  assert.equal(r.counts.done, 1);
  assert.equal(r.slaBasis, 'paid');
  assert.equal(r.strict, false);
  const o = byId(r, 'O1');
  assert.equal(o.status, 'done');
  assert.equal(o.supplier_id, 'S1');
  assert.equal(o.start_minute, 0);
});

test('D1/D2 SLA late, paid basis vs arrive basis', () => {
  const sc = scenario({ orders: [order({ arrive_minute: 0, paid_minute: 20, sla_minutes: 30 })] });
  const p = plan(a('O1', 'S1', 50));
  // paid: late = max(0, 55 − (20+30)) = 5 → total 90−5 = 85
  const rp = S(sc, p, { slaBasis: 'paid' });
  assert.equal(byId(rp, 'O1').lateMinutes, 5);
  assert.ok(near(rp.totals.slaPenalty, 5));
  assert.ok(near(rp.total, 85));
  // arrive: late = 55 − (0+30) = 25 → total 65
  const ra = S(sc, p, { slaBasis: 'arrive' });
  assert.equal(ra.slaBasis, 'arrive');
  assert.equal(byId(ra, 'O1').lateMinutes, 25);
  assert.ok(near(ra.total, 65));
  assert.equal(rp.counts.overSla, 1);
});

test('D1 default slaBasis is paid', () => {
  const sc = scenario({ orders: [order({ arrive_minute: 0, paid_minute: 20, sla_minutes: 30 })] });
  const r = score(sc, plan(a('O1', 'S1', 50)), {});
  assert.equal(r.slaBasis, 'paid');
  assert.ok(near(r.total, 85));
});

test('D2 VIP lateness costs 2 per minute', () => {
  const sc = scenario({ orders: [order({ vip: true, paid_minute: 0, sla_minutes: 10 })] });
  // late = 25 − 10 = 15 → penalty 30 → total 90 − 30 = 60
  const r = S(sc, plan(a('O1', 'S1', 20)));
  assert.equal(byId(r, 'O1').lateMinutes, 15);
  assert.ok(near(byId(r, 'O1').slaPenalty, 30));
  assert.ok(near(r.total, 60));
});

test('D2 lateness measured at finish (start+5), not start', () => {
  const sc = scenario({ orders: [order({ paid_minute: 0, sla_minutes: 10 })] });
  // start 5 → finish 10 = deadline → 0 late; start 6 → finish 11 → 1 late
  assert.equal(byId(S(sc, plan(a('O1', 'S1', 5))), 'O1').lateMinutes, 0);
  assert.equal(byId(S(sc, plan(a('O1', 'S1', 6))), 'O1').lateMinutes, 1);
  assert.ok(near(S(sc, plan(a('O1', 'S1', 6))).total, 89));
});

test('D6 paid order not done → −5% of value', () => {
  const r = S(scenario({ orders: [order({ value_thb: 200 })] }), plan());
  // 0.05 × 200 = 10; maxProfit = 200×0.9 = 180; pct = −10/180×100
  assert.equal(byId(r, 'O1').status, 'not_done');
  assert.ok(near(r.totals.unprocessedPenalty, 10));
  assert.ok(near(r.total, -10));
  assert.ok(near(r.scorePct, -10 / 180 * 100));
  assert.equal(r.counts.paidNotDone, 1);
});

test('D14 negative scorePct reported as is', () => {
  const r = S(scenario(), plan(a('O1', 'S1', 2000)));
  // OUT_OF_DAY: −100 − 5 (5% of 100) = −105; maxProfit 90
  assert.ok(near(r.total, -105));
  assert.ok(r.scorePct < 0);
  assert.ok(near(r.scorePct, -105 / 90 * 100));
});

test('R2/D6 unpaid order submitted → UNPAID, −100, no −5%', () => {
  const sc = scenario({ orders: [order({ paid_minute: null }), order({ order_id: 'O2' })] });
  const r = S(sc, plan(a('O1', 'S1', 10), a('O2', 'S1', 0)));
  // O2 profit 90; O1 −100 → total −10; unpaid gets no 5%
  assert.equal(r.counts.violations, 1);
  assert.equal(r.violations[0].rule, 'UNPAID');
  assert.ok(near(r.totals.violationPenalty, 100));
  assert.ok(near(r.totals.unprocessedPenalty, 0));
  assert.ok(near(r.total, -10));
  assert.equal(byId(r, 'O1').status, 'unpaid');
});

test('D3 unpaid order never submitted → 0 and excluded from maxProfit', () => {
  const sc = scenario({ orders: [order({ paid_minute: null }), order({ order_id: 'O2' })] });
  const r = S(sc, plan(a('O2', 'S1', 0)));
  assert.ok(near(r.total, 90));
  assert.ok(near(r.maxProfit, 90));
  assert.equal(byId(r, 'O1').status, 'unpaid');
  assert.ok(near(byId(r, 'O1').unprocessedPenalty, 0));
});

test('D12 BEFORE_PAID scored as violation with D6 −5%', () => {
  const sc = scenario({ orders: [order({ paid_minute: 30 })] });
  const r = S(sc, plan(a('O1', 'S1', 10)));
  // −100 −5 = −105
  assert.equal(r.violations[0].rule, 'BEFORE_PAID');
  assert.ok(near(r.total, -105));
  assert.equal(byId(r, 'O1').status, 'not_done');
  assert.ok(near(byId(r, 'O1').profit, 0));
});

test('D6 invalid paid assignment (UNSUPPORTED_GAME) gets −100 and −5%', () => {
  const sc = scenario({
    orders: [order({ value_thb: 300 })],
    suppliers: [supplier({ supplier_id: 'S1', games: ['ROV'] }), supplier({ supplier_id: 'S2', games: ['PUBG'] })],
  });
  const r = S(sc, plan(a('O1', 'S2', 0)));
  // −100 − 0.05×300 = −115
  assert.equal(r.violations[0].rule, 'UNSUPPORTED_GAME');
  assert.ok(near(byId(r, 'O1').violationPenalty, 100));
  assert.ok(near(byId(r, 'O1').unprocessedPenalty, 15));
  assert.ok(near(r.total, -115));
});

test('D8 duplicates → total 0 and scorePct 0', () => {
  const sc = scenario({ orders: [order(), order({ order_id: 'O2' })], shifts: [shift({ count: 2 })] });
  const r = S(sc, plan(a('O1', 'S1', 0), a('O2', 'S1', 0), a('O1', 'S1', 100)));
  assert.equal(r.total, 0);
  assert.equal(r.scorePct, 0);
  assert.equal(r.counts.duplicates, 1);
});

test('D4/D4b wallet exhaustion: first accepted, second WALLET (−100, −5%)', () => {
  const sc = scenario({
    orders: [order({ order_id: 'O1' }), order({ order_id: 'O2' })],
    suppliers: [supplier({ wallet_thb: 15 })],
    shifts: [shift({ count: 2 })],
  });
  const r = S(sc, plan(a('O2', 'S1', 10), a('O1', 'S1', 10)));
  // O1 done: 90; O2: −100 − 5 → total −15
  assert.equal(byId(r, 'O1').status, 'done');
  assert.equal(byId(r, 'O2').status, 'not_done');
  assert.equal(r.violations[0].rule, 'WALLET');
  assert.ok(near(r.total, -15));
});

test('R4 OVER_STAFF: second overlapping order rejected in score', () => {
  const sc = scenario({ orders: [order({ order_id: 'O1' }), order({ order_id: 'O2' })] });
  const r = S(sc, plan(a('O1', 'S1', 10), a('O2', 'S1', 14)));
  assert.equal(r.violations[0].rule, 'OVER_STAFF');
  assert.ok(near(r.total, 90 - 100 - 5));
});

test('D3b impossible paid order: excluded from maxProfit and from −5%', () => {
  const sc = scenario({ orders: [order({ order_id: 'O1' }), order({ order_id: 'O2', game: 'NOBODY', value_thb: 1000 })] });
  const r = S(sc, plan(a('O1', 'S1', 0)));
  assert.equal(byId(r, 'O2').status, 'impossible');
  assert.ok(near(byId(r, 'O2').unprocessedPenalty, 0));
  assert.ok(near(r.maxProfit, 90));
  assert.ok(near(r.total, 90));
  assert.equal(r.counts.impossible, 1);
});

test('D3 maxProfit uses cheapest SUPPORTING supplier, ignoring wallet/staff/outage', () => {
  const sc = scenario({
    orders: [order({ order_id: 'O1', value_thb: 100 }), order({ order_id: 'O2', value_thb: 200, game: 'PUBG' }),
      order({ order_id: 'O3', value_thb: 50, paid_minute: null })],
    suppliers: [
      supplier({ supplier_id: 'CHEAP_OTHER', games: ['FF'], cost_pct: 0.01 }),
      supplier({ supplier_id: 'S1', games: ['ROV', 'PUBG'], cost_pct: 0.1, wallet_thb: 0 }),
      supplier({ supplier_id: 'S2', games: ['ROV'], cost_pct: 0.05, outages: [{ start: 0, end: 1440 }] }),
    ],
    shifts: [shift({ count: 0 })],
  });
  const r = S(sc, plan());
  // O1: 100×(1−0.05)=95; O2: 200×(1−0.1)=180; O3 unpaid excluded → 275
  assert.ok(near(r.maxProfit, 275));
  // nothing done: −5%×100 −5%×200 = −15
  assert.ok(near(r.total, -15));
});

test('D6 −100 per violation summed in totals; scorePct = total/maxProfit×100', () => {
  const sc = scenario({ orders: [order(), order({ order_id: 'O2' })] });
  const r = S(sc, plan(a('O1', 'S1', 0), a('O2', 'NOPE', 0), a('GHOST', 'S1', 50)));
  // O1 90; O2 UNKNOWN_SUPPLIER −100 −5; GHOST UNKNOWN_ORDER −100 → −115; max 180
  assert.equal(r.counts.violations, 2);
  assert.ok(near(r.totals.violationPenalty, 200));
  assert.ok(near(r.total, -115));
  assert.ok(near(r.scorePct, -115 / 180 * 100));
});

test('D10 strict option propagates: start 1435 valid default, violation strict', () => {
  const sc = scenario({ orders: [order({ paid_minute: 1430, sla_minutes: 30 })] });
  const d = S(sc, plan(a('O1', 'S1', 1435)));
  assert.ok(near(d.total, 90));
  const s = S(sc, plan(a('O1', 'S1', 1435)), { strict: true });
  assert.equal(s.strict, true);
  assert.equal(s.violations[0].rule, 'OUT_OF_DAY');
  assert.ok(near(s.total, -105));
});

test('total = profit − slaPenalty − unprocessedPenalty − violationPenalty', () => {
  const sc = scenario({ orders: [order({ vip: true, sla_minutes: 0 }), order({ order_id: 'O2' }), order({ order_id: 'O3' })] });
  const r = S(sc, plan(a('O1', 'S1', 0), a('O3', 'S1', 2000)));
  const t = r.totals;
  assert.ok(near(r.total, t.profit - t.slaPenalty - t.unprocessedPenalty - t.violationPenalty));
  // O1: 90 − 5×2=80; O2: −5; O3: −105 → −30
  assert.ok(near(r.total, -30));
});
