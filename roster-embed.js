/* =====================================================================
 * ASMH CarePortal — Duty Roster, embedded in the main portal (index.html)
 * The roster pages open inside the portal's main area; its account menu
 * (role, demo "view as", notifications) sits in the portal header.
 * ===================================================================== */
import { R, E, $, $$, esc, icon, initials, can, boot, on, act, setPersona, toast, scopeCSS, fmt } from './roster-core.js';
import { renderRoster } from './roster-calendar.js';
import { renderHomeWorkforce, renderMy, renderStaff, renderRequests, renderReports, renderActivity, renderSettings } from './roster-pages.js';

export const PAGES = [
  ['roster', 'Duty Roster', 'cal'], ['my', 'My Roster', 'user'], ['staff', 'Staff Directory', 'users'],
  ['requests', 'Requests', 'inbox'], ['reports', 'Reports', 'chart'], ['activity', 'Versions & Audit', 'history', true], ['settings', 'Settings', 'gear', true]
];
const ROUTES = { roster: renderRoster, my: renderMy, staff: renderStaff, requests: renderRequests, reports: renderReports, activity: renderActivity, settings: renderSettings };

const SPRITE = `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
  <symbol id="i-grid" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></symbol>
  <symbol id="i-cal" viewBox="0 0 24 24"><rect x="3" y="4.5" width="18" height="16.5" rx="2"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/></symbol>
  <symbol id="i-user" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></symbol>
  <symbol id="i-users" viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14a6.5 6.5 0 0 1 3.5 6"/></symbol>
  <symbol id="i-inbox" viewBox="0 0 24 24"><path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5.1 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.7 4H7.3a2 2 0 0 0-1.8 1.1z"/></symbol>
  <symbol id="i-chart" viewBox="0 0 24 24"><path d="M3 3v18h18"/><path d="M8 17v-5M12 17V8M16 17v-8M20 17v-3"/></symbol>
  <symbol id="i-gear" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></symbol>
  <symbol id="i-history" viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/></symbol>
  <symbol id="i-plus" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></symbol>
  <symbol id="i-send" viewBox="0 0 24 24"><path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4z"/></symbol>
  <symbol id="i-search" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></symbol>
  <symbol id="i-left" viewBox="0 0 24 24"><path d="m15 18-6-6 6-6"/></symbol>
  <symbol id="i-right" viewBox="0 0 24 24"><path d="m9 18 6-6-6-6"/></symbol>
  <symbol id="i-down" viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></symbol>
  <symbol id="i-bell" viewBox="0 0 24 24"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></symbol>
  <symbol id="i-x" viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></symbol>
  <symbol id="i-alert" viewBox="0 0 24 24"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/></symbol>
  <symbol id="i-check" viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></symbol>
  <symbol id="i-copy" viewBox="0 0 24 24"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/></symbol>
  <symbol id="i-magic" viewBox="0 0 24 24"><path d="m15 4-1 2-2 1 2 1 1 2 1-2 2-1-2-1zM5 14l-1 2-2 1 2 1 1 2 1-2 2-1-2-1z"/><path d="m21 3-18 18"/></symbol>
  <symbol id="i-download" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></symbol>
  <symbol id="i-print" viewBox="0 0 24 24"><path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M6 14h12v7H6z"/></symbol>
  <symbol id="i-more" viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/></symbol>
  <symbol id="i-clock" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></symbol>
  <symbol id="i-pin" viewBox="0 0 24 24"><path d="M12 22s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12z"/><circle cx="12" cy="10" r="2.5"/></symbol>
  <symbol id="i-swap" viewBox="0 0 24 24"><path d="M7 4 3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7"/></symbol>
  <symbol id="i-menu" viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h16"/></symbol>
  <symbol id="i-moon" viewBox="0 0 24 24"><path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z"/></symbol>
  <symbol id="i-home" viewBox="0 0 24 24"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/></symbol>
  <symbol id="i-layers" viewBox="0 0 24 24"><path d="m12 2 10 5-10 5L2 7z"/><path d="m2 17 10 5 10-5M2 12l10 5 10-5"/></symbol>
</defs></svg>`;

