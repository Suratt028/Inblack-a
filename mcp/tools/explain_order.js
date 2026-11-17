'use strict';
// MCP tool explain_order: why an order scored what it did (assignment, SLA, penalties, violations).
const { score, UNPROCESSED_RATE } = require('../../harness/scorer');
const { DURATION } = require('../../harness/validator');
const c = require('./common');
const { z } = c;

const name = 'explain_order';
const config = {
  title: 'Explain one order',
  description: 'Explains how one order is handled by a plan and scored: assignment, supplier, start/finish, SLA deadline, late minutes, penalties and violations. If no plan is given, the planner is run with the chosen strategy.',
  inputSchema: {
    ...c.scenarioInput,
    order_id: z.string().min(1).describe('Order id to explain'),
    ...c.planInput,
    strategy: z.string().min(1).default('fcfs').describe('Planner strategy used when no plan is given'),
    ...c.slaInput,
  },
  outputSchema: {
    source: z.string(),
    planSource: z.enum(['given', 'planner']),
    slaBasis: z.enum(['paid', 'arrive']),
    strict: z.boolean(),
    order: z.object({
      id: z.string(), arrive_minute: z.number(), paid_minute: z.number().nullable(), game: z.string(),
      value_thb: z.number(), vip: z.boolean(), sla_minutes: z.number(),
    }),
    status: z.string(),
    assigned: z.boolean(),
    supplier_id: z.string().nullable(),
    start_minute: z.number().nullable(),
    finish_minute: z.number().nullable(),
    slaDeadline: z.number().nullable(),
    lateMinutes: z.number(),
    profit: z.number(),
    penalties: z.object({ sla: z.number(), unprocessed: z.number(), violation: z.number(), total: z.number() }),
    violations: z.array(c.violationOut),
    plannerReason: z.string().nullable(),
    reason: z.string(),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
};

async function compute(args) {
  const { scenario, source } = c.resolveScenario(args);
  const o = scenario.orders.find((x) => x.id === args.order_id);
  if (!o) c.bad(`order_id ${args.order_id} not found in scenario (${scenario.orders.length} orders)`);
  const slaBasis = args.sla_basis || 'paid';
  let plan = c.resolvePlan(args, { required: false });
  let planSource = 'given', plannerReason = null;
  if (!plan) {
    const out = c.plannerRun(scenario, args.strategy || 'fcfs');
    plan = { assignments: out.assignments };
    planSource = 'planner';
    plannerReason = out.reasons && out.reasons[o.id] ? out.reasons[o.id].reason || null : null;
  }
  let r;
  try { r = score(scenario, plan, { slaBasis, strict: !!args.strict }); } catch (e) { c.bad(e.message); }
  const row = r.orders.find((x) => x.order_id === o.id);
  const viol = r.violations.filter((x) => x.order_id === o.id);
  const paid = o.paid_minute !== null && o.paid_minute !== undefined;
  const clock = slaBasis === 'paid' ? o.paid_minute : o.arrive_minute;
  const slaDeadline = paid ? clock + o.sla_minutes : null; // unpaid orders have no SLA under either basis
  const assigned = row.status === 'done';
  const start = assigned ? row.start_minute : null;
  const finish = assigned ? start + DURATION : null;
  const pen = { sla: row.slaPenalty, unprocessed: row.unprocessedPenalty, violation: row.violationPenalty };
  pen.total = pen.sla + pen.unprocessed + pen.violation;

  // "no penalty" only when nothing was charged; otherwise the violation part below explains the charge (D6).
  const noPen = pen.total === 0 ? 'no penalty' : 'no SLA or unprocessed penalty';
  const parts = [];
  if (!paid) parts.push(viol.length
    ? `unpaid (paid_minute null): must never be processed, but the plan assigned it; no profit, ${noPen}`
    : `unpaid (paid_minute null): never processed; no profit and ${noPen}`);
  else if (row.status === 'impossible') parts.push(`no supplier supports game ${o.game}: impossible, excluded from maxProfit, ${noPen}`);
  else if (!assigned) parts.push(`paid but not assigned: lost ${UNPROCESSED_RATE * 100}% of value = ${c.f2(row.unprocessedPenalty)} THB`);
  else if (row.lateMinutes > 0) parts.push(`done by ${row.supplier_id} at ${start}-${finish}, late by ${row.lateMinutes} min past deadline ${slaDeadline} (${slaBasis} basis) => SLA penalty ${c.f2(row.slaPenalty)}${o.vip ? ' (VIP x2)' : ''}; profit ${c.f2(row.profit)}`);
  else parts.push(`done by ${row.supplier_id} at ${start}-${finish}, within SLA deadline ${slaDeadline} (${slaBasis} basis); profit ${c.f2(row.profit)}`);
  if (viol.length) parts.push(`${viol.length} rejected assignment(s): ${viol.map((v) => `${v.rule} (${v.detail})`).join('; ')} => violation penalty ${c.f2(row.violationPenalty)}`);
  if (r.duplicates.includes(o.id)) parts.push('order assigned more than once: duplicate (D8) forces total score to 0');
  if (plannerReason) parts.push(`planner: ${plannerReason}`);

  const data = {
    source, planSource, slaBasis, strict: r.strict,
    order: { id: o.id, arrive_minute: o.arrive_minute, paid_minute: paid ? o.paid_minute : null, game: o.game,
      value_thb: o.value_thb, vip: !!o.vip, sla_minutes: o.sla_minutes },
    status: row.status, assigned, supplier_id: row.supplier_id, start_minute: start, finish_minute: finish,
    slaDeadline, lateMinutes: row.lateMinutes, profit: row.profit, penalties: pen, violations: viol,
    plannerReason, reason: parts.join('. '),
  };
  return { data, text: `explain_order ${o.id}: ${data.reason}` };
}

module.exports = { name, config, handler: c.wrap(name, compute) };
