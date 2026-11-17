'use strict';
// Shared helpers for MCP tools (T08): input resolution, validation, planner run, logging.
const fs = require('fs');
const path = require('path');
const z = require('zod');
const { generate } = require('../../harness/generator');
const planner = require('../../src/planner');
const runPlan = planner.plan;
// T17: MCP default strategy follows the planner's exported default (fallback fcfs if not exported).
const DEFAULT_STRATEGY = typeof planner.DEFAULT_STRATEGY === 'string' && planner.DEFAULT_STRATEGY ? planner.DEFAULT_STRATEGY : 'fcfs';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const MAX_FILE_BYTES = 20 * 1024 * 1024;

class ToolInputError extends Error {}
const bad = (msg) => { throw new ToolInputError(msg); };

// ---------- zod building blocks ----------
const scenarioShape = z.object({
  orders: z.array(z.record(z.string(), z.unknown())),
  staff: z.array(z.record(z.string(), z.unknown())),
  suppliers: z.array(z.record(z.string(), z.unknown())),
}).passthrough();
const planShape = z.object({ assignments: z.array(z.unknown()) }).passthrough();

const scenarioInput = {
  seed: z.number().int().min(0).max(2 ** 31 - 1).optional()
    .describe('Generate the scenario with harness/generator.js for this seed'),
  scenario: scenarioShape.optional().describe('Inline scenario object {orders, staff, suppliers}'),
  scenario_path: z.string().min(1).optional()
    .describe('Path to a scenario JSON file inside the repository (relative to repo root)'),
};
const slaInput = {
  sla_basis: z.enum(['paid', 'arrive']).default('paid').describe('SLA clock basis (D1): paid_minute (default) or arrive_minute; lateness at finish per D2'),
  strict: z.boolean().default(false).describe('Strict boundary checker (D10); default false'),
};
const planInput = {
  plan: planShape.optional().describe('Inline plan object {assignments:[...]}'),
  plan_path: z.string().min(1).optional().describe('Path to a plan JSON file inside the repository'),
};

const countsOut = z.object({
  done: z.number(), overSla: z.number(), paidNotDone: z.number(),
  violations: z.number(), duplicates: z.number(), impossible: z.number(),
});
const totalsOut = z.object({
  profit: z.number(), slaPenalty: z.number(), unprocessedPenalty: z.number(), violationPenalty: z.number(),
});
const violationOut = z.object({
  index: z.number(), order_id: z.unknown(), supplier_id: z.unknown(), start_minute: z.unknown(),
  rule: z.string(), detail: z.string(),
});
const lostOrderOut = z.object({
  order_id: z.string(), status: z.string(), loss: z.number(), lateMinutes: z.number(),
  slaPenalty: z.number(), unprocessedPenalty: z.number(), violationPenalty: z.number(),
});

// ---------- resolution ----------
function resolveRepoPath(p, what) {
  if (typeof p !== 'string' || !p.trim()) bad(`${what} must be a non-empty string`);
  const outside = (root, target) => {
    const rel = path.relative(root, target);
    return rel === '' || rel === '..' || rel.startsWith('..' + path.sep) || path.isAbsolute(rel);
  };
  const abs = path.resolve(REPO_ROOT, p);
  const insideMsg = `${what} must point to a file inside the repository: ${p}`;
  // Lexical containment first, so paths outside the repo never reveal whether they exist.
  if (outside(REPO_ROOT, abs)) bad(insideMsg);
  let real;
  try { real = fs.realpathSync(abs); } catch { bad(`${what} not found: ${p}`); }
  if (outside(fs.realpathSync(REPO_ROOT), real)) bad(insideMsg); // symlink escaping the repo
  const st = fs.statSync(real);
  if (!st.isFile()) bad(`${what} is not a file: ${p}`);
  if (st.size > MAX_FILE_BYTES) bad(`${what} is too large (${st.size} bytes > ${MAX_FILE_BYTES})`);
  try { return JSON.parse(fs.readFileSync(real, 'utf8')); } catch { bad(`${what} is not valid JSON`); }
}