/* layout of the embedded roster inside the portal (selectors already start at .rp) */
const EMBED_CSS = `
.rp{overflow:visible;height:auto;background:transparent;font-size:14px;line-height:1.45;color:var(--ink)}
.rp-app{margin:-16px -20px;min-height:calc(100% + 32px);background:var(--bg);display:flex;flex-direction:column}
.rp-tabs{position:sticky;top:-16px;z-index:30;display:flex;align-items:center;gap:4px;padding:8px 20px 8px 16px;background:var(--surface);border-bottom:1px solid var(--line);overflow-x:auto;scrollbar-width:none}
.rp-tabs::-webkit-scrollbar{display:none}
.rp-tabs .tab{display:inline-flex;align-items:center;gap:7px;padding:8px 12px;border-radius:9px;border:0;background:none;color:var(--ink-2);font-weight:600;font-size:13.5px;white-space:nowrap;cursor:pointer}
.rp-tabs .tab:hover{background:var(--surface-3);color:var(--ink)}
.rp-tabs .tab.on{background:var(--brand-soft2);color:var(--brand)}
[data-theme="dark"] .rp-tabs .tab.on{color:var(--brand-2)}
.rp-tabs .tab .nbadge{position:static;margin-left:2px}
.rp-tabs .grow{flex:1}
.rp-tabs .mode-pill{flex-shrink:0}
.rp-app>.main{position:static;inset:auto;margin:0;padding:0;overflow:visible;height:auto;flex:1;outline:none}
.rp-hdr{display:flex;align-items:center;gap:6px;background:transparent}
.rp-hdr .me-chip{height:36px}
.rp-hdr .pop{top:calc(100% + 8px);z-index:300}
.rp-hdr .pop label{display:block;padding:6px 10px 4px;font-size:12px;font-weight:600;color:var(--muted)}
.rp-hdr .pop select{margin:0 10px 8px;width:calc(100% - 20px)}
@media (max-width:820px){.rp-app{margin:-12px}.rp-tabs{top:-12px;padding:6px 10px}.rp-hdr .me-txt{display:none}}
`;

let main = null, current = 'roster', ready = null, isOpen = false;
const content = () => document.getElementById('rosterContent');

function injectAssets() {
  if (!document.getElementById('rpSprite')) document.body.insertAdjacentHTML('afterbegin', SPRITE.replace('<svg ', '<svg id="rpSprite" '));
  if (!document.getElementById('rpLayer')) document.body.insertAdjacentHTML('beforeend', '<div class="rp" id="rpFloat" style="position:static"><div id="modalRoot"></div><div class="toasts" id="toasts" aria-live="polite"></div><div id="rpLayer"></div></div>');
  return fetch('roster.css', { cache: 'no-cache' }).then(r => r.text()).then(css => {
    const el = document.createElement('style'); el.id = 'rpCss';
    el.textContent = scopeCSS(css) + EMBED_CSS;
    document.head.appendChild(el);
  });
}

function buildHeader() {
  const hdr = document.getElementById('rpHdr'); if (!hdr) return;
  hdr.className = 'rp rp-hdr';
  hdr.innerHTML = `<div class="pop-wrap">
      <button class="ibtn" id="bellBtn" aria-label="Roster notifications">${icon('bell')}<span class="dot-badge" id="bellBadge" hidden></span></button>
      <div class="pop" id="bellPop" hidden></div>
    </div>
    <div class="pop-wrap">
      <button class="me-chip" id="meBtn" aria-label="Account"><span class="av" id="meAv">?</span><span class="me-txt"><b id="meName">…</b><small id="meRole"></small></span>${icon('down', 'sm')}</button>
      <div class="pop" id="mePop" hidden></div>
    </div>`;
}
function buildApp() {
  const c = content(); if (!c || c.querySelector('.rp-app')) return;
  c.innerHTML = `<div class="rp rp-app">
    <nav class="rp-tabs" aria-label="Duty roster">${PAGES.map(([k, label, ic, admin]) => `<button class="tab ${admin ? 'admin-only' : ''}" data-route="${k}">${icon(ic)}${esc(label)}${k === 'my' ? '<span class="nbadge" id="nbMy" hidden></span>' : k === 'requests' ? '<span class="nbadge" id="nbReq" hidden></span>' : ''}</button>`).join('')}
      <span class="grow"></span><span class="mode-pill" id="modePill">Loading…</span></nav>
    <div class="main" id="main" tabindex="-1"><div class="boot">Loading duty roster…</div></div>
  </div>`;
  main = $('#main', c);
}

