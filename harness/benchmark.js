#!/usr/bin/env node
'use strict';
// T07: benchmark runner (D1, D10, D15).
// node harness/benchmark.js [--strategies a,b] [--out-dir harness/benchmarks] [--no-write]
// Runs every strategy through the real planner CLI on tuning seeds 101-110 and
// held-out seeds 1-10 (read from harness/scenarios, never regenerated), scores each
// plan with harness/scorer.js under slaBasis paid/arrive x default/strict.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { score } = require('./scorer');

const ROOT = path.resolve(__dirname, '..');
const PLANNER = path.join(ROOT, 'src', 'planner.js');
const SCEN_DIR = path.join(ROOT, 'harness', 'scenarios');
const GENERATOR_LOCK = 'b2a5da2';
const LOCKED_PATHS = ['harness/generator.js', 'harness/generator.config.json', 'harness/scenarios'];
const SEED_SETS = {
  tuning: [101, 102, 103, 104, 105, 106, 107, 108, 109, 110],
  heldout: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
};
const BASES = ['paid', 'arrive'];
const MODES = ['default', 'strict'];

function git(args) {
  try { return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); }
  catch (_) { return null; }
}

// Strategy discovery: prefer an exported list from the planner, otherwise parse the
// "available:" list from the planner's unknown-strategy error. fcfs is always first.
function discoverStrategies() {
  let names = [];
  const planner = require(PLANNER);
  if (planner.STRATEGIES) names = Array.isArray(planner.STRATEGIES) ? planner.STRATEGIES.slice() : Object.keys(planner.STRATEGIES);
  else {
    try { planner.plan({ orders: [], staff: [], suppliers: [] }, { strategy: '__bench_probe__' }); }
    catch (e) {
      const m = /available:\s*(.+)$/.exec(e.message);
      if (m) names = m[1].split(',').map((s) => s.trim()).filter(Boolean);
    }
  }
  if (!names.includes('fcfs')) names.unshift('fcfs');
  return ['fcfs', ...names.filter((n) => n !== 'fcfs').sort()];
}

function scenarioPath(seed) { return path.join(SCEN_DIR, `seed-${seed}.json`); }

// Run the real planner CLI; returns the parsed plan.
function runPlanner(strategy, scenarioFile, planFile) {
  execFileSync(process.execPath, [PLANNER, scenarioFile, planFile, '--strategy', strategy], { cwd: ROOT, stdio: ['ignore', 'ignore', 'pipe'] });
  return JSON.parse(fs.readFileSync(planFile, 'utf8'));
}

function r2(x) { return Math.round(x * 100) / 100; }

function scoreAll(scenario, plan) {
  const out = {};
  for (const basis of BASES) {
    out[basis] = {};
    for (const mode of MODES) {
      const r = score(scenario, plan, { slaBasis: basis, strict: mode === 'strict' });
      // Unrounded scorer values: aggregation must use these (rounding happens only in summaries and display).
      out[basis][mode] = { scorePct: r.scorePct, total: r.total, violations: r.violations.length, duplicates: r.duplicates.length };
    }
  }
  return out;
}

function median(xs) {
  if (!xs.length) return null;
  const s = xs.slice().sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function summarize(perSeed) {
  // perSeed: [{ seed, scores: {basis:{mode:{...}}} }]
  const out = {};
  for (const basis of BASES) {
    const pct = perSeed.map((x) => x.scores[basis].default.scorePct);
    const sum = (mode, k) => perSeed.reduce((a, x) => a + x.scores[basis][mode][k], 0);
    out[basis] = {
      median: r2(median(pct)),
      mean: r2(pct.reduce((a, b) => a + b, 0) / pct.length),
      min: r2(Math.min(...pct)),
      max: r2(Math.max(...pct)),
      violations: { default: sum('default', 'violations'), strict: sum('strict', 'violations') },
      duplicates: { default: sum('default', 'duplicates'), strict: sum('strict', 'duplicates') },
    };
    out[basis].gatePass = out[basis].violations.default === 0 && out[basis].violations.strict === 0
      && out[basis].duplicates.default === 0 && out[basis].duplicates.strict === 0;
  }
  return out;
}

function runBenchmark({ strategies = discoverStrategies(), seedSets = SEED_SETS } = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'inblack-bench-'));
  const results = {};
  try {
    for (const strategy of strategies) {
      results[strategy] = {};
      let gate = true;
      for (const [setName, seeds] of Object.entries(seedSets)) {
        const perSeed = [];
        for (const seed of seeds) {
          const scenFile = scenarioPath(seed);
          const scenario = JSON.parse(fs.readFileSync(scenFile, 'utf8'));
          const plan = runPlanner(strategy, scenFile, path.join(tmp, `${strategy}-${seed}.json`));
          perSeed.push({ seed, assignments: plan.assignments.length, scores: scoreAll(scenario, plan) });
        }
        const summary = summarize(perSeed);
        gate = gate && BASES.every((b) => summary[b].gatePass);
        results[strategy][setName] = { perSeed, summary };
      }
      results[strategy].gatePass = gate;
    }
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  return results;
}

