#!/usr/bin/env node
'use strict';
// T12: GitHub Pages site-data builder.
// node harness/reports/build-site-data.js --out <dir> [--bench <benchmark.json>] [--no-api] [--seeds 1,2,...]
// Writes summary.json, history.json, replay/index.json, replay/seed-N.json, team.json and
// bench-summary.json into <dir>. Scores come from harness/scorer.js on plans produced by the
// real planner CLI (src/planner.js ... --strategy X --explain reasons.json).
// history.json: in CI (GITHUB_TOKEN + GITHUB_REPOSITORY set, no --no-api) previous successful runs
// of this workflow on main are listed with the GitHub REST API and each run's `bench-summary`
// artifact is downloaded; on any API error a warning is logged and only the current point is kept.
// The token is only sent as an Authorization header and is never printed.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { score } = require('../scorer');
const { DURATION } = require('../validator');
const { readZip } = require('./unzip');

const ROOT = path.resolve(__dirname, '..', '..');
const PLANNER = path.join(ROOT, 'src', 'planner.js');
const SCEN_DIR = path.join(ROOT, 'harness', 'scenarios');
const TASK_DIR = path.join(ROOT, 'harness', 'tasks');
const REJECTED = path.join(ROOT, 'AGENT_LOG', 'rejected-work.md');
const DEFAULT_BENCH = path.join(ROOT, 'harness', 'benchmarks', 'latest.json');
const HELDOUT = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const ARTIFACT = 'bench-summary';
const API = process.env.GITHUB_API_URL || 'https://api.github.com';
const HISTORY_SOURCE = 'GitHub REST API GET /repos/{owner}/{repo}/actions/workflows/{file}/runs + /actions/runs/{id}/artifacts';

function parseArgs(argv) {
  const o = { out: null, bench: DEFAULT_BENCH, api: true, seeds: HELDOUT };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out') o.out = path.resolve(argv[++i]);
    else if (a === '--bench') o.bench = path.resolve(argv[++i]);
    else if (a === '--no-api') o.api = false;
    else if (a === '--seeds') o.seeds = argv[++i].split(',').map((s) => Number(s.trim())).filter((n) => Number.isInteger(n));
    else throw new Error(`unknown argument ${a}\nusage: node harness/reports/build-site-data.js --out <dir> [--bench <benchmark.json>] [--no-api] [--seeds 1,2]`);
  }
  if (!o.out) throw new Error('--out <dir> is required');
  return o;
}

function readJson(f) { return JSON.parse(fs.readFileSync(f, 'utf8')); }
function writeJson(f, v) { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(v, null, 2) + '\n'); }
function git(args) {
  try { return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); }
  catch (_) { return null; }
}

// Real planner CLI; returns { plan, reasons }.
function runPlanner(strategy, seed, tmp) {
  const scen = path.join(SCEN_DIR, `seed-${seed}.json`);
  const planFile = path.join(tmp, `${strategy}-${seed}.plan.json`);
  const reasonsFile = path.join(tmp, `${strategy}-${seed}.reasons.json`);
  execFileSync(process.execPath, [PLANNER, scen, planFile, '--strategy', strategy, '--explain', reasonsFile],
    { cwd: ROOT, stdio: ['ignore', 'ignore', 'pipe'] });
  return { plan: readJson(planFile), reasons: readJson(reasonsFile) };
}

// ---------- summary ----------
function pickSummary(s) { return { median: s.median, mean: s.mean, min: s.min, max: s.max, gatePass: s.gatePass }; }

function buildMedians(bench) {
  const out = {};
  for (const [strategy, r] of Object.entries(bench.results)) {
    out[strategy] = {};
    for (const set of Object.keys(bench.seedSets)) {
      out[strategy][set] = { paid: pickSummary(r[set].summary.paid), arrive: pickSummary(r[set].summary.arrive) };
    }
  }
  return out;
}

function buildPerSeed(bench) {
  const sets = Object.keys(bench.seedSets).sort((a, b) => (a === 'heldout' ? -1 : b === 'heldout' ? 1 : 0));
  const rows = [];
  for (const set of sets) {
    for (const seed of bench.seedSets[set]) {
      const scores = {};
      for (const [strategy, r] of Object.entries(bench.results)) {
        const x = r[set].perSeed.find((p) => p.seed === seed);
        if (x) scores[strategy] = { paid: x.scores.paid.default.scorePct, arrive: x.scores.arrive.default.scorePct };
      }
      rows.push({ seed, set, scores });
    }
  }
  return rows;
}