/* ---------------- routing ---------------- */
function pick(r) {
  if (!ROUTES[r]) r = can('edit') ? 'roster' : R.me.staff_id ? 'my' : 'roster';
  if ((r === 'activity' && !can('audit')) || (r === 'settings' && !can('settings') && !can('edit'))) r = 'roster';
  return r;
}
function draw() {
  if (!isOpen || !main) return;
  if (R.mode === 'error') { main.innerHTML = `<div class="page"><div class="card card-b" style="max-width:560px;margin:40px auto;text-align:center"><h2 style="margin-bottom:8px">Duty roster unavailable</h2><p class="muted">${esc(R.notice)}</p><p style="margin-top:14px"><button class="btn primary" onclick="location.reload()">Try again</button></p></div></div>`; return; }
  const sc = document.getElementById('mainContent'), y = sc ? sc.scrollTop : 0;
  try { ROUTES[current](main); } catch (e) { console.error(e); main.innerHTML = `<div class="page"><div class="errbox">Something went wrong displaying this page: ${esc(e.message)}</div></div>`; }
  if (R.mode === 'demo') {
    const pg = main.querySelector('.page');
    if (pg && !pg.querySelector('.banner.demo')) pg.insertAdjacentHTML('afterbegin', `<div class="banner demo">${icon('alert')}<span><b>Sample data.</b> MO duty roster for 11–17 Oct 2026 as issued; other weeks follow the same pattern. Changes stay in your browser — nothing is sent to a server. Viewing as <b>${esc(R.me.name)}</b> (${esc(E.ROLE_LABEL[R.me.role])}).</span></div>`);
  }
  if (sc && current !== 'roster') sc.scrollTop = y;
  chrome();
}

