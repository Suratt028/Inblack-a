'use strict';
// Completion gate (CLAUDE.md): 0 duplicates and 0 violations, default AND strict (D10), on every
// frozen seed (D15: tuning 101–110, held-out 1–10), for every strategy the planner exposes.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { validate } = require('../validator.js');
const { SCENARIOS, runCli, listStrategies, independentCheck } = require('./planner.helpers.js');

const STRATS = listStrategies();
const SEEDS = [...Array.from({ length: 10 }, (_, i) => i + 1), ...Array.from({ length: 10 }, (_, i) => i + 101)];

for (const s of STRATS) {
  for (const seed of SEEDS) {
    test(`[${s}] seed-${seed}: 0 duplicates, 0 violations default+strict, independent check`, () => {
      const file = path.join(SCENARIOS, `seed-${seed}.json`);
      const sc = JSON.parse(fs.readFileSync(file, 'utf8'));
      const r = runCli(file, s);
      assert.equal(r.status, 0, r.stderr);
      for (const strict of [false, true]) {
        const v = validate(sc, r.plan, { strict });
        assert.deepEqual(v.duplicates, [], `strict=${strict} duplicates`);
        assert.deepEqual(v.violations.map((x) => `${x.rule} ${x.order_id}: ${x.detail}`), [], `strict=${strict}`);
      }
      assert.deepEqual(independentCheck(sc, r.plan), []);
    });
  }
}
