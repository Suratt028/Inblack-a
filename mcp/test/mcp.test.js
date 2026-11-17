'use strict';
// T08: MCP server end-to-end over Streamable HTTP using the official SDK client.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StreamableHTTPClientTransport } = require('@modelcontextprotocol/sdk/client/streamableHttp.js');
const { startServer } = require('../server');

const ROOT = path.resolve(__dirname, '..', '..');
const SCEN = 'harness/scenarios/seed-1.json';
let srv, client, tmp, planFile, plan;
const cli = {}; // score.js --json output keyed by basis

function scoreCli(basis, strict) {
  const args = [path.join(ROOT, 'harness/score.js'), path.join(ROOT, SCEN), planFile, '--json', '--sla-basis', basis];
  if (strict) args.push('--strict');
  return JSON.parse(execFileSync(process.execPath, args, { encoding: 'utf8' }));
}

before(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-t08-'));
  planFile = path.join(tmp, 'plan.json');
  execFileSync(process.execPath, [path.join(ROOT, 'src/planner.js'), path.join(ROOT, SCEN), planFile], { stdio: ['ignore', 'ignore', 'ignore'] });
  plan = JSON.parse(fs.readFileSync(planFile, 'utf8'));
  cli.paid = scoreCli('paid', false);
  cli.arrive = scoreCli('arrive', false);
  cli.strict = scoreCli('paid', true);
  srv = await startServer({ port: 0 });
  client = new Client({ name: 't08-test', version: '0.0.0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(srv.url)));
});

after(async () => {
  if (client) await client.close();
  if (srv) await srv.close();
  if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
});

const sameSummary = (sc, ref) => {
  assert.equal(sc.scorePct, ref.scorePct);
  assert.equal(sc.total, ref.total);
  assert.equal(sc.maxProfit, ref.maxProfit);
  assert.deepEqual(sc.totals, ref.totals);
  assert.deepEqual(sc.counts, ref.counts);
};

test('initialize: server info and tools capability', () => {
  const info = client.getServerVersion();
  assert.equal(info.name, 'inblack-a');
  assert.ok(client.getServerCapabilities().tools);
});

test('ping', async () => {
  assert.deepEqual(await client.ping(), {});
});

test('tools/list: 3 tools with input and output schemas', async () => {
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map((t) => t.name).sort(), ['explain_order', 'run_scenario', 'score_plan']);
  for (const t of tools) {
    assert.equal(t.inputSchema.type, 'object');
    assert.equal(t.outputSchema.type, 'object');
    assert.ok(t.description.length > 20);
  }
  const ex = tools.find((t) => t.name === 'explain_order');
  assert.ok(ex.inputSchema.required.includes('order_id'));
  assert.ok(ex.inputSchema.properties.seed && ex.inputSchema.properties.scenario && ex.inputSchema.properties.scenario_path);
});

test('run_scenario seed 1 equals score.js --json (paid, arrive, strict)', async () => {
  for (const [key, args] of [['paid', {}], ['arrive', { sla_basis: 'arrive' }], ['strict', { strict: true }]]) {
    const r = await client.callTool({ name: 'run_scenario', arguments: { seed: 1, ...args } });
    assert.ok(!r.isError, JSON.stringify(r.content));
    const sc = r.structuredContent;
    sameSummary(sc, cli[key]);
    assert.equal(sc.assignments, plan.assignments.length);
    assert.equal(sc.violations, cli[key].violations.length);
    assert.equal(sc.duplicates, 0);
    assert.ok(sc.topLostOrders.length <= 10);
    assert.equal(r.content[0].type, 'text');
    assert.match(r.content[0].text, /score .*%/);
  }
  const viaPath = await client.callTool({ name: 'run_scenario', arguments: { scenario_path: SCEN } });
  sameSummary(viaPath.structuredContent, cli.paid);
});

test('T17: default strategy follows planner DEFAULT_STRATEGY (fallback fcfs)', async () => {
  const planner = require('../../src/planner');
  const expected = typeof planner.DEFAULT_STRATEGY === 'string' && planner.DEFAULT_STRATEGY ? planner.DEFAULT_STRATEGY : 'fcfs';
  assert.ok(planner.STRATEGY_NAMES.includes(expected), `planner default ${expected} is a known strategy`);
  const { tools } = await client.listTools();
  for (const n of ['run_scenario', 'explain_order']) {
    const p = tools.find((t) => t.name === n).inputSchema.properties.strategy;
    assert.equal(p.default, expected, n);
    assert.match(p.description, new RegExp(`currently ${expected}`));
  }
  const r = await client.callTool({ name: 'run_scenario', arguments: { seed: 1 } });
  assert.equal(r.structuredContent.strategy, expected);
  // the CLI planner (used for cli.*) runs the same default: identical assignments
  const scenario = JSON.parse(fs.readFileSync(path.join(ROOT, SCEN), 'utf8'));
  assert.deepEqual(planner.plan(scenario, { strategy: expected }).assignments, plan.assignments);
});

