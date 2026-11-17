'use strict';
// Independent rule checker (T03). Implements DECISIONS_INPUT D4, D4b, D5, D7, D8, D9, D10, D11, D12.
const DURATION = 5;
const DAY = 1440;

function capacityArray(staff) {
  const cap = new Array(DAY).fill(0);
  for (const sh of staff || []) {
    for (let m = Math.max(0, sh.from); m < Math.min(DAY, sh.to); m++) cap[m] += sh.count; // D11, [from,to)
  }
  return cap;
}

function validate(scenario, plan, opts = {}) {
  const strict = !!(opts && opts.strict);
  if (!plan || typeof plan !== 'object' || !Array.isArray(plan.assignments)) {
    throw new Error('plan must be an object with an "assignments" array');
  }
  const orders = new Map(scenario.orders.map((o) => [o.id, o]));
  const sups = new Map(scenario.suppliers.map((s) => [s.id, s]));
  const cap = capacityArray(scenario.staff);
  const violations = [];
  const passed = [];

  // D8 duplicates
  const seen = new Map();
  for (const a of plan.assignments) {
    if (a && typeof a === 'object' && typeof a.order_id === 'string') seen.set(a.order_id, (seen.get(a.order_id) || 0) + 1);
  }
  const duplicates = [...seen].filter(([, n]) => n >= 2).map(([id]) => id);

  const viol = (index, a, rule, detail) => {
    const ok = a && typeof a === 'object';
    violations.push({
      index,
      order_id: ok && a.order_id !== undefined ? a.order_id : null,
      supplier_id: ok && a.supplier_id !== undefined ? a.supplier_id : null,
      start_minute: ok && a.start_minute !== undefined ? a.start_minute : null,
      rule, detail,
    });
  };

  // Per-item checks (first failing rule reported)
  plan.assignments.forEach((a, index) => {
    if (!a || typeof a !== 'object' || Array.isArray(a)) return viol(index, a, 'BAD_INPUT', 'assignment is not an object');
    for (const f of ['order_id', 'supplier_id', 'start_minute']) {
      if (a[f] === undefined || a[f] === null) return viol(index, a, 'BAD_INPUT', `missing field ${f}`);
    }
    const o = orders.get(a.order_id);
    if (!o) return viol(index, a, 'UNKNOWN_ORDER', `order ${a.order_id} not in scenario`);
    const sp = sups.get(a.supplier_id);
    if (!sp) return viol(index, a, 'UNKNOWN_SUPPLIER', `supplier ${a.supplier_id} not in scenario`);
    const s = a.start_minute;
    if (typeof s !== 'number' || !Number.isInteger(s)) return viol(index, a, 'BAD_MINUTE', `start_minute ${JSON.stringify(s)} is not an integer`);
    if (o.paid_minute === null || o.paid_minute === undefined) return viol(index, a, 'UNPAID', 'order is not paid');
    const earliest = Math.max(o.arrive_minute, o.paid_minute);
    if (s < earliest) return viol(index, a, 'BEFORE_PAID', `start ${s} < max(arrive,paid) ${earliest}`);
    const lastEnd = strict ? DAY - 1 : DAY;
    if (s < 0 || s + DURATION > lastEnd) return viol(index, a, 'OUT_OF_DAY', `[${s},${s + DURATION}) outside day${strict ? ' (strict: end must be <= 1439)' : ''}`);
    if (!sp.games.includes(o.game)) return viol(index, a, 'UNSUPPORTED_GAME', `${sp.id} does not support ${o.game}`);
    for (const [oa, ob] of sp.outages || []) {
      const hit = strict ? (s <= ob && s + DURATION >= oa) : (s < ob && s + DURATION > oa);
      if (hit) return viol(index, a, 'OUTAGE', `[${s},${s + DURATION}) overlaps ${sp.id} outage [${oa},${ob})${strict ? ' (strict)' : ''}`);
    }
    passed.push({ index, a, o, sp, s });
  });

  // D4b/D7: sequential staff + wallet check, sorted by (start, order_id)
  passed.sort((x, y) => x.s - y.s || (x.a.order_id < y.a.order_id ? -1 : x.a.order_id > y.a.order_id ? 1 : x.index - y.index));
  const used = new Array(DAY).fill(0);
  const wallet = new Map(scenario.suppliers.map((sp) => [sp.id, sp.wallet_thb]));
  const accepted = [];
  for (const { index, a, o, sp, s } of passed) {
    let staffFail = null;
    for (let m = s; m < s + DURATION; m++) {
      if (used[m] >= cap[m]) { staffFail = `minute ${m}: used ${used[m]} >= capacity ${cap[m]}`; break; }
    }
    if (!staffFail && strict && s + DURATION < DAY && cap[s + DURATION] <= 0) staffFail = `strict: no staff at end minute ${s + DURATION}`;
    if (staffFail) { viol(index, a, 'OVER_STAFF', staffFail); continue; }
    const cost = o.value_thb * sp.cost_pct;
    const rem = wallet.get(sp.id);
    if (rem < cost) { viol(index, a, 'WALLET', `${sp.id} remaining ${rem.toFixed(2)} < cost ${cost.toFixed(2)}`); continue; }
    wallet.set(sp.id, rem - cost);
    for (let m = s; m < s + DURATION; m++) used[m]++;
    accepted.push({ order_id: o.id, supplier_id: sp.id, start_minute: s, cost });
  }
  violations.sort((x, y) => x.index - y.index);
  return { accepted, violations, duplicates };
}

module.exports = { validate, capacityArray, DURATION, DAY };
