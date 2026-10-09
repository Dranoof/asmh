/* ASMH Duty Roster — dashboard, my roster, staff, requests, reports, activity, settings */
import { R, E, $, $$, esc, icon, initials, fmt, dept, staffById, tpl, settings, colorOf, can, act, modal, confirmBox, toast, download, toCSV, exportXLSX, exportPDF, printDoc, approvalLine, auditLog, backup, restore } from './roster-core.js';
import { UI, openShift, openShiftEditor } from './roster-calendar.js';

const go = r => { location.hash = '#/' + r; };
const pubMode = () => (can('drafts') ? 'draft' : 'published');
function shiftsOn(from, to, mode = pubMode()) {
  const out = [];
  for (const raw of R.state.shift) {
    const v = mode === 'published' ? (raw.published ? Object.assign({ id: raw.id, _raw: raw }, raw.published) : null) : (raw.deleted ? null : Object.assign({ _raw: raw }, raw, { staff_ids: R.state.assignment.filter(a => a.shift_id === raw.id).map(a => a.staff_id) }));
    if (v && v.date >= from && v.date <= to) out.push(v);
  }
  return out.sort((a, b) => E.span(a).s - E.span(b).s);
}
const person = (s, sub) => `<span class="person"><span class="av" style="background:${dept(s.department_id).color}">${esc(initials(s.name))}</span><span style="min-width:0"><b>${esc(s.name)}</b><small>${esc(sub || s.designation)}</small></span></span>`;
const statusTag = st => ({ pending: '<span class="tag amber">Pending</span>', approved: '<span class="tag green">Approved</span>', rejected: '<span class="tag red">Rejected</span>', cancelled: '<span class="tag">Cancelled</span>', declined: '<span class="tag red">Declined</span>', pending_peer: '<span class="tag amber">Awaiting colleague</span>', pending_approval: '<span class="tag blue">Awaiting supervisor</span>' }[st] || esc(st));

/* ================================================================== */
/* DASHBOARD                                                          */
/* ================================================================== */
export function renderDashboard(main) {
  const t = E.todayStr(), now = E.nowMinAbs(), mode = pubMode();
  const near = shiftsOn(E.addDays(t, -1), E.addDays(t, 14), mode);
  const onNow = near.filter(s => { const p = E.span(s); return p.s <= now && p.e > now; });
  const todayList = near.filter(s => { const p = E.span(s); return p.e > E.dayNum(t) * 1440 && p.s < (E.dayNum(t) + 1) * 1440; });
  const staffToday = new Set(todayList.flatMap(s => s.staff_ids)), staffNow = new Set(onNow.flatMap(s => s.staff_ids));
  const upcoming = near.filter(s => { const p = E.span(s); return p.s > now && p.s <= now + 1440; });
  const an = E.analyze(R.state, t, E.addDays(t, 13), { mode });
  const unfilled = Object.entries(an.coverage).filter(([, c]) => c.short > 0);
  const pendingLeave = R.state.leave.filter(l => l.status === 'pending' && (can('approve', (staffById(l.staff_id) || {}).department_id) || l.staff_id === R.me.staff_id));
  const an7 = E.analyze(R.state, t, E.addDays(t, 6), { mode });
  const shortDeps = new Map();
  near.forEach(s => { const c = an7.coverage[s.id]; if (c && c.short) shortDeps.set(s.department_id, (shortDeps.get(s.department_id) || 0) + c.short); });
  const versions = R.state.version.slice().sort((a, b) => b.no - a.no).slice(0, 5);
  const issues = an7.issues.filter(i => i.staff_id).slice(0, 8);
  main.innerHTML = `<div class="page">
    <div class="ph"><div><h1>Workforce dashboard</h1><p>${fmt.short(t)} ${t.slice(0, 4)} · ${mode === 'draft' ? 'including unpublished draft changes' : 'published roster'}</p></div>
      <div class="row">${can('edit') ? `<button class="btn" data-go="roster">${icon('cal')}Open roster</button><button class="btn primary" data-add>${icon('plus')}Add shift</button>` : `<button class="btn primary" data-go="my">${icon('user')}My roster</button>`}</div></div>
    <div class="kpis">
      <button class="kpi" data-go="roster"><span class="kpi-ic">${icon('users')}</span><span>Staff on duty today</span><b>${staffToday.size}</b><small>${staffNow.size} on duty right now</small></button>
      <button class="kpi" data-go="roster"><span class="kpi-ic">${icon('clock')}</span><span>Upcoming shifts</span><b>${upcoming.length}</b><small>starting in the next 24 h</small></button>
      <button class="kpi ${unfilled.length ? 'bad' : ''}" data-go="roster" data-panel="unfilled"><span class="kpi-ic">${icon('alert')}</span><span>Unassigned shifts</span><b>${unfilled.length}</b><small>next 14 days</small></button>
      <button class="kpi ${pendingLeave.length ? 'warn' : ''}" data-go="requests"><span class="kpi-ic">${icon('inbox')}</span><span>Pending leave requests</span><b>${pendingLeave.length}</b><small>${can('approve') ? 'awaiting your decision' : 'your open requests'}</small></button>
      <button class="kpi ${shortDeps.size ? 'warn' : ''}" data-go="reports"><span class="kpi-ic">${icon('chart')}</span><span>Departments short-staffed</span><b>${shortDeps.size}</b><small>next 7 days</small></button>
    </div>
    <div class="grid3">
      <div class="card"><div class="card-h"><h3>${icon('users')}On duty now</h3><span class="muted small">${onNow.length} shift${onNow.length === 1 ? '' : 's'}</span></div>
        <div>${onNow.length ? onNow.map(s => `<div class="list-row" data-open="${s.id}" style="cursor:pointer"><span class="dot" style="background:${colorOf(s)};width:10px;height:10px"></span><span style="min-width:0;flex:1"><b>${esc(s.name)}</b> <span class="muted small">${s.start}–${s.end} · ${esc(dept(s.department_id).name)}</span><br><span class="small">${s.staff_ids.map(id => esc((staffById(id) || {}).name || '')).join(', ') || '<span class="tag red">Unassigned</span>'}</span></span></div>`).join('') : '<div class="empty">No one is rostered at this moment.</div>'}</div></div>
      <div class="card"><div class="card-h"><h3>${icon('alert')}Alerts · next 7 days</h3></div>
        <div>${[...shortDeps.entries()].map(([d, n]) => `<div class="issue" data-dep="${d}"><span class="dot sev-high"></span><span><b>${esc(dept(d).name)}</b> — ${n} unfilled position${n > 1 ? 's' : ''}</span></div>`).join('')}${issues.map(i => `<div class="issue" data-open="${i.shift_id || ''}"><span class="dot sev-${i.severity}"></span><span>${esc(i.text)}</span></div>`).join('') || (shortDeps.size ? '' : '<div class="empty">No staffing alerts.</div>')}</div></div>
    </div>
    <div class="grid2" style="margin-top:14px">
      <div class="card"><div class="card-h"><h3>${icon('clock')}Starting in the next 24 hours</h3></div>
        <div>${upcoming.slice(0, 10).map(s => `<div class="list-row" data-open="${s.id}" style="cursor:pointer"><span class="tag" style="min-width:86px;justify-content:center">${fmt.dow(s.date)} ${s.start}</span><span style="flex:1;min-width:0"><b>${esc(s.name)}</b> <span class="muted small">· ${esc(dept(s.department_id).name)}</span><br><span class="small muted">${s.staff_ids.map(id => esc((staffById(id) || {}).name || '')).join(', ') || 'Unassigned'}</span></span>${(an.coverage[s.id] || {}).short ? '<span class="tag red">Short</span>' : ''}</div>`).join('') || '<div class="empty">No shifts start in the next 24 hours.</div>'}</div></div>
      <div class="card"><div class="card-h"><h3>${icon('history')}Recent roster updates</h3>${can('audit') ? '<a data-go="activity" class="small" style="cursor:pointer">All versions →</a>' : ''}</div>
        <div>${versions.map(v => `<div class="list-row"><span class="tag ${v.kind === 'swap' ? 'blue' : 'brand'}">v${v.no}</span><span style="flex:1;min-width:0"><b>${v.kind === 'swap' ? 'Shift exchange' : 'Published'}</b> ${fmt.range(v.start, v.end)}${v.department_id ? ' · ' + esc(dept(v.department_id).name) : ''}<br><span class="muted small">${esc(v.by_name || v.by)} · ${fmt.when(v.at)}${v.note ? ' · ' + esc(v.note) : ''}</span></span><span class="muted small">${v.counts.added + v.counts.changed + v.counts.removed} changes</span></div>`).join('') || '<div class="empty">No roster has been published yet.</div>'}</div></div>
    </div></div>`;
  main.onclick = e => {
    const g = e.target.closest('[data-go]'); if (g) { if (g.dataset.panel) UI.panel = g.dataset.panel; return go(g.dataset.go); }
    const o = e.target.closest('[data-open]'); if (o && o.dataset.open) return openShift(o.dataset.open);
    const d = e.target.closest('[data-dep]'); if (d) { UI.dept = d.dataset.dep; UI.panel = 'unfilled'; UI.view = 'week'; UI.date = E.todayStr(); return go('roster'); }
    if (e.target.closest('[data-add]')) openShiftEditor(null, { date: E.todayStr() });
  };
}

