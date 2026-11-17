'use strict';
// T09 helpers for planner spec tests. Written from PLAN.md §2 + harness/DECISIONS_INPUT.md (D1–D15)
// and the CLI contract in CLAUDE.md only — no knowledge of src/ internals beyond
// `node src/planner.js scenario.json plan.json [--strategy X]` and `module.exports.plan`.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..', '..');
const PLANNER = path.join(ROOT, 'src', 'planner.js');
const SCENARIOS = path.join(ROOT, 'harness', 'scenarios');
const DAY = 1440;
const DUR = 5;

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 't09-'));
let n = 0;
function writeJson(obj) { const p = path.join(tmp, `sc-${process.pid}-${n++}.json`); fs.writeFileSync(p, JSON.stringify(obj)); return p; }

// Run the planner CLI. Returns { status, stderr, stdout, raw, plan }.
function runCli(scenario, strategy) {
  const sc = typeof scenario === 'string' ? scenario : writeJson(scenario);
  const out = path.join(tmp, `plan-${process.pid}-${n++}.json`);
  const args = [PLANNER, sc, out];
  if (strategy !== undefined) args.push('--strategy', strategy);
  const r = spawnSync(process.execPath, args, { encoding: 'utf8', timeout: 120000 });
  let raw = null, plan = null;
  if (fs.existsSync(out)) { raw = fs.readFileSync(out, 'utf8'); try { plan = JSON.parse(raw); } catch { /* left null */ } }
  return { status: r.status, stderr: r.stderr, stdout: r.stdout, raw, plan };
}

// Dynamic strategy discovery (new strategies are covered automatically):
// 1) an exported STRATEGIES / strategies map or array, else
// 2) the "available: a,b,c" list from the error that plan() throws for an unknown strategy.
function listStrategies() {
  const mod = require(PLANNER);
  for (const k of ['STRATEGIES', 'strategies', 'STRATEGY_NAMES', 'strategyNames']) {
    const v = mod[k];
    if (Array.isArray(v) && v.length) return [...v].map(String).sort();
    if (v && typeof v === 'object' && Object.keys(v).length) return Object.keys(v).sort();
  }
  if (typeof mod.plan === 'function') {
    try { mod.plan({ orders: [], staff: [], suppliers: [] }, { strategy: '__qa_probe__' }); }
    catch (e) {
      const m = /available:\s*([A-Za-z0-9_,\- ]+)/.exec(String(e && e.message));
      if (m) return m[1].split(',').map((s) => s.trim()).filter(Boolean).sort();
    }
  }
  return ['fcfs'];
}

function capacity(staff) {
  const cap = new Array(DAY).fill(0);
  for (const sh of staff) for (let m = Math.max(0, sh.from); m < Math.min(DAY, sh.to); m++) cap[m] += sh.count; // D10 [from,to), D11 sum
  return cap;
}

// Independent checker. Applies the STRICTER reading everywhere (D10 strict + 1-minute margin):
// finish s+5 <= 1439, closed [s,s+5] disjoint from closed outage [a,b], shift must also cover minute s+5.
function independentCheck(scenario, plan) {
  const errs = [];
  if (!plan || !Array.isArray(plan.assignments)) return ['plan.assignments missing'];
  const orders = new Map(scenario.orders.map((o) => [o.id, o]));
  const sups = new Map(scenario.suppliers.map((s) => [s.id, s]));
  const cap = capacity(scenario.staff);
  const used = new Array(DAY).fill(0);
  const spent = new Map();
  const seen = new Set();
  for (const a of plan.assignments) {
    const tag = JSON.stringify(a);
    const keys = Object.keys(a || {}).sort().join(',');
    if (keys !== 'order_id,start_minute,supplier_id') errs.push(`format: keys ${keys} ${tag}`);
    if (seen.has(a.order_id)) errs.push(`D8 duplicate ${a.order_id}`);
    seen.add(a.order_id);
    const o = orders.get(a.order_id), sp = sups.get(a.supplier_id), s = a.start_minute;
    if (!o) { errs.push(`D9 unknown order ${tag}`); continue; }
    if (!sp) { errs.push(`D9 unknown supplier ${tag}`); continue; }
    if (!Number.isInteger(s)) { errs.push(`D9 non-integer minute ${tag}`); continue; }
    if (o.paid_minute === null || o.paid_minute === undefined) errs.push(`UNPAID assigned ${tag}`);
    else if (s < Math.max(o.arrive_minute, o.paid_minute)) errs.push(`D12 start < max(arrive,paid) ${tag}`);
    if (s < 0 || s + DUR > DAY - 1) errs.push(`D5/D10 strict day margin: finish ${s + DUR} > 1439 ${tag}`);
    if (!sp.games.includes(o.game)) errs.push(`UNSUPPORTED_GAME ${tag}`);
    for (const [oa, ob] of sp.outages || []) {
      if (s <= ob && s + DUR >= oa) errs.push(`D10 strict outage [${oa},${ob}] touches [${s},${s + DUR}] ${tag}`);
    }
    for (let m = Math.max(0, s); m < Math.min(DAY, s + DUR); m++) used[m]++;
    if (s + DUR < DAY && s + DUR >= 0 && cap[s + DUR] <= 0) errs.push(`D10 strict shift end: no staff at minute ${s + DUR} ${tag}`);
    spent.set(sp.id, (spent.get(sp.id) || 0) + o.value_thb * sp.cost_pct); // D4 deduct value*cost_pct
  }
  for (let m = 0; m < DAY; m++) if (used[m] > cap[m]) errs.push(`D11 minute ${m}: used ${used[m]} > capacity ${cap[m]}`);
  for (const [id, v] of spent) {
    const w = sups.get(id).wallet_thb;
    if (v > w + 1e-9) errs.push(`D4 wallet ${id}: spent ${v} > ${w}`);
  }
  return errs;
}

// Tiny deterministic RNG for fuzz scenarios (mulberry32).
function rng(seed) {
  let t = seed >>> 0;
  return () => { t = (t + 0x6D2B79F5) >>> 0; let r = Math.imul(t ^ (t >>> 15), 1 | t); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; };
}

module.exports = { ROOT, PLANNER, SCENARIOS, DAY, DUR, runCli, writeJson, listStrategies, capacity, independentCheck, rng };
