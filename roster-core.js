/* ASMH Duty Roster — client core: data layer (server or demo), helpers, UI primitives */
import * as E from './roster-engine.js';
export { E };

export const R = {
  mode: 'loading',        // 'live' | 'demo' | 'error'
  full: null,             // demo only: the complete state
  state: null,            // what this user may see
  me: null,
  rev: 0,
  notice: '',
  personas: [],
  listeners: new Set(),
  audit: []               // demo audit log
};
const DEMO_KEY = 'asmh_roster_demo_v2';

/* ------------------------------------------------------------------ */
/* DOM + formatting helpers                                            */
/* ------------------------------------------------------------------ */
export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
export const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
export const icon = (n, cls = '') => `<svg class="ic ${cls}"><use href="#i-${n}"/></svg>`;
export function initials(n) { const p = String(n || '?').replace(/^dr\.?\s+/i, '').split(/\s+/).filter(Boolean); return ((p[0] || '?')[0] + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase(); }
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const fmt = {
  dow: d => DOW[E.weekday(d)],
  day: d => +d.slice(8, 10),
  short: d => DOW[E.weekday(d)] + ' ' + (+d.slice(8, 10)) + ' ' + MON[+d.slice(5, 7) - 1],
  date: d => (+d.slice(8, 10)) + ' ' + MON[+d.slice(5, 7) - 1] + ' ' + d.slice(0, 4),
  month: d => MONL[+d.slice(5, 7) - 1] + ' ' + d.slice(0, 4),
  mon: d => MON[+d.slice(5, 7) - 1],
  range: (a, b) => a.slice(0, 7) === b.slice(0, 7) ? (+a.slice(8)) + '–' + (+b.slice(8)) + ' ' + MON[+a.slice(5, 7) - 1] + ' ' + a.slice(0, 4) : fmt.date(a) + ' – ' + fmt.date(b),
  when: ts => { if (!ts) return ''; const d = new Date(ts); return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }); },
  ago: ts => { const m = Math.round((Date.now() - ts) / 6e4); if (m < 1) return 'just now'; if (m < 60) return m + ' min ago'; const h = Math.round(m / 60); if (h < 24) return h + ' h ago'; return Math.round(h / 24) + ' d ago'; },
  hrs: h => (Math.round(h * 10) / 10) + ' h'
};
export const today = () => E.todayStr();

/* lookups (fresh each render) */
export const dept = id => R.state.department.find(d => d.id === id) || { name: '—', color: '#94a3b8', code: '?' };
export const staffById = id => R.state.staff.find(s => s.id === id);
export const tpl = id => R.state.template.find(t => t.id === id);
export const settings = () => E.settingsOf(R.state);
export function colorOf(sh) { const t = sh.template_id && tpl(sh.template_id); return (t && t.color) || (E.SHIFT_KINDS[E.kindOf(sh, R.state)] || E.SHIFT_KINDS.custom).color; }
export const can = (cap, dep) => !!R.me && E.can(R.me, cap, dep);
export const viewMode = () => (can('drafts') ? 'draft' : 'published');
export function staffIds(sh) { return R.state.assignment.filter(a => a.shift_id === sh.id).map(a => a.staff_id); }
export function proposedIds(sh) { return R.state.assignment.filter(a => a.shift_id === sh.id && a.proposed).map(a => a.staff_id); }

/* ------------------------------------------------------------------ */
/* events                                                              */
/* ------------------------------------------------------------------ */
export function on(fn) { R.listeners.add(fn); return () => R.listeners.delete(fn); }
function emit(kind) { R.listeners.forEach(fn => { try { fn(kind); } catch (e) { console.error(e); } }); }

/* ------------------------------------------------------------------ */
/* boot: live server or demo                                           */
/* ------------------------------------------------------------------ */
export async function boot() {
  let health = null;
  try {
    const r = await fetch('api/health', { headers: { accept: 'application/json' } });
    if (r.ok && /json/.test(r.headers.get('content-type') || '')) health = await r.json();
  } catch (e) {}
  if (health && health.app === 'asmh-roster') {
    const r = await fetch('api/state', { credentials: 'same-origin' });
    const j = await r.json().catch(() => ({}));
    if (r.ok && j.ok) { R.mode = 'live'; setLive(j); startSync(); return; }
    R.mode = 'error';
    R.notice = j.error || 'The roster server could not be reached.';
    if (r.status === 401) R.notice = 'Please sign in to use the duty roster.';
    return;
  }
  await startDemo();
}
function setLive(j) { R.state = j.state; R.me = j.me; R.rev = j.rev; }