/* ================================================================== */
/* MY ROSTER                                                          */
/* ================================================================== */
export function renderMy(main) {
  const sid = R.me.staff_id, me = sid && staffById(sid);
  if (!me) {
    main.innerHTML = `<div class="page"><div class="ph"><div><h1>My roster</h1></div></div><div class="card card-b empty">Your sign-in (${esc(R.me.email)}) is not linked to a staff profile yet.<br>${can('users') ? 'Link it under Settings → Users &amp; roles' + (R.mode === 'demo' ? ', or switch the demo user from your account menu.' : '.') : 'Ask a roster administrator to link your email to your staff profile.'}</div></div>`;
    return;
  }
  const t = E.todayStr(), now = E.nowMinAbs();
  const mine = R.state.shift.filter(s => s.published && s.published.staff_ids.includes(sid)).map(s => Object.assign({ id: s.id }, s.published)).sort((a, b) => E.span(a).s - E.span(b).s);
  const upcoming = mine.filter(s => E.span(s).e > now);
  const next = upcoming[0];
  const mStart = t.slice(0, 8) + '01', mEnd = E.addDays(E.addDays(mStart, 32).slice(0, 8) + '01', -1);
  const month = mine.filter(s => s.date >= mStart && s.date <= mEnd);
  const hours = month.reduce((h, s) => h + E.hoursOf(s), 0), nights = month.filter(s => E.isNight(s, settings())).length;
  const leave = R.state.leave.filter(l => l.staff_id === sid).sort((a, b) => (b.start > a.start ? 1 : -1));
  const toAck = R.state.version.filter(v => (v.affected || []).includes(sid) && !R.state.ack.some(a => a.version_id === v.id && a.staff_id === sid)).sort((a, b) => b.no - a.no);
  const swapsIn = R.state.swap.filter(x => x.to_staff_id === sid && x.status === 'pending_peer');
  const swapsMine = R.state.swap.filter(x => x.from_staff_id === sid).sort((a, b) => b.created_at - a.created_at).slice(0, 6);
  const shiftLbl = id => { const s = R.state.shift.find(x => x.id === id); const p = s && (s.published || s); return p ? p.name + ' · ' + fmt.short(p.date) + ' ' + p.start + '–' + p.end : 'Shift'; };
  const until = next ? E.span(next).s - now : 0;
  main.innerHTML = `<div class="page">
    <div class="ph"><div><h1>My roster</h1><p>${esc(me.name)} · ${esc(me.designation)} · ${esc(dept(me.department_id).name)}</p></div>
      <div class="row"><button class="btn" data-ics>${icon('cal')}Add to calendar (.ics)</button><button class="btn" data-pdf>${icon('download')}Download PDF</button><button class="btn" data-csv>${icon('download')}CSV</button><button class="btn primary" data-leave>${icon('plus')}Request leave</button></div></div>
    ${toAck.length ? `<div class="banner warn">${icon('bell')}<span><b>Roster updated.</b> Version ${toAck[0].no} (${fmt.range(toAck[0].start, toAck[0].end)}) changed your duties${toAck[0].note ? ' — ' + esc(toAck[0].note) : ''}. Please review and acknowledge.</span><button class="btn sm primary" data-ack="${toAck.map(v => v.id).join(',')}">Acknowledge</button></div>` : ''}
    ${next ? `<div class="next"><div><small>Next duty</small><div class="big">${esc(next.name)}</div><small>${esc(dept(next.department_id).name)}${next.location ? ' · ' + esc(next.location) : ''}</small></div><div class="when"><div class="big">${fmt.short(next.date)} · ${next.start}</div><small>${until > 0 ? 'starts in ' + (until >= 1440 ? Math.floor(until / 1440) + ' d ' : '') + Math.floor((until % 1440) / 60) + ' h' : 'on duty now'} · until ${next.end}${E.isOvernight(next) ? ' (+1)' : ''}</small></div></div>` : '<div class="banner info">No upcoming published duties.</div>'}
    <div class="kpis" style="grid-template-columns:repeat(4,1fr)">
      <div class="kpi"><span>Duty hours · ${fmt.month(t)}</span><b>${fmt.hrs(hours)}</b><small>${month.length} shifts</small></div>
      <div class="kpi"><span>Night duties this month</span><b>${nights}</b><small>limit ${settings().max_consecutive_nights} in a row</small></div>
      <div class="kpi"><span>Upcoming duties</span><b>${upcoming.length}</b><small>published</small></div>
      <div class="kpi"><span>Approved leave</span><b>${leave.filter(l => l.status === 'approved' && l.end >= t).length}</b><small>current &amp; upcoming</small></div>
    </div>
    <div class="grid3">
      <div class="card"><div class="card-h"><h3>${icon('cal')}Upcoming duties</h3><span class="muted small">Tap a duty to view or request an exchange</span></div>
        <div>${upcoming.slice(0, 30).map(s => `<div class="duty" data-open="${s.id}" style="cursor:pointer"><span class="bar-c" style="background:${colorOf(s)}"></span><span class="dd"><b>${fmt.day(s.date)}</b><small>${fmt.dow(s.date)} ${fmt.mon(s.date)}</small></span><span style="flex:1;min-width:0"><b>${esc(s.name)}</b><br><span class="muted small">${s.start}–${s.end}${E.isOvernight(s) ? ' (+1)' : ''} · ${esc(dept(s.department_id).name)}${s.location ? ' · ' + esc(s.location) : ''}</span></span><span class="muted small">${fmt.hrs(E.hoursOf(s))}</span></div>`).join('') || '<div class="empty">Nothing scheduled.</div>'}</div></div>
      <div style="display:flex;flex-direction:column;gap:14px">
        ${swapsIn.length ? `<div class="card"><div class="card-h"><h3>${icon('swap')}Exchange requests for you</h3></div>${swapsIn.map(x => `<div class="list-row"><span style="flex:1"><b>${esc((staffById(x.from_staff_id) || {}).name || '')}</b> asks you to take<br><span class="small">${esc(shiftLbl(x.shift_id))}</span>${x.reason ? `<br><span class="muted small">“${esc(x.reason)}”</span>` : ''}</span><span class="row" style="flex-direction:column"><button class="btn sm primary" data-sr="${x.id}" data-ok="1">Accept</button><button class="btn sm" data-sr="${x.id}" data-ok="0">Decline</button></span></div>`).join('')}</div>` : ''}
        <div class="card"><div class="card-h"><h3>${icon('inbox')}My leave</h3></div>${leave.slice(0, 6).map(l => `<div class="list-row"><span style="flex:1"><b>${esc(l.type)}</b><br><span class="muted small">${fmt.date(l.start)} – ${fmt.date(l.end)}</span></span>${statusTag(l.status)}${['pending', 'approved'].includes(l.status) && l.end >= t ? `<button class="btn sm ghost" data-lc="${l.id}">Cancel</button>` : ''}</div>`).join('') || '<div class="empty">No leave requests.</div>'}</div>
        <div class="card"><div class="card-h"><h3>${icon('swap')}My exchange requests</h3></div>${swapsMine.map(x => `<div class="list-row"><span style="flex:1"><span class="small">${esc(shiftLbl(x.shift_id))}</span><br><span class="muted small">to ${esc((staffById(x.to_staff_id) || {}).name || '')}</span></span>${statusTag(x.status)}${['pending_peer', 'pending_approval'].includes(x.status) ? `<button class="btn sm ghost" data-sc="${x.id}">Cancel</button>` : ''}</div>`).join('') || '<div class="empty">Open a duty to request an exchange.</div>'}</div>
      </div>
    </div></div>`;
  const meta = { org: settings().org_name, title: 'Personal duty roster — ' + me.name + ' (' + (me.emp_id || '') + ')', period: 'Upcoming duties from ' + fmt.date(t), approval: 'Published roster as of ' + fmt.when(Date.now()) };
  const rows = upcoming.map(s => [s.date, fmt.dow(s.date), s.name, s.start, s.end + (E.isOvernight(s) ? ' (+1)' : ''), E.hoursOf(s), dept(s.department_id).name, s.location || '']);
  const head = ['Date', 'Day', 'Shift', 'Start', 'End', 'Hours', 'Department', 'Location'];
  main.onclick = async e => {
    const b = e.target.closest('button,[data-open]'); if (!b) return;
    if (b.dataset.open) return openShift(b.dataset.open);
    if (b.hasAttribute('data-ics')) return download('asmh-duties-' + (me.emp_id || 'me') + '.ics', E.toICS(R.state, upcoming, 'ASMH duties — ' + me.name), 'text/calendar');
    if (b.hasAttribute('data-csv')) return download('asmh-duties-' + (me.emp_id || 'me') + '.csv', toCSV([head, ...rows]), 'text/csv');
    if (b.hasAttribute('data-pdf')) return exportPDF('asmh-duties-' + (me.emp_id || 'me') + '.pdf', meta, [{ head, body: rows.map(r => r.map(String)) }], false).catch(err => toast(err.message, 'err'));
    if (b.hasAttribute('data-leave')) return openLeaveForm();
    if (b.dataset.ack) { for (const id of b.dataset.ack.split(',')) await act('roster.ack', { version_id: id }, { quiet: true }); toast('Thank you — acknowledgement recorded.'); return; }
    if (b.dataset.sr) return act('swap.respond', { id: b.dataset.sr, accept: b.dataset.ok === '1' });
    if (b.dataset.lc) { if (await confirmBox({ title: 'Cancel leave?', body: '<p>Withdraw this leave request?</p>', ok: 'Cancel leave', danger: true })) act('leave.cancel', { id: b.dataset.lc }); return; }
    if (b.dataset.sc) return act('swap.cancel', { id: b.dataset.sc });
  };
}

