#!/usr/bin/env node
'use strict';
// Replays a plan through a fresh Model in scorer order (start, id); exits 1 on any violation.
// Usage: node src/selfcheck.js scenario.json plan.json
const fs = require('fs');
const { Model } = require('./model/feasibility');
const [scP, plP] = process.argv.slice(2);
const m = new Model(JSON.parse(fs.readFileSync(scP, 'utf8')));
const plan = JSON.parse(fs.readFileSync(plP, 'utf8'));
const keys = Object.keys(plan); let bad = 0;
if (keys.length !== 1 || keys[0] !== 'assignments') { console.log('BAD top-level keys', keys); bad++; }
const O = new Map(m.sc.orders.map(o => [o.id, o])), S = new Map(m.sc.suppliers.map(s => [s.id, s]));
const list = [...plan.assignments].sort((a, b) => a.start_minute - b.start_minute || (a.order_id < b.order_id ? -1 : 1));
for (const a of list) {
  const o = O.get(a.order_id), s = S.get(a.supplier_id);
  const r = !o ? 'UNKNOWN_ORDER' : !s ? 'UNKNOWN_SUPPLIER' : m.check(o, s, a.start_minute);
  if (r) { console.log('VIOLATION', a, r); bad++; } else m.commit(o, s, a.start_minute);
}
console.log(`selfcheck: ${plan.assignments.length} assignments, ${bad} violations`);
process.exit(bad ? 1 : 0);
