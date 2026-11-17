'use strict';
/**
 * Own feasibility model (independent of harness/). Deterministic.
 *
 * Accepts ONLY the official format (CLAUDE.md "I/O format"): orders{id,arrive_minute,
 * paid_minute|null,game,value_thb,vip,sla_minutes}, staff[{from,to,count}],
 * suppliers{id,games,wallet_thb,cost_pct,outages:[[start,end]]}. Wallet is per supplier.
 *
 * SAFETY RULES (D10: valid under half-open default AND strict end-inclusive
 * checker, with a 1-minute margin). Order starting at s, DUR=5:
 *   R-DAY    : s >= 0 and s+5 <= 1438            (finish keeps 2-min margin to 1440)
 *   R-START  : s >= max(arrive, paid); unpaid orders never scheduled
 *   R-STAFF  : order uses 1 staff on minutes [s, s+5) (both modes); used(m) < cap(m).
 *              Additionally cap(m) > 0 for every m in [s-1, s+6] ∩ [0,1439]
 *              (1-minute margin before/after shift boundaries; covers strict end-minute check).
 *   R-OUTAGE : outage treated as closed [a,b]; require s+5 <= a-1 or s >= b+1.
 *   R-GAME   : supplier.games includes order.game
 *   R-WALLET : cost = value_thb*cost_pct deducted from that supplier's wallet_thb (D4b order),
 *              accepted only if remaining - cost >= WALLET_MARGIN (1e-6, conservative side).
 *   R-DUP    : each order_id at most once.
 */
const DUR = 5, DAY_END = 1438, MINUTES = 1440;
// D4/D4b: conservative wallet margin. Accept only if remaining - cost >= WALLET_MARGIN, so float
// rounding at exact exhaustion (e.g. 117 - 45.9 = 71.09999.. < 71.1) can never overspend.
const WALLET_MARGIN = 1e-6;

function normalize(sc) {
  return {
    orders: sc.orders.map(o => ({ id: String(o.id), game: o.game, value_thb: o.value_thb, arrive_minute: o.arrive_minute,
      paid_minute: o.paid_minute === null || o.paid_minute === undefined ? null : o.paid_minute, vip: !!o.vip, sla_minutes: o.sla_minutes })),
    suppliers: sc.suppliers.map(s => ({ id: String(s.id), games: s.games, cost_pct: s.cost_pct, wallet_thb: s.wallet_thb,
      outages: (s.outages || []).map(([start, end]) => ({ start, end })) })),
    staff: sc.staff || [],
  };
}

class Model {
  constructor(sc) {
    this.sc = normalize(sc);
    this.cap = new Array(MINUTES).fill(0);
    for (const h of this.sc.staff) for (let m = Math.max(0, h.from); m < Math.min(MINUTES, h.to); m++) this.cap[m] += h.count; // D11
    this.used = new Array(MINUTES).fill(0);
    this.supWallet = new Map(this.sc.suppliers.map(s => [s.id, s.wallet_thb]));
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
    for (let m = s; m < s + DUR; m++) if (this.used[m] + 1 > this.cap[m]) return 'STAFF';
    for (let m = Math.max(0, s - 1); m <= Math.min(MINUTES - 1, s + DUR + 1); m++) if (this.cap[m] <= 0) return 'SHIFT_MARGIN';
    return null;
  }
  checkSupplier(o, sup, s) {
    if (!sup.games.includes(o.game)) return 'UNSUPPORTED_GAME';
    for (const w of sup.outages) if (!(s + DUR <= w.start - 1 || s >= w.end + 1)) return 'OUTAGE_MARGIN';
    const c = this.cost(o, sup);
    if (c > this.supWallet.get(sup.id) - WALLET_MARGIN) return 'WALLET';
    return null;
  }
  check(o, sup, s) {
    if (this.assigned.has(o.id)) return 'DUPLICATE';
    return this.checkTime(o, s) || this.checkSupplier(o, sup, s);
  }
  commit(o, sup, s) {
    const r = this.check(o, sup, s);
    if (r) throw new Error(`infeasible commit ${o.id}/${sup.id}@${s}: ${r}`);
    for (let m = s; m < s + DUR; m++) this.used[m]++;
    const c = this.cost(o, sup);
    this.supWallet.set(sup.id, this.supWallet.get(sup.id) - c);
    this.assigned.add(o.id);
  }
}

module.exports = { Model, normalize, DUR, DAY_END, MINUTES, WALLET_MARGIN };