/** open a roster page inside the portal */
export async function show(r) {
  await init();
  const c = content(); if (!c) return;
  const sc = document.getElementById('mainContent');
  isOpen = true;
  if (sc) Array.from(sc.children).forEach(el => { if (el !== c && el.tagName !== 'FOOTER' && el.style.display !== 'none') el.style.display = 'none'; });
  c.style.display = 'block';
  const fab = document.getElementById('addDrugFab'); if (fab) fab.classList.remove('visible');
  document.querySelectorAll('.hnav-item').forEach(i => i.classList.remove('open'));
  const prev = current;
  current = pick(r);
  if (('#/' + current) !== location.hash) history.replaceState(null, '', '#/' + current);
  $$('.rp-tabs [data-route]').forEach(a => a.classList.toggle('on', a.dataset.route === current));
  document.getElementById('hnavItemRoster')?.classList.add('active');
  if (sc && prev !== current) sc.scrollTop = 0;
  draw();
}
/** hide the roster (another portal section was opened) */
export function hide() {
  const c = content(); if (!c) return;
  isOpen = false;
  c.style.display = 'none';
  document.getElementById('hnavItemRoster')?.classList.remove('active');
  if (/^#\//.test(location.hash)) history.replaceState(null, '', location.pathname + location.search);
}

/* ---------------- header: account + notifications ---------------- */
function chrome() {
  if (!R.me) return;
  const me = R.me;
  const set = (id, fn) => { const el = document.getElementById(id); if (el) fn(el); };
  set('meAv', el => (el.textContent = initials(me.name)));
  set('meName', el => (el.textContent = me.name));
  set('meRole', el => (el.textContent = E.ROLE_LABEL[me.role] + (R.mode === 'demo' ? ' · demo' : '')));
  set('modePill', pill => { pill.className = 'mode-pill ' + R.mode; pill.textContent = R.mode === 'demo' ? 'Demo data' : R.mode === 'live' ? 'Live · synced' : 'Offline'; pill.title = R.mode === 'demo' ? 'No roster server is connected. This is sample roster data saved only in this browser.' : 'Connected to the ASMH roster server. Changes sync to all devices.'; });
  $$('.rp .admin-only').forEach(el => (el.hidden = !(can('audit') || can('settings'))));
  document.querySelectorAll('[data-rp-admin]').forEach(el => (el.hidden = !(can('audit') || can('settings'))));
  const unread = R.state.notif.filter(n => !n.read).length;
  set('bellBadge', el => { el.hidden = !unread; el.textContent = unread; });
  const pendLeave = R.state.leave.filter(l => l.status === 'pending' && can('approve', (R.state.staff.find(s => s.id === l.staff_id) || {}).department_id)).length;
  const pendSwap = R.state.swap.filter(x => (x.status === 'pending_approval' && can('approve')) || (x.status === 'pending_peer' && x.to_staff_id === me.staff_id)).length;
  const req = pendLeave + pendSwap;
  set('nbReq', el => { el.hidden = !req; el.textContent = req; });
  const toAck = me.staff_id ? R.state.version.filter(v => (v.affected || []).includes(me.staff_id) && !R.state.ack.some(a => a.version_id === v.id && a.staff_id === me.staff_id)).length : 0;
  set('nbMy', el => { el.hidden = !toAck; el.textContent = toAck; });
  document.querySelectorAll('[data-rp-badge="my"]').forEach(el => { el.hidden = !toAck; el.textContent = toAck; });
  document.querySelectorAll('[data-rp-badge="requests"]').forEach(el => { el.hidden = !req; el.textContent = req; });
}
function bell() {
  const pop = $('#bellPop');
  const list = R.state.notif.slice().sort((a, b) => b.at - a.at).slice(0, 30);
  pop.innerHTML = `<div class="pop-h">Roster notifications ${list.some(n => !n.read) ? '<button class="btn sm ghost" data-read>Mark all read</button>' : ''}</div>` +
    (list.map(n => `<button class="pop-item ${n.read ? '' : 'unread'}" data-n="${n.id}" data-k="${n.kind}"><span class="dot" style="margin-top:6px;background:${n.read ? 'var(--line-2)' : 'var(--brand-2)'}"></span><span>${esc(n.text)}<small>${fmt.ago(n.at)}</small></span></button>`).join('') || '<div class="pop-empty">You have no notifications.</div>');
}
function meMenu() {
  const pop = $('#mePop');
  pop.innerHTML = `<div class="pop-h">${esc(R.me.email)}</div>
    <div class="pop-empty" style="padding:4px 10px 10px">Role: <b>${esc(E.ROLE_LABEL[R.me.role])}</b>${R.me.dept_scope ? '<br>Departments: ' + R.me.dept_scope.map(d => esc((R.state.department.find(x => x.id === d) || {}).name || d)).join(', ') : ''}</div>
    ${R.mode === 'demo' ? `<label for="persona">Demo: view as</label><select class="inp" id="persona">${R.personas.map(p => `<option value="${esc(p.key)}" ${p.key === R.me.email ? 'selected' : ''}>${esc(p.label)}</option>`).join('')}</select>` : ''}
    <button class="pop-item" data-go="roster">${icon('cal')}<span>Duty roster</span></button>
    <button class="pop-item" data-go="my">${icon('user')}<span>My roster</span></button>
    <button class="pop-item" data-theme-toggle>${icon('moon')}<span>Toggle dark mode</span></button>
    ${R.mode === 'live' ? `<button class="pop-item" data-out style="color:var(--red)">${icon('x')}<span>Sign out</span></button>` : ''}`;
  const p = $('#persona'); if (p) p.onchange = () => { setPersona(p.value); pop.hidden = true; toast('Now viewing the roster as ' + R.me.name + ' (' + E.ROLE_LABEL[R.me.role] + ')'); chrome(); if (isOpen) show(current); };
}
function closePops() { const a = $('#bellPop'), b = $('#mePop'); if (a) a.hidden = true; if (b) b.hidden = true; }

function wire() {
  const bb = $('#bellBtn'), mb = $('#meBtn');
  if (bb) bb.onclick = e => { e.stopPropagation(); const p = $('#bellPop'); $('#mePop').hidden = true; p.hidden = !p.hidden; if (!p.hidden) bell(); };
  if (mb) mb.onclick = e => { e.stopPropagation(); const p = $('#mePop'); $('#bellPop').hidden = true; p.hidden = !p.hidden; if (!p.hidden) meMenu(); };
  document.addEventListener('click', e => { if (!e.target.closest('.rp-hdr .pop-wrap')) closePops(); });
  const bp = $('#bellPop');
  if (bp) bp.onclick = async e => {
    e.stopPropagation();
    if (e.target.closest('[data-read]')) { await act('notif.read', {}, { quiet: true }); bell(); return; }
    const n = e.target.closest('[data-n]'); if (!n) return;
    act('notif.read', { ids: [n.dataset.n] }, { quiet: true });
    closePops(); show(n.dataset.k === 'roster' ? 'my' : 'requests');
  };
  const mp = $('#mePop');
  if (mp) mp.onclick = e => {
    e.stopPropagation();
    const g = e.target.closest('[data-go]'); if (g) { closePops(); show(g.dataset.go); }
    if (e.target.closest('[data-theme-toggle]')) { const t = document.getElementById('themeBtn'); if (t) t.click(); }
    if (e.target.closest('[data-out]')) location.href = '/cdn-cgi/access/logout';
  };
  const c = content();
  if (c) c.addEventListener('click', e => { const t = e.target.closest('.rp-tabs [data-route]'); if (t) show(t.dataset.route); });
  on(kind => { chrome(); if (kind === 'persona') return; draw(); });
  // portal theme switch → redraw (board colours are computed at draw time)
  new MutationObserver(() => { if (isOpen && current === 'roster') draw(); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  // another portal section opened → close the roster
  const sc = document.getElementById('mainContent');
  if (sc) new MutationObserver(muts => {
    if (!isOpen) return;
    for (const m of muts) { const el = m.target; if (el !== content() && el.parentElement === sc && el.tagName !== 'FOOTER' && el.style.display !== 'none' && getComputedStyle(el).display !== 'none') { hide(); break; } }
  }).observe(sc, { attributes: true, attributeFilter: ['style'], subtree: true });
  document.addEventListener('keydown', e => {
    if (!isOpen || current !== 'roster' || e.target.closest('input,textarea,select') || document.querySelector('.rp .mbg')) return;
    const k = { ArrowLeft: 'prev', ArrowRight: 'next', t: 'today', n: 'add' }[e.key];
    if (k) { const b = document.querySelector(`.rp [data-a="${k}"]`); if (b) { e.preventDefault(); b.click(); } }
  });
}

/** workforce summary on the portal landing page (replaces the roster dashboard) */
export async function home(el) {
  if (!el || el.dataset.rpHome) return;
  el.dataset.rpHome = '1';
  await init();
  if (R.mode === 'error') { el.hidden = true; return; }
  const draw = () => { try { renderHomeWorkforce(el); } catch (e) { console.error(e); } };
  draw(); on(draw); setInterval(draw, 60000);
}

/** load styles, the header menu and the roster data (once) */
export function init() {
  if (ready) return ready;
  ready = (async () => {
    buildHeader(); buildApp();
    await injectAssets();
    try { await boot(); } catch (e) { console.error(e); R.mode = 'error'; R.notice = 'Could not start the roster: ' + e.message; }
    if (R.mode === 'error') { const h = document.getElementById('rpHdr'); if (h) h.hidden = true; chrome(); return; }
    wire(); chrome();
  })();
  return ready;
}
