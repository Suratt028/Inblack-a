'use strict';
// T12: site-data builder tests (run with --no-api / mocked fetch; no network).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const { execFileSync } = require('child_process');
const { score } = require('../scorer');
const { DEFAULT_STRATEGY } = require('../../src/planner');
const { build, fetchHistory, parseRejections } = require('./build-site-data');
const { readZip } = require('./unzip');

const ROOT = path.resolve(__dirname, '..', '..');
const BUILDER = path.join(__dirname, 'build-site-data.js');
const BENCH = path.join(ROOT, 'harness', 'benchmarks', 'latest.json');
const bench = JSON.parse(fs.readFileSync(BENCH, 'utf8'));
const read = (dir, f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
const scenario = (seed) => JSON.parse(fs.readFileSync(path.join(ROOT, 'harness', 'scenarios', `seed-${seed}.json`), 'utf8'));
const TMP = [];
const tmpDir = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'inblack-site-test-')); TMP.push(d); return d; };
test.after(() => { for (const d of TMP) fs.rmSync(d, { recursive: true, force: true }); });

// One full CLI run shared by the shape tests.
const OUT = path.join(tmpDir(), 'data');
execFileSync(process.execPath, [BUILDER, '--out', OUT, '--bench', BENCH, '--no-api'], { cwd: ROOT, stdio: ['ignore', 'ignore', 'pipe'] });

test('writes every contract file', () => {
  for (const f of ['summary.json', 'history.json', 'team.json', 'bench-summary.json', 'replay/index.json']) assert.ok(fs.existsSync(path.join(OUT, f)), f);
  for (let s = 1; s <= 10; s++) assert.ok(fs.existsSync(path.join(OUT, 'replay', `seed-${s}.json`)), `seed-${s}`);
});

test('summary: medians and perSeed equal the benchmark JSON', () => {
  const s = read(OUT, 'summary.json');
  assert.equal(s.defaultStrategy, DEFAULT_STRATEGY);
  assert.equal(s.commit, bench.commit);
  assert.equal(s.generatorLock, bench.generatorLock);
  assert.deepEqual(s.seedSets, bench.seedSets);
  assert.deepEqual(s.strategies, Object.keys(bench.results));
  assert.ok(typeof s.generatedAt === 'string');
  for (const [strategy, r] of Object.entries(bench.results)) {
    for (const set of ['heldout', 'tuning']) {
      for (const basis of ['paid', 'arrive']) {
        const b = r[set].summary[basis];
        assert.deepEqual(s.medians[strategy][set][basis], { median: b.median, mean: b.mean, min: b.min, max: b.max, gatePass: b.gatePass }, `${strategy} ${set} ${basis}`);
      }
    }
  }
  assert.equal(s.perSeed.length, 20);
  for (const row of s.perSeed) {
    assert.ok(row.set === 'heldout' || row.set === 'tuning');
    for (const [strategy, r] of Object.entries(bench.results)) {
      const x = r[row.set].perSeed.find((p) => p.seed === row.seed);
      assert.equal(row.scores[strategy].paid, x.scores.paid.default.scorePct);
      assert.equal(row.scores[strategy].arrive, x.scores.arrive.default.scorePct);
    }
  }
  for (const k of [DEFAULT_STRATEGY, 'fcfs']) {
    const kp = s.kpis[k];
    assert.equal(kp.set, 'heldout'); assert.equal(kp.basis, 'paid');
    for (const f of ['profit', 'overSla', 'paidNotDone', 'violations', 'duplicates', 'total', 'maxProfit']) assert.equal(typeof kp[f], 'number', f);
    assert.equal(kp.violations, 0); assert.equal(kp.duplicates, 0);
  }
});

test('kpis equal summed scorer output (2 seeds, independent planner+scorer run)', async () => {
  const out = path.join(tmpDir(), 'data');
  const { summary } = await build({ out, bench: BENCH, api: false, seeds: [1, 2] }, {});
  const tmp = tmpDir();
  for (const strategy of [DEFAULT_STRATEGY, 'fcfs']) {
    const exp = { profit: 0, overSla: 0, paidNotDone: 0, violations: 0, duplicates: 0, total: 0, maxProfit: 0 };
    for (const seed of [1, 2]) {
      const planFile = path.join(tmp, `${strategy}-${seed}.json`);
      execFileSync(process.execPath, [path.join(ROOT, 'src', 'planner.js'), path.join(ROOT, 'harness', 'scenarios', `seed-${seed}.json`), planFile, '--strategy', strategy], { stdio: ['ignore', 'ignore', 'pipe'] });
      const r = score(scenario(seed), JSON.parse(fs.readFileSync(planFile, 'utf8')), { slaBasis: 'paid', strict: false });
      exp.profit += r.totals.profit; exp.overSla += r.counts.overSla; exp.paidNotDone += r.counts.paidNotDone;
      exp.violations += r.violations.length; exp.duplicates += r.duplicates.length; exp.total += r.total; exp.maxProfit += r.maxProfit;
    }
    assert.deepEqual(summary.kpis[strategy], { set: 'heldout', basis: 'paid', ...exp }, strategy);
  }
  assert.deepEqual(read(out, 'replay/index.json').map((x) => x.seed), [1, 2]);
});

