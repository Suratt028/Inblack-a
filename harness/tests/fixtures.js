'use strict';
// Hand-built scenario fixtures for spec tests (T04).
// ASSUMED scenario schema (not fixed in PLAN.md/DECISIONS_INPUT.md — see T04.md gaps).
// All field names live here so a schema change is a one-file edit.
//   order:    { order_id, game, value_thb, vip, arrive_minute, paid_minute|null, sla_minutes }
//   supplier: { supplier_id, games:[..], cost_pct (fraction 0..1), wallet_thb, outages:[{start,end}] }
//   shift:    { from, to, count }
const path = require('node:path');
const HARNESS = path.join(__dirname, '..');

function order(o = {}) {
  return Object.assign({
    order_id: 'O1', game: 'ROV', value_thb: 100, vip: false,
    arrive_minute: 0, paid_minute: 0, sla_minutes: 30,
  }, o);
}
function supplier(s = {}) {
  return Object.assign({
    supplier_id: 'S1', games: ['ROV'], cost_pct: 0.1, wallet_thb: 1e9, outages: [],
  }, s);
}
function shift(f = {}) { return Object.assign({ from: 0, to: 1440, count: 1 }, f); }
function scenario({ orders = [order()], suppliers = [supplier()], shifts = [shift()] } = {}) {
  return { seed: 0, orders, suppliers, shifts };
}
function a(order_id, supplier_id, start_minute) { return { order_id, supplier_id, start_minute }; }
function plan(...assignments) { return { assignments }; }
function near(x, y, eps = 1e-6) { return Math.abs(x - y) < eps; }
function rules(res) { return res.violations.map(v => v.rule); }

module.exports = { HARNESS, order, supplier, shift, scenario, a, plan, near, rules };
