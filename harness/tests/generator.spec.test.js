'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { generate } = require('../generator.js');
const { HARNESS } = require('./fixtures.js');

const SEEDS = [1, 2, 3, 101];

test('D15/R9 determinism: same seed ⇒ deep-equal output', () => {
  for (const s of SEEDS) assert.deepEqual(generate(s), generate(s));
});

test('D15/R9 different seeds differ', () => {
  assert.notDeepEqual(generate(1), generate(2));
});

for (const seed of SEEDS) {
  test(`R9 seed ${seed}: ~300 orders, VIP, unpaid, ≥4 games, outages, ≥2 staff shifts`, () => {
    const sc = generate(seed);
    assert.ok(sc.orders.length >= 280 && sc.orders.length <= 320, `orders=${sc.orders.length}`);
    assert.ok(sc.orders.some(o => o.vip === true), 'has VIP');
    assert.ok(sc.orders.some(o => o.paid_minute === null || o.paid_minute === undefined), 'has unpaid');
    assert.ok(new Set(sc.orders.map(o => o.game)).size >= 4, '≥4 games');
    assert.ok(sc.suppliers.some(s => Array.isArray(s.outages) && s.outages.length > 0), 'has outages');
    assert.ok(sc.staff.length >= 2, '≥2 staff shifts');
    assert.ok(sc.suppliers.every(s => typeof s.wallet_thb === 'number'), 'wallets');
  });

  test(`D12/R3 seed ${seed}: paid ≥ arrive, minutes within 0..1440, unique ids`, () => {
    const sc = generate(seed);
    const ids = new Set();
    for (const o of sc.orders) {
      assert.ok(!ids.has(o.id), `dup id ${o.id}`); ids.add(o.id);
      assert.ok(Number.isInteger(o.arrive_minute) && o.arrive_minute >= 0 && o.arrive_minute <= 1440);
      if (o.paid_minute !== null && o.paid_minute !== undefined) {
        assert.ok(Number.isInteger(o.paid_minute) && o.paid_minute <= 1440);
        assert.ok(o.paid_minute >= o.arrive_minute, `${o.id} paid<arrive`);
      }
    }
    for (const s of sc.suppliers) for (const w of s.outages) {
      assert.ok(Array.isArray(w) && w[0] >= 0 && w[1] <= 1440 && w[0] < w[1]);
    }
    for (const f of sc.staff) assert.ok(f.from >= 0 && f.to <= 1440 && f.from < f.to && f.count >= 0);
  });
}

test('R9 CLI --seed N prints JSON equal to generate(N)', () => {
  const out = execFileSync(process.execPath, [path.join(HARNESS, 'generator.js'), '--seed', '7'], { encoding: 'utf8' });
  assert.deepEqual(JSON.parse(out), JSON.parse(JSON.stringify(generate(7))));
});