export function openSwapRequest(shiftId) {
  const raw = R.state.shift.find(s => s.id === shiftId); if (!raw || !raw.published) return;
  const sh = raw.published, me = staffById(R.me.staff_id);
  const peers = R.state.staff.filter(s => s.status === 'Active' && s.id !== me.id && s.designation === me.designation && !sh.staff_ids.includes(s.id));
  const theirShifts = id => R.state.shift.filter(x => x.published && x.published.staff_ids.includes(id) && !x.published.staff_ids.includes(me.id) && E.span(x.published).s > E.nowMinAbs() && Math.abs(E.dayNum(x.published.date) - E.dayNum(sh.date)) <= 14);
  const m = modal({ title: 'Request shift exchange', body: `<p>${esc(sh.name)} · <b>${fmt.short(sh.date)} ${sh.start}–${sh.end}</b> · ${esc(dept(sh.department_id).name)}</p>
    <div class="fgrid" style="margin-top:12px"><div class="f full"><label>Colleague who will take this duty</label><select class="inp" data-to><option value="">Choose a colleague (${esc(me.designation)})…</option>${peers.map(p => `<option value="${p.id}">${esc(p.name)} · ${esc(dept(p.department_id).code)}</option>`).join('')}</select><small>They are notified and must accept; then a supervisor approves. The published roster changes only after approval.</small></div>
    <div class="f full"><label>Offer one of their duties in exchange (optional)</label><select class="inp" data-tg><option value="">No — they cover my duty</option></select></div>
    <div class="f full"><label>Reason</label><textarea class="inp" data-r rows="2" maxlength="300"></textarea></div></div>`,
    foot: '<span class="sp"></span><button class="btn" data-c>Cancel</button><button class="btn primary" data-ok>Send request</button>' });
  $('[data-to]', m.el).onchange = e => { $('[data-tg]', m.el).innerHTML = '<option value="">No — they cover my duty</option>' + theirShifts(e.target.value).map(x => `<option value="${x.id}">${esc(x.published.name)} · ${fmt.short(x.published.date)} ${x.published.start}–${x.published.end}</option>`).join(''); };
  $('[data-c]', m.el).onclick = m.close;
  $('[data-ok]', m.el).onclick = async () => { const to = $('[data-to]', m.el).value; if (!to) return toast('Choose a colleague.', 'err'); if (await act('swap.create', { shift_id: shiftId, to_staff_id: to, target_shift_id: $('[data-tg]', m.el).value || undefined, reason: $('[data-r]', m.el).value })) m.close(); };
}

function openLeaveForm() {
  const approver = can('approve');
  const options = approver ? R.state.staff.filter(s => s.status !== 'Inactive' && can('approve', s.department_id)) : [];
  const m = modal({ title: 'Request leave', body: `<div class="fgrid">
    ${approver ? `<div class="f full"><label>Staff member</label><select class="inp" data-s>${R.me.staff_id ? `<option value="${R.me.staff_id}">Myself</option>` : ''}${options.filter(s => s.id !== R.me.staff_id).map(s => `<option value="${s.id}">${esc(s.name)} · ${esc(dept(s.department_id).code)}</option>`).join('')}</select></div>` : ''}
    <div class="f full"><label>Leave type</label><select class="inp" data-t>${E.LEAVE_TYPES.map(t => `<option>${t}</option>`).join('')}</select></div>
    <div class="f"><label>From</label><input class="inp" type="date" data-a value="${E.addDays(E.todayStr(), 7)}"></div><div class="f"><label>To</label><input class="inp" type="date" data-b value="${E.addDays(E.todayStr(), 8)}"></div>
    <div class="f full"><label>Remarks</label><textarea class="inp" rows="3" data-r maxlength="400" placeholder="Optional details for your supervisor"></textarea></div></div>`,
    foot: '<span class="sp"></span><button class="btn" data-c>Cancel</button><button class="btn primary" data-ok>Submit request</button>' });
  $('[data-c]', m.el).onclick = m.close;
  $('[data-ok]', m.el).onclick = async () => {
    const p = { type: $('[data-t]', m.el).value, start: $('[data-a]', m.el).value, end: $('[data-b]', m.el).value, remarks: $('[data-r]', m.el).value };
    const s = $('[data-s]', m.el); if (s) p.staff_id = s.value;
    if (!p.staff_id && !R.me.staff_id) return toast('Your account is not linked to a staff profile.', 'err');
    if (await act('leave.create', p)) m.close();
  };
}