function fmt(x) { return x.toFixed(2).padStart(7); }

function renderTable(report) {
  const L = [];
  L.push(`Benchmark  commit=${report.commit}${report.dirty ? ' (dirty)' : ''}  generatorLock=${report.generatorLock} (intact=${report.generatorLockIntact})`);
  L.push('scorePct under default checker; viol/dup = default/strict totals over 10 seeds');
  L.push('');
  const hdr = ['strategy', 'set    ', 'basis ', ' median', '   mean', '    min', '    max', 'viol d/s', 'dup d/s', 'gate'];
  L.push(hdr.join(' | '));
  L.push(hdr.map((h) => '-'.repeat(h.length)).join('-|-'));
  for (const [strategy, r] of Object.entries(report.results)) {
    for (const basis of BASES) {
      for (const setName of Object.keys(report.seedSets)) {
        const s = r[setName].summary[basis];
        L.push([strategy.padEnd(8), setName.padEnd(7), basis.padEnd(6), fmt(s.median), fmt(s.mean), fmt(s.min), fmt(s.max),
          `${s.violations.default}/${s.violations.strict}`.padEnd(8), `${s.duplicates.default}/${s.duplicates.strict}`.padEnd(7),
          s.gatePass ? 'PASS' : 'FAIL'].join(' | '));
      }
    }
  }
  L.push('');
  L.push('Held-out vs tuning median scorePct (D15, side by side)');
  for (const [strategy, r] of Object.entries(report.results)) {
    for (const basis of BASES) {
      L.push(`  ${strategy.padEnd(10)} ${basis.padEnd(6)} tuning ${fmt(r.tuning.summary[basis].median)}   held-out ${fmt(r.heldout.summary[basis].median)}`);
    }
  }
  L.push(`Gate (0 dup, 0 viol, default+strict, all seeds): ${Object.entries(report.results).map(([s, r]) => `${s}=${r.gatePass ? 'PASS' : 'FAIL'}`).join(' ')}`);
  return L.join('\n') + '\n';
}

function main(argv) {
  let strategies = null, outDir = path.join(ROOT, 'harness', 'benchmarks'), write = true;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--strategies') strategies = argv[++i].split(',').map((s) => s.trim()).filter(Boolean);
    else if (a.startsWith('--strategies=')) strategies = a.slice(13).split(',').map((s) => s.trim()).filter(Boolean);
    else if (a === '--out-dir') outDir = path.resolve(argv[++i]);
    else if (a === '--no-write') write = false;
    else { process.stderr.write(`error: unknown argument ${a}\nusage: node harness/benchmark.js [--strategies a,b] [--out-dir dir] [--no-write]\n`); process.exit(2); }
  }
  const known = discoverStrategies();
  const unknown = (strategies || []).filter((s) => !known.includes(s));
  if (unknown.length) { process.stderr.write(`error: unknown strategy ${unknown.join(',')}; available: ${known.join(',')}\n`); process.exit(2); }
  const commitFull = git(['rev-parse', 'HEAD']);
  const commit = git(['rev-parse', '--short=7', 'HEAD']) || 'nogit';
  const dirty = (git(['status', '--porcelain', '--', 'src', 'harness/scorer.js', 'harness/validator.js', 'harness/benchmark.js']) || '') !== '';
  const lockDiff = git(['diff', '--name-only', GENERATOR_LOCK, '--', ...LOCKED_PATHS]);
  const report = {
    commit, commitFull, dirty,
    generatorLock: GENERATOR_LOCK,
    generatorLockIntact: lockDiff === '',
    timestamp: new Date().toISOString(),
    seedSets: SEED_SETS,
    bases: BASES,
    modes: MODES,
    results: runBenchmark({ strategies: strategies || known }),
  };
  process.stdout.write(renderTable(report));
  if (write) {
    fs.mkdirSync(outDir, { recursive: true });
    const body = JSON.stringify(report, null, 2) + '\n';
    for (const f of [`${commit}.json`, 'latest.json']) fs.writeFileSync(path.join(outDir, f), body);
    process.stdout.write(`wrote ${path.relative(ROOT, path.join(outDir, `${commit}.json`))} and latest.json\n`);
  }
}

if (require.main === module) main(process.argv.slice(2));
module.exports = { runBenchmark, summarize, median, scoreAll, runPlanner, discoverStrategies, renderTable, SEED_SETS, GENERATOR_LOCK };