async function startDemo() {
  const { buildDemo, demoPersonas } = await import('./roster-demo.js');
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(DEMO_KEY) || 'null'); } catch (e) {}
  const fresh = !saved || saved.v !== E.VERSION || !saved.built || Date.now() - saved.built > 6 * 864e5;
  R.full = fresh ? buildDemo() : saved.state;
  R.audit = fresh ? [{ at: Date.now(), actor: 'system', action: 'demo.build', summary: 'Demo data generated (fictional staff)' }] : (saved.audit || []);
  R.personas = demoPersonas(R.full);
  const pk = (saved && !fresh && saved.persona) || R.personas[0].key;
  R.me = (R.personas.find(p => p.key === pk) || R.personas[0]).actor;
  R.mode = 'demo';
  R.state = E.viewFor(R.full, R.me);
  R.rev = R.full.meta.rev;
  if (fresh) saveDemo(Date.now());
}
function saveDemo(built) {
  try {
    const prev = JSON.parse(localStorage.getItem(DEMO_KEY) || 'null');
    localStorage.setItem(DEMO_KEY, JSON.stringify({ v: E.VERSION, built: built || (prev && prev.built) || Date.now(), persona: R.me && R.me.email, state: R.full, audit: R.audit.slice(-500) }));
  } catch (e) {}
}
export function setPersona(key) {
  const p = R.personas.find(x => x.key === key); if (!p) return;
  R.me = p.actor; R.state = E.viewFor(R.full, R.me); saveDemo(); emit('persona');
}
export function resetDemo() { try { localStorage.removeItem(DEMO_KEY); } catch (e) {} location.reload(); }

let syncTimer = null;
function startSync() {
  clearInterval(syncTimer);
  syncTimer = setInterval(async () => {
    if (document.hidden) return;
    try {
      const r = await fetch('api/rev'); const j = await r.json();
      if (j.ok && j.rev !== R.rev) await refresh(true);
    } catch (e) {}
  }, 20000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && R.mode === 'live') refresh(true); });
}
export async function refresh(fromSync) {
  if (R.mode !== 'live') return;
  const r = await fetch('api/state'); const j = await r.json();
  if (j.ok) { const changed = j.rev !== R.rev; setLive(j); if (changed) { emit('sync'); if (fromSync) toast('Roster updated — showing the latest version.'); } }
}

/* ------------------------------------------------------------------ */
/* actions                                                             */
/* ------------------------------------------------------------------ */
/**
 * Run an engine action on the server (live) or locally (demo).
 * Conflicts ask for confirmation and retry with force/replace.
 */
export async function act(action, payload = {}, opts = {}) {
  let res;
  try {
    res = await send(action, payload);
  } catch (e) {
    if (e.code === 'conflict' && !opts.noForce) {
      const ok = await confirmBox({ title: 'Conflict detected', body: `<div class="errbox">${esc(e.message)}</div><p>You can still save this change; it will be flagged in the roster issues list.</p>`, ok: 'Save anyway', danger: true });
      if (!ok) return null;
      return act(action, Object.assign({}, payload, { force: true }), { noForce: true, quiet: opts.quiet });
    }
    if (e.code === 'confirm') {
      const ok = await confirmBox({ title: 'Replace existing shifts?', body: `<p>${esc(e.message)}</p><p>Copying will replace them with last week's roster.</p>`, ok: 'Replace', danger: true });
      if (!ok) return null;
      return act(action, Object.assign({}, payload, { replace: true }), opts);
    }
    toast(e.message || 'Something went wrong.', 'err');
    return null;
  }
  if (!opts.quiet && res.summary) toast(res.summary, res.warnings && res.warnings.length ? 'warn' : '', res.warnings);
  else if (!opts.quiet && res.warnings && res.warnings.length) toast('Saved with warnings', 'warn', res.warnings);
  emit('change');
  return res;
}
async function send(action, payload) {
  if (R.mode === 'live') {
    const r = await fetch('api/action', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action, payload }) });
    const j = await r.json().catch(() => ({ ok: false, error: 'The server returned an unexpected response.' }));
    if (!j.ok) { const err = new Error(j.error || 'Request failed'); err.code = j.code; err.details = j.details; if (r.status === 401) err.message = 'Your sign-in expired. Reload the page to sign in again.'; throw err; }
    setLive(j);
    return j;
  }
  if (R.mode === 'demo') {
    const snapshot = JSON.stringify(R.full);
    try {
      const out = E.apply(R.full, R.me, action, payload, Date.now());
      if (out.summary) R.audit.push({ at: Date.now(), actor: R.me.email, action, summary: out.summary });
      R.state = E.viewFor(R.full, R.me); R.rev = R.full.meta.rev;
      saveDemo();
      return Object.assign({ ok: true }, out);
    } catch (e) {
      R.full = JSON.parse(snapshot);
      throw e;
    }
  }
  throw new Error('The roster is not available.');
}
export async function auditLog() {
  if (R.mode === 'live') { const r = await fetch('api/audit?limit=400'); const j = await r.json(); return j.ok ? j.audit : []; }
  return R.audit.slice().reverse();
}
export async function backup() {
  if (R.mode === 'live') { window.location.href = 'api/backup'; return; }
  download('asmh-roster-demo-backup.json', JSON.stringify({ app: 'asmh-roster', version: E.VERSION, exported_at: new Date().toISOString(), demo: true, state: R.full, audit: R.audit }, null, 1), 'application/json');
}
export async function restore(file) {
  const text = await file.text(); let data;
  try { data = JSON.parse(text); } catch (e) { toast('That file is not a valid backup.', 'err'); return; }
  if (!data || data.app !== 'asmh-roster' || !data.state) { toast('That file is not an ASMH roster backup.', 'err'); return; }
  if (!await confirmBox({ title: 'Restore backup?', body: '<p>This replaces <b>all</b> current roster data with the backup from ' + esc(data.exported_at || 'the file') + '. This cannot be undone.</p>', ok: 'Restore', danger: true })) return;
  if (R.mode === 'live') {
    const r = await fetch('api/restore', { method: 'POST', headers: { 'content-type': 'application/json' }, body: text });
    const j = await r.json(); if (!j.ok) { toast(j.error || 'Restore failed', 'err'); return; }
    await refresh(); toast('Backup restored'); emit('change'); return;
  }
  R.full = data.state; R.audit.push({ at: Date.now(), actor: R.me.email, action: 'backup.restore', summary: 'Restored backup' });
  R.state = E.viewFor(R.full, R.me); saveDemo(); toast('Backup restored'); emit('change');
}