/* ================================================================== */
/* STAFF                                                              */
/* ================================================================== */
const SF = { q: '', dep: '', des: '', status: 'Active' };
export function renderStaff(main) {
  const t = E.todayStr(), st = settings(), ws = E.weekStartOf(t, st.week_start), mStart = t.slice(0, 8) + '01', mEnd = E.addDays(E.addDays(mStart, 32).slice(0, 8) + '01', -1);
  const anW = E.analyze(R.state, ws, E.addDays(ws, 6), { mode: pubMode() }), anM = E.analyze(R.state, mStart, mEnd, { mode: pubMode() });
  const contacts = can('contacts');
  const list = R.state.staff.filter(s => (!SF.q || (s.name + ' ' + (s.emp_id || '') + ' ' + s.designation).toLowerCase().includes(SF.q.toLowerCase())) && (!SF.dep || s.department_id === SF.dep) && (!SF.des || s.designation === SF.des) && (!SF.status || s.status === SF.status)).sort((a, b) => a.name.localeCompare(b.name));
  main.innerHTML = `<div class="page">
    <div class="ph"><div><h1>Staff directory</h1><p>${R.state.staff.filter(s => s.status === 'Active').length} active staff across ${new Set(R.state.staff.map(s => s.department_id)).size} departments${R.mode === 'demo' ? ' · <b>demo data</b> (fictional)' : ''}</p></div>
      <div class="row"><button class="btn" data-exp>${icon('download')}Export</button>${can('staff_edit') ? `<button class="btn primary" data-new>${icon('plus')}Add staff</button>` : ''}</div></div>
    <div class="rtool-2" style="margin-bottom:12px">
      <label class="search">${icon('search')}<input data-q placeholder="Search name, ID or designation…" value="${esc(SF.q)}"></label>
      <select class="inp" data-dep><option value="">All departments</option>${R.state.department.map(d => `<option value="${d.id}" ${SF.dep === d.id ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}</select>
      <select class="inp" data-des><option value="">All designations</option>${E.DESIGNATIONS.map(d => `<option ${SF.des === d ? 'selected' : ''}>${d}</option>`).join('')}</select>
      <select class="inp" data-st><option value="">Any status</option>${E.EMPLOYMENT.map(d => `<option ${SF.status === d ? 'selected' : ''}>${d}</option>`).join('')}</select>
      <span class="legend">${list.length} shown</span>
    </div>
    <div class="card"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Name</th><th>Employee ID</th><th>Department</th>${contacts ? '<th>Contact</th>' : ''}<th>Status</th><th class="num">Shifts (week)</th><th class="num">Hours (week)</th><th class="num">Hours (${fmt.mon(t)})</th><th>Availability</th></tr></thead><tbody>
      ${list.map(s => { const w = anW.staff[s.id] || { hours: 0, shifts: 0 }, mo = anM.staff[s.id] || { hours: 0 }, lv = E.approvedLeave(R.state, s.id, t);
        return `<tr data-id="${s.id}" style="cursor:pointer"><td>${person(s)}</td><td>${esc(s.emp_id || '—')}</td><td><span class="dot" style="background:${dept(s.department_id).color}"></span> ${esc(dept(s.department_id).name)}</td>${contacts ? `<td class="small">${esc(s.phone || '')}<br><span class="muted">${esc(s.email || '')}</span></td>` : ''}<td>${s.status === 'Active' ? (lv ? '<span class="tag amber">On leave</span>' : '<span class="tag green">Active</span>') : s.status === 'Inactive' ? '<span class="tag">Inactive</span>' : '<span class="tag amber">' + esc(s.status) + '</span>'}</td><td class="num">${w.shifts}</td><td class="num ${w.hours > st.max_weekly_hours ? 'tag red' : ''}">${fmt.hrs(w.hours)}</td><td class="num">${fmt.hrs(mo.hours)}</td><td class="small muted">${esc(s.availability || '')}</td></tr>`; }).join('') || `<tr><td colspan="9" class="empty">No staff match.</td></tr>`}
    </tbody></table></div></div></div>`;
  let tm;
  $('[data-q]', main).oninput = e => { clearTimeout(tm); tm = setTimeout(() => { SF.q = e.target.value; renderStaff(main); const n = $('[data-q]', main); n.focus(); n.setSelectionRange(SF.q.length, SF.q.length); }, 200); };
  $('[data-dep]', main).onchange = e => { SF.dep = e.target.value; renderStaff(main); };
  $('[data-des]', main).onchange = e => { SF.des = e.target.value; renderStaff(main); };
  $('[data-st]', main).onchange = e => { SF.status = e.target.value; renderStaff(main); };
  main.onclick = e => {
    if (e.target.closest('[data-new]')) return openStaffEditor(null);
    if (e.target.closest('[data-exp]')) {
      const head = ['Name', 'Employee ID', 'Designation', 'Department', ...(contacts ? ['Phone', 'Email'] : []), 'Status', 'Hours this week', 'Hours this month'];
      return download('asmh-staff.csv', toCSV([head, ...list.map(s => [s.name, s.emp_id, s.designation, dept(s.department_id).name, ...(contacts ? [s.phone, s.email] : []), s.status, Math.round((anW.staff[s.id] || { hours: 0 }).hours), Math.round((anM.staff[s.id] || { hours: 0 }).hours)])]), 'text/csv');
    }
    const r = e.target.closest('tr[data-id]'); if (r) openStaffProfile(r.dataset.id);
  };
}
export function openStaffProfile(id) {
  const s = staffById(id); if (!s) return;
  const t = E.todayStr();
  const ups = R.state.shift.map(x => (pubMode() === 'published' ? (x.published ? Object.assign({ id: x.id }, x.published) : null) : (x.deleted ? null : Object.assign({}, x, { staff_ids: R.state.assignment.filter(a => a.shift_id === x.id).map(a => a.staff_id) })))).filter(x => x && x.staff_ids.includes(id) && x.date >= t).sort((a, b) => E.span(a).s - E.span(b).s).slice(0, 12);
  const leave = R.state.leave.filter(l => l.staff_id === id && l.end >= t && l.status !== 'cancelled');
  const m = modal({ title: s.name, size: 'wide', body: `<div class="grid2"><div><dl class="kv"><dt>Designation</dt><dd>${esc(s.designation)}</dd><dt>Department</dt><dd>${esc(dept(s.department_id).name)}</dd><dt>Employee ID</dt><dd>${esc(s.emp_id || '—')}</dd><dt>Status</dt><dd>${esc(s.status)}</dd>${can('contacts') || s.id === R.me.staff_id ? `<dt>Phone</dt><dd>${esc(s.phone || '—')}</dd><dt>Email</dt><dd>${esc(s.email || '—')}</dd>` : '<dt>Contact</dt><dd class="muted">Visible to supervisors only</dd>'}${s.availability ? `<dt>Availability</dt><dd>${esc(s.availability)}</dd>` : ''}</dl>
    <div class="fsec">Leave</div>${leave.map(l => `<div class="row small" style="margin-bottom:6px">${statusTag(l.status)} ${esc(l.type)} · ${fmt.date(l.start)} – ${fmt.date(l.end)}</div>`).join('') || '<p class="muted small">No current or upcoming leave.</p>'}</div>
    <div><div class="fsec" style="margin-top:0;padding-top:0;border:0">Upcoming shifts</div>${ups.map(x => `<div class="duty" style="padding:8px 0"><span class="bar-c" style="background:${colorOf(x)}"></span><span class="dd"><b>${fmt.day(x.date)}</b><small>${fmt.dow(x.date)}</small></span><span><b>${esc(x.name)}</b><br><span class="muted small">${x.start}–${x.end} · ${esc(dept(x.department_id).code)}</span></span></div>`).join('') || '<p class="muted small">No upcoming shifts.</p>'}</div></div>`,
    foot: `<span class="sp"></span>${can('staff_edit', s.department_id) ? '<button class="btn" data-ed>Edit profile</button>' : ''}<button class="btn primary" data-c>Close</button>` });
  $('[data-c]', m.el).onclick = m.close;
  const ed = $('[data-ed]', m.el); if (ed) ed.onclick = () => { m.close(); openStaffEditor(s); };
}
function openStaffEditor(s) {
  const d = s || { status: 'Active', designation: 'Medical Officer', department_id: UI.dept || (R.state.department[0] || {}).id };
  const m = modal({ title: s ? 'Edit staff profile' : 'Add staff', size: 'wide', body: `<div class="fgrid">
    <div class="f"><label>Full name</label><input class="inp" name="name" value="${esc(d.name || '')}" maxlength="80"></div>
    <div class="f"><label>Employee ID</label><input class="inp" name="emp_id" value="${esc(d.emp_id || '')}" maxlength="20"></div>
    <div class="f"><label>Designation</label><select class="inp" name="designation">${E.DESIGNATIONS.map(x => `<option ${d.designation === x ? 'selected' : ''}>${x}</option>`).join('')}</select></div>
    <div class="f"><label>Department</label><select class="inp" name="department_id">${R.state.department.filter(x => can('staff_edit', x.id)).map(x => `<option value="${x.id}" ${d.department_id === x.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></div>
    <div class="f"><label>Work email (used for sign-in)</label><input class="inp" type="email" name="email" value="${esc(d.email || '')}"></div>
    <div class="f"><label>Phone</label><input class="inp" name="phone" value="${esc(d.phone || '')}" maxlength="30"></div>
    <div class="f"><label>Employment status</label><select class="inp" name="status">${E.EMPLOYMENT.map(x => `<option ${d.status === x ? 'selected' : ''}>${x}</option>`).join('')}</select><small>Inactive staff cannot be rostered.</small></div>
    <div class="f"><label>Availability notes</label><input class="inp" name="availability" value="${esc(d.availability || '')}" maxlength="120" placeholder="e.g. No nights until March"></div></div>`,
    foot: '<span class="sp"></span><button class="btn" data-c>Cancel</button><button class="btn primary" data-ok>Save</button>' });
  $('[data-c]', m.el).onclick = m.close;
  $('[data-ok]', m.el).onclick = async () => { const p = { id: s && s.id }; $$('[name]', m.el).forEach(i => (p[i.name] = i.value)); if (await act('staff.save', p)) m.close(); };
}