function emptyKpi() { return { set: 'heldout', basis: 'paid', profit: 0, overSla: 0, paidNotDone: 0, violations: 0, duplicates: 0, total: 0, maxProfit: 0 }; }
function addKpi(k, r) {
  k.profit += r.totals.profit; k.overSla += r.counts.overSla; k.paidNotDone += r.counts.paidNotDone;
  k.violations += r.violations.length; k.duplicates += r.duplicates.length; k.total += r.total; k.maxProfit += r.maxProfit;
}

// ---------- replay ----------
function replayStatus(row) {
  if (row.status === 'done') return 'done';
  if (row.violationPenalty > 0) return 'violation';
  if (row.status === 'not_done') return 'paidNotDone';
  return row.status; // 'unpaid' | 'impossible'
}

function buildReplay(seed, strategy, scenario, result, reasons, fcfsPct) {
  const byId = new Map(result.orders.map((r) => [r.order_id, r]));
  const used = new Map(scenario.suppliers.map((s) => [s.id, 0]));
  const cost = new Map(scenario.suppliers.map((s) => [s.id, s.cost_pct]));
  const orders = scenario.orders.map((o) => {
    const r = byId.get(o.id);
    const done = r.status === 'done';
    if (done) used.set(r.supplier_id, used.get(r.supplier_id) + o.value_thb * cost.get(r.supplier_id));
    return {
      id: o.id, arrive: o.arrive_minute, paid: o.paid_minute, game: o.game, value: o.value_thb, vip: !!o.vip, sla: o.sla_minutes,
      status: replayStatus(r),
      supplier_id: done ? r.supplier_id : null,
      start: done ? r.start_minute : null,
      finish: done ? r.start_minute + DURATION : null,
      lateMinutes: r.lateMinutes, profit: r.profit, slaPenalty: r.slaPenalty,
      unprocessedPenalty: r.unprocessedPenalty, violationPenalty: r.violationPenalty,
      reason: (reasons[o.id] && reasons[o.id].reason) || '',
    };
  });
  return {
    seed, strategy, slaBasis: 'paid', scorePct: result.scorePct, scorePctFcfs: fcfsPct,
    staff: scenario.staff,
    suppliers: scenario.suppliers.map((s) => ({ id: s.id, games: s.games, wallet_thb: s.wallet_thb, cost_pct: s.cost_pct, outages: s.outages, used_thb: used.get(s.id) })),
    orders,
  };
}

// ---------- team ----------
function parseTask(text) {
  const head = /^#\s+(T\d+)\s+[—-]\s+(.+)$/m.exec(text);
  const field = (k) => {
    const m = new RegExp(`^\\|\\s*${k}\\s*\\|\\s*(.*?)\\s*\\|\\s*$`, 'm').exec(text);
    return m ? m[1] : null;
  };
  const histM = /^## History\s*\n([\s\S]*?)(?=^## |(?![\s\S]))/m.exec(text);
  const history = histM ? histM[1].split('\n').filter((l) => /^\s*-\s+/.test(l)).map((l) => l.replace(/^\s*-\s+/, '').trim()) : [];
  const deps = field('dependencies');
  return {
    id: head ? head[1] : field('id'),
    title: head ? head[2].trim() : '',
    owner: field('owner'),
    status: field('status'),
    branch: field('branch'),
    dependencies: deps && deps !== '—' && deps !== '-' ? deps.split(',').map((s) => s.trim()).filter(Boolean) : [],
    history,
  };
}