/* ------------------------------------------------------------------ */
/* UI primitives                                                       */
/* ------------------------------------------------------------------ */
export function toast(msg, kind = '', list) {
  const t = document.createElement('div');
  t.className = 'toast ' + kind;
  t.innerHTML = esc(msg) + (list && list.length ? '<ul>' + list.slice(0, 5).map(x => '<li>' + esc(x) + '</li>').join('') + (list.length > 5 ? '<li>+' + (list.length - 5) + ' more</li>' : '') + '</ul>' : '');
  $('#toasts').appendChild(t);
  setTimeout(() => { t.style.transition = 'opacity .3s'; t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, list && list.length ? 6500 : 3200);
}

let modalStack = [];
/** open a modal; returns { el, close } */
export function modal({ title, body = '', foot = '', size = '', onClose } = {}) {
  const bg = document.createElement('div');
  bg.className = 'mbg';
  bg.innerHTML = `<div class="modal ${size}" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="modal-h"><h2>${esc(title)}</h2><button class="ibtn" data-x aria-label="Close">${icon('x')}</button></div><div class="modal-b">${body}</div>${foot ? `<div class="modal-f">${foot}</div>` : ''}</div>`;
  $('#modalRoot').appendChild(bg);
  const prev = document.activeElement;
  const close = () => { bg.remove(); modalStack = modalStack.filter(m => m !== api); if (onClose) onClose(); if (prev && prev.focus) prev.focus(); };
  const api = { el: bg.querySelector('.modal'), close };
  bg.addEventListener('mousedown', e => { if (e.target === bg) close(); });
  bg.querySelector('[data-x]').onclick = close;
  modalStack.push(api);
  setTimeout(() => { const f = bg.querySelector('input:not([type=hidden]):not([type=checkbox]),select,textarea,button.primary'); if (f) f.focus(); }, 40);
  return api;
}
document.addEventListener('keydown', e => { if (e.key === 'Escape' && modalStack.length) modalStack[modalStack.length - 1].close(); });

export function confirmBox({ title, body, ok = 'Confirm', danger = false }) {
  return new Promise(res => {
    let done = false;
    const m = modal({ title, body, foot: `<span class="sp"></span><button class="btn" data-no>Cancel</button><button class="btn ${danger ? 'danger' : 'primary'}" data-yes>${esc(ok)}</button>`, onClose: () => { if (!done) res(false); } });
    m.el.querySelector('[data-no]').onclick = () => m.close();
    m.el.querySelector('[data-yes]').onclick = () => { done = true; m.close(); res(true); };
  });
}

export function download(name, content, type) {
  const blob = content instanceof Blob ? content : new Blob([content], { type: type || 'text/plain' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 400);
}
const loaded = {};
export function loadScript(src) {
  if (loaded[src]) return loaded[src];
  return (loaded[src] = new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('Could not load ' + src)); document.head.appendChild(s); }));
}
export const LIB = {
  xlsx: 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
  jspdf: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  autotable: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js'
};