/* ================================================================== */
/* REQUESTS                                                           */
/* ================================================================== */
let reqTab = 'leave';
export function renderRequests(main) {
  const approver = can('approve');
  const leaves = R.state.leave.filter(l => l.staff_id === R.me.staff_id || can('approve', (staffById(l.staff_id) || {}).department_id)).filter(l => l.type !== 'Leave').sort((a, b) => (a.status === 'pending' ? -1 : 0) - (b.status === 'pending' ? -1 : 0) || b.created_at - a.created_at);
  const swaps = R.state.swap.slice().sort((a, b) => (b.status.startsWith('pending') ? 1 : 0) - (a.status.startsWith('pending') ? 1 : 0) || b.created_at - a.created_at);
  const shiftLbl = id => { const s = R.state.shift.find(x => x.id === id); const p = s && (s.published || s); return p ? `${esc(p.name)}<br><span class="muted small">${fmt.short(p.date)} ${p.start}–${p.end} · ${esc(dept(p.department_id).code)}</span>` : '<span class="muted">Removed shift</span>'; };
  main.innerHTML = `<div class="page">
    <div class="ph"><div><h1>Requests</h1><p>Leave and duty exchange requests${approver ? ' for the departments you supervise' : ''}</p></div><div class="row"><button class="btn primary" data-nl>${icon('plus')}Request leave</button></div></div>
    <div class="seg" style="margin-bottom:12px"><button class="${reqTab === 'leave' ? 'on' : ''}" data-t="leave">Leave (${leaves.filter(l => l.status === 'pending').length} pending)</button><button class="${reqTab === 'swap' ? 'on' : ''}" data-t="swap">Shift exchange (${swaps.filter(x => x.status.startsWith('pending')).length} open)</button></div>
    <div class="card"><div class="tbl-wrap">${reqTab === 'leave' ? `<table class="tbl"><thead><tr><th>Staff</th><th>Type</th><th>Dates</th><th>Days</th><th>Remarks</th><th>Status</th><th></th></tr></thead><tbody>
      ${leaves.map(l => { const s = staffById(l.staff_id) || { name: '?' }; const mine = l.staff_id === R.me.staff_id;
        const clash = l.status !== 'rejected' && R.state.assignment.filter(a => a.staff_id === l.staff_id && (sh => sh && !sh.deleted && sh.date >= l.start && sh.date <= l.end)(R.state.shift.find(x => x.id === a.shift_id))).length;
        return `<tr><td>${person(s, dept(s.department_id).name)}</td><td>${esc(l.type)}</td><td>${fmt.date(l.start)} – ${fmt.date(l.end)}</td><td>${E.dayNum(l.end) - E.dayNum(l.start) + 1}</td><td class="small">${esc(l.remarks || '')}${clash ? `<br><span class="tag amber">${clash} rostered shift${clash > 1 ? 's' : ''} in this period</span>` : ''}${l.comment ? `<br><span class="muted">Decision note: ${esc(l.comment)}</span>` : ''}</td><td>${statusTag(l.status)}${l.decided_by ? `<br><span class="muted small">${esc(l.decided_by)}</span>` : ''}</td>
          <td class="num" style="white-space:nowrap">${l.status === 'pending' && can('approve', s.department_id) ? `<button class="btn sm primary" data-ld="${l.id}" data-v="approve">Approve</button> <button class="btn sm danger" data-ld="${l.id}" data-v="reject">Reject</button>` : ''}${mine && ['pending', 'approved'].includes(l.status) && l.end >= E.todayStr() ? `<button class="btn sm ghost" data-lc="${l.id}">Cancel</button>` : ''}</td></tr>`; }).join('') || '<tr><td colspan="7" class="empty">No leave requests.</td></tr>'}</tbody></table>`
    : `<table class="tbl"><thead><tr><th>Duty</th><th>From</th><th>To</th><th>Exchange for</th><th>Reason</th><th>Status</th><th></th></tr></thead><tbody>
      ${swaps.map(x => { const sh = R.state.shift.find(s => s.id === x.shift_id); const dep = sh && sh.department_id;
        return `<tr><td>${shiftLbl(x.shift_id)}</td><td>${esc((staffById(x.from_staff_id) || {}).name || '')}</td><td>${esc((staffById(x.to_staff_id) || {}).name || '')}</td><td>${x.target_shift_id ? shiftLbl(x.target_shift_id) : '<span class="muted">—</span>'}</td><td class="small">${esc(x.reason || '')}</td><td>${statusTag(x.status)}</td>
        <td class="num" style="white-space:nowrap">${x.status === 'pending_peer' && x.to_staff_id === R.me.staff_id ? `<button class="btn sm primary" data-sr="${x.id}" data-ok="1">Accept</button> <button class="btn sm" data-sr="${x.id}" data-ok="0">Decline</button>` : ''}${x.status === 'pending_approval' && can('approve', dep) ? `<button class="btn sm primary" data-sd="${x.id}" data-v="approve">Approve</button> <button class="btn sm danger" data-sd="${x.id}" data-v="reject">Reject</button>` : ''}${x.from_staff_id === R.me.staff_id && x.status.startsWith('pending') ? `<button class="btn sm ghost" data-sc="${x.id}">Cancel</button>` : ''}</td></tr>`; }).join('') || '<tr><td colspan="7" class="empty">No exchange requests. Staff request exchanges from a duty in My Roster.</td></tr>'}</tbody></table>`}
    </div></div></div>`;
  main.onclick = async e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.t) { reqTab = b.dataset.t; return renderRequests(main); }
    if (b.hasAttribute('data-nl')) return openLeaveForm();
    if (b.dataset.ld) { const note = b.dataset.v === 'reject' ? prompt('Reason for rejecting (optional):') : ''; if (note === null) return; return act('leave.decide', { id: b.dataset.ld, decision: b.dataset.v, comment: note || '' }); }
    if (b.dataset.lc) return act('leave.cancel', { id: b.dataset.lc });
    if (b.dataset.sr) return act('swap.respond', { id: b.dataset.sr, accept: b.dataset.ok === '1' });
    if (b.dataset.sd) { if (b.dataset.v === 'approve' && !await confirmBox({ title: 'Approve exchange?', body: '<p>The published roster will be updated immediately and both staff notified.</p>', ok: 'Approve' })) return; return act('swap.decide', { id: b.dataset.sd, decision: b.dataset.v }); }
    if (b.dataset.sc) return act('swap.cancel', { id: b.dataset.sc });
  };
}