test('score_plan seed 1 + planner plan equals score.js --json', async () => {
  const scenario = JSON.parse(fs.readFileSync(path.join(ROOT, SCEN), 'utf8'));
  const r = await client.callTool({ name: 'score_plan', arguments: { scenario, plan } });
  assert.ok(!r.isError, JSON.stringify(r.content));
  sameSummary(r.structuredContent, cli.paid);
  assert.deepEqual(r.structuredContent.violations, cli.paid.violations.slice(0, 50));
  assert.deepEqual(r.structuredContent.duplicates, []);
  const a = await client.callTool({ name: 'score_plan', arguments: { scenario_path: SCEN, plan, sla_basis: 'arrive' } });
  sameSummary(a.structuredContent, cli.arrive);
});

test('score_plan reports duplicates and violations (D8 forces 0)', async () => {
  const a0 = plan.assignments[0];
  const bad = { assignments: [...plan.assignments, a0, { order_id: 'NOPE', supplier_id: a0.supplier_id, start_minute: 600 }] };
  const r = await client.callTool({ name: 'score_plan', arguments: { seed: 1, plan: bad } });
  assert.ok(!r.isError);
  assert.equal(r.structuredContent.scorePct, 0);
  assert.equal(r.structuredContent.total, 0);
  assert.deepEqual(r.structuredContent.duplicates, [a0.order_id]);
  assert.ok(r.structuredContent.violations.some((v) => v.rule === 'UNKNOWN_ORDER'));
});

test('explain_order seed 1 matches scorer per-order rows', async () => {
  const rows = cli.paid.orders;
  const done = rows.find((o) => o.status === 'done' && o.lateMinutes > 0) || rows.find((o) => o.status === 'done');
  const unpaid = rows.find((o) => o.status === 'unpaid');
  const lost = rows.find((o) => o.status === 'not_done');
  for (const row of [done, unpaid, lost].filter(Boolean)) {
    const r = await client.callTool({ name: 'explain_order', arguments: { seed: 1, order_id: row.order_id } });
    assert.ok(!r.isError, JSON.stringify(r.content));
    const sc = r.structuredContent;
    assert.equal(sc.planSource, 'planner');
    assert.equal(sc.status, row.status);
    assert.equal(sc.supplier_id, row.supplier_id);
    assert.equal(sc.start_minute, row.start_minute);
    assert.equal(sc.lateMinutes, row.lateMinutes);
    assert.equal(sc.penalties.sla, row.slaPenalty);
    assert.equal(sc.penalties.unprocessed, row.unprocessedPenalty);
    assert.equal(sc.penalties.violation, row.violationPenalty);
    assert.equal(sc.profit, row.profit);
    if (row.status === 'done') {
      assert.equal(sc.finish_minute, row.start_minute + 5);
      assert.match(sc.reason, row.lateMinutes > 0 ? /late by \d+ min/ : /within SLA/);
    }
    if (row.status === 'unpaid') assert.match(sc.reason, /never processed/);
    if (row.status === 'not_done') assert.match(sc.reason, /not assigned: lost 5%/);
  }
  // explicit plan: same answer as planner run
  const g = await client.callTool({ name: 'explain_order', arguments: { scenario_path: SCEN, order_id: done.order_id, plan } });
  assert.equal(g.structuredContent.planSource, 'given');
  assert.equal(g.structuredContent.lateMinutes, done.lateMinutes);
});

test('invalid input returns tool error with clear message', async () => {
  const none = await client.callTool({ name: 'run_scenario', arguments: {} });
  assert.equal(none.isError, true);
  assert.match(none.content[0].text, /exactly one of seed, scenario, scenario_path/);

  const typ = await client.callTool({ name: 'run_scenario', arguments: { seed: 'one' } });
  assert.equal(typ.isError, true);
  assert.match(typ.content[0].text, /seed/);

  const outside = path.join(tmp, 'outside.json'); // exists, but outside the repo
  fs.copyFileSync(path.join(ROOT, SCEN), outside);
  const esc = await client.callTool({ name: 'score_plan', arguments: { scenario_path: outside, plan: { assignments: [] } } });
  assert.equal(esc.isError, true);
  assert.match(esc.content[0].text, /inside the repository/);

  const nf = await client.callTool({ name: 'score_plan', arguments: { scenario_path: 'harness/scenarios/nope.json', plan: { assignments: [] } } });
  assert.equal(nf.isError, true);
  assert.match(nf.content[0].text, /not found/);

  const missing = await client.callTool({ name: 'explain_order', arguments: { seed: 1, order_id: 'NO_SUCH' } });
  assert.equal(missing.isError, true);
  assert.match(missing.content[0].text, /order_id NO_SUCH not found/);

  const strat = await client.callTool({ name: 'run_scenario', arguments: { seed: 1, strategy: 'nope' } });
  assert.equal(strat.isError, true);
  assert.match(strat.content[0].text, /unknown strategy nope/);
});