test('replay: index and per-seed files match the scenarios and the scorer', () => {
  const index = read(OUT, 'replay/index.json');
  assert.deepEqual(index.map((x) => x.id), Array.from({ length: 10 }, (_, i) => `seed-${i + 1}`));
  const statuses = new Set(['done', 'paidNotDone', 'unpaid', 'violation', 'impossible']);
  for (const entry of index) {
    const sc = scenario(entry.seed);
    const r = read(OUT, `replay/seed-${entry.seed}.json`);
    assert.equal(entry.set, 'heldout');
    assert.equal(entry.orders, sc.orders.length);
    assert.equal(r.orders.length, sc.orders.length);
    assert.equal(r.seed, entry.seed);
    assert.equal(r.strategy, DEFAULT_STRATEGY);
    assert.deepEqual(r.staff, sc.staff);
    assert.deepEqual(r.suppliers.map((s) => s.id), sc.suppliers.map((s) => s.id));
    for (const o of r.orders) {
      assert.ok(statuses.has(o.status), o.status);
      assert.equal(typeof o.reason, 'string');
      if (o.status === 'done') { assert.ok(o.supplier_id); assert.equal(o.finish, o.start + 5); }
      else { assert.equal(o.supplier_id, null); assert.equal(o.start, null); assert.equal(o.finish, null); }
    }
    // used_thb per supplier = sum of value * cost_pct over its done orders, within wallet
    for (const s of r.suppliers) {
      const used = r.orders.filter((o) => o.supplier_id === s.id).reduce((a, o) => a + o.value * s.cost_pct, 0);
      assert.ok(Math.abs(used - s.used_thb) < 1e-9); assert.ok(s.used_thb <= s.wallet_thb);
    }
    // order rows reproduce the scorer total -> scorePct
    const total = r.orders.reduce((a, o) => a + o.profit - o.slaPenalty - o.unprocessedPenalty - o.violationPenalty, 0);
    const maxProfit = sc.orders.filter((o) => o.paid_minute !== null).reduce((a, o) => {
      const c = Math.min(...sc.suppliers.filter((s) => s.games.includes(o.game)).map((s) => s.cost_pct));
      return Number.isFinite(c) ? a + o.value_thb * (1 - c) : a;
    }, 0);
    assert.ok(Math.abs(total / maxProfit * 100 - r.scorePct) < 1e-9);
    assert.equal(typeof r.scorePctFcfs, 'number');
  }
});

test('team.json: tasks parsed and T06/T07/T08 rejections present', () => {
  const t = read(OUT, 'team.json');
  const files = fs.readdirSync(path.join(ROOT, 'harness', 'tasks')).filter((f) => /^T\d+\.md$/.test(f));
  assert.equal(t.tasks.length, files.length);
  const t12 = t.tasks.find((x) => x.id === 'T12');
  assert.equal(t12.owner, 'backend-mcp'); assert.equal(t12.branch, 'agent/backend');
  assert.ok(t12.title.length > 0); assert.ok(Array.isArray(t12.history) && t12.history.length > 0);
  for (const x of t.tasks) for (const k of ['id', 'title', 'owner', 'status', 'branch', 'dependencies', 'history']) assert.ok(k in x, `${x.id}.${k}`);
  const rej = Object.fromEntries(t.rejections.map((r) => [r.task, r]));
  for (const id of ['T06', 'T07', 'T08']) {
    assert.ok(rej[id], id);
    assert.equal(rej[id].reviewer, 'qa-reviewer');
    assert.match(rej[id].date, /^\d{4}-\d{2}-\d{2}$/);
    assert.match(rej[id].review, new RegExp(`harness/reviews/${id}-review\\.md`));
  }
  assert.equal(rej.T06.agent, 'strategy-optimizer'); assert.equal(rej.T07.agent, 'backend-mcp'); assert.equal(rej.T08.agent, 'backend-mcp');
  const be = t.agents.find((a) => a.name === 'backend-mcp');
  assert.ok(be.tasks.includes('T12'));
});

test('parseRejections ignores non-rejection headings', () => {
  assert.deepEqual(parseRejections('# rejected-work\n## notes\nfoo\n'), []);
});

