/* ASMH Duty Roster — app shell */
import { R, E, $, $$, esc, icon, initials, fmt, can, boot, on, act, setPersona, toast } from './roster-core.js';
import { renderRoster, openShift } from './roster-calendar.js';
import { renderDashboard, renderMy, renderStaff, renderRequests, renderReports, renderActivity, renderSettings } from './roster-pages.js';

const ROUTES = { dashboard: renderDashboard, roster: renderRoster, my: renderMy, staff: renderStaff, requests: renderRequests, reports: renderReports, activity: renderActivity, settings: renderSettings };
const main = $('#main');
let current = null;

function route() {
  let r = (location.hash.replace(/^#\/?/, '') || '').split('?')[0];
  if (!ROUTES[r]) r = can('edit') ? 'roster' : can('approve') ? 'dashboard' : R.me.staff_id ? 'my' : 'roster';
  if ((r === 'activity' && !can('audit')) || (r === 'settings' && !can('settings') && !can('edit'))) r = 'dashboard';
  current = r;
  $$('.nav[data-route]').forEach(a => a.classList.toggle('on', a.dataset.route === r));
  $('#side').classList.remove('open'); $('#scrim').classList.remove('open');
  draw();
}
function draw() {
  const y = main.scrollTop;
  try { ROUTES[current](main); } catch (e) { console.error(e); main.innerHTML = `<div class="page"><div class="errbox">Something went wrong displaying this page: ${esc(e.message)}</div></div>`; }
  if (R.mode === 'demo') {
    const pg = main.querySelector('.page');
    if (pg && !pg.querySelector('.banner.demo')) pg.insertAdjacentHTML('afterbegin', `<div class="banner demo">${icon('alert')}<span><b>Sample data.</b> MO duty roster for 11–17 Oct 2026 as issued; other weeks follow the same pattern. Changes stay in your browser — nothing is sent to a server. Viewing as <b>${esc(R.me.name)}</b> (${esc(E.ROLE_LABEL[R.me.role])}).</span></div>`);
  }
  if (current !== 'roster') main.scrollTop = y;
  chrome();
}

/* header, badges, notifications, account menu */
function chrome() {
  const me = R.me, staff = me.staff_id && R.state.staff.find(s => s.id === me.staff_id);
  $('#meAv').textContent = initials(me.name);
  $('#meName').textContent = me.name;
  $('#meRole').textContent = E.ROLE_LABEL[me.role] + (R.mode === 'demo' ? ' · demo' : '');
  const pill = $('#modePill');
  pill.className = 'mode-pill ' + R.mode;
  pill.textContent = R.mode === 'demo' ? 'Demo data' : 'Live · synced';
  pill.title = R.mode === 'demo' ? 'No roster server is connected. This is sample roster data saved only in this browser.' : 'Connected to the ASMH roster server. Changes sync to all devices.';
  $$('.admin-only').forEach(el => (el.hidden = !(can('audit') || can('settings'))));
  const unread = R.state.notif.filter(n => !n.read).length;
  $('#bellBadge').hidden = !unread; $('#bellBadge').textContent = unread;
  const pendLeave = R.state.leave.filter(l => l.status === 'pending' && can('approve', (R.state.staff.find(s => s.id === l.staff_id) || {}).department_id)).length;
  const pendSwap = R.state.swap.filter(x => (x.status === 'pending_approval' && can('approve')) || (x.status === 'pending_peer' && x.to_staff_id === me.staff_id)).length;
  const req = pendLeave + pendSwap;
  $('#nbReq').hidden = !req; $('#nbReq').textContent = req;
  const toAck = me.staff_id ? R.state.version.filter(v => (v.affected || []).includes(me.staff_id) && !R.state.ack.some(a => a.version_id === v.id && a.staff_id === me.staff_id)).length : 0;
  $('#nbMy').hidden = !toAck; $('#nbMy').textContent = toAck;
  $('#sideFoot').innerHTML = R.mode === 'demo' ? 'Demo mode: sample MO roster, saved in this browser only. Connect the roster server to go live.' : 'Signed in as ' + esc(me.email) + (staff ? '<br>' + esc(staff.designation) : '');
}
function bell() {
  const pop = $('#bellPop');
  const list = R.state.notif.slice().sort((a, b) => b.at - a.at).slice(0, 30);
  pop.innerHTML = `<div class="pop-h">Notifications ${list.some(n => !n.read) ? '<button class="btn sm ghost" data-read>Mark all read</button>' : ''}</div>` +
    (list.map(n => `<button class="pop-item ${n.read ? '' : 'unread'}" data-n="${n.id}" data-k="${n.kind}" data-ref="${esc(n.ref || '')}"><span class="dot" style="margin-top:6px;background:${n.read ? 'var(--line-2)' : 'var(--brand-2)'}"></span><span>${esc(n.text)}<small>${fmt.ago(n.at)}</small></span></button>`).join('') || '<div class="pop-empty">You have no notifications.</div>');
}
function meMenu() {
  const pop = $('#mePop');
  pop.innerHTML = `<div class="pop-h">${esc(R.me.email)}</div>
    <div class="pop-empty" style="padding:4px 10px 10px">Role: <b>${esc(E.ROLE_LABEL[R.me.role])}</b>${R.me.dept_scope ? '<br>Departments: ' + R.me.dept_scope.map(d => esc((R.state.department.find(x => x.id === d) || {}).name || d)).join(', ') : ''}</div>
    ${R.mode === 'demo' ? `<label>Demo: view as</label><select class="inp" id="persona">${R.personas.map(p => `<option value="${esc(p.key)}" ${p.key === R.me.email ? 'selected' : ''}>${esc(p.label)}</option>`).join('')}</select>` : ''}
    <button class="pop-item" data-go="my">${icon('user')}<span>My roster</span></button>
    <button class="pop-item" data-theme>${icon('moon')}<span>Toggle dark mode</span></button>
    <button class="pop-item" data-home>${icon('home')}<span>Back to CarePortal</span></button>
    ${R.mode === 'live' ? `<button class="pop-item" data-out style="color:var(--red)">${icon('x')}<span>Sign out</span></button>` : ''}`;
  const p = $('#persona'); if (p) p.onchange = () => { setPersona(p.value); pop.hidden = true; toast('Now viewing the demo as ' + R.me.name + ' (' + E.ROLE_LABEL[R.me.role] + ')'); route(); };
}
function toggleTheme() {
  const dark = document.documentElement.getAttribute('data-theme') !== 'dark';
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  try { localStorage.setItem('theme', dark ? 'dark' : 'light'); } catch (e) {}
  if (current === 'roster') draw();
}

function wire() {
  $('#bellBtn').onclick = e => { e.stopPropagation(); const p = $('#bellPop'); $('#mePop').hidden = true; p.hidden = !p.hidden; if (!p.hidden) bell(); };
  $('#meBtn').onclick = e => { e.stopPropagation(); const p = $('#mePop'); $('#bellPop').hidden = true; p.hidden = !p.hidden; if (!p.hidden) meMenu(); };
  $('#themeBtn').onclick = toggleTheme;
  $('#navToggle').onclick = () => { $('#side').classList.toggle('open'); $('#scrim').classList.toggle('open'); };
  $('#scrim').onclick = () => { $('#side').classList.remove('open'); $('#scrim').classList.remove('open'); };
  $$('.nav[data-route]').forEach(a => (a.onclick = () => { location.hash = '#/' + a.dataset.route; }));
  document.addEventListener('click', e => {
    if (!e.target.closest('.pop-wrap')) { $('#bellPop').hidden = true; $('#mePop').hidden = true; }
  });
  $('#bellPop').onclick = async e => {
    e.stopPropagation();
    if (e.target.closest('[data-read]')) { await act('notif.read', {}, { quiet: true }); bell(); return; }
    const n = e.target.closest('[data-n]'); if (!n) return;
    act('notif.read', { ids: [n.dataset.n] }, { quiet: true });
    $('#bellPop').hidden = true;
    location.hash = n.dataset.k === 'roster' ? '#/my' : '#/requests';
  };
  $('#mePop').onclick = e => {
    e.stopPropagation();
    if (e.target.closest('[data-go]')) { location.hash = '#/my'; $('#mePop').hidden = true; }
    if (e.target.closest('[data-theme]')) toggleTheme();
    if (e.target.closest('[data-home]')) location.href = 'index.html';
    if (e.target.closest('[data-out]')) location.href = '/cdn-cgi/access/logout';
  };
  window.addEventListener('hashchange', route);
  on(kind => { if (kind === 'persona') return; draw(); });
  document.addEventListener('keydown', e => {
    if (current !== 'roster' || e.target.closest('input,textarea,select') || document.querySelector('.mbg')) return;
    const k = { ArrowLeft: 'prev', ArrowRight: 'next', t: 'today', n: 'add' }[e.key];
    if (k) { const b = document.querySelector(`[data-a="${k}"]`); if (b) { e.preventDefault(); b.click(); } }
  });
}

(async function start() {
  try { await boot(); } catch (e) { console.error(e); R.mode = 'error'; R.notice = 'Could not start the roster: ' + e.message; }
  if (R.mode === 'error') {
    main.innerHTML = `<div class="page"><div class="card card-b" style="max-width:560px;margin:40px auto;text-align:center"><h2 style="margin-bottom:8px">Duty roster unavailable</h2><p class="muted">${esc(R.notice)}</p><p style="margin-top:14px"><button class="btn primary" onclick="location.reload()">Try again</button> <a class="btn" href="index.html">Back to CarePortal</a></p></div></div>`;
    $('#modePill').textContent = 'Offline'; return;
  }
  wire();
  route();
  if (R.mode === 'demo' && !sessionStorage.getItem('asmh_roster_demo_seen')) {
    try { sessionStorage.setItem('asmh_roster_demo_seen', '1'); } catch (e) {}
    toast('Demo mode — sample MO roster. Use the account menu to try other roles.');
  }
})();
