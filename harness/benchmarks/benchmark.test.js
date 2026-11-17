'use strict';
// T07: benchmark runner — cross-check against harness/score.js --json and summary math (D1, D10, D15).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { runBenchmark, summarize, median, discoverStrategies, SEED_SETS, GENERATOR_LOCK } = require('../benchmark');

const ROOT = path.resolve(__dirname, '..', '..');

test('T07 D15: seed sets are tuning 101-110 and held-out 1-10; generator lock b073430', () => {
  assert.deepEqual(SEED_SETS.tuning, [101, 102, 103, 104, 105, 106, 107, 108, 109, 110]);
  assert.deepEqual(SEED_SETS.heldout, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.equal(GENERATOR_LOCK, 'b073430');
});

test('T07: strategy discovery includes fcfs first', () => {
  const s = discoverStrategies();
  assert.equal(s[0], 'fcfs');
});

test('T07: median of even count averages the two middle values', () => {
  assert.equal(median([4, 1, 3, 2]), 2.5);
  assert.equal(median([10, -2, 7, 7, 0, 3]), 5);
  assert.equal(median([5, 1, 9]), 5);
});

test('T07: summarize computes median/mean/min/max and gate per basis', () => {
  const mk = (p, a, vd = 0, vs = 0, dd = 0) => ({
    paid: { default: { scorePct: p, total: 0, violations: vd, duplicates: dd }, strict: { scorePct: p, total: 0, violations: vs, duplicates: dd } },
    arrive: { default: { scorePct: a, total: 0, violations: 0, duplicates: 0 }, strict: { scorePct: a, total: 0, violations: 0, duplicates: 0 } },
  });
  const s = summarize([{ seed: 1, scores: mk(60, 50) }, { seed: 2, scores: mk(70, 40, 0, 1) }, { seed: 3, scores: mk(80, 30) }, { seed: 4, scores: mk(90, -10) }]);
  assert.deepEqual({ median: s.paid.median, mean: s.paid.mean, min: s.paid.min, max: s.paid.max }, { median: 75, mean: 75, min: 60, max: 90 });
  assert.deepEqual({ median: s.arrive.median, mean: s.arrive.mean, min: s.arrive.min, max: s.arrive.max }, { median: 35, mean: 27.5, min: -10, max: 50 });
  assert.deepEqual(s.paid.violations, { default: 0, strict: 1 });
  assert.equal(s.paid.gatePass, false, 'one strict violation fails the gate (D10)');
  assert.equal(s.arrive.gatePass, true);
});

test('T07 F1: summary aggregates unrounded per-seed values (median/mean of rounded values differ)', () => {
  // Rounding first: median(66.34, 66.34)=66.34, but true median 66.3349.. rounds to 66.33.
  const mk = (p) => ({
    paid: { default: { scorePct: p, total: 0, violations: 0, duplicates: 0 }, strict: { scorePct: p, total: 0, violations: 0, duplicates: 0 } },
    arrive: { default: { scorePct: p, total: 0, violations: 0, duplicates: 0 }, strict: { scorePct: p, total: 0, violations: 0, duplicates: 0 } },
  });
  const s = summarize([66.335, 66.3349, 60.001, 70.004].map((p, i) => ({ seed: i + 1, scores: mk(p) })));
  assert.equal(s.paid.median, 66.33);
  assert.equal(s.paid.mean, 65.67);
  const t = summarize([1.004, 1.004, 1.004, 1.004].map((p, i) => ({ seed: i + 1, scores: mk(p) })));
  assert.equal(t.paid.mean, 1, 'mean of 1.004 x4 = 1.004 -> 1.00');
  const u = summarize([0.005, 0.0049].map((p, i) => ({ seed: i + 1, scores: mk(p) })));
  assert.equal(u.paid.median, 0, 'true median 0.00495 -> 0.00; rounded-first gives (0.01+0)/2 = 0.005 -> 0.01');
});

test('T07 F1: per-seed scorePct is kept unrounded; summary median equals rounded exact median (fcfs held-out)', () => {
  const res = runBenchmark({ strategies: ['fcfs'], seedSets: { heldout: SEED_SETS.heldout } });
  const pct = res.fcfs.heldout.perSeed.map((r) => r.scores.paid.default.scorePct);
  assert.ok(pct.some((p) => Math.round(p * 100) / 100 !== p), 'per-seed values are not pre-rounded');
  assert.equal(res.fcfs.heldout.summary.paid.median, Math.round(median(pct) * 100) / 100);
});

test('T07 D1 D10: fcfs held-out numbers equal harness/score.js --json for seeds 1 and 2', () => {
  const res = runBenchmark({ strategies: ['fcfs'], seedSets: { heldout: [1, 2] } });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-t07-'));
  try {
    for (const row of res.fcfs.heldout.perSeed) {
      const scen = path.join(ROOT, 'harness', 'scenarios', `seed-${row.seed}.json`);
      const planFile = path.join(tmp, `p${row.seed}.json`);
      execFileSync(process.execPath, [path.join(ROOT, 'src', 'planner.js'), scen, planFile, '--strategy', 'fcfs'], { stdio: 'ignore' });
      for (const basis of ['paid', 'arrive']) {
        for (const mode of ['default', 'strict']) {
          const args = [path.join(ROOT, 'harness', 'score.js'), scen, planFile, '--json', '--sla-basis', basis];
          if (mode === 'strict') args.push('--strict');
          const cli = JSON.parse(execFileSync(process.execPath, args, { encoding: 'utf8' }));
          const b = row.scores[basis][mode];
          const tag = `seed ${row.seed} ${basis} ${mode}`;
          assert.equal(b.scorePct, cli.scorePct, tag);
          assert.equal(b.total, cli.total, tag);
          assert.equal(b.violations, cli.violations.length, tag);
          assert.equal(b.duplicates, cli.duplicates.length, tag);
        }
      }
    }
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});
