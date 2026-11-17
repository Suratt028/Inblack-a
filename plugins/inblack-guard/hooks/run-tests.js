#!/usr/bin/env node
'use strict';
// inblack-guard Stop hook.
// Runs `npm test` in the project. If it fails: logs the block to AGENT_LOG/hook-events.md,
// prints the reason to stderr and exits 2, which tells Claude Code not to finish the turn.
// If Claude is already continuing because of this hook (stop_hook_active) and tests still
// fail, it blocks again — the agent must fix the tests, not retry.
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function readStdin() {
  try { return JSON.parse(fs.readFileSync(0, 'utf8') || '{}'); } catch { return {}; }
}

function summarize(out) {
  const lines = out.split(/\r?\n/);
  const pick = (k) => { const l = lines.find((x) => x.startsWith(`ℹ ${k} `)); return l ? Number(l.split(' ')[2]) : null; };
  const failed = lines.filter((l) => /^\s*✖ /.test(l) && !/✖ failing tests:/.test(l)).map((l) => l.trim().replace(/\s*\(\d+(\.\d+)?ms\)$/, ''));
  return { tests: pick('tests'), pass: pick('pass'), fail: pick('fail'), failed: [...new Set(failed)].slice(0, 10) };
}

function main() {
  const input = readStdin();
  const root = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
  if (!fs.existsSync(path.join(root, 'package.json'))) process.exit(0); // not this project

  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const r = spawnSync(npm, ['test'], { cwd: root, encoding: 'utf8', shell: process.platform === 'win32', timeout: 170000 });
  const out = `${r.stdout || ''}\n${r.stderr || ''}`;
  if (r.status === 0) process.exit(0);

  const s = summarize(out);
  const when = new Date().toISOString().replace('T', ' ').slice(0, 16) + 'Z';
  const reason = `npm test failed (${s.fail ?? '?'} of ${s.tests ?? '?'} failing). Fix the failing tests before finishing.`;
  const entry = [
    '',
    `## ${when} — Stop blocked by inblack-guard`,
    `- session: ${input.session_id || 'unknown'} · stop_hook_active: ${Boolean(input.stop_hook_active)}`,
    `- command: \`npm test\` · exit ${r.status === null ? 'timeout' : r.status} · tests ${s.tests ?? '?'} · pass ${s.pass ?? '?'} · fail ${s.fail ?? '?'}`,
    ...s.failed.map((f) => `- ${f}`),
    `- reason sent to agent: ${reason}`,
    '',
  ].join('\n');
  try {
    const logDir = path.join(root, 'AGENT_LOG');
    fs.mkdirSync(logDir, { recursive: true });
    const file = path.join(logDir, 'hook-events.md');
    if (!fs.existsSync(file)) fs.writeFileSync(file, '# hook-events\n_Real events only, appended by the inblack-guard Stop hook._\n');
    fs.appendFileSync(file, entry);
  } catch { /* logging must never hide the block */ }

  process.stderr.write(`${reason}\nFailing: ${s.failed.join(' | ') || 'see npm test output'}\n`);
  process.exit(2);
}

main();
