'use strict';
// MCP tool run_scenario: scenario (seed|object|path) -> planner -> official scorer summary.
const { score } = require('../../harness/scorer');
const c = require('./common');
const { z } = c;

const name = 'run_scenario';
const config = {
  title: 'Run planner on a scenario and score it',
  description: 'Builds a scenario (seed via harness/generator.js, inline object, or repo path), runs src/planner.js with the chosen strategy, and scores the plan with harness/scorer.js. Provide exactly one of seed, scenario, scenario_path.',
  inputSchema: {
    ...c.scenarioInput,
    strategy: z.string().min(1).default(c.DEFAULT_STRATEGY).describe(`Planner strategy (default: planner default, currently ${c.DEFAULT_STRATEGY})`),
    ...c.slaInput,
  },
  outputSchema: {
    source: z.string(),
    strategy: z.string(),
    slaBasis: z.enum(['paid', 'arrive']),
    strict: z.boolean(),
    scorePct: z.number(),
    total: z.number(),
    maxProfit: z.number(),
    totals: c.totalsOut,
    counts: c.countsOut,
    violations: z.number(),
    duplicates: z.number(),
    assignments: z.number(),
    orders: z.number(),
    topLostOrders: z.array(c.lostOrderOut).max(10),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
};

async function compute(args) {
  const { scenario, source } = c.resolveScenario(args);
  const strategy = args.strategy || c.DEFAULT_STRATEGY;
  const { assignments } = c.plannerRun(scenario, strategy);
  const r = score(scenario, { assignments }, { slaBasis: args.sla_basis || 'paid', strict: !!args.strict });
  const data = {
    source, strategy, slaBasis: r.slaBasis, strict: r.strict,
    scorePct: r.scorePct, total: r.total, maxProfit: r.maxProfit, totals: r.totals, counts: r.counts,
    violations: r.violations.length, duplicates: r.duplicates.length,
    assignments: assignments.length, orders: scenario.orders.length,
    topLostOrders: c.topLost(r.orders, 10),
  };
  const text = `run_scenario ${source} strategy=${strategy} slaBasis=${r.slaBasis}${r.strict ? ' strict' : ''}: score ${c.f2(r.scorePct)}% (total ${c.f2(r.total)} / maxProfit ${c.f2(r.maxProfit)}), assignments=${assignments.length}, violations=${data.violations}, duplicates=${data.duplicates}`;
  return { data, text };
}

module.exports = { name, config, handler: c.wrap(name, compute) };