// Capture the server's JSON log lines (server runs in this process) during fn().
async function captureLogs(fn) {
  const lines = [];
  const orig = process.stderr.write;
  process.stderr.write = function (chunk, ...rest) {
    const s = String(chunk);
    for (const l of s.split('\n')) if (l.startsWith('{"ts"')) lines.push(JSON.parse(l));
    return orig.call(process.stderr, chunk, ...rest);
  };
  try { await fn(); } finally { process.stderr.write = orig; }
  return lines;
}

test('F1: every tools/call logs exactly one JSON line (ok, tool error, schema error, unknown tool)', async () => {
  const cases = [
    { name: 'run_scenario', arguments: { seed: 1 }, ok: true },
    { name: 'run_scenario', arguments: {}, ok: false },
    { name: 'run_scenario', arguments: { seed: 'one' }, ok: false },
    { name: 'nope_unknown_tool', arguments: { seed: 1 }, ok: false },
  ];
  for (const c of cases) {
    let res, thrown;
    const lines = await captureLogs(async () => {
      try { res = await client.callTool({ name: c.name, arguments: c.arguments }); } catch (e) { thrown = e; }
    });
    const mine = lines.filter((l) => l.tool !== undefined);
    assert.equal(mine.length, 1, `${c.name} ${JSON.stringify(c.arguments)} -> ${JSON.stringify(lines)}`);
    assert.equal(mine[0].tool, c.name);
    assert.equal(mine[0].ok, c.ok);
    assert.equal(typeof mine[0].duration_ms, 'number');
    assert.ok(mine[0].args && typeof mine[0].args === 'object');
    if (!c.ok) assert.ok(mine[0].error.length > 0);
    if (c.name === 'nope_unknown_tool') {
      assert.ok(thrown || (res && res.isError));
      assert.match(thrown ? thrown.message : res.content[0].text, /nope_unknown_tool not found/);
    }
  }
});

test('F2/R3: explain_order on an unpaid order the plan assigned reports the violation, not "no penalty"', async () => {
  const unpaid = cli.paid.orders.find((o) => o.status === 'unpaid');
  const p = { assignments: [{ order_id: unpaid.order_id, supplier_id: plan.assignments[0].supplier_id, start_minute: 600 }] };
  const r = await client.callTool({ name: 'explain_order', arguments: { seed: 1, order_id: unpaid.order_id, plan: p } });
  assert.ok(!r.isError, JSON.stringify(r.content));
  const sc = r.structuredContent;
  assert.equal(sc.penalties.violation, 100);
  assert.equal(sc.penalties.total, 100);
  assert.equal(sc.violations.length, 1);
  assert.equal(sc.violations[0].rule, 'UNPAID');
  assert.doesNotMatch(sc.reason, /\bno penalty\b/);
  assert.match(sc.reason, /UNPAID/);
  assert.match(sc.reason, /violation penalty 100\.00/);
  // unpaid without assignment: no penalty; and no SLA deadline under either basis
  for (const basis of ['paid', 'arrive']) {
    const q = await client.callTool({ name: 'explain_order', arguments: { seed: 1, order_id: unpaid.order_id, sla_basis: basis } });
    assert.equal(q.structuredContent.slaDeadline, null);
    assert.equal(q.structuredContent.penalties.total, 0);
    assert.match(q.structuredContent.reason, /never processed; no profit and no penalty/);
  }
});

test('R1/R2/R4: path containment without existence oracle, generic JSON error, vip type check', async () => {
  for (const p of [path.join(tmp, 'does-not-exist-zzz.json'), '../../does-not-exist-zzz.json']) {
    const r = await client.callTool({ name: 'score_plan', arguments: { scenario_path: p, plan: { assignments: [] } } });
    assert.equal(r.isError, true);
    assert.match(r.content[0].text, /inside the repository/);
  }
  const js = await client.callTool({ name: 'score_plan', arguments: { seed: 1, plan_path: 'CLAUDE.md' } });
  assert.equal(js.isError, true);
  assert.match(js.content[0].text, /plan_path is not valid JSON$/);

  const scenario = JSON.parse(fs.readFileSync(path.join(ROOT, SCEN), 'utf8'));
  scenario.orders[0].vip = 'yes';
  const v = await client.callTool({ name: 'run_scenario', arguments: { scenario } });
  assert.equal(v.isError, true);
  assert.match(v.content[0].text, /scenario\.orders\[0\]\.vip must be a boolean/);
});
