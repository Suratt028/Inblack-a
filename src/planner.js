#!/usr/bin/env node
'use strict';
// Usage: node src/planner.js scenario.json plan.json [--strategy fcfs|edf|vip|cheapest|profit|hybrid] [--explain reasons.json]
const fs = require('fs');
const { Model } = require('./model/feasibility');
const greedy = require('./strategies/greedy');
const STRATEGIES = {
  fcfs: require('./strategies/fcfs').fcfs,
  edf: greedy.edf,
  vip: greedy.vip,
  cheapest: greedy.cheapest,
  profit: greedy.profit,
  hybrid: require('./strategies/hybrid').hybrid,
};

function plan(scenario, { strategy = 'fcfs' } = {}) {
  const fn = STRATEGIES[strategy];
  if (!fn) throw new Error(`unknown strategy ${strategy}; available: ${Object.keys(STRATEGIES).join(',')}`);
  const { assignments, reasons } = fn(new Model(scenario));
  assignments.sort((a, b) => a.start_minute - b.start_minute || (a.order_id < b.order_id ? -1 : a.order_id > b.order_id ? 1 : 0));
  return { assignments, reasons };
}

function main(argv) {
  const pos = [], opt = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--strategy') opt.strategy = argv[++i];
    else if (argv[i] === '--explain') opt.explain = argv[++i];
    else pos.push(argv[i]);
  }
  if (pos.length !== 2) { console.error('usage: node src/planner.js scenario.json plan.json [--strategy fcfs] [--explain reasons.json]'); process.exit(2); }
  const scenario = JSON.parse(fs.readFileSync(pos[0], 'utf8'));
  const { assignments, reasons } = plan(scenario, { strategy: opt.strategy });
  fs.writeFileSync(pos[1], JSON.stringify({ assignments }, null, 2) + '\n');
  if (opt.explain) fs.writeFileSync(opt.explain, JSON.stringify(reasons, null, 2) + '\n');
  console.error(`planner: strategy=${opt.strategy || 'fcfs'} assigned=${assignments.length} skipped=${Object.values(reasons).filter(r => r.skipped).length}`);
}

if (require.main === module) main(process.argv.slice(2));
// Best strategy on tuning seeds 101-110 that passes the gate (T06). The CLI/plan()
// default stays 'fcfs' until the default switch is coordinated with mcp/ tests.
const RECOMMENDED_STRATEGY = 'hybrid';
module.exports = { plan, STRATEGIES, STRATEGY_NAMES: Object.keys(STRATEGIES), RECOMMENDED_STRATEGY };
