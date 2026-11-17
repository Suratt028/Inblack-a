#!/usr/bin/env node
'use strict';
// node harness/score.js scenario.json plan.json [--sla-basis paid|arrive] [--strict] [--json]
const fs = require('fs');
const { score } = require('./scorer');

function fail(msg) { process.stderr.write(`error: ${msg}\n`); process.exit(2); }
const f2 = (x) => (Math.round(x * 100) / 100).toFixed(2);

function main(argv) {
  const pos = []; let slaBasis = 'paid', strict = false, json = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--sla-basis') slaBasis = argv[++i];
    else if (a.startsWith('--sla-basis=')) slaBasis = a.split('=')[1];
    else if (a === '--strict') strict = true;
    else if (a === '--json') json = true;
    else if (a.startsWith('--')) fail(`unknown option ${a}`);
    else pos.push(a);
  }
  if (pos.length !== 2) fail('usage: node harness/score.js scenario.json plan.json [--sla-basis paid|arrive] [--strict] [--json]');
  if (slaBasis !== 'paid' && slaBasis !== 'arrive') fail('--sla-basis must be paid or arrive');
  let scenario, plan, r;
  try { scenario = JSON.parse(fs.readFileSync(pos[0], 'utf8')); } catch (e) { fail(`cannot read scenario ${pos[0]}: ${e.message}`); }
  try { plan = JSON.parse(fs.readFileSync(pos[1], 'utf8')); } catch (e) { fail(`cannot read plan ${pos[1]}: ${e.message}`); }
  try { r = score(scenario, plan, { slaBasis, strict }); } catch (e) { fail(e.message); }
  if (json) { process.stdout.write(JSON.stringify(r, null, 2) + '\n'); return; }

  const L = [];
  L.push(`Score report  (slaBasis=${r.slaBasis}, ${r.strict ? 'strict' : 'default half-open'})`);
  L.push(`  total       ${f2(r.total)}`);
  L.push(`  maxProfit   ${f2(r.maxProfit)}`);
  L.push(`  score %     ${f2(r.scorePct)}%`);
  if (r.duplicates.length) L.push(`  DUPLICATES  ${r.duplicates.join(', ')}  => total and score forced to 0 (D8)`);
  L.push('Components');
  L.push(`  profit              +${f2(r.totals.profit)}`);
  L.push(`  SLA penalty         -${f2(r.totals.slaPenalty)}`);
  L.push(`  unprocessed penalty -${f2(r.totals.unprocessedPenalty)}`);
  L.push(`  violation penalty   -${f2(r.totals.violationPenalty)}`);
  const c = r.counts;
  L.push(`Counts  done=${c.done} overSla=${c.overSla} paidNotDone=${c.paidNotDone} violations=${c.violations} duplicates=${c.duplicates} impossible=${c.impossible}`);
  L.push(`Violations (${r.violations.length})`);
  for (const x of r.violations) L.push(`  #${x.index} ${x.order_id} ${x.supplier_id} @${x.start_minute}  ${x.rule}: ${x.detail}`);
  const lost = r.orders.map((o) => ({ o, loss: o.slaPenalty + o.unprocessedPenalty + o.violationPenalty }))
    .filter((x) => x.loss > 0).sort((a, b) => b.loss - a.loss || (a.o.order_id < b.o.order_id ? -1 : 1)).slice(0, 10);
  L.push('Top 10 orders where points were lost');
  for (const { o, loss } of lost) {
    const parts = [];
    if (o.slaPenalty) parts.push(`SLA ${f2(o.slaPenalty)} (${o.lateMinutes} min late)`);
    if (o.unprocessedPenalty) parts.push(`not done ${f2(o.unprocessedPenalty)}`);
    if (o.violationPenalty) parts.push(`violation ${f2(o.violationPenalty)}`);
    L.push(`  ${o.order_id} [${o.status}] -${f2(loss)}  ${parts.join(', ')}`);
  }
  process.stdout.write(L.join('\n') + '\n');
}

if (require.main === module) main(process.argv.slice(2));