test('history --no-api: only the current point, equal to bench-summary.json', () => {
  const h = read(OUT, 'history.json');
  assert.match(h.source, /GitHub REST API/);
  assert.equal(h.points.length, 1);
  const cur = read(OUT, 'bench-summary.json');
  assert.deepEqual(h.points[0], cur);
  assert.equal(cur.heldoutMedianPaid, bench.results[DEFAULT_STRATEGY].heldout.summary.paid.median);
  assert.equal(cur.heldoutMedianArrive, bench.results[DEFAULT_STRATEGY].heldout.summary.arrive.median);
  assert.equal(cur.fcfsHeldoutMedianPaid, bench.results.fcfs.heldout.summary.paid.median);
  assert.equal(cur.fcfsHeldoutMedianArrive, bench.results.fcfs.heldout.summary.arrive.median);
});

// ---- REST API path with a mocked fetch ----
function makeZip(name, data) { // single deflated entry (CRC not checked by readZip)
  const comp = zlib.deflateRawSync(data); const nb = Buffer.from(name);
  const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(8, 8);
  local.writeUInt32LE(comp.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(nb.length, 26);
  const cd = Buffer.alloc(46); cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt16LE(8, 10);
  cd.writeUInt32LE(comp.length, 20); cd.writeUInt32LE(data.length, 24); cd.writeUInt16LE(nb.length, 28); cd.writeUInt32LE(0, 42);
  const cdOff = 30 + nb.length + comp.length; const cdLen = 46 + nb.length;
  const eocd = Buffer.alloc(22); eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(1, 8); eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(cdLen, 12); eocd.writeUInt32LE(cdOff, 16);
  return Buffer.concat([local, nb, comp, cd, nb, eocd]);
}

test('readZip round-trips a deflated entry', () => {
  const files = readZip(makeZip('bench-summary.json', Buffer.from('{"a":1}')));
  assert.equal(files['bench-summary.json'].toString(), '{"a":1}');
});

test('fetchHistory lists runs, downloads bench-summary artifacts, never sends the token to the blob host', async (t) => {
  const old = { sha: 'a'.repeat(40), shortSha: 'aaaaaaa', date: '2026-11-17T10:00:00Z', runId: 11, runUrl: 'https://github.com/o/r/actions/runs/11', heldoutMedianPaid: 70, heldoutMedianArrive: 69, fcfsHeldoutMedianPaid: 59, fcfsHeldoutMedianArrive: 58 };
  const zip = makeZip('bench-summary.json', Buffer.from(JSON.stringify(old)));
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, init = {}) => {
    calls.push({ url, auth: init.headers && init.headers.Authorization });
    const json = (o) => new Response(JSON.stringify(o), { status: 200 });
    if (url.includes('/actions/workflows/pages.yml/runs')) return json({ workflow_runs: [{ id: 99, html_url: 'x' }, { id: 11, html_url: 'https://github.com/o/r/actions/runs/11', created_at: old.date }] });
    if (url.includes('/actions/runs/11/artifacts')) return json({ artifacts: [{ name: 'bench-summary', expired: false, archive_download_url: 'https://api.github.com/zip/11' }] });
    if (url === 'https://api.github.com/zip/11') return new Response(null, { status: 302, headers: { location: 'https://blob.example/11.zip' } });
    if (url === 'https://blob.example/11.zip') return new Response(zip, { status: 200 });
    return new Response('nope', { status: 404 });
  });
  const env = { GITHUB_REPOSITORY: 'o/r', GITHUB_TOKEN: 'test-placeholder', GITHUB_RUN_ID: '99', GITHUB_WORKFLOW_REF: 'o/r/.github/workflows/pages.yml@refs/heads/main' };
  const pts = await fetchHistory(env);
  assert.deepEqual(pts, [old]);
  assert.ok(!calls.some((c) => c.url.includes('/runs/99/')), 'current run skipped');
  assert.equal(calls.find((c) => c.url.startsWith('https://blob.example')).auth, undefined);
});

test('build fails soft when the REST API errors: current point still written', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response('boom', { status: 500 }));
  t.mock.method(console, 'warn', () => {});
  t.mock.method(console, 'log', () => {});
  const out = path.join(tmpDir(), 'data');
  await build({ out, bench: BENCH, api: true, seeds: [] }, { GITHUB_REPOSITORY: 'o/r', GITHUB_TOKEN: 'test-placeholder', GITHUB_RUN_ID: '5', GITHUB_SHA: 'b'.repeat(40) });
  const h = read(out, 'history.json');
  assert.equal(h.points.length, 1);
  assert.equal(h.points[0].sha, 'b'.repeat(40));
  assert.equal(h.points[0].runUrl, 'https://github.com/o/r/actions/runs/5');
  assert.ok(console.warn.mock.calls.some((c) => /history API unavailable/.test(c.arguments[0])));
  assert.ok(!console.warn.mock.calls.some((c) => String(c.arguments[0]).includes('test-placeholder')), 'token never logged');
});
