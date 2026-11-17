'use strict';
// FCFS baseline: paid orders by (paid, arrive, id); earliest feasible start;
// supplier = first in scenario order that is valid (game, outage margin, wallet).
const { DAY_END, DUR } = require('../model/feasibility');

function fcfs(model) {
  const { orders, suppliers } = model.sc;
  const assignments = [], reasons = {};
  for (const o of orders) if (o.paid_minute === null) reasons[o.id] = { skipped: true, reason: 'unpaid: never scheduled' };
  const queue = orders.filter(o => o.paid_minute !== null)
    .sort((a, b) => a.paid_minute - b.paid_minute || a.arrive_minute - b.arrive_minute || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const o of queue) {
    if (model.assigned.has(o.id)) continue; // duplicate ids in input: schedule once
    if (!suppliers.some(s => s.games.includes(o.game))) { reasons[o.id] = { skipped: true, reason: `no supplier supports game ${o.game}` }; continue; }
    let done = false, lastReject = {};
    for (let s = Math.max(0, model.earliest(o)); s + DUR <= DAY_END && !done; s++) {
      const tr = model.checkTime(o, s);
      if (tr) { lastReject.time = tr; continue; }
      const alts = [];
      for (const sup of suppliers) {
        const r = model.checkSupplier(o, sup, s);
        alts.push({ supplier_id: sup.id, ok: !r, reason: r || 'chosen (first valid in scenario order)' });
        if (!r) {
          model.commit(o, sup, s);
          assignments.push({ order_id: o.id, supplier_id: sup.id, start_minute: s });
          reasons[o.id] = { start_minute: s, supplier_id: sup.id,
            reason: `FCFS: earliest feasible start >= ${model.earliest(o)} (waited ${s - model.earliest(o)} min); first valid supplier`,
            alternativesConsidered: alts };
          done = true; break;
        }
      }
      if (!done) lastReject.supplier = alts.map(a => `${a.supplier_id}:${a.reason}`).join(',');
    }
    if (!done) reasons[o.id] = { skipped: true, reason: `no feasible slot today (last time reject: ${lastReject.time || (lastReject.supplier ? '-' : 'DAY_MARGIN (ready too late)')}; last supplier rejects: ${lastReject.supplier || '-'})` };
  }
  return { assignments, reasons };
}
module.exports = { fcfs };
