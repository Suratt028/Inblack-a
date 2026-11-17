'use strict';
// MCP tool score_plan: scenario + plan -> official scorer summary (harness/scorer.js).
const { score } = require('../../harness/scorer');
const c = require('./common');
const { z } = c;

const MAX_VIOLATIONS = 50;
const name = 'score_plan';
const config = {
  title: 'Score a plan against a scenario',
  description: 'Validates and scores a plan with harness/scorer.js (official rules D1-D15). Provide exactly one of seed, scenario, scenario_path and exactly one of plan, plan_path.',
  inputSchema: { ...c.scenarioInput, ...c.planInput, ...c.slaInput },
  outputSchema: {
    source: z.string(),
    slaBasis: z.enum(['paid', 'arrive']),
    strict: z.boolean(),
    scorePct: z.number(),
    total: z.number(),
    maxProfit: z.number(),
    totals: c.totalsOut,
    counts: c.countsOut,
    violations: z.array(c.violationOut).max(MAX_VIOLATIONS),
    violationsTruncated: z.boolean(),
    duplicates: z.array(z.string()),
    topLostOrders: z.array(c.lostOrderOut).max(10),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
};

async function compute(args) {
  const { scenario, source } = c.resolveScenario(args);
  const plan = c.resolvePlan(args, { required: true });
  let r;
  try { r = score(scenario, plan, { slaBasis: args.sla_basis || 'paid', strict: !!args.strict }); } catch (e) { c.bad(e.message); }
  const data = {
    source, slaBasis: r.slaBasis, strict: r.strict,
    scorePct: r.scorePct, total: r.total, maxProfit: r.maxProfit, totals: r.totals, counts: r.counts,
    violations: r.violations.slice(0, MAX_VIOLATIONS), violationsTruncated: r.violations.length > MAX_VIOLATIONS,
    duplicates: r.duplicates, topLostOrders: c.topLost(r.orders, 10),
  };
  const text = `score_plan ${source} slaBasis=${r.slaBasis}${r.strict ? ' strict' : ''}: score ${c.f2(r.scorePct)}% (total ${c.f2(r.total)} / maxProfit ${c.f2(r.maxProfit)}), violations=${r.violations.length}, duplicates=${r.duplicates.length}${r.duplicates.length ? ' (D8: score forced to 0)' : ''}`;
  return { data, text };
}

module.exports = { name, config, handler: c.wrap(name, compute) };
