'use strict';
// Official score (T03). Implements DECISIONS_INPUT D1, D2, D3, D3b, D6, D8, D14.
const { validate, DURATION } = require('./validator');

const VIOLATION_PENALTY = 100;
const UNPROCESSED_RATE = 0.05;

function score(scenario, plan, opts = {}) {
  const slaBasis = (opts && opts.slaBasis) || 'paid';
  if (slaBasis !== 'paid' && slaBasis !== 'arrive') throw new Error(`slaBasis must be "paid" or "arrive", got ${slaBasis}`);
  const strict = !!(opts && opts.strict);
  const v = validate(scenario, plan, { strict });

  const sups = new Map(scenario.suppliers.map((s) => [s.id, s]));
  const minCost = (game) => {
    let m = Infinity;
    for (const s of scenario.suppliers) if (s.games.includes(game) && s.cost_pct < m) m = s.cost_pct;
    return m;
  };

  const doneBy = new Map(); // first accepted assignment per order
  for (const a of v.accepted) if (!doneBy.has(a.order_id)) doneBy.set(a.order_id, a);
  const violByOrder = new Map();
  for (const x of v.violations) violByOrder.set(x.order_id, (violByOrder.get(x.order_id) || 0) + 1);

  const totals = { profit: 0, slaPenalty: 0, unprocessedPenalty: 0, violationPenalty: 0 };
  const counts = { done: 0, overSla: 0, paidNotDone: 0, violations: v.violations.length, duplicates: v.duplicates.length, impossible: 0 };
  let maxProfit = 0;
  const knownIds = new Set();
  const rows = scenario.orders.map((o) => {
    knownIds.add(o.id);
    const paid = o.paid_minute !== null && o.paid_minute !== undefined;
    const mc = minCost(o.game);
    const possible = mc !== Infinity;
    const row = { order_id: o.id, status: 'not_done', supplier_id: null, start_minute: null, profit: 0, lateMinutes: 0, slaPenalty: 0, unprocessedPenalty: 0, violationPenalty: 0 };
    row.violationPenalty = (violByOrder.get(o.id) || 0) * VIOLATION_PENALTY;
    const d = doneBy.get(o.id);
    if (!paid) row.status = 'unpaid';
    else if (!possible) { row.status = 'impossible'; counts.impossible++; }
    else maxProfit += o.value_thb * (1 - mc); // D3
    if (d) { // only paid & possible orders can be accepted
      const sp = sups.get(d.supplier_id);
      row.status = 'done'; row.supplier_id = d.supplier_id; row.start_minute = d.start_minute;
      row.profit = o.value_thb - o.value_thb * sp.cost_pct;
      const clock = slaBasis === 'paid' ? o.paid_minute : o.arrive_minute;
      row.lateMinutes = Math.max(0, d.start_minute + DURATION - (clock + o.sla_minutes)); // D2
      row.slaPenalty = row.lateMinutes * (o.vip ? 2 : 1);
      counts.done++; if (row.lateMinutes > 0) counts.overSla++;
    } else if (paid && possible) {
      row.unprocessedPenalty = UNPROCESSED_RATE * o.value_thb; // D6
      counts.paidNotDone++;
    }
    totals.profit += row.profit; totals.slaPenalty += row.slaPenalty;
    totals.unprocessedPenalty += row.unprocessedPenalty; totals.violationPenalty += row.violationPenalty;
    return row;
  });
  for (const x of v.violations) if (!knownIds.has(x.order_id)) totals.violationPenalty += VIOLATION_PENALTY;

  let total = totals.profit - totals.slaPenalty - totals.unprocessedPenalty - totals.violationPenalty;
  let scorePct = maxProfit > 0 ? (total / maxProfit) * 100 : 0;
  if (v.duplicates.length > 0) { total = 0; scorePct = 0; } // D8
  return { total, maxProfit, scorePct, slaBasis, strict, totals, counts, orders: rows, violations: v.violations, duplicates: v.duplicates };
}

module.exports = { score, VIOLATION_PENALTY, UNPROCESSED_RATE };
