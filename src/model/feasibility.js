'use strict';
/**
 * Own feasibility model (independent of harness/). Deterministic.
 *
 * Scenario schema is not frozen yet (T02 pending), so normalize() accepts
 * common field aliases. Canonical form:
 *   orders:    {id, game, value_thb, arrive_minute, paid_minute|null, vip, sla_minutes}
 *   suppliers: {id, games[], cost_pct, outages[{start,end}], wallet_thb?}
 *   shifts:    [{from,to,count}]   wallet_thb (day-shared, optional)
 *
 * SAFETY RULES (D10: valid under half-open default AND strict end-inclusive
 * checker, with a 1-minute margin). Order starting at s, DUR=5:
 *   R-DAY    : s >= 0 and s+5 <= 1438            (finish keeps 2-min margin to 1440)
 *   R-START  : s >= max(arrive, paid); unpaid orders never scheduled
 *   R-STAFF  : order OCCUPIES minutes s..s+5 INCLUSIVE (6 slots) in our capacity
 *              grid, so a strict checker counting the end minute never sees
 *              overlap with an order starting at s+5; used(m) < cap(m) there.
 *              Additionally cap(m) > 0 for every m in [s-1, s+6] ∩ [0,1439]
 *              (1-minute margin before/after shift boundaries).
 *   R-OUTAGE : outage treated as closed [a,b]; require s+5 <= a-1 or s >= b+1.
 *   R-GAME   : supplier.games includes order.game
 *   R-WALLET : cost = value_thb*cost_pct; remaining wallet (day-shared and, if
 *              given, per-supplier) must stay >= 0 (epsilon 1e-9). Sum of all
 *              deductions <= wallet implies every prefix in scorer's D4b order is OK.
 *   R-DUP    : each order_id at most once.
 */
const DUR = 5, DAY_END = 1438, MINUTES = 1440, EPS = 1e-9;

const num = (...v) => { for (const x of v) if (x !== undefined && x !== null && x !== '') return Number(x); return undefined; };

function normalize(sc) {
  const orders = (sc.orders || []).map(o => {
    const paid = o.paid_minute ?? o.paidMinute ?? o.paid_at ?? null;
    const isPaid = o.paid === false || o.status === 'unpaid' ? false : paid !== null && paid !== undefined;
    return {
      id: String(o.id ?? o.order_id),
      game: o.game ?? o.game_id,
      value_thb: num(o.value_thb, o.value, o.amount_thb, o.amount) || 0,
      arrive_minute: num(o.arrive_minute, o.arriveMinute, o.arrival_minute, 0),
      paid_minute: isPaid ? Number(paid) : null,
      vip: !!(o.vip ?? o.is_vip ?? (o.tier === 'VIP')),
      sla_minutes: num(o.sla_minutes, o.sla),
    };
  });
  const suppliers = (sc.suppliers || []).map(s => ({
    id: String(s.id ?? s.supplier_id),
    games: s.games || s.supported_games || [],
    cost_pct: num(s.cost_pct, s.costPct, s.cost) || 0,
    outages: (s.outages || []).map(w => Array.isArray(w)
      ? { start: w[0], end: w[1] } : { start: num(w.start, w.from, w.start_minute), end: num(w.end, w.to, w.end_minute) }),
    wallet_thb: num(s.wallet_thb, s.wallet),
  }));
  const shifts = (sc.shifts || sc.staff_shifts || (sc.staff && sc.staff.shifts) || []).map(h => ({
    from: num(h.from, h.start, h.from_minute), to: num(h.to, h.end, h.to_minute), count: num(h.count, h.staff, h.headcount) || 0,
  }));
  const w = sc.wallet_thb ?? sc.wallet ?? (sc.wallet && sc.wallet.balance_thb);
  return { orders, suppliers, shifts, wallet_thb: w === undefined ? Infinity : Number(typeof w === 'object' ? w.balance_thb : w) };
}

class Model {
  constructor(sc) {
    this.sc = normalize(sc);
    this.cap = new Array(MINUTES).fill(0);
    for (const h of this.sc.shifts) for (let m = Math.max(0, h.from); m < Math.min(MINUTES, h.to); m++) this.cap[m] += h.count; // D11
    this.used = new Array(MINUTES).fill(0);
    this.wallet = this.sc.wallet_thb;
    this.supWallet = new Map(this.sc.suppliers.map(s => [s.id, s.wallet_thb === undefined ? Infinity : s.wallet_thb]));
    this.assigned = new Set();
  }
  earliest(o) { return Math.max(o.arrive_minute, o.paid_minute); }
  cost(o, s) { return o.value_thb * s.cost_pct; }
  /** returns null if ok, else reason string */
  checkTime(o, s) {
    if (o.paid_minute === null) return 'UNPAID';
    if (!Number.isInteger(s)) return 'NON_INTEGER';
    if (s < this.earliest(o)) return 'BEFORE_READY';
    if (s < 0 || s + DUR > DAY_END) return 'DAY_MARGIN';
    for (let m = s; m <= s + DUR; m++) if (this.used[m] + 1 > this.cap[m]) return 'STAFF';
    for (let m = Math.max(0, s - 1); m <= Math.min(MINUTES - 1, s + DUR + 1); m++) if (this.cap[m] <= 0) return 'SHIFT_MARGIN';
    return null;
  }
  checkSupplier(o, sup, s) {
    if (!sup.games.includes(o.game)) return 'UNSUPPORTED_GAME';
    for (const w of sup.outages) if (!(s + DUR <= w.start - 1 || s >= w.end + 1)) return 'OUTAGE_MARGIN';
    const c = this.cost(o, sup);
    if (c > this.wallet + EPS || c > this.supWallet.get(sup.id) + EPS) return 'WALLET';
    return null;
  }
  check(o, sup, s) {
    if (this.assigned.has(o.id)) return 'DUPLICATE';
    return this.checkTime(o, s) || this.checkSupplier(o, sup, s);
  }
  commit(o, sup, s) {
    const r = this.check(o, sup, s);
    if (r) throw new Error(`infeasible commit ${o.id}/${sup.id}@${s}: ${r}`);
    for (let m = s; m <= s + DUR; m++) this.used[m]++;
    const c = this.cost(o, sup);
    this.wallet -= c; this.supWallet.set(sup.id, this.supWallet.get(sup.id) - c);
    this.assigned.add(o.id);
  }
}

module.exports = { Model, normalize, DUR, DAY_END, MINUTES };