/* ================================================================== */
/* REPORTS                                                            */
/* ================================================================== */
const RP = { period: 'month', from: '', to: '', dep: '', mode: 'published' };
function rpRange() {
  const t = E.todayStr(), st = settings();
  if (RP.period === 'week') { const w = E.weekStartOf(t, st.week_start); return [w, E.addDays(w, 6)]; }
  if (RP.period === 'next') { const w = E.addDays(E.weekStartOf(t, st.week_start), 7); return [w, E.addDays(w, 6)]; }
  if (RP.period === 'custom' && RP.from && RP.to) return [RP.from, RP.to];
  const a = t.slice(0, 8) + '01'; return [a, E.addDays(E.addDays(a, 32).slice(0, 8) + '01', -1)];
}
export function renderReports(main) {
  if (!can('drafts')) RP.mode = 'published';
  const [from, to] = rpRange();
  const rep = E.report(R.state, from, to, { mode: RP.mode, department_id: RP.dep || null });
  const active = rep.staff.filter(s => s.shifts > 0);
  const maxH = Math.max(1, ...active.map(s => s.hours)), maxN = Math.max(1, ...active.map(s => s.nights)), maxW = Math.max(1, ...active.map(s => s.weekends));
  const totH = active.reduce((h, s) => h + s.hours, 0);
  main.innerHTML = `<div class="page">
    <div class="ph"><div><h1>Reports</h1><p>${fmt.range(from, to)} · ${RP.dep ? esc(dept(RP.dep).name) : 'All departments'} · ${RP.mode === 'published' ? 'published roster' : 'draft roster'}</p></div>
      <div class="row"><button class="btn" data-x="print">${icon('print')}Print</button><button class="btn" data-x="pdf">${icon('download')}PDF</button><button class="btn" data-x="xlsx">${icon('download')}Excel</button><button class="btn" data-x="csv">${icon('download')}CSV</button></div></div>
    <div class="rtool-2" style="margin-bottom:14px">
      <select class="inp" data-p>${[['week', 'This week'], ['next', 'Next week'], ['month', 'This month'], ['custom', 'Custom range']].map(([v, l]) => `<option value="${v}" ${RP.period === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
      ${RP.period === 'custom' ? `<input class="inp" type="date" data-f value="${from}"><input class="inp" type="date" data-t value="${to}">` : ''}
      <select class="inp" data-d><option value="">All departments</option>${R.state.department.map(d => `<option value="${d.id}" ${RP.dep === d.id ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}</select>
      ${can('drafts') ? `<div class="seg"><button class="${RP.mode === 'published' ? 'on' : ''}" data-m="published">Published</button><button class="${RP.mode === 'draft' ? 'on' : ''}" data-m="draft">Draft</button></div>` : ''}
      <span class="legend">${esc(approvalLine(from, to, RP.dep))}</span>
    </div>
    <div class="kpis" style="grid-template-columns:repeat(4,1fr)">
      <div class="kpi"><span>Shifts</span><b>${rep.shifts.length}</b><small>${rep.departments.length} departments</small></div>
      <div class="kpi"><span>Total duty hours</span><b>${Math.round(totH)}</b><small>${active.length} staff rostered</small></div>
      <div class="kpi ${rep.unassigned.length ? 'bad' : ''}"><span>Unfilled shifts</span><b>${rep.unassigned.length}</b><small>${rep.unassigned.reduce((n, s) => n + rep.coverage[s.id].short, 0)} positions</small></div>
      <div class="kpi ${rep.issues.filter(i => i.staff_id).length ? 'warn' : ''}"><span>Rostering conflicts</span><b>${rep.issues.filter(i => i.staff_id).length}</b><small>rest, nights, leave, hours</small></div>
    </div>
    <div class="card" style="margin-bottom:14px"><div class="card-h"><h3>${icon('chart')}Staffing coverage by department</h3></div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Department</th><th class="num">Shifts</th><th class="num">Positions</th><th class="num">Filled</th><th style="width:30%">Coverage</th><th class="num">Staff hours</th></tr></thead><tbody>
      ${rep.departments.map(d => `<tr><td><span class="dot" style="background:${dept(d.id).color}"></span> ${esc(d.name)}</td><td class="num">${d.shifts}</td><td class="num">${d.required}</td><td class="num">${d.filled}</td><td><div class="row" style="flex-wrap:nowrap"><div class="bar grow"><i style="width:${d.coverage}%;background:${d.coverage < 90 ? 'var(--red)' : d.coverage < 100 ? 'var(--amber)' : 'var(--green)'}"></i></div><b style="width:42px;text-align:right">${d.coverage}%</b></div></td><td class="num">${d.hours}</td></tr>`).join('') || '<tr><td colspan="6" class="empty">No shifts in this period.</td></tr>'}</tbody></table></div></div>
    <div class="card" style="margin-bottom:14px"><div class="card-h"><h3>${icon('users')}Individual duty summary</h3><span class="muted small">Night = ≥4 h between ${settings().night_window.join('–')} · Weekend = ${settings().weekend_days.map(d => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d]).join('/')}</span></div><div class="tbl-wrap" style="max-height:520px"><table class="tbl"><thead><tr><th>Staff</th><th>Department</th><th class="num">Shifts</th><th style="width:20%">Hours</th><th style="width:15%">Night duties</th><th style="width:15%">Weekend duties</th><th class="num">Issues</th></tr></thead><tbody>
      ${active.map(s => `<tr><td>${person(s)}</td><td class="small">${esc(dept(s.department_id).name)}</td><td class="num">${s.shifts}</td><td><div class="row" style="flex-wrap:nowrap"><div class="bar grow"><i style="width:${s.hours / maxH * 100}%"></i></div><b style="width:52px;text-align:right">${fmt.hrs(s.hours)}</b></div></td><td><div class="row" style="flex-wrap:nowrap"><div class="bar grow"><i style="width:${s.nights / maxN * 100}%;background:#6366f1"></i></div><b style="width:22px;text-align:right">${s.nights}</b></div></td><td><div class="row" style="flex-wrap:nowrap"><div class="bar grow"><i style="width:${s.weekends / maxW * 100}%;background:#f59e0b"></i></div><b style="width:22px;text-align:right">${s.weekends}</b></div></td><td class="num">${s.issues ? `<span class="tag amber">${s.issues}</span>` : '—'}</td></tr>`).join('') || '<tr><td colspan="7" class="empty">No rostered staff in this period.</td></tr>'}</tbody></table></div></div>
    <div class="card"><div class="card-h"><h3>${icon('alert')}Unassigned and short-staffed shifts</h3></div><div class="tbl-wrap" style="max-height:420px"><table class="tbl"><thead><tr><th>Date</th><th>Shift</th><th>Department</th><th class="num">Required</th><th class="num">Assigned</th><th class="num">Short</th></tr></thead><tbody>
      ${rep.unassigned.map(s => `<tr data-open="${s.id}" style="cursor:pointer"><td>${fmt.short(s.date)}</td><td>${esc(s.name)} <span class="muted small">${s.start}–${s.end}</span></td><td>${esc(dept(s.department_id).name)}</td><td class="num">${rep.coverage[s.id].required}</td><td class="num">${rep.coverage[s.id].assigned}</td><td class="num"><span class="tag red">${rep.coverage[s.id].short}</span></td></tr>`).join('') || '<tr><td colspan="6" class="empty">All shifts are fully staffed.</td></tr>'}</tbody></table></div></div>
  </div>`;
  const rer = () => renderReports(main);
  $('[data-p]', main).onchange = e => { RP.period = e.target.value; if (RP.period === 'custom') { RP.from = from; RP.to = to; } rer(); };
  $('[data-d]', main).onchange = e => { RP.dep = e.target.value; rer(); };
  const f = $('[data-f]', main); if (f) { f.onchange = e => { RP.from = e.target.value; rer(); }; $('[data-t]', main).onchange = e => { RP.to = e.target.value; rer(); }; }
  main.onclick = e => {
    const m = e.target.closest('[data-m]'); if (m) { RP.mode = m.dataset.m; return rer(); }
    const o = e.target.closest('[data-open]'); if (o) return openShift(o.dataset.open);
    const x = e.target.closest('[data-x]'); if (!x) return;
    const meta = { org: settings().org_name, title: 'Duty roster report — ' + (RP.dep ? dept(RP.dep).name : 'All departments'), period: fmt.range(from, to), approval: approvalLine(from, to, RP.dep) + (RP.mode === 'draft' ? ' · DRAFT data' : '') };
    const T = [
      { title: 'Department-wise duty roster', head: ['Date', 'Day', 'Department', 'Shift', 'Time', 'Hours', 'Staff'], body: rep.shifts.map(s => [s.date, fmt.dow(s.date), dept(s.department_id).name, s.name, s.start + '–' + s.end, E.hoursOf(s), (s.staff_ids || []).map(id => (staffById(id) || {}).name).join('; ') || 'UNASSIGNED']) },
      { title: 'Staffing coverage', head: ['Department', 'Shifts', 'Positions', 'Filled', 'Coverage %', 'Staff hours'], body: rep.departments.map(d => [d.name, d.shifts, d.required, d.filled, d.coverage, d.hours]) },
      { title: 'Individual duty summary (hours, night and weekend distribution)', head: ['Staff', 'Employee ID', 'Designation', 'Department', 'Shifts', 'Hours', 'Nights', 'Weekends'], body: active.map(s => [s.name, s.emp_id || '', s.designation, dept(s.department_id).name, s.shifts, s.hours, s.nights, s.weekends]) },
      { title: 'Unassigned shifts', head: ['Date', 'Shift', 'Department', 'Required', 'Assigned', 'Short'], body: rep.unassigned.map(s => [s.date, s.name + ' ' + s.start + '–' + s.end, dept(s.department_id).name, rep.coverage[s.id].required, rep.coverage[s.id].assigned, rep.coverage[s.id].short]) }
    ];
    const base = 'asmh-roster-report-' + from + '-to-' + to;
    if (x.dataset.x === 'csv') return download(base + '.csv', toCSV(T.flatMap(t => [[t.title], t.head, ...t.body, []])), 'text/csv');
    if (x.dataset.x === 'xlsx') return exportXLSX(base + '.xlsx', T.map((t, i) => ({ name: ['Roster', 'Coverage', 'Staff summary', 'Unassigned'][i], rows: [t.head, ...t.body] })), meta).catch(err => toast(err.message, 'err'));
    if (x.dataset.x === 'pdf') return exportPDF(base + '.pdf', meta, T.map(t => ({ title: t.title, head: t.head, body: t.body.map(r => r.map(String)) }))).catch(err => toast(err.message, 'err'));
    printDoc(meta, T);
  };
}

/* ================================================================== */
/* ACTIVITY: versions + audit                                          */
/* ================================================================== */
export async function renderActivity(main) {
  if (!can('audit')) { main.innerHTML = '<div class="page"><div class="card card-b empty">Only roster administrators can view the audit log.</div></div>'; return; }
  const versions = R.state.version.slice().sort((a, b) => b.no - a.no);
  main.innerHTML = `<div class="page"><div class="ph"><div><h1>Versions &amp; audit log</h1><p>Every publish creates a version; every change is logged with who made it and when.</p></div></div>
    <div class="grid2"><div class="card"><div class="card-h"><h3>${icon('layers')}Roster versions</h3><span class="muted small">${versions.length}</span></div><div style="max-height:70vh;overflow:auto">
      ${versions.map(v => { const acks = R.state.ack.filter(a => a.version_id === v.id).length; return `<details class="list-row" style="display:block"><summary style="cursor:pointer;display:flex;gap:10px;align-items:center"><span class="tag ${v.kind === 'swap' ? 'blue' : 'brand'}">v${v.no}</span><span style="flex:1"><b>${v.kind === 'swap' ? 'Shift exchange' : 'Published'} · ${fmt.range(v.start, v.end)}</b>${v.department_id ? ' · ' + esc(dept(v.department_id).name) : ''}<br><span class="muted small">${esc(v.by_name || v.by)} · ${fmt.when(v.at)}${v.note ? ' · ' + esc(v.note) : ''}</span></span><span class="small muted">+${v.counts.added} ~${v.counts.changed} −${v.counts.removed}<br>${acks}/${(v.affected || []).length} acknowledged</span></summary>
        <div class="small" style="margin:8px 0 0 52px">${(v.changes || []).slice(0, 60).map(c => `<div><span class="tag ${c.type === 'removed' ? 'red' : c.type === 'added' ? 'green' : 'amber'}">${c.type}</span> ${fmt.short(c.date)} · ${esc(c.name)} ${esc(c.time)} · ${esc(dept(c.department_id).code)}</div>`).join('')}${(v.changes || []).length > 60 ? `<div class="muted">+${v.changes.length - 60} more</div>` : ''}</div></details>`; }).join('') || '<div class="empty">No versions yet.</div>'}
    </div></div>
    <div class="card"><div class="card-h"><h3>${icon('history')}Audit log</h3><button class="btn sm" data-exp>${icon('download')}Export</button></div><div data-audit style="max-height:70vh;overflow:auto"><div class="empty">Loading…</div></div></div></div></div>`;
  const rows = await auditLog();
  $('[data-audit]', main).innerHTML = rows.map(r => `<div class="list-row"><span class="tag" style="min-width:110px">${fmt.when(r.at)}</span><span style="flex:1;min-width:0">${esc(r.summary || r.action)}<br><span class="muted small">${esc(r.actor)} · ${esc(r.action)}</span></span></div>`).join('') || '<div class="empty">No changes logged yet.</div>';
  $('[data-exp]', main).onclick = () => download('asmh-roster-audit.csv', toCSV([['Time', 'User', 'Action', 'Summary'], ...rows.map(r => [new Date(r.at).toISOString(), r.actor, r.action, r.summary])]), 'text/csv');
}

/* ================================================================== */
/* SETTINGS                                                           */
/* ================================================================== */
let setTab = 'departments';
export function renderSettings(main) {
  if (!can('settings') && !can('edit')) { main.innerHTML = '<div class="page"><div class="card card-b empty">Settings are available to administrators.</div></div>'; return; }
  const admin = can('settings'), st = settings();
  const tabs = [['departments', 'Departments'], ['templates', 'Shift templates'], ['requirements', 'Staffing requirements'], ['rules', 'Roster rules'], ['users', 'Users & roles'], ['backup', 'Backup & restore']].filter(([k]) => admin || k === 'requirements');
  if (!tabs.some(t => t[0] === setTab)) setTab = tabs[0][0];
  const deps = R.state.department, tpls = R.state.template;
  let body = '';
  if (setTab === 'departments') body = `<div class="card"><div class="card-h"><h3>Departments</h3><button class="btn sm primary" data-nd>${icon('plus')}Add department</button></div><table class="tbl"><thead><tr><th>Colour</th><th>Name</th><th>Code</th><th class="num">Staff</th><th>Status</th><th></th></tr></thead><tbody>
    ${deps.map(d => `<tr><td><span class="dot" style="background:${d.color};width:14px;height:14px"></span></td><td><b>${esc(d.name)}</b></td><td>${esc(d.code)}</td><td class="num">${R.state.staff.filter(s => s.department_id === d.id && s.status !== 'Inactive').length}</td><td>${d.active === false ? '<span class="tag">Inactive</span>' : '<span class="tag green">Active</span>'}</td><td class="num"><button class="btn sm" data-ed="${d.id}">Edit</button> <button class="btn sm ${d.active === false ? '' : 'danger'}" data-tog="${d.id}">${d.active === false ? 'Activate' : 'Deactivate'}</button></td></tr>`).join('')}</tbody></table></div>`;
  if (setTab === 'templates') body = `<div class="card"><div class="card-h"><h3>Shift templates</h3><button class="btn sm primary" data-nt>${icon('plus')}Add template</button></div><table class="tbl"><thead><tr><th></th><th>Name</th><th>Time</th><th class="num">Hours</th><th>Type</th><th>Rest rule</th><th>Status</th><th></th></tr></thead><tbody>
    ${tpls.map(t => `<tr><td><span class="dot" style="background:${t.color};width:14px;height:14px"></span></td><td><b>${esc(t.name)}</b></td><td>${t.start}–${t.end}${t.start >= t.end ? ' (+1)' : ''}</td><td class="num">${E.hoursOf({ date: '2026-01-01', start: t.start, end: t.end })}</td><td>${esc((E.SHIFT_KINDS[t.kind] || {}).label || t.kind)}</td><td>${t.rest_exempt ? '<span class="tag">Exempt (on-call)</span>' : 'Applies'}</td><td>${t.active === false ? '<span class="tag">Inactive</span>' : '<span class="tag green">Active</span>'}</td><td class="num"><button class="btn sm" data-et="${t.id}">Edit</button></td></tr>`).join('')}</tbody></table></div>`;
  if (setTab === 'requirements') {
    const ed = d => can('edit', d.id);
    body = `<div class="card"><div class="card-h"><h3>Default staff required per shift</h3><span class="muted small">Used when a shift has no explicit number and by the auto-generator. Changes save as you type.</span></div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Department</th>${tpls.filter(t => t.active !== false).map(t => `<th class="num">${esc(t.name.replace(/ shift| duty/i, ''))}</th>`).join('')}</tr></thead><tbody>
      ${deps.filter(d => d.active !== false).map(d => `<tr><td><b>${esc(d.name)}</b></td>${tpls.filter(t => t.active !== false).map(t => { const r = R.state.requirement.find(x => x.id === d.id + '|' + t.id); return `<td class="num"><input class="inp" type="number" min="0" max="50" style="width:64px;text-align:right" data-req="${d.id}|${t.id}" value="${r ? r.required : ''}" placeholder="–" ${ed(d) ? '' : 'disabled'}></td>`; }).join('')}</tr>`).join('')}</tbody></table></div></div>`;
  }
  if (setTab === 'rules') body = `<div class="card card-b" style="max-width:640px"><div class="fgrid">
    <div class="f"><label>Minimum rest between shifts (hours)</label><input class="inp" type="number" min="0" max="48" data-r="min_rest_hours" value="${st.min_rest_hours}"></div>
    <div class="f"><label>Maximum duty hours per week</label><input class="inp" type="number" min="1" max="168" data-r="max_weekly_hours" value="${st.max_weekly_hours}"></div>
    <div class="f"><label>Maximum consecutive night duties</label><input class="inp" type="number" min="1" max="14" data-r="max_consecutive_nights" value="${st.max_consecutive_nights}"></div>
    <div class="f"><label>Week starts on</label><select class="inp" data-r="week_start"><option value="0" ${st.week_start === 0 ? 'selected' : ''}>Sunday</option><option value="1" ${st.week_start === 1 ? 'selected' : ''}>Monday</option></select></div>
    <div class="f full"><label>Weekend days</label><div class="wd">${[0, 1, 2, 3, 4, 5, 6].map(i => `<label><input type="checkbox" data-wk value="${i}" ${st.weekend_days.includes(i) ? 'checked' : ''}>${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][i]}</label>`).join('')}</div></div>
    </div><div class="row" style="margin-top:14px"><span class="grow"></span><button class="btn primary" data-saverules>Save rules</button></div></div>`;
  if (setTab === 'users') body = `<div class="card"><div class="card-h"><h3>Users &amp; roles</h3><button class="btn sm primary" data-nu>${icon('plus')}Add user</button></div>
    <div class="card-b small muted" style="border-bottom:1px solid var(--line)">Anyone whose sign-in email matches a staff profile gets the <b>Staff</b> role automatically. Add people here to give them more access. Roles: <b>Administrator</b> (everything), <b>Roster administrator</b> (edit &amp; publish rosters, manage staff for their departments), <b>Supervisor</b> (approve leave &amp; exchanges), <b>Staff</b> (own roster &amp; requests).</div>
    <table class="tbl"><thead><tr><th>Email</th><th>Role</th><th>Linked staff</th><th>Departments</th><th>Status</th><th></th></tr></thead><tbody>
    ${R.state.user.map(u => `<tr><td>${esc(u.email)}</td><td><span class="tag brand">${esc(E.ROLE_LABEL[u.role])}</span></td><td>${esc((staffById(u.staff_id) || {}).name || '—')}</td><td class="small">${u.dept_scope ? u.dept_scope.map(d => esc(dept(d).code)).join(', ') : 'All'}</td><td>${u.active === false ? '<span class="tag">Disabled</span>' : '<span class="tag green">Active</span>'}</td><td class="num"><button class="btn sm" data-eu="${esc(u.email)}">Edit</button></td></tr>`).join('') || '<tr><td colspan="6" class="empty">No users with elevated roles yet.</td></tr>'}</tbody></table></div>`;
  if (setTab === 'backup') body = `<div class="grid2"><div class="card card-b"><h3 style="margin-bottom:6px">Download backup</h3><p class="muted small" style="margin-bottom:12px">A complete JSON copy of departments, staff, shifts, assignments, requests, versions${R.mode === 'live' ? ' and the audit log' : ''}. Keep it somewhere safe (e.g. the hospital shared drive).</p><button class="btn primary" data-bk>${icon('download')}Download backup</button></div>
    <div class="card card-b"><h3 style="margin-bottom:6px">Restore from backup</h3><p class="muted small" style="margin-bottom:12px">Replaces all roster data with the contents of a backup file. The restore is recorded in the audit log.</p><label class="btn danger">${icon('history')}Choose backup file…<input type="file" accept=".json,application/json" data-rs hidden></label></div>
    ${R.mode === 'demo' ? `<div class="card card-b"><h3 style="margin-bottom:6px">Reset demo data</h3><p class="muted small" style="margin-bottom:12px">Discard demo changes made in this browser and generate a fresh demo roster.</p><button class="btn" data-reset>Reset demo</button></div>` : `<div class="card card-b"><h3 style="margin-bottom:6px">Automatic database backups</h3><p class="muted small">Cloudflare D1 keeps point-in-time recovery (Time Travel) for the last 30 days. See the setup guide for restore steps.</p></div>`}</div>`;
  main.innerHTML = `<div class="page"><div class="ph"><div><h1>Settings</h1><p>Roster configuration${admin ? '' : ' (roster administrators can set staffing requirements)'}</p></div></div>
    <div class="seg" style="margin-bottom:14px;flex-wrap:wrap">${tabs.map(([k, l]) => `<button class="${setTab === k ? 'on' : ''}" data-tab="${k}">${l}</button>`).join('')}</div>${body}</div>`;
  main.onclick = async e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.tab) { setTab = b.dataset.tab; return renderSettings(main); }
    if (b.hasAttribute('data-nd') || b.dataset.ed) return deptForm(deps.find(d => d.id === b.dataset.ed));
    if (b.dataset.tog) { const d = deps.find(x => x.id === b.dataset.tog); return act('department.save', Object.assign({}, d, { active: d.active === false })); }
    if (b.hasAttribute('data-nt') || b.dataset.et) return tplForm(tpls.find(t => t.id === b.dataset.et));
    if (b.hasAttribute('data-nu') || b.dataset.eu) return userForm(R.state.user.find(u => u.email === b.dataset.eu));
    if (b.hasAttribute('data-saverules')) { const p = {}; $$('[data-r]', main).forEach(i => (p[i.dataset.r] = +i.value)); p.weekend_days = $$('[data-wk]:checked', main).map(i => +i.value); return act('settings.save', p); }
    if (b.hasAttribute('data-bk')) return backup();
    if (b.hasAttribute('data-reset')) { if (await confirmBox({ title: 'Reset demo?', body: '<p>All demo changes in this browser will be lost.</p>', ok: 'Reset', danger: true })) (await import('./roster-core.js')).resetDemo(); }
  };
  const rs = $('[data-rs]', main); if (rs) rs.onchange = e => { if (e.target.files[0]) restore(e.target.files[0]); };
  $$('[data-req]', main).forEach(i => (i.onchange = () => { const [d, t] = i.dataset.req.split('|'); act('requirement.save', { department_id: d, template_id: t, required: i.value || 0 }, { quiet: true }).then(r => r && toast('Requirement saved')); }));
}
function deptForm(d) {
  const m = modal({ title: d ? 'Edit department' : 'Add department', body: `<div class="fgrid"><div class="f full"><label>Name</label><input class="inp" data-n value="${esc(d ? d.name : '')}" maxlength="60"></div><div class="f"><label>Short code</label><input class="inp" data-c value="${esc(d ? d.code : '')}" maxlength="8"></div><div class="f"><label>Colour</label><input class="inp" type="color" data-k value="${d ? d.color : '#0a8f9e'}" style="padding:2px;width:80px"></div></div>`,
    foot: '<span class="sp"></span><button class="btn" data-x>Cancel</button><button class="btn primary" data-ok>Save</button>' });
  $('[data-x]', m.el).onclick = m.close;
  $('[data-ok]', m.el).onclick = async () => { if (await act('department.save', { id: d && d.id, name: $('[data-n]', m.el).value, code: $('[data-c]', m.el).value, color: $('[data-k]', m.el).value })) m.close(); };
}
function tplForm(t) {
  const m = modal({ title: t ? 'Edit shift template' : 'Add shift template', body: `<div class="fgrid"><div class="f full"><label>Name</label><input class="inp" data-n value="${esc(t ? t.name : '')}" maxlength="40" placeholder="e.g. Long day"></div>
    <div class="f"><label>Start</label><input class="inp" type="time" data-s value="${t ? t.start : '08:00'}"></div><div class="f"><label>End</label><input class="inp" type="time" data-e value="${t ? t.end : '20:00'}"><small>An end at or before the start crosses midnight.</small></div>
    <div class="f"><label>Type</label><select class="inp" data-k>${Object.entries(E.SHIFT_KINDS).map(([k, v]) => `<option value="${k}" ${(t ? t.kind : 'custom') === k ? 'selected' : ''}>${v.label}</option>`).join('')}</select></div><div class="f"><label>Colour</label><input class="inp" type="color" data-c value="${t ? t.color : '#64748b'}" style="padding:2px;width:80px"></div>
    <label class="f full small"><input type="checkbox" data-r ${t && t.rest_exempt ? 'checked' : ''}> Exempt from the minimum-rest rule (e.g. on-call from home)</label>
    <label class="f full small"><input type="checkbox" data-a ${!t || t.active !== false ? 'checked' : ''}> Active</label></div>`,
    foot: '<span class="sp"></span><button class="btn" data-x>Cancel</button><button class="btn primary" data-ok>Save</button>' });
  $('[data-x]', m.el).onclick = m.close;
  $('[data-ok]', m.el).onclick = async () => { if (await act('template.save', { id: t && t.id, name: $('[data-n]', m.el).value, start: $('[data-s]', m.el).value, end: $('[data-e]', m.el).value, kind: $('[data-k]', m.el).value, color: $('[data-c]', m.el).value, rest_exempt: $('[data-r]', m.el).checked, active: $('[data-a]', m.el).checked })) m.close(); };
}
function userForm(u) {
  const m = modal({ title: u ? 'Edit user' : 'Add user', body: `<div class="fgrid"><div class="f full"><label>Sign-in email</label><input class="inp" type="email" data-e value="${esc(u ? u.email : '')}" ${u ? 'disabled' : ''}></div>
    <div class="f"><label>Role</label><select class="inp" data-r>${Object.keys(E.ROLE_LABEL).filter(r => r !== 'viewer').map(r => `<option value="${r}" ${(u ? u.role : 'roster_admin') === r ? 'selected' : ''}>${E.ROLE_LABEL[r]}</option>`).join('')}</select></div>
    <div class="f"><label>Linked staff profile</label><select class="inp" data-s><option value="">None</option>${R.state.staff.map(s => `<option value="${s.id}" ${u && u.staff_id === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></div>
    <div class="f full"><label>Departments (leave all unticked for all departments)</label><div class="picker" style="max-height:180px">${R.state.department.map(d => `<label class="pk"><input type="checkbox" value="${d.id}" ${u && u.dept_scope && u.dept_scope.includes(d.id) ? 'checked' : ''}>${esc(d.name)}</label>`).join('')}</div></div>
    <label class="f full small"><input type="checkbox" data-a ${!u || u.active !== false ? 'checked' : ''}> Active</label></div>`,
    foot: '<span class="sp"></span><button class="btn" data-x>Cancel</button><button class="btn primary" data-ok>Save</button>' });
  $('[data-x]', m.el).onclick = m.close;
  $('[data-ok]', m.el).onclick = async () => { if (await act('user.save', { email: $('[data-e]', m.el).value, role: $('[data-r]', m.el).value, staff_id: $('[data-s]', m.el).value || null, dept_scope: $$('.picker input:checked', m.el).map(i => i.value), active: $('[data-a]', m.el).checked })) m.close(); };
}
