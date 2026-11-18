// Shared helpers for the INBLACK Project A site. All numbers come from data/*.json,
// which GitHub Actions generates from the benchmark run (harness/reports/build-site-data.js).
'use strict';

const Site = (() => {
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pct = (v, d = 2) => (v == null || Number.isNaN(v) ? '–' : `${Number(v).toFixed(d)}%`);
  const num = (v, d = 0) => (v == null || Number.isNaN(v) ? '–' : Number(v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }));
  const signed = (v, d = 2) => (v == null ? '–' : `${v >= 0 ? '+' : ''}${Number(v).toFixed(d)}`);

  // One request per file per page, shared by every section that needs it.
  const cache = new Map();
  function getJSON(path) {
    if (!cache.has(path)) {
      cache.set(path, fetch(path, { cache: 'no-cache' }).then((res) => {
        if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
        return res.json();
      }));
    }
    return cache.get(path);
  }
  // Round the same way as the display, so differences agree with the shown numbers.
  const r2 = (v) => Math.round(v * 100) / 100;
  const plain = (s) => String(s ?? '').replace(/`/g, '');

  // Shows a loading message in `el`, runs `fn`, and replaces it with an error message if `fn` throws.
  async function load(el, fn) {
    el.innerHTML = '<div class="state" role="status">กำลังโหลดข้อมูล…</div>';
    try {
      await fn();
    } catch (err) {
      console.error(err);
      el.innerHTML = `<div class="state error" role="alert"><p>โหลดข้อมูลไม่สำเร็จ: ${esc(err.message)}</p><button type="button" class="btn">ลองอีกครั้ง</button></div>`;
      el.querySelector('button').addEventListener('click', () => location.reload());
    }
  }

  function footer(meta) {
    const f = document.getElementById('foot');
    if (!f || !meta) return;
    const when = meta.generatedAt ? new Date(meta.generatedAt).toLocaleString('th-TH') : '–';
    const parts = ['ข้อมูลสร้างโดย GitHub Actions'];
    if (meta.commit) parts.push(`commit <code>${esc(meta.commit)}</code>`);
    if (meta.generatorLock) parts.push(`generator lock <code>${esc(meta.generatorLock)}</code>`);
    parts.push(esc(when));
    f.innerHTML = parts.join(' · ');
  }

  return { esc, pct, num, signed, r2, plain, getJSON, load, footer };
})();