function checkScenario(sc) {
  if (!sc || typeof sc !== 'object' || Array.isArray(sc)) bad('scenario must be an object');
  for (const k of ['orders', 'staff', 'suppliers']) if (!Array.isArray(sc[k])) bad(`scenario.${k} must be an array`);
  sc.orders.forEach((o, i) => {
    const at = `scenario.orders[${i}]`;
    if (!o || typeof o !== 'object') bad(`${at} must be an object`);
    if (typeof o.id !== 'string' || !o.id) bad(`${at}.id must be a non-empty string`);
    for (const f of ['arrive_minute', 'value_thb', 'sla_minutes']) if (typeof o[f] !== 'number' || !Number.isFinite(o[f])) bad(`${at}.${f} must be a number`);
    if (o.paid_minute !== null && (typeof o.paid_minute !== 'number' || !Number.isFinite(o.paid_minute))) bad(`${at}.paid_minute must be a number or null`);
    if (typeof o.game !== 'string') bad(`${at}.game must be a string`);
    if (o.vip !== undefined && typeof o.vip !== 'boolean') bad(`${at}.vip must be a boolean`);
  });
  sc.staff.forEach((s, i) => {
    for (const f of ['from', 'to', 'count']) if (typeof s[f] !== 'number' || !Number.isFinite(s[f])) bad(`scenario.staff[${i}].${f} must be a number`);
  });
  sc.suppliers.forEach((s, i) => {
    const at = `scenario.suppliers[${i}]`;
    if (typeof s.id !== 'string' || !s.id) bad(`${at}.id must be a non-empty string`);
    if (!Array.isArray(s.games)) bad(`${at}.games must be an array`);
    for (const f of ['wallet_thb', 'cost_pct']) if (typeof s[f] !== 'number' || !Number.isFinite(s[f])) bad(`${at}.${f} must be a number`);
    if (s.outages !== undefined && (!Array.isArray(s.outages) || s.outages.some((x) => !Array.isArray(x) || x.length !== 2))) bad(`${at}.outages must be an array of [start,end] pairs`);
  });
  return sc;
}

function resolveScenario(args) {
  const given = ['seed', 'scenario', 'scenario_path'].filter((k) => args[k] !== undefined);
  if (given.length !== 1) bad(`provide exactly one of seed, scenario, scenario_path (got ${given.length ? given.join(', ') : 'none'})`);
  if (args.seed !== undefined) return { scenario: generate(args.seed), source: `seed:${args.seed}` };
  if (args.scenario !== undefined) return { scenario: checkScenario(args.scenario), source: 'inline' };
  return { scenario: checkScenario(resolveRepoPath(args.scenario_path, 'scenario_path')), source: `path:${args.scenario_path}` };
}

function resolvePlan(args, { required }) {
  const given = ['plan', 'plan_path'].filter((k) => args[k] !== undefined);
  if (given.length > 1) bad('provide at most one of plan, plan_path');
  if (given.length === 0) { if (required) bad('provide exactly one of plan, plan_path'); return null; }
  const p = args.plan !== undefined ? args.plan : resolveRepoPath(args.plan_path, 'plan_path');
  if (!p || typeof p !== 'object' || !Array.isArray(p.assignments)) bad('plan must be an object with an "assignments" array');
  return p;
}

function plannerRun(scenario, strategy) {
  try { return runPlan(scenario, { strategy }); } catch (e) { bad(`planner failed: ${e.message}`); }
}

function topLost(rows, n = 10) {
  return rows.map((o) => ({ o, loss: o.slaPenalty + o.unprocessedPenalty + o.violationPenalty }))
    .filter((x) => x.loss > 0)
    .sort((a, b) => b.loss - a.loss || (a.o.order_id < b.o.order_id ? -1 : 1))
    .slice(0, n)
    .map(({ o, loss }) => ({ order_id: o.order_id, status: o.status, loss, lateMinutes: o.lateMinutes,
      slaPenalty: o.slaPenalty, unprocessedPenalty: o.unprocessedPenalty, violationPenalty: o.violationPenalty }));
}

// ---------- logging ----------
function summarizeArgs(args) {
  const s = {};
  for (const [k, v] of Object.entries(args || {})) {
    if (k === 'scenario' && v && typeof v === 'object') s[k] = `object(orders=${Array.isArray(v.orders) ? v.orders.length : '?'})`;
    else if (k === 'plan' && v && typeof v === 'object') s[k] = `object(assignments=${Array.isArray(v.assignments) ? v.assignments.length : '?'})`;
    else if (typeof v === 'string') s[k] = v.length > 120 ? v.slice(0, 120) + '...' : v;
    else if (typeof v === 'number' || typeof v === 'boolean' || v === null) s[k] = v;
    else s[k] = typeof v;
  }
  return s;
}

function logLine(obj) { process.stderr.write(JSON.stringify({ ts: new Date().toISOString(), ...obj }) + '\n'); }

// Wrap a tool handler: compute -> {structuredContent, content:[text]}; errors -> isError result.
// Logging is done once per tools/call in mcp/server.js (covers unknown tools and schema errors too).
function wrap(name, compute) {
  return async (args) => {
    try {
      const { data, text } = await compute(args);
      return { structuredContent: data, content: [{ type: 'text', text: text + '\n' + JSON.stringify(data) }] };
    } catch (e) {
      const msg = e instanceof ToolInputError ? `invalid input: ${e.message}` : `error: ${e.message}`;
      return { isError: true, content: [{ type: 'text', text: msg }] };
    }
  };
}

const f2 = (x) => (Math.round(x * 100) / 100).toFixed(2);

module.exports = {
  z, REPO_ROOT, ToolInputError, bad, DEFAULT_STRATEGY,
  scenarioInput, slaInput, planInput, countsOut, totalsOut, violationOut, lostOrderOut,
  resolveScenario, resolvePlan, resolveRepoPath, checkScenario, plannerRun, topLost, summarizeArgs, wrap, logLine, f2,
};