function parseRejections(text) {
  const out = [];
  const parts = text.split(/^(?=## )/m).filter((p) => p.startsWith('## '));
  for (const p of parts) {
    const nl = p.indexOf('\n');
    const heading = p.slice(3, nl < 0 ? undefined : nl).trim();
    const body = nl < 0 ? '' : p.slice(nl + 1).trim();
    const m = /^(\d{4}-\d{2}-\d{2})\s+[—-]\s+(T\d+)\s+(.*?)\s*\(([^,()]+),\s*([^()]*)\)\s+REJECTED by\s+(\S+)/.exec(heading);
    if (!m) continue;
    const rev = /Review:\s*`([^`]+)`(?:\s+on\s+([^\s.]+(?:\s*\([0-9a-f]+\))?))?/.exec(body);
    out.push({
      task: m[2], agent: m[4].trim(), reviewer: m[6], date: m[1],
      summary: `${m[3]} (${m[5].trim()})`,
      review: rev ? `${rev[1]}${rev[2] ? ` on ${rev[2]}` : ''}` : null,
      body,
    });
  }
  return out;
}

function buildTeam(generatedAt) {
  const files = fs.readdirSync(TASK_DIR).filter((f) => /^T\d+\.md$/.test(f)).sort((a, b) => parseInt(a.slice(1), 10) - parseInt(b.slice(1), 10));
  const tasks = files.map((f) => parseTask(fs.readFileSync(path.join(TASK_DIR, f), 'utf8')));
  const rejections = fs.existsSync(REJECTED) ? parseRejections(fs.readFileSync(REJECTED, 'utf8')) : [];
  const agents = new Map();
  for (const t of tasks) {
    for (const name of String(t.owner || 'unassigned').split(/\s*[,+&]\s*|\s+and\s+/).filter(Boolean)) {
      if (!agents.has(name)) agents.set(name, []);
      agents.get(name).push(t.id);
    }
  }
  return { generatedAt, tasks, rejections, agents: [...agents].map(([name, ids]) => ({ name, tasks: ids })) };
}

// ---------- history (GitHub REST API) ----------
function currentPoint(bench, defaultStrategy, env, date) {
  const r = (s, b) => (bench.results[s] ? bench.results[s].heldout.summary[b].median : null);
  const sha = env.GITHUB_SHA || bench.commitFull || git(['rev-parse', 'HEAD']) || bench.commit;
  const runId = env.GITHUB_RUN_ID ? Number(env.GITHUB_RUN_ID) : null;
  const server = env.GITHUB_SERVER_URL || 'https://github.com';
  return {
    sha, shortSha: String(sha).slice(0, 7), date, runId,
    runUrl: runId && env.GITHUB_REPOSITORY ? `${server}/${env.GITHUB_REPOSITORY}/actions/runs/${runId}` : null,
    heldoutMedianPaid: r(defaultStrategy, 'paid'), heldoutMedianArrive: r(defaultStrategy, 'arrive'),
    fcfsHeldoutMedianPaid: r('fcfs', 'paid'), fcfsHeldoutMedianArrive: r('fcfs', 'arrive'),
  };
}

function workflowFile(env) {
  // GITHUB_WORKFLOW_REF = owner/repo/.github/workflows/pages.yml@refs/heads/main
  const m = /\.github\/workflows\/([^@/]+)@/.exec(env.GITHUB_WORKFLOW_REF || '');
  return m ? m[1] : 'pages.yml';
}

async function gh(url, token, accept = 'application/vnd.github+json') {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: accept, 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'inblack-a-site-data' } });
  if (!res.ok) throw new Error(`GET ${url.replace(API, '')} -> HTTP ${res.status}`);
  return res;
}

// The archive endpoint answers 302 to a short-lived signed blob URL; follow it manually
// so the token is never sent to the storage host.
async function downloadArtifact(url, token) {
  const res = await fetch(url, { redirect: 'manual', headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'inblack-a-site-data' } });
  let final = res;
  if (res.status >= 300 && res.status < 400) {
    const loc = res.headers.get('location');
    if (!loc) throw new Error('artifact redirect without location');
    final = await fetch(loc, { headers: { 'User-Agent': 'inblack-a-site-data' } });
  }
  if (!final.ok) throw new Error(`artifact download -> HTTP ${final.status}`);
  return Buffer.from(await final.arrayBuffer());
}

async function fetchHistory(env, { maxRuns = 30 } = {}) {
  const repo = env.GITHUB_REPOSITORY, token = env.GITHUB_TOKEN;
  if (!repo || !token) throw new Error('GITHUB_REPOSITORY / GITHUB_TOKEN not set');
  const file = workflowFile(env);
  const runsUrl = `${API}/repos/${repo}/actions/workflows/${encodeURIComponent(file)}/runs?branch=main&status=success&per_page=${maxRuns}`;
  const runs = (await (await gh(runsUrl, token)).json()).workflow_runs || [];
  const points = [];
  for (const run of runs) {
    if (String(run.id) === String(env.GITHUB_RUN_ID)) continue;
    try {
      const arts = (await (await gh(`${API}/repos/${repo}/actions/runs/${run.id}/artifacts?name=${ARTIFACT}`, token)).json()).artifacts || [];
      const art = arts.find((a) => a.name === ARTIFACT && !a.expired);
      if (!art) continue;
      const zip = await downloadArtifact(art.archive_download_url, token);
      const files = readZip(zip);
      const name = Object.keys(files).find((n) => path.basename(n) === 'bench-summary.json');
      if (!name) continue;
      const p = JSON.parse(files[name].toString('utf8'));
      points.push({ ...p, runId: p.runId || run.id, runUrl: p.runUrl || run.html_url, date: p.date || run.created_at });
    } catch (e) {
      console.warn(`warning: run ${run.id}: ${e.message}`);
    }
  }
  return points;
}

function mergeHistory(prev, cur) {
  const bySha = new Map();
  for (const p of [...prev, cur]) if (p && p.sha) bySha.set(p.sha, p); // current run wins for its own sha
  return [...bySha.values()].sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

// ---------- main ----------
async function build(opts, env = process.env) {
  const { DEFAULT_STRATEGY } = require(PLANNER);
  const bench = readJson(opts.bench);
  const generatedAt = new Date().toISOString();
  const strategies = Object.keys(bench.results);
  const kpiStrategies = [...new Set([DEFAULT_STRATEGY, 'fcfs'])];
  const kpis = Object.fromEntries(kpiStrategies.map((s) => [s, emptyKpi()]));
  const out = opts.out;
  fs.mkdirSync(path.join(out, 'replay'), { recursive: true });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'inblack-site-'));
  const index = [];
  try {
    for (const seed of opts.seeds) {
      const scenario = readJson(path.join(SCEN_DIR, `seed-${seed}.json`));
      const res = {};
      for (const s of kpiStrategies) {
        const { plan, reasons } = runPlanner(s, seed, tmp);
        res[s] = { result: score(scenario, plan, { slaBasis: 'paid', strict: false }), reasons };
        addKpi(kpis[s], res[s].result);
      }
      const d = res[DEFAULT_STRATEGY];
      writeJson(path.join(out, 'replay', `seed-${seed}.json`), buildReplay(seed, DEFAULT_STRATEGY, scenario, d.result, d.reasons, res.fcfs.result.scorePct));
      index.push({ id: `seed-${seed}`, seed, set: 'heldout', orders: scenario.orders.length });
    }
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  writeJson(path.join(out, 'replay', 'index.json'), index);

  const summary = {
    generatedAt, commit: bench.commit, commitFull: bench.commitFull, generatorLock: bench.generatorLock,
    generatorLockIntact: bench.generatorLockIntact, benchmarkTimestamp: bench.timestamp,
    defaultStrategy: DEFAULT_STRATEGY, seedSets: bench.seedSets, strategies,
    medians: buildMedians(bench), perSeed: buildPerSeed(bench), kpis,
  };
  writeJson(path.join(out, 'summary.json'), summary);

  const cur = currentPoint(bench, DEFAULT_STRATEGY, env, generatedAt);
  writeJson(path.join(out, 'bench-summary.json'), cur);
  let prev = [];
  if (opts.api) {
    try { prev = await fetchHistory(env); console.log(`history: ${prev.length} previous point(s) from the REST API`); }
    catch (e) { console.warn(`warning: history API unavailable (${e.message}); writing current point only`); }
  }
  writeJson(path.join(out, 'history.json'), { source: HISTORY_SOURCE, points: mergeHistory(prev, cur) });
  writeJson(path.join(out, 'team.json'), buildTeam(generatedAt));
  return { summary, out };
}

if (require.main === module) {
  let opts;
  try { opts = parseArgs(process.argv.slice(2)); }
  catch (e) { console.error(`error: ${e.message}`); process.exit(2); }
  build(opts).then(({ out }) => {
    console.log(`site data written to ${out}`);
  }).catch((e) => { console.error(`error: ${e.stack || e.message}`); process.exit(1); });
}

module.exports = { build, fetchHistory, downloadArtifact, parseArgs, parseTask, parseRejections, replayStatus, mergeHistory, currentPoint, workflowFile, buildMedians, buildPerSeed };