/* ------------------------------------------------------------------ */
/* exports: CSV / Excel / PDF / print                                  */
/* ------------------------------------------------------------------ */
export function toCSV(rows) {
  return '﻿' + rows.map(r => r.map(v => { v = v == null ? '' : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(',')).join('\r\n');
}
/** sheets: [{ name, rows: [[...]] }] */
export async function exportXLSX(file, sheets, meta) {
  await loadScript(LIB.xlsx);
  const wb = window.XLSX.utils.book_new();
  for (const sh of sheets) {
    const head = meta ? [[meta.org], [meta.title], [meta.period], [meta.approval || ''], []] : [];
    const ws = window.XLSX.utils.aoa_to_sheet(head.concat(sh.rows));
    ws['!cols'] = (sh.rows[0] || []).map((_, i) => ({ wch: Math.min(40, Math.max(10, ...sh.rows.slice(0, 200).map(r => String(r[i] == null ? '' : r[i]).length + 2))) }));
    window.XLSX.utils.book_append_sheet(wb, ws, sh.name.slice(0, 31));
  }
  window.XLSX.writeFile(wb, file);
}
/** tables: [{ title, head: [...], body: [[...]] }] */
export async function exportPDF(file, meta, tables, landscape = true) {
  await loadScript(LIB.jspdf); await loadScript(LIB.autotable);
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: landscape ? 'landscape' : 'portrait', unit: 'pt', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const header = () => {
    doc.setFillColor(5, 85, 122); doc.rect(0, 0, W, 6, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(20, 32, 42); doc.text(meta.org, 36, 30);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(90, 100, 110);
    doc.text(meta.title + '  ·  ' + meta.period, 36, 46);
    if (meta.approval) doc.text(meta.approval, 36, 60);
  };
  let y = 76;
  header();
  for (const t of tables) {
    if (t.title) { doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(20, 32, 42); doc.text(t.title, 36, y); y += 8; }
    doc.autoTable({ startY: y, head: [t.head], body: t.body, margin: { left: 36, right: 36, top: 76 }, styles: { fontSize: 8.5, cellPadding: 4, lineColor: [220, 226, 232], lineWidth: .5 }, headStyles: { fillColor: [5, 85, 122], textColor: 255, fontStyle: 'bold' }, alternateRowStyles: { fillColor: [246, 248, 250] },
      didDrawPage: d => { if (d.pageNumber > 1) header(); doc.setFontSize(8); doc.setTextColor(140); doc.text('ASMH CarePortal · generated ' + new Date().toLocaleString('en-GB') + ' · page ' + doc.internal.getNumberOfPages(), 36, doc.internal.pageSize.getHeight() - 16); } });
    y = doc.lastAutoTable.finalY + 24;
  }
  doc.save(file);
}
export function printDoc(meta, tables, extraCss = '') {
  const w = window.open('', '_blank');
  if (!w) { toast('Allow pop-ups to print.', 'err'); return; }
  const tbl = t => `${t.title ? `<h2>${esc(t.title)}</h2>` : ''}<table><thead><tr>${t.head.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${t.body.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(meta.title)}</title><style>
    @page{size:A4 landscape;margin:14mm}body{font:11px/1.4 -apple-system,"Segoe UI",Roboto,sans-serif;color:#14202a}
    .hd{border-top:5px solid #05557a;padding-top:10px;margin-bottom:14px;display:flex;justify-content:space-between;align-items:flex-end}
    h1{font-size:16px;margin:0}.sub{color:#555;margin-top:2px}.ap{font-size:10px;color:#555;text-align:right}
    h2{font-size:12px;margin:16px 0 6px}table{width:100%;border-collapse:collapse;page-break-inside:auto}
    th,td{border:1px solid #cfd7de;padding:4px 6px;text-align:left;vertical-align:top}th{background:#e6eef3}tr{page-break-inside:avoid}
    .sig{margin-top:28px;display:flex;gap:60px;font-size:10px}.sig div{border-top:1px solid #999;padding-top:4px;width:200px}${extraCss}
  </style></head><body><div class="hd"><div><h1>${esc(meta.org)}</h1><div class="sub">${esc(meta.title)} · ${esc(meta.period)}</div></div><div class="ap">${esc(meta.approval || '')}<br>Printed ${esc(new Date().toLocaleString('en-GB'))}</div></div>
  ${tables.map(tbl).join('')}
  <div class="sig"><div>Prepared by</div><div>Approved by (Head of Department)</div><div>Date</div></div>
  <script>onload=function(){print()}<\/script></body></html>`);
  w.document.close();
}
/** approval line for exports: latest version covering the period */
export function approvalLine(from, to, depId) {
  const v = R.state.version.filter(x => x.kind !== 'swap' && x.start <= to && x.end >= from && (!depId || !x.department_id || x.department_id === depId)).sort((a, b) => b.no - a.no)[0];
  return v ? `Published roster v${v.no} · approved by ${v.by_name || v.by} on ${fmt.when(v.at)}` : 'DRAFT — not yet published';
}
