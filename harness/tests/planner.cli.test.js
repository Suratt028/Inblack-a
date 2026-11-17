'use strict';
// R10 CLI contract (CLAUDE.md I/O format) + determinism, for every strategy the planner exposes.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { PLANNER, SCENARIOS, runCli, listStrategies, independentCheck } = require('./planner.helpers.js');

const STRATS = listStrategies();
const SEED1 = path.join(SCENARIOS, 'seed-1.json');
const small = {
  orders: [
    { id: 'O1', arrive_minute: 10, paid_minute: 12, game: 'rov', value_thb: 430, vip: false, sla_minutes: 10 },
    { id: 'O2', arrive_minute: 11, paid_minute: null, game: 'rov', value_thb: 300, vip: true, sla_minutes: 10 },
  ],
  staff: [{ from: 0, to: 1440, count: 1 }],
  suppliers: [{ id: 'S1', games: ['rov'], wallet_thb: 45000, cost_pct: 0.94, outages: [[300, 420]] }],
};

test('R11 strategy discovery finds the fcfs baseline', () => {
  assert.ok(STRATS.includes('fcfs'), `strategies: ${STRATS.join(',')}`);
});

test('R10 CLI default (no --strategy) writes {assignments:[{order_id,supplier_id,start_minute}]}', () => {
  const r = runCli(small);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(Object.keys(r.plan), ['assignments']);
  assert.deepEqual(r.plan.assignments, [{ order_id: 'O1', supplier_id: 'S1', start_minute: r.plan.assignments[0].start_minute }]);
  assert.deepEqual(independentCheck(small, r.plan), []);
});

for (const s of STRATS) {
  test(`R10 CLI --strategy ${s}: exit 0, output format, valid on example`, () => {
    const r = runCli(small, s);
    assert.equal(r.status, 0, r.stderr);
    assert.ok(r.plan && Array.isArray(r.plan.assignments), `bad output: ${r.raw}`);
    assert.deepEqual(Object.keys(r.plan), ['assignments']);
    for (const a of r.plan.assignments) {
      assert.equal(typeof a.order_id, 'string');
      assert.equal(typeof a.supplier_id, 'string');
      assert.ok(Number.isInteger(a.start_minute));
    }
    assert.deepEqual(independentCheck(small, r.plan), []);
  });

  test(`determinism --strategy ${s}: same input twice → byte-identical plan (seed-1)`, () => {
    const r1 = runCli(SEED1, s), r2 = runCli(SEED1, s);
    assert.equal(r1.status, 0, r1.stderr);
    assert.equal(r2.status, 0, r2.stderr);
    assert.ok(r1.raw && r1.raw.length > 0);
    assert.equal(r1.raw, r2.raw);
  });
}

test('R10 CLI: unknown --strategy fails (no silent fallback)', () => {
  const r = runCli(small, '__no_such_strategy__');
  assert.notEqual(r.status, 0);
});

test('R10 CLI: wrong argument count exits non-zero', () => {
  const r = spawnSync(process.execPath, [PLANNER], { encoding: 'utf8' });
  assert.notEqual(r.status, 0);
});

test('R10 CLI: planner does not modify the scenario file', () => {
  const before = fs.readFileSync(SEED1, 'utf8');
  for (const s of STRATS) runCli(SEED1, s);
  assert.equal(fs.readFileSync(SEED1, 'utf8'), before);
});
