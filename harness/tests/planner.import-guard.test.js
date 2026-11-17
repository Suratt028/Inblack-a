'use strict';
// R10 / CLAUDE.md "src/planner.js MUST NOT import from harness/" — planner and scorer share no code (PLAN.md §3).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT } = require('./planner.helpers.js');

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'node_modules') walk(p, out); }
    else if (/\.(c|m)?js$/.test(e.name)) out.push(p);
  }
  return out;
}

const SRC = path.join(ROOT, 'src');
const HARNESS = path.join(ROOT, 'harness');
// require('x') / require("x") / import ... from 'x' / import('x') / import 'x'
const SPEC_RE = /(?:require\s*\(\s*|import\s*\(\s*|from\s+|import\s+)(['"`])([^'"`]+)\1/g;

test('R10 import-guard: no file under src/ requires or imports harness/', () => {
  const files = walk(SRC);
  assert.ok(files.length > 0, 'src/ has no JS files');
  const bad = [];
  for (const f of files) {
    const text = fs.readFileSync(f, 'utf8');
    for (const m of text.matchAll(SPEC_RE)) {
      const spec = m[2];
      const resolved = spec.startsWith('.') ? path.resolve(path.dirname(f), spec) : null;
      const hitsHarness = /(^|[\/])harness([\/]|$)/.test(spec) ||
        (resolved && (resolved === HARNESS || resolved.startsWith(HARNESS + path.sep)));
      if (hitsHarness) bad.push(`${path.relative(ROOT, f)}: ${spec}`);
    }
    // dynamic path building to harness (e.g. path.join(__dirname,'..','harness'))
    if (/['"`]harness['"`]/.test(text)) bad.push(`${path.relative(ROOT, f)}: string literal 'harness'`);
  }
  assert.deepEqual(bad, []);
});

test('R10 import-guard: loading src/planner.js does not load any harness/ module', () => {
  const before = new Set(Object.keys(require.cache));
  require(path.join(SRC, 'planner.js'));
  const loaded = Object.keys(require.cache).filter((k) => !before.has(k) && k.startsWith(HARNESS + path.sep));
  assert.deepEqual(loaded, []);
});
