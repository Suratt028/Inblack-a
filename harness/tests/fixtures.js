'use strict';
// Hand-built scenario fixtures for spec tests (T04).
// Scenario schema = CLAUDE.md "I/O format" (authoritative, main 32850ca):
//   orders:[{ id, game, value_thb, vip, arrive_minute, paid_minute|null, sla_minutes }]
//   staff:[{ from, to, count }]
//   suppliers:[{ id, games, cost_pct, wallet_thb, outages:[[start,end]] }]
// Builders accept the readable aliases order_id / supplier_id / outages [{start,end}]
// and translate them, so tests stay readable. Plan assignments use order_id/supplier_id.
const path = require('node:path');
const HARNESS = path.join(__dirname, '..');

function order(o = {}) {
  o = Object.assign({}, o);
  if ('order_id' in o) { o.id = o.order_id; delete o.order_id; }
  return Object.assign({
    id: 'O1', game: 'ROV', value_thb: 100, vip: false,
    arrive_minute: 0, paid_minute: 0, sla_minutes: 30,
  }, o);
}
function supplier(s = {}) {
  s = Object.assign({}, s);
  if ('supplier_id' in s) { s.id = s.supplier_id; delete s.supplier_id; }
  if (Array.isArray(s.outages)) s.outages = s.outages.map(w => Array.isArray(w) ? w : [w.start, w.end]);
  return Object.assign({
    id: 'S1', games: ['ROV'], cost_pct: 0.1, wallet_thb: 1e9, outages: [],
  }, s);
}
function shift(f = {}) { return Object.assign({ from: 0, to: 1440, count: 1 }, f); }
function scenario({ orders = [order()], suppliers = [supplier()], shifts = [shift()] } = {}) {
  return { orders, staff: shifts, suppliers };
}
function a(order_id, supplier_id, start_minute) { return { order_id, supplier_id, start_minute }; }
function plan(...assignments) { return { assignments }; }
function near(x, y, eps = 1e-6) { return Math.abs(x - y) < eps; }
function rules(res) { return res.violations.map(v => v.rule); }

module.exports = { HARNESS, order, supplier, shift, scenario, a, plan, near, rules };
