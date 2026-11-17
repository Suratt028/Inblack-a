'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { HARNESS, order, scenario, a, plan, near } = require('./fixtures.js');

const CLI = path.join(HARNESS, 'score.js');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 't04-'));
function write(name, obj) { const p = path.join(dir, name); fs.writeFileSync(p, typeof obj === 'string' ? obj : JSON.stringify(obj)); return p; }
function run(...args) { return spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' }); }

const sc = write('sc.json', scenario({ orders: [order({ arrive_minute: 0, paid_minute: 20, sla_minutes: 30 })] }));
const pl = write('pl.json', plan(a('O1', 'S1', 50)));

test('R8 CLI: exit 0 and prints score %', () => {
  const r = run(sc, pl);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /%/);
});

test('R8/D1 CLI --json paid basis: total 85 (late 55−50=5)', () => {
  const r = run(sc, pl, '--json');
  assert.equal(r.status, 0, r.stderr);
  const j = JSON.parse(r.stdout);
  assert.equal(j.slaBasis, 'paid');
  assert.ok(near(j.total, 85));
});

test('D1 CLI --sla-basis arrive: total 65 (late 55−30=25)', () => {
  const j = JSON.parse(run(sc, pl, '--sla-basis', 'arrive', '--json').stdout);
  assert.equal(j.slaBasis, 'arrive');
  assert.ok(near(j.total, 65));
});

test('D10 CLI --strict: start 1435 → OUT_OF_DAY', () => {
  const p2 = write('pl2.json', plan(a('O1', 'S1', 1435)));
  const j = JSON.parse(run(sc, p2, '--strict', '--json').stdout);
  assert.equal(j.strict, true);
  assert.equal(j.violations[0].rule, 'OUT_OF_DAY');
});

test('BAD_INPUT CLI exit 2: missing file, bad JSON, plan without assignments', () => {
  assert.equal(run(sc, path.join(dir, 'nope.json')).status, 2);
  assert.equal(run(sc, write('bad.json', '{not json')).status, 2);
  assert.equal(run(sc, write('noassign.json', {})).status, 2);
  assert.equal(run().status, 2);
});
