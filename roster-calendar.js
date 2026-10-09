/* ASMH Duty Roster — calendar page (week / day / month), builder panel, shift editor, publishing */
import { R, E, $, $$, esc, icon, initials, fmt, dept, staffById, tpl, settings, colorOf, can, act, modal, confirmBox, toast, download, toCSV, exportXLSX, exportPDF, printDoc, approvalLine } from './roster-core.js';

const UI_KEY = 'asmh_roster_ui';
export const UI = Object.assign({ view: 'week', date: E.todayStr(), dept: '', des: '', q: '', show: 'draft', group: 'department', panel: 'staff', allDeptsInPicker: false },
  (() => { try { const u = JSON.parse(localStorage.getItem(UI_KEY) || '{}'); delete u.date; return u; } catch (e) { return {}; } })());
const saveUI = () => { try { localStorage.setItem(UI_KEY, JSON.stringify(UI)); } catch (e) {} };
const SNAP = 15;
let selected = null;

/* ------------------------------------------------------------------ */
/* data selection                                                      */
/* ------------------------------------------------------------------ */
export function rangeOf() {
  const st = settings();
  if (UI.view === 'day') return { from: UI.date, to: UI.date };
  if (UI.view === 'month') { const first = UI.date.slice(0, 8) + '01'; const last = E.addDays(E.addDays(first, 32).slice(0, 8) + '01', -1); return { from: first, to: last }; }
  const ws = E.weekStartOf(UI.date, st.week_start); return { from: ws, to: E.addDays(ws, 6) };
}
const showMode = () => (can('drafts') ? UI.show : 'published');

/** shifts visible in a range, with draft/published handling and filters */
export function visibleShifts(from, to, opts = {}) {
  const mode = opts.mode || showMode(), out = [];
  const a = E.dayNum(from) - 1, b = E.dayNum(to);
  const q = (opts.q !== undefined ? opts.q : UI.q).trim().toLowerCase();
  const dep = opts.dept !== undefined ? opts.dept : UI.dept, des = opts.des !== undefined ? opts.des : UI.des;
  for (const raw of R.state.shift) {
    let sh;
    if (mode === 'published') { if (!raw.published) continue; sh = Object.assign({ id: raw.id, series_id: raw.series_id, _raw: raw }, raw.published); sh.staff = raw.published.staff_ids.slice(); sh.prop = []; }
    else { if (raw.deleted && !raw.published) continue; sh = Object.assign({ _raw: raw }, raw); sh.staff = R.state.assignment.filter(x => x.shift_id === raw.id).map(x => x.staff_id); sh.prop = R.state.assignment.filter(x => x.shift_id === raw.id && x.proposed).map(x => x.staff_id); }
    const d = E.dayNum(sh.date); if (d < a || d > b) continue;
    if (dep && sh.department_id !== dep) continue;
    if (des && sh.designation !== des && !sh.staff.some(id => (staffById(id) || {}).designation === des)) continue;
    if (q) {
      const hay = [sh.name, sh.location, dept(sh.department_id).name, ...sh.staff.map(id => (staffById(id) || {}).name)].join(' ').toLowerCase();
      if (!hay.includes(q)) continue;
    }
    out.push(sh);
  }
  return out.sort((x, y) => E.span(x).s - E.span(y).s);
}
function coverage(sh) {
  const req = sh.required == null ? 1 : sh.required;
  return { req, got: sh.staff.length, short: Math.max(0, req - sh.staff.length) };
}

/* ------------------------------------------------------------------ */
/* page render                                                         */
/* ------------------------------------------------------------------ */
export function renderRoster(main) {
  if (!UI.dept && !UI._init) {                              // first visit: start on the user's department
    const me = R.me.staff_id && staffById(R.me.staff_id);
    UI.dept = me ? me.department_id : (R.state.department.find(d => d.active !== false) || {}).id || '';
    UI._init = true; saveUI();
  }
  if (!can('drafts')) UI.show = 'published';
  const { from, to } = rangeOf(), editor = can('edit');
  const label = UI.view === 'month' ? fmt.month(from) : UI.view === 'day' ? fmt.short(from) + ' ' + from.slice(0, 4) : fmt.range(from, to);
  const deps = R.state.department.filter(d => d.active !== false || d.id === UI.dept);
  main.innerHTML = `<div class="page" style="max-width:none">
    <div class="rtool">
      <div class="rtool-1">
        <h1>Staff Duty Roster</h1>
        <button class="btn sm" data-a="today">Today</button>
        <div class="row" style="gap:4px"><button class="ibtn" data-a="prev" aria-label="Previous">${icon('left')}</button><button class="ibtn" data-a="next" aria-label="Next">${icon('right')}</button></div>
        <span class="range-lbl">${esc(label)}</span>
        <span class="grow"></span>
        <div class="seg" role="tablist">${['day', 'week', 'month'].map(v => `<button class="${UI.view === v ? 'on' : ''}" data-view="${v}">${v[0].toUpperCase() + v.slice(1)}</button>`).join('')}</div>
        ${editor ? `<button class="btn primary" data-a="add">${icon('plus')}Add shift</button><button class="btn accent" data-a="publish">${icon('send')}Publish roster</button>` : ''}
        <div class="menu-wrap"><button class="btn" data-a="menu">${icon('more')}<span class="hide-mobile">${editor ? 'Tools' : 'Export'}</span></button><div class="menu" id="rMenu" hidden>
          ${editor ? `<button data-a="copyweek">${icon('copy')}Copy previous week</button><button data-a="generate">${icon('magic')}Auto-generate draft…</button><button data-a="bulk">${icon('users')}Bulk assign…</button><button data-a="recur">${icon('layers')}Recurring shift pattern…</button><hr>` : ''}
          <button data-a="csv">${icon('download')}Export CSV</button><button data-a="xlsx">${icon('download')}Export Excel</button><button data-a="pdf">${icon('download')}Export PDF</button><button data-a="print">${icon('print')}Print roster</button>
        </div></div>
      </div>
      <div class="rtool-2">
        <label class="search">${icon('search')}<input id="rq" placeholder="Search staff, shift or department…" value="${esc(UI.q)}" autocomplete="off"></label>
        <select class="inp" id="rdep" aria-label="Department"><option value="">All departments</option>${deps.map(d => `<option value="${d.id}" ${UI.dept === d.id ? 'selected' : ''}>${esc(d.name)}${d.active === false ? ' (inactive)' : ''}</option>`).join('')}</select>
        <select class="inp" id="rdes" aria-label="Designation"><option value="">All designations</option>${E.DESIGNATIONS.map(d => `<option ${UI.des === d ? 'selected' : ''}>${d}</option>`).join('')}</select>
        ${UI.view === 'day' ? `<select class="inp" id="rgroup" aria-label="Group by"><option value="department" ${UI.group === 'department' ? 'selected' : ''}>Group by department</option><option value="designation" ${UI.group === 'designation' ? 'selected' : ''}>Group by designation</option></select>` : ''}
        ${can('drafts') ? `<div class="seg" title="Which version to show"><button class="${UI.show === 'draft' ? 'on' : ''}" data-show="draft">Draft</button><button class="${UI.show === 'published' ? 'on' : ''}" data-show="published">Published</button></div>` : ''}
        <div class="legend">${R.state.template.filter(t => t.active !== false).slice(0, 7).map(t => `<span><i style="background:${t.color}"></i>${esc(t.name.replace(/ shift| duty/i, ''))}</span>`).join('')}<span><i style="background:transparent;border:1.5px dashed var(--red)"></i>Unassigned</span></div>
      </div>
    </div>
    ${statusBar(from, to)}
    <div class="rwrap ${UI.view === 'month' ? 'nopanel' : ''}">
      <div class="cal" id="cal"></div>
      ${UI.view === 'month' ? '' : '<aside class="panel" id="panel"></aside>'}
    </div>
  </div>`;
  wireToolbar(main);
  const cal = $('#cal', main);
  if (UI.view === 'month') renderMonth(cal, from, to);
  else renderGrid(cal, from, to);
  if (UI.view !== 'month') renderPanel($('#panel', main), from, to);
}

function statusBar(from, to) {
  if (!can('drafts')) {
    const v = R.state.version.filter(x => x.start <= to && x.end >= from).sort((a, b) => b.no - a.no)[0];
    return `<div class="statusbar"><span class="tag green">${icon('check', 'sm')}Published roster</span><span class="muted">${v ? 'Version ' + v.no + ' · ' + fmt.when(v.at) : 'No roster has been published for this period yet.'}</span></div>`;
  }
  const inRange = R.state.shift.filter(s => s.date >= from && s.date <= to && (!UI.dept || s.department_id === UI.dept));
  const dirty = inRange.filter(s => s.dirty).length;
  const prop = R.state.assignment.filter(a => a.proposed && inRange.some(s => s.id === a.shift_id)).length;
  const v = R.state.version.filter(x => x.start <= to && x.end >= from).sort((a, b) => b.no - a.no)[0];
  return `<div class="statusbar">
    ${dirty ? `<span class="tag amber">Draft · ${dirty} unpublished change${dirty > 1 ? 's' : ''}</span>` : `<span class="tag green">${icon('check', 'sm')}Up to date with published roster</span>`}
    <span class="muted small">${v ? 'Last published v' + v.no + ' by ' + esc(v.by_name || v.by) + ' · ' + fmt.when(v.at) : 'Not published yet'}</span>
    ${prop ? `<span class="grow"></span><span class="tag brand">${icon('magic', 'sm')}${prop} auto-generated proposal${prop > 1 ? 's' : ''} awaiting review</span><button class="btn sm" data-a="prop-discard">Discard</button><button class="btn sm primary" data-a="prop-approve">Approve</button>` : ''}
  </div>`;
}

function wireToolbar(main) {
  const rer = () => { saveUI(); renderRoster(main); };
  main.onclick = async e => {
    const b = e.target.closest('[data-a],[data-view],[data-show]'); if (!b) { const m = $('#rMenu'); if (m && !e.target.closest('.menu-wrap')) m.hidden = true; return; }
    if (b.dataset.view) { UI.view = b.dataset.view; return rer(); }
    if (b.dataset.show) { UI.show = b.dataset.show; return rer(); }
    const a = b.dataset.a, { from, to } = rangeOf(), menu = $('#rMenu');
    if (menu && a !== 'menu') menu.hidden = true;
    const step = UI.view === 'day' ? 1 : UI.view === 'week' ? 7 : 0;
    if (a === 'today') { UI.date = E.todayStr(); return rer(); }
    if (a === 'prev' || a === 'next') {
      const k = a === 'prev' ? -1 : 1;
      if (step) UI.date = E.addDays(UI.date, k * step);
      else { const [y, m] = UI.date.split('-').map(Number); const d = new Date(Date.UTC(y, m - 1 + k, 1)); UI.date = d.toISOString().slice(0, 10); }
      return rer();
    }
    if (a === 'menu') { menu.hidden = !menu.hidden; return; }
    if (a === 'add') return openShiftEditor(null, { date: UI.view === 'day' ? UI.date : (from <= E.todayStr() && E.todayStr() <= to ? E.todayStr() : from) });
    if (a === 'recur') return openShiftEditor(null, { date: from, repeat: true });
    if (a === 'publish') return openPublish(from, to);
    if (a === 'copyweek') return openCopyWeek();
    if (a === 'generate') return openGenerate(from, to);
    if (a === 'bulk') return openBulk(from, to);
    if (a === 'prop-approve' || a === 'prop-discard') { await act('roster.proposals', { decision: a === 'prop-approve' ? 'approve' : 'discard', start: from, end: to, department_id: UI.dept || undefined }); return; }
    if (['csv', 'xlsx', 'pdf', 'print'].includes(a)) return exportRoster(a, from, to);
  };
  let t;
  $('#rq', main).oninput = e => { clearTimeout(t); t = setTimeout(() => { UI.q = e.target.value; saveUI(); const p = e.target.selectionStart; renderRoster(main); const n = $('#rq', main); n.focus(); n.setSelectionRange(p, p); }, 180); };
  $('#rdep', main).onchange = e => { UI.dept = e.target.value; rer(); };
  $('#rdes', main).onchange = e => { UI.des = e.target.value; rer(); };
  const g = $('#rgroup', main); if (g) g.onchange = e => { UI.group = e.target.value; rer(); };
}

/* ------------------------------------------------------------------ */
/* time grid (week + day)                                              */
/* ------------------------------------------------------------------ */
function columnsFor(from, to) {
  const st = settings(), t = E.todayStr();
  if (UI.view === 'week') {
    const cols = [];
    for (let d = E.dayNum(from); d <= E.dayNum(to); d++) {
      const date = E.dayStr(d);
      cols.push({ key: date, date, today: date === t, weekend: E.isWeekend(date, st), head: `<span class="dn">${fmt.day(date)}</span><span><span class="dw">${fmt.dow(date)}</span></span>`, match: () => true });
    }
    return cols;
  }
  const date = from;
  if (UI.group === 'designation') {
    return E.DESIGNATIONS.filter(d => !UI.des || d === UI.des).map(d => ({ key: d, date, today: date === t, head: `<span class="dtitle">${esc(d)}</span>`, match: sh => (sh.designation || 'Other staff') === d || (!sh.designation && sh.staff.some(id => (staffById(id) || {}).designation === d)) }));
  }
  const deps = R.state.department.filter(d => (!UI.dept || d.id === UI.dept) && d.active !== false);
  return deps.map(d => ({ key: d.id, date, dept: d.id, today: date === t, head: `<span class="dot" style="background:${d.color}"></span><span class="dtitle">${esc(d.name)}</span>`, match: sh => sh.department_id === d.id }));
}

function renderGrid(cal, from, to) {
  const H = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--hour')) || 44, PX = H / 60;
  const cols = columnsFor(from, to), shifts = visibleShifts(from, to);
  const layout = new Map(); let maxLanes = 1;
  cols.forEach(c => {
    const dn = E.dayNum(c.date), segs = [];
    for (const sh of shifts) {
      if (!c.match(sh)) continue;
      const p = E.span(sh), s0 = Math.max(p.s, dn * 1440), e0 = Math.min(p.e, (dn + 1) * 1440);
      if (e0 <= s0) continue;
      segs.push({ sh, top: s0 - dn * 1440, end: e0 - dn * 1440, cont: p.s < dn * 1440, cut: p.e > (dn + 1) * 1440 });
    }
    segs.sort((x, y) => x.top - y.top || y.end - x.end);
    let cluster = [], clusterEnd = -1;
    const flush = () => { const lanes = []; cluster.forEach(s => { let i = lanes.findIndex(e => e <= s.top); if (i < 0) { i = lanes.length; lanes.push(0); } lanes[i] = s.end; s.lane = i; }); cluster.forEach(s => (s.lanes = lanes.length)); maxLanes = Math.max(maxLanes, lanes.length); cluster = []; clusterEnd = -1; };
    for (const s of segs) { if (cluster.length && s.top >= clusterEnd) flush(); cluster.push(s); clusterEnd = Math.max(clusterEnd, s.end); }
    flush();
    layout.set(c.key, segs);
  });
  const minCol = Math.max(UI.view === 'week' ? 112 : 150, Math.min(maxLanes, 6) * 72);
  const tmpl = `56px repeat(${cols.length}, minmax(${minCol}px, 1fr))`;
  const wide = cols.length * minCol + 56;
  cal.innerHTML = `<div class="cal-body" id="calBody"><div style="min-width:${wide}px"><div class="cal-head" style="grid-template-columns:${tmpl};position:sticky;top:0">
      <div class="gutter"></div>${cols.map(c => {
        const list = shifts.filter(s => (UI.view === 'week' ? s.date === c.date : c.match(s)));
        const short = list.reduce((n, s) => n + coverage(s).short, 0);
        return `<div class="dh ${c.today && UI.view === 'week' ? 'today' : ''} ${c.weekend ? 'weekend' : ''}" ${UI.view === 'week' ? `data-goday="${c.date}" style="cursor:pointer" title="Open day view"` : ''}>${c.head}<span class="dsum">${list.length ? `<span class="tag" title="Shifts">${list.length}</span>` : ''}${short ? `<span class="tag red" title="${short} unfilled position(s)">${short}</span>` : ''}</span></div>`;
      }).join('')}</div>
    <div class="cal-grid" style="grid-template-columns:${tmpl}">
      <div class="hours">${Array.from({ length: 24 }, (_, h) => h ? `<span style="top:${h * H}px">${String(h).padStart(2, '0')}:00</span>` : '').join('')}</div>
      ${cols.map(c => `<div class="col ${c.weekend ? 'weekend' : ''} ${c.today && UI.view === 'week' ? 'today' : ''}" data-col="${esc(c.key)}" data-date="${c.date}" ${c.dept ? `data-dept="${c.dept}"` : ''}></div>`).join('')}
    </div></div></div>`;
  const body = $('#calBody', cal);
  $$('[data-goday]', cal).forEach(el => el.onclick = () => { UI.view = 'day'; UI.date = el.dataset.goday; saveUI(); renderRoster(cal.closest('.main')); });

  // segments per column
  const issues = E.analyze(R.state, from, to, { mode: showMode() }).issues;
  const flagged = new Set(issues.filter(i => i.staff_id).map(i => i.shift_id));
  cols.forEach(c => {
    const colEl = $(`.col[data-col="${CSS.escape(c.key)}"]`, cal);
    const segs = layout.get(c.key);
    colEl.innerHTML = segs.map(s => blockHTML(s, PX, flagged)).join('');
    if (c.today) {
      const n = new Date(), m = n.getHours() * 60 + n.getMinutes();
      if (c.date === E.todayStr()) colEl.insertAdjacentHTML('beforeend', `<div class="nowline" style="top:${m * PX}px"></div>`);
    }
  });
  // scroll to morning / now
  const nowM = new Date().getHours() * 60;
  body.scrollTop = Math.max(0, (from <= E.todayStr() && E.todayStr() <= to ? nowM - 120 : 7 * 60) * PX);
  wireGrid(cal, PX);
}

const shortName = n => n.replace(/ shift| duty/gi, '').replace('Medical Officer', 'MO');
function blockHTML(s, PX, flagged) {
  const sh = s.sh, raw = sh._raw, cv = coverage(sh), c = colorOf(sh);
  const h = Math.max(22, (s.end - s.top) * PX - 2), w = 100 / s.lanes;
  const dense = s.lanes > 3 || h < 46;
  const avs = sh.staff.slice(0, dense ? 3 : 6).map(id => { const st = staffById(id); return `<span class="av ${sh.prop.includes(id) ? 'prop' : ''}" data-staff="${id}" title="${esc(st ? st.name + ' · ' + st.designation : 'Unknown')}${sh.prop.includes(id) ? ' (proposed)' : ''}">${esc(initials(st && st.name))}</span>`; }).join('') + (sh.staff.length > (dense ? 3 : 6) ? `<span class="more">+${sh.staff.length - (dense ? 3 : 6)}</span>` : '');
  const cls = ['sb', cv.got === 0 && cv.req > 0 ? 'unassigned' : '', raw.dirty && showMode() === 'draft' ? 'dirty' : '', raw.deleted && showMode() === 'draft' ? 'deleted' : '', s.cont ? 'cont' : '', s.cut ? 'cut' : '', flagged.has(sh.id) ? 'issue-x' : '', selected === sh.id ? 'sel' : ''].join(' ');
  const title = `${sh.name} · ${sh.start}–${sh.end}${E.isOvernight(sh) ? ' (+1)' : ''} · ${dept(sh.department_id).name}${sh.location ? ' · ' + sh.location : ''} · ${cv.got}/${cv.req} staff`;
  return `<div class="${cls}" data-id="${sh.id}" style="--c:${c};top:${s.top * PX + 1}px;height:${h}px;left:calc(${s.lane * w}% + 2px);width:calc(${w}% - 4px)" title="${esc(title)}" tabindex="0">
    <span class="t">${s.cont ? '↳ ' : ''}${esc(s.lanes > 1 ? shortName(sh.name) : sh.name)}</span>
    ${h >= 34 ? `<span class="m"><b class="cv ${cv.short ? 'short' : ''}">${cv.got}/${cv.req}</b> ${sh.start}–${sh.end}${E.isOvernight(sh) ? ' +1' : ''}${UI.view === 'week' && !UI.dept ? ' · ' + esc(dept(sh.department_id).code) : sh.location ? ' · ' + esc(sh.location) : ''}</span>` : `<span class="m"><b class="cv ${cv.short ? 'short' : ''}">${cv.got}/${cv.req}</b></span>`}
    ${h >= 46 ? (cv.got ? `<span class="avs">${avs}</span>` : `<span class="ua">${icon('alert', 'sm')} Unassigned</span>`) : ''}
    ${can('edit', sh.department_id) && showMode() === 'draft' && !raw.deleted && !s.cut ? '<span class="rz" data-rz></span>' : ''}
  </div>`;
}

/* ------------------------------------------------------------------ */
/* drag & drop, resize, staff assignment                               */
/* ------------------------------------------------------------------ */
function wireGrid(cal, PX) {
  const body = $('#calBody', cal);
  const colAt = (x, y) => { const el = document.elementFromPoint(x, y); return el && el.closest('.col'); };
  const minuteIn = (col, y) => (y - col.getBoundingClientRect().top) / PX;
  const snap = m => Math.round(m / SNAP) * SNAP;
  let tip = null;
  const showTip = (x, y, txt) => { if (!tip) { tip = document.createElement('div'); tip.className = 'drag-time'; document.body.appendChild(tip); } tip.textContent = txt; tip.style.left = x + 14 + 'px'; tip.style.top = y + 12 + 'px'; };
  const hideTip = () => { if (tip) tip.remove(); tip = null; };

  cal.onpointerdown = e => {
    if (e.button !== 0) return;
    const av = e.target.closest('.sb .av[data-staff]');
    const blk = e.target.closest('.sb');
    if (!blk) return;
    const sh = R.state.shift.find(x => x.id === blk.dataset.id);
    const editable = sh && can('edit', sh.department_id) && showMode() === 'draft' && !sh.deleted;
    const mouse = e.pointerType !== 'touch';
    if (av && editable && mouse) return staffDrag(e, av.dataset.staff, sh.id);
    const resize = !!e.target.closest('[data-rz]');
    const sx = e.clientX, sy = e.clientY;
    let moved = false, preview = null, target = null;
    const p = E.span(sh || {}), dur = sh ? p.e - p.s : 0;
    const col0 = blk.closest('.col');
    const grabAbs = col0 ? E.dayNum(col0.dataset.date) * 1440 + minuteIn(col0, sy) : 0;
    const grabOff = grabAbs - p.s;
    const move = ev => {
      if (!editable || !mouse) return;
      if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 5) return;
      if (!moved) { moved = true; blk.classList.add(resize ? 'dragging' : 'ghost'); document.body.style.cursor = resize ? 'ns-resize' : 'grabbing'; }
      autoScroll(body, ev);
      if (resize) {
        const col = col0, abs = E.dayNum(col.dataset.date) * 1440 + snap(minuteIn(col, ev.clientY));
        const endAbs = Math.min(p.s + 1440, Math.max(p.s + SNAP, abs));
        blk.style.height = Math.max(22, (Math.min(endAbs, (E.dayNum(col.dataset.date) + 1) * 1440) - Math.max(p.s, E.dayNum(col.dataset.date) * 1440)) * PX - 2) + 'px';
        target = { endAbs };
        showTip(ev.clientX, ev.clientY, sh.start + ' – ' + E.fromMin(endAbs) + ' (' + fmt.hrs((endAbs - p.s) / 60) + ')');
        return;
      }
      const col = colAt(ev.clientX, ev.clientY); if (!col) return;
      const abs = snap(E.dayNum(col.dataset.date) * 1440 + minuteIn(col, ev.clientY) - grabOff);
      const day = Math.floor(abs / 1440), top = abs - E.dayNum(col.dataset.date) * 1440;
      if (!preview) { preview = blk.cloneNode(true); preview.classList.remove('ghost'); preview.classList.add('dragging'); preview.querySelectorAll('[data-rz]').forEach(x => x.remove()); }
      if (preview.parentElement !== col) col.appendChild(preview);
      preview.style.top = Math.max(0, top) * PX + 1 + 'px'; preview.style.left = '2px'; preview.style.width = 'calc(100% - 4px)';
      target = { date: E.dayStr(day), start: E.fromMin(abs), end: E.fromMin(abs + dur), dept: col.dataset.dept || null };
      showTip(ev.clientX, ev.clientY, fmt.short(target.date) + '  ' + target.start + '–' + target.end);
    };
    const up = async () => {
      document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up);
      document.body.style.cursor = ''; hideTip(); if (preview) preview.remove(); blk.classList.remove('ghost', 'dragging');
      if (!moved) { selected = blk.dataset.id; return openShift(blk.dataset.id); }
      if (!target) return;
      if (resize) await act('shift.move', { id: sh.id, date: sh.date, start: sh.start, end: E.fromMin(target.endAbs) });
      else if (target.date !== sh.date || target.start !== sh.start || (target.dept && target.dept !== sh.department_id)) await act('shift.move', { id: sh.id, date: target.date, start: target.start, end: target.end, department_id: target.dept && target.dept !== sh.department_id ? target.dept : undefined });
      else rerender();
    };
    document.addEventListener('pointermove', move); document.addEventListener('pointerup', up);
  };
  cal.onkeydown = e => { const b = e.target.closest('.sb'); if (b && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openShift(b.dataset.id); } };
  // click empty space = new shift at that time
  cal.ondblclick = e => {
    const col = e.target.classList.contains('col') ? e.target : null;
    if (!col || !can('edit')) return;
    const m = Math.floor(minuteIn(col, e.clientY) / 60) * 60;
    openShiftEditor(null, { date: col.dataset.date, start: E.fromMin(m), end: E.fromMin(m + 480), department_id: col.dataset.dept || UI.dept || undefined });
  };
}
function autoScroll(body, ev) {
  const r = body.getBoundingClientRect();
  if (ev.clientY < r.top + 40) body.scrollTop -= 14; else if (ev.clientY > r.bottom - 40) body.scrollTop += 14;
  if (ev.clientX < r.left + 40) body.scrollLeft -= 14; else if (ev.clientX > r.right - 40) body.scrollLeft += 14;
}

/** drag a staff member (from panel or from another shift) onto a shift */
export function staffDrag(e, staffId, fromShiftId) {
  e.preventDefault(); e.stopPropagation();
  const st = staffById(staffId); if (!st) return;
  const ghost = document.createElement('div'); ghost.className = 'drag-chip'; ghost.textContent = (fromShiftId ? 'Move ' : 'Assign ') + st.name;
  let over = null, moved = false;
  const sx = e.clientX, sy = e.clientY;
  const move = ev => {
    if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 5) return;
    if (!moved) { moved = true; document.body.appendChild(ghost); }
    ghost.style.left = ev.clientX + 12 + 'px'; ghost.style.top = ev.clientY + 10 + 'px';
    const body = $('#calBody'); if (body) autoScroll(body, ev);
    const el = document.elementFromPoint(ev.clientX, ev.clientY), b = el && el.closest('.sb');
    if (over && over !== b) over.classList.remove('dropok');
    over = b && b.dataset.id !== fromShiftId ? b : null;
    if (over) over.classList.add('dropok');
  };
  const up = async () => {
    document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up);
    ghost.remove();
    if (!moved) { if (fromShiftId) openShift(fromShiftId); else openStaffQuick(staffId); return; }
    if (over) { over.classList.remove('dropok'); await act('assign.add', { shift_id: over.dataset.id, staff_id: staffId, from_shift_id: fromShiftId || undefined }); }
  };
  document.addEventListener('pointermove', move); document.addEventListener('pointerup', up);
}
function rerender() { const m = $('#main'); if (m) renderRoster(m); }

/* ------------------------------------------------------------------ */
/* month view                                                          */
/* ------------------------------------------------------------------ */
function renderMonth(cal, from, to) {
  const st = settings(), start = E.weekStartOf(from, st.week_start), t = E.todayStr();
  const shifts = visibleShifts(start, E.addDays(start, 41));
  const head = Array.from({ length: 7 }, (_, i) => `<div class="mh">${fmt.dow(E.addDays(start, i))}</div>`).join('');
  let cells = '';
  for (let i = 0; i < 42; i++) {
    const d = E.addDays(start, i), list = shifts.filter(s => s.date === d);
    const short = list.reduce((n, s) => n + coverage(s).short, 0), people = new Set(list.flatMap(s => s.staff)).size;
    const kinds = {};
    list.forEach(s => { const k = s.template_id ? (tpl(s.template_id) || {}).name || s.name : s.name; (kinds[k] = kinds[k] || { n: 0, c: colorOf(s) }).n++; });
    cells += `<div class="mc ${d < from || d > to ? 'out' : ''} ${d === t ? 'today' : ''} ${short ? 'short' : ''}" data-day="${d}" tabindex="0" title="Open ${fmt.short(d)}">
      <div class="row" style="gap:6px;flex-wrap:nowrap"><span class="mn">${fmt.day(d)}</span>${short ? `<span class="tag red" title="Unfilled positions">${short} short</span>` : ''}</div>
      ${Object.entries(kinds).sort((x, y) => y[1].n - x[1].n).slice(0, 4).map(([k, v]) => `<div class="mrow"><i style="background:${v.c}"></i><span>${esc(k.replace(/ shift| duty/i, ''))}</span><b style="margin-left:auto">${v.n}</b></div>`).join('')}
      <div class="mfoot">${list.length ? `<span class="tag" title="Shifts">${list.length} shifts</span><span class="tag brand" title="Staff assigned">${people} staff</span>` : ''}</div>
    </div>`;
  }
  cal.innerHTML = `<div class="month">${head}${cells}</div>`;
  cal.onclick = e => { const c = e.target.closest('[data-day]'); if (c) { UI.view = 'day'; UI.date = c.dataset.day; saveUI(); rerender(); } };
  cal.onkeydown = e => { const c = e.target.closest('[data-day]'); if (c && e.key === 'Enter') c.click(); };
}

/* ------------------------------------------------------------------ */
/* builder panel                                                       */
/* ------------------------------------------------------------------ */
function renderPanel(panel, from, to) {
  const an = E.analyze(R.state, from, to, { mode: showMode() });
  const ws = E.weekStartOf(from, settings().week_start);
  const anH = UI.view === 'day' ? E.analyze(R.state, ws, E.addDays(ws, 6), { mode: showMode() }) : an;
  const shifts = visibleShifts(from, to);
  const unfilled = shifts.filter(s => coverage(s).short > 0 && s.date >= from && !(s._raw.deleted));
  const issues = an.issues.filter(i => i.type !== 'unassigned' && i.type !== 'shortage' && (!UI.dept || (staffById(i.staff_id) || {}).department_id === UI.dept || i.department_id === UI.dept));
  const tab = UI.panel;
  const staff = R.state.staff.filter(s => s.status !== 'Inactive' && (!UI.dept || s.department_id === UI.dept) && (!UI.des || s.designation === UI.des) && (!UI.q || s.name.toLowerCase().includes(UI.q.toLowerCase())));
  const max = settings().max_weekly_hours;
  const sorted = staff.map(s => ({ s, w: anH.staff[s.id] || { hours: 0, shifts: 0, nights: 0 }, leave: E.approvedLeave(R.state, s.id, UI.view === 'day' ? from : E.todayStr()) })).sort((a, b) => a.w.hours - b.w.hours);
  const editor = can('edit') && showMode() === 'draft';
  panel.innerHTML = `<div class="card fill">
    <div class="ptabs">
      <button class="${tab === 'staff' ? 'on' : ''}" data-tab="staff">Staff</button>
      <button class="${tab === 'unfilled' ? 'on' : ''}" data-tab="unfilled">Unfilled${unfilled.length ? `<b>${unfilled.length}</b>` : ''}</button>
      <button class="${tab === 'issues' ? 'on' : ''}" data-tab="issues">Issues${issues.length ? `<b>${issues.length}</b>` : ''}</button>
    </div>
    <div class="pbody">${tab === 'staff' ? `
      ${editor ? '<p class="muted small" style="padding:8px 12px 4px">Drag a person onto a shift to assign. Drag an avatar between shifts to move.</p>' : ''}
      ${sorted.map(x => `<div class="chip ${x.w.hours > max ? 'over' : ''} ${x.leave ? 'leave' : ''}" data-staff="${x.s.id}" ${editor ? '' : 'style="cursor:pointer"'}>
        <span class="av" style="background:${dept(x.s.department_id).color}">${esc(initials(x.s.name))}</span>
        <span style="min-width:0"><b>${esc(x.s.name)}</b><small>${esc(x.s.designation)}${x.leave ? ' · on leave' : ''}${x.s.availability ? ' · ' + esc(x.s.availability) : ''}</small></span>
        <span class="hrs" title="Hours this ${UI.view === 'day' ? 'week' : 'period'}">${fmt.hrs(x.w.hours)}<small>${x.w.shifts} shift${x.w.shifts === 1 ? '' : 's'}${x.w.nights ? ' · ' + x.w.nights + ' night' + (x.w.nights > 1 ? 's' : '') : ''}${UI.view === 'day' ? ' this wk' : ''}</small></span></div>`).join('') || '<div class="empty">No staff match the filters.</div>'}`
      : tab === 'unfilled' ? (unfilled.map(s => `<div class="issue" data-open="${s.id}"><span class="dot sev-${coverage(s).got ? 'medium' : 'high'}"></span><span><b>${esc(s.name)}</b> · ${fmt.short(s.date)} ${s.start}–${s.end}<br><span class="muted small">${esc(dept(s.department_id).name)} · ${coverage(s).got}/${coverage(s).req} staff${s.designation ? ' · needs ' + esc(s.designation) : ''}</span></span></div>`).join('') || '<div class="empty">Every shift in this period is fully staffed.</div>')
      : (issues.map(i => `<div class="issue" data-open="${i.shift_id || ''}"><span class="dot sev-${i.severity}"></span><span>${esc(i.text)}<br><span class="muted small">${esc({ overlap: 'Overlapping assignment', rest: 'Insufficient rest', nights: 'Consecutive nights', leave: 'Rostered on leave', hours: 'Weekly hours limit', inactive: 'Inactive staff' }[i.type] || i.type)}</span></span></div>`).join('') || '<div class="empty">No rostering conflicts found.</div>')}
    </div></div>`;
  panel.onclick = e => {
    const t = e.target.closest('[data-tab]'); if (t) { UI.panel = t.dataset.tab; saveUI(); return renderPanel(panel, from, to); }
    const o = e.target.closest('[data-open]'); if (o && o.dataset.open) { selected = o.dataset.open; openShift(o.dataset.open); }
  };
  panel.onpointerdown = e => { const c = e.target.closest('.chip[data-staff]'); if (!c || e.button !== 0) return; if (editor && e.pointerType !== 'touch') staffDrag(e, c.dataset.staff, null); };
  panel.onclick = (orig => e => { orig(e); const c = e.target.closest('.chip[data-staff]'); if (c && (!editor || e.pointerType === 'touch' || e.detail === 0)) openStaffQuick(c.dataset.staff); })(panel.onclick);
}
function openStaffQuick(id) { import('./roster-pages.js').then(m => m.openStaffProfile(id)); }

/* ------------------------------------------------------------------ */
/* shift details + editor                                              */
/* ------------------------------------------------------------------ */
export function openShift(id) {
  const raw = R.state.shift.find(s => s.id === id); if (!raw) return;
  if (can('edit', raw.department_id) && !raw.deleted) return openShiftEditor(raw);
  const sh = showMode() === 'published' && raw.published ? Object.assign({ id: raw.id }, raw.published) : raw;
  const ids = raw.published && showMode() === 'published' ? raw.published.staff_ids : R.state.assignment.filter(a => a.shift_id === id).map(a => a.staff_id);
  const mine = R.me.staff_id && ids.includes(R.me.staff_id);
  const future = E.span(sh).s > E.nowMinAbs();
  const m = modal({ title: sh.name, body: `<dl class="kv">
      <dt>Date</dt><dd>${fmt.short(sh.date)} ${sh.date.slice(0, 4)}</dd><dt>Time</dt><dd>${sh.start} – ${sh.end}${E.isOvernight(sh) ? ' (next day)' : ''} · ${fmt.hrs(E.hoursOf(sh))}</dd>
      <dt>Department</dt><dd>${esc(dept(sh.department_id).name)}</dd>${sh.location ? `<dt>Location</dt><dd>${esc(sh.location)}</dd>` : ''}
      <dt>Staffing</dt><dd>${ids.length} of ${sh.required} required${sh.designation ? ' · ' + esc(sh.designation) : ''}</dd>
      ${sh.notes ? `<dt>Notes</dt><dd>${esc(sh.notes)}</dd>` : ''}
      <dt>Assigned</dt><dd>${ids.map(i => { const s = staffById(i); return s ? `<div class="person" style="margin-bottom:6px"><span class="av">${esc(initials(s.name))}</span><span><b>${esc(s.name)}</b><small>${esc(s.designation)}${s.phone ? ' · ' + esc(s.phone) : ''}</small></span></div>` : ''; }).join('') || '<span class="tag red">Unassigned</span>'}</dd>
      ${raw.deleted ? '<dt>Status</dt><dd><span class="tag red">Deletion pending publish</span></dd>' : ''}
    </dl>`, foot: `<span class="sp"></span>${mine && future && raw.published ? `<button class="btn primary" data-swap>${icon('swap')}Request exchange</button>` : ''}<button class="btn" data-close>Close</button>` });
  m.el.querySelector('[data-close]').onclick = m.close;
  const sw = m.el.querySelector('[data-swap]'); if (sw) sw.onclick = () => { m.close(); import('./roster-pages.js').then(p => p.openSwapRequest(id)); };
}

/** conflicts a candidate would have on a (possibly unsaved) shift */
function candidateIssues(staffId, shLike, exceptId) {
  const s = staffById(staffId); if (!s) return [];
  const out = [], st = settings(), p = E.span(shLike);
  if (s.status === 'Inactive') out.push(['red', 'Inactive']);
  if (E.approvedLeave(R.state, staffId, shLike.date)) out.push(['red', 'On leave']);
  const exempt = shLike.template_id && (tpl(shLike.template_id) || {}).rest_exempt;
  let wk = 0; const wks = E.weekStartOf(shLike.date, st.week_start);
  for (const a of R.state.assignment) {
    if (a.staff_id !== staffId || a.shift_id === exceptId) continue;
    const o = R.state.shift.find(x => x.id === a.shift_id); if (!o || o.deleted) continue;
    if (E.weekStartOf(o.date, st.week_start) === wks) wk += E.hoursOf(o);
    if (Math.abs(E.dayNum(o.date) - E.dayNum(shLike.date)) > 2) continue;
    const q = E.span(o);
    if (E.overlaps(p, q)) out.push(['red', 'Overlaps ' + o.start + '–' + o.end]);
    else if (!exempt && !(tpl(o.template_id) || {}).rest_exempt) { const gap = (p.s >= q.e ? p.s - q.e : q.s - p.e) / 60; if (gap < st.min_rest_hours) out.push(['amber', Math.round(gap) + ' h rest']); }
  }
  if (wk + E.hoursOf(shLike) > st.max_weekly_hours) out.push(['amber', Math.round(wk + E.hoursOf(shLike)) + ' h this week']);
  else out.push(['', Math.round(wk) + ' h this week']);
  return out;
}

export function openShiftEditor(raw, defaults = {}) {
  const isNew = !raw;
  const d0 = raw ? Object.assign({}, raw) : Object.assign({ date: E.todayStr(), start: '08:00', end: '16:00', department_id: UI.dept || (R.state.department[0] || {}).id, required: 1, name: '', location: '', notes: '', template_id: '' }, defaults);
  let chosen = raw ? R.state.assignment.filter(a => a.shift_id === raw.id).map(a => a.staff_id) : [];
  const deps = R.state.department.filter(d => d.active !== false || d.id === d0.department_id);
  const tpls = R.state.template.filter(t => t.active !== false);
  const series = raw && raw.series_id && R.state.shift.filter(s => s.series_id === raw.series_id && !s.deleted).length > 1;
  const m = modal({ title: isNew ? (defaults.repeat ? 'New recurring shift' : 'Add shift') : 'Edit shift', size: 'wide', body: `<div class="fgrid">
      <div class="f"><label>Shift template</label><select class="inp" name="template_id"><option value="">Custom shift</option>${tpls.map(t => `<option value="${t.id}" ${d0.template_id === t.id ? 'selected' : ''}>${esc(t.name)} (${t.start}–${t.end})</option>`).join('')}</select></div>
      <div class="f"><label>Shift name</label><input class="inp" name="name" value="${esc(d0.name)}" placeholder="e.g. Morning shift" maxlength="60"></div>
      <div class="f"><label>Department</label><select class="inp" name="department_id">${deps.filter(d => can('edit', d.id)).map(d => `<option value="${d.id}" ${d0.department_id === d.id ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}</select></div>
      <div class="f"><label>Date</label><input class="inp" type="date" name="date" value="${d0.date}" required></div>
      <div class="f"><label>Start time</label><input class="inp" type="time" name="start" value="${d0.start}" step="900" required></div>
      <div class="f"><label>End time</label><input class="inp" type="time" name="end" value="${d0.end}" step="900" required><small data-len></small></div>
      <div class="f"><label>Staff required</label><input class="inp" type="number" min="0" max="50" name="required" value="${d0.required == null ? 1 : d0.required}"></div>
      <div class="f"><label>Designation needed</label><select class="inp" name="designation"><option value="">Any designation</option>${E.DESIGNATIONS.map(x => `<option ${d0.designation === x ? 'selected' : ''}>${x}</option>`).join('')}</select></div>
      <div class="f"><label>Location</label><input class="inp" name="location" value="${esc(d0.location || '')}" placeholder="e.g. Emergency, Ward 2, Theatre 1" maxlength="80"></div>
      <div class="f full"><label>Notes</label><textarea class="inp" name="notes" rows="2" maxlength="500" placeholder="Handover notes, special instructions…">${esc(d0.notes || '')}</textarea></div>
    </div>
    ${isNew ? `<div class="fsec">Repeat</div>
      <div class="fgrid"><div class="f"><label>Pattern</label><select class="inp" name="repeat"><option value="">Does not repeat</option><option value="weekly" ${defaults.repeat ? 'selected' : ''}>Weekly on selected days</option></select></div>
      <div class="f" data-rep><label>Every</label><select class="inp" name="every"><option value="1">week</option><option value="2">2 weeks</option><option value="3">3 weeks</option><option value="4">4 weeks</option></select></div>
      <div class="f full" data-rep><label>On</label><div class="wd">${[0, 1, 2, 3, 4, 5, 6].map(i => `<label><input type="checkbox" name="wd" value="${i}" ${i === E.weekday(d0.date) ? 'checked' : ''}>${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][i]}</label>`).join('')}</div></div>
      <div class="f" data-rep><label>Until</label><input class="inp" type="date" name="until" value="${E.addDays(d0.date, 27)}"></div></div>` : ''}
    <div class="fsec">Assigned staff <span class="muted" data-count></span></div>
    <div class="row" style="margin-bottom:8px"><label class="search grow">${icon('search')}<input data-ps placeholder="Search staff…"></label><label class="small muted"><input type="checkbox" data-all ${UI.allDeptsInPicker ? 'checked' : ''}> All departments</label></div>
    <div class="picker" data-picker></div>
    <div data-warn></div>`,
    foot: `${!isNew ? `<button class="btn danger" data-del>${icon('x')}Delete</button><button class="btn" data-dup>${icon('copy')}Duplicate…</button>` : ''}<span class="sp"></span><button class="btn" data-cancel>Cancel</button><button class="btn primary" data-save>${isNew ? 'Create shift' : 'Save changes'}</button>` });
  const el = m.el, f = n => el.querySelector(`[name="${n}"]`);
  const form = () => ({ template_id: f('template_id').value, name: f('name').value.trim(), department_id: f('department_id').value, date: f('date').value, start: f('start').value, end: f('end').value, required: +f('required').value, designation: f('designation').value, location: f('location').value, notes: f('notes').value });
  const lenTxt = () => { const v = form(); if (!E.TIME_RE.test(v.start) || !E.TIME_RE.test(v.end)) return; const h = E.hoursOf(v); el.querySelector('[data-len]').textContent = fmt.hrs(h) + (v.start === v.end ? ' · 24-hour duty' : E.isOvernight(v) ? ' · ends next day' : ''); };
  f('template_id').onchange = () => { const t = tpl(f('template_id').value); if (t) { f('start').value = t.start; f('end').value = t.end; if (!f('name').value || R.state.template.some(x => x.name === f('name').value)) f('name').value = t.name; } lenTxt(); drawPicker(); };
  ['start', 'end', 'date', 'department_id', 'designation'].forEach(n => f(n).addEventListener('change', () => { lenTxt(); drawPicker(); }));
  const rep = f('repeat'); const repSync = () => el.querySelectorAll('[data-rep]').forEach(x => (x.style.display = rep && rep.value ? '' : 'none')); if (rep) { rep.onchange = repSync; repSync(); }
  lenTxt();
  let ps = '';
  el.querySelector('[data-ps]').oninput = e => { ps = e.target.value.toLowerCase(); drawPicker(); };
  el.querySelector('[data-all]').onchange = e => { UI.allDeptsInPicker = e.target.checked; saveUI(); drawPicker(); };
  function drawPicker() {
    const v = form(); if (!E.isValidDate(v.date) || !E.TIME_RE.test(v.start) || !E.TIME_RE.test(v.end)) return;
    const list = R.state.staff.filter(s => (chosen.includes(s.id) || (s.status !== 'Inactive' && (UI.allDeptsInPicker || s.department_id === v.department_id))) && (!ps || s.name.toLowerCase().includes(ps)))
      .sort((a, b) => (chosen.includes(b.id) - chosen.includes(a.id)) || ((v.designation && b.designation === v.designation) - (v.designation && a.designation === v.designation)) || a.name.localeCompare(b.name));
    el.querySelector('[data-picker]').innerHTML = list.map(s => {
      const iss = candidateIssues(s.id, v, raw && raw.id), bad = iss.some(x => x[0] === 'red');
      return `<label class="pk ${bad && !chosen.includes(s.id) ? 'dis' : ''}"><input type="checkbox" value="${s.id}" ${chosen.includes(s.id) ? 'checked' : ''}><span class="av" style="background:${dept(s.department_id).color}">${esc(initials(s.name))}</span><span><b>${esc(s.name)}</b><br><span class="muted small">${esc(s.designation)} · ${esc(dept(s.department_id).code)}</span></span><span class="w">${iss.map(x => `<span class="tag ${x[0]}">${esc(x[1])}</span>`).join('')}</span></label>`;
    }).join('') || '<div class="empty">No staff found.</div>';
    el.querySelector('[data-count]').textContent = '· ' + chosen.length + ' of ' + (v.required || 0);
  }
  el.querySelector('[data-picker]').onchange = e => { const c = e.target; if (c.type !== 'checkbox') return; chosen = c.checked ? chosen.concat(c.value) : chosen.filter(x => x !== c.value); drawPicker(); };
  drawPicker();
  el.querySelector('[data-cancel]').onclick = m.close;
  el.querySelector('[data-save]').onclick = async () => {
    const v = form(); v.staff_ids = chosen;
    if (!v.name) v.name = (tpl(v.template_id) || {}).name || 'Custom shift';
    let res;
    if (isNew && rep && rep.value) {
      const weekdays = Array.from(el.querySelectorAll('[name=wd]:checked')).map(x => +x.value);
      res = await act('shift.recur', { shift: v, weekdays, every_weeks: +f('every').value, until: f('until').value });
    } else res = await act('shift.save', Object.assign(v, raw ? { id: raw.id } : {}));
    if (res) m.close();
  };
  const del = el.querySelector('[data-del]');
  if (del) del.onclick = async () => {
    let seriesToo = false;
    if (series) {
      const choice = await new Promise(res => { const c = modal({ title: 'Delete recurring shift', body: '<p>This shift is part of a recurring pattern.</p>', foot: '<span class="sp"></span><button class="btn" data-sone>This shift only</button><button class="btn danger" data-sall>This and following</button>', onClose: () => res(null) }); c.el.querySelector('[data-sone]').onclick = () => { res('one'); c.close(); }; c.el.querySelector('[data-sall]').onclick = () => { res('all'); c.close(); }; });
      if (!choice) return; seriesToo = choice === 'all';
    } else if (!await confirmBox({ title: 'Delete shift?', body: `<p>${esc(raw.name)} on ${fmt.short(raw.date)}${raw.published ? ' will be removed from the published roster when you next publish.' : ' will be deleted.'}</p>`, ok: 'Delete', danger: true })) return;
    if (await act('shift.delete', { id: raw.id, series: seriesToo })) m.close();
  };
  const dup = el.querySelector('[data-dup]');
  if (dup) dup.onclick = () => openDuplicate(raw, m);
}

function openDuplicate(raw, parent) {
  const d = modal({ title: 'Duplicate shift', body: `<p class="muted" style="margin-bottom:10px">Copy <b>${esc(raw.name)}</b> (${raw.start}–${raw.end}) to other dates.</p>
    <div class="fgrid"><div class="f"><label>From</label><input class="inp" type="date" data-f value="${E.addDays(raw.date, 1)}"></div><div class="f"><label>To</label><input class="inp" type="date" data-t value="${E.addDays(raw.date, 6)}"></div>
    <div class="f full"><label>On</label><div class="wd">${[0, 1, 2, 3, 4, 5, 6].map(i => `<label><input type="checkbox" value="${i}" checked>${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][i]}</label>`).join('')}</div></div>
    <label class="f full small"><input type="checkbox" data-ws checked> Copy assigned staff (skipped where they have a conflict)</label></div>`,
    foot: '<span class="sp"></span><button class="btn" data-c>Cancel</button><button class="btn primary" data-ok>Duplicate</button>' });
  d.el.querySelector('[data-c]').onclick = d.close;
  d.el.querySelector('[data-ok]').onclick = async () => {
    const a = d.el.querySelector('[data-f]').value, b = d.el.querySelector('[data-t]').value, days = Array.from(d.el.querySelectorAll('.wd input:checked')).map(x => +x.value);
    const dates = []; for (let n = E.dayNum(a); n <= E.dayNum(b) && dates.length < 62; n++) if (days.includes(E.weekday(E.dayStr(n)))) dates.push(E.dayStr(n));
    if (await act('shift.duplicate', { id: raw.id, dates, with_staff: d.el.querySelector('[data-ws]').checked })) { d.close(); parent.close(); }
  };
}

/* ------------------------------------------------------------------ */
/* publish, copy, generate, bulk                                       */
/* ------------------------------------------------------------------ */
function openPublish(from, to) {
  if (UI.view === 'day') { const ws = E.weekStartOf(from, settings().week_start); from = ws; to = E.addDays(ws, 6); }
  const body = () => {
    const a = $('[data-pf]', m.el).value, b = $('[data-pt]', m.el).value, dep = $('[data-pd]', m.el).value;
    const list = R.state.shift.filter(s => s.date >= a && s.date <= b && (!dep || s.department_id === dep) && can('publish', s.department_id));
    const dirty = list.filter(s => s.dirty), prop = R.state.assignment.filter(x => x.proposed && list.some(s => s.id === x.shift_id)).length;
    const an = E.analyze(R.state, a, b);
    const un = an.issues.filter(i => (i.type === 'unassigned' || i.type === 'shortage') && (!dep || i.department_id === dep)).length;
    const other = an.issues.filter(i => i.staff_id && (!dep || (staffById(i.staff_id) || {}).department_id === dep)).length;
    $('[data-sum]', m.el).innerHTML = `<div class="kpis" style="grid-template-columns:repeat(4,1fr);margin:12px 0">
      <div class="kpi"><span>Changes to publish</span><b>${dirty.length}</b><small>${dirty.filter(s => !s.published).length} new · ${dirty.filter(s => s.published && !s.deleted).length} edited · ${dirty.filter(s => s.deleted).length} removed</small></div>
      <div class="kpi ${prop ? 'bad' : ''}"><span>Proposals to review</span><b>${prop}</b><small>${prop ? 'Approve or discard first' : 'None'}</small></div>
      <div class="kpi ${un ? 'warn' : ''}"><span>Unfilled shifts</span><b>${un}</b><small>Will publish as unfilled</small></div>
      <div class="kpi ${other ? 'warn' : ''}"><span>Conflicts</span><b>${other}</b><small>Rest, nights, leave, hours</small></div></div>
      ${prop ? '<div class="errbox">Auto-generated proposals in this period must be approved or discarded before publishing.</div>' : ''}`;
    $('[data-go]', m.el).disabled = !dirty.length || !!prop;
  };
  const m = modal({ title: 'Publish roster', size: 'wide', body: `<p class="muted">Publishing makes this period's roster visible to staff, notifies everyone whose duties changed, and records a new version.</p>
    <div class="fgrid" style="margin-top:12px"><div class="f"><label>From</label><input class="inp" type="date" data-pf value="${from}"></div><div class="f"><label>To</label><input class="inp" type="date" data-pt value="${to}"></div>
    <div class="f"><label>Department</label><select class="inp" data-pd><option value="">All departments I manage</option>${R.state.department.filter(d => can('publish', d.id)).map(d => `<option value="${d.id}" ${UI.dept === d.id ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}</select></div>
    <div class="f"><label>Note for this version</label><input class="inp" data-pn maxlength="300" placeholder="e.g. Week 42 roster approved by HOD"></div></div>
    <div data-sum></div>`, foot: '<span class="sp"></span><button class="btn" data-c>Cancel</button><button class="btn accent" data-go>' + icon('send') + 'Publish now</button>' });
  ['[data-pf]', '[data-pt]', '[data-pd]'].forEach(s => $(s, m.el).onchange = body);
  body();
  $('[data-c]', m.el).onclick = m.close;
  $('[data-go]', m.el).onclick = async () => {
    const r = await act('roster.publish', { start: $('[data-pf]', m.el).value, end: $('[data-pt]', m.el).value, department_id: $('[data-pd]', m.el).value || undefined, note: $('[data-pn]', m.el).value });
    if (r) m.close();
  };
}
async function openCopyWeek() {
  const ws = E.weekStartOf(UI.date, settings().week_start);
  const m = modal({ title: 'Copy previous week', body: `<p>Copy all shifts and assignments from the week of <b>${fmt.date(E.addDays(ws, -7))}</b> into the week of <b>${fmt.date(ws)}</b> as a draft.</p>
    <div class="f" style="margin-top:12px"><label>Department</label><select class="inp" data-d>${UI.dept ? '' : '<option value="">All departments I manage</option>'}${R.state.department.filter(d => can('edit', d.id)).map(d => `<option value="${d.id}" ${UI.dept === d.id ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}</select><small>Staff who now have leave or conflicts are skipped and listed.</small></div>`,
    foot: '<span class="sp"></span><button class="btn" data-c>Cancel</button><button class="btn primary" data-ok>Copy week</button>' });
  $('[data-c]', m.el).onclick = m.close;
  $('[data-ok]', m.el).onclick = async () => { const r = await act('roster.copyWeek', { to_week: ws, department_id: $('[data-d]', m.el).value || undefined }); if (r) m.close(); };
}
function openGenerate(from, to) {
  const m = modal({ title: 'Auto-generate roster draft', body: `<p>Fills unassigned positions using staff availability, approved leave, required coverage, minimum rest (${settings().min_rest_hours} h), consecutive-night and weekly-hour limits, and an even workload.</p>
    <div class="banner info" style="margin:12px 0">Generated assignments appear as <b>dashed</b> avatars and stay as proposals until an authorised administrator approves them. Nothing is published automatically.</div>
    <div class="fgrid"><div class="f"><label>From</label><input class="inp" type="date" data-f value="${from}"></div><div class="f"><label>To</label><input class="inp" type="date" data-t value="${to}"></div>
    <div class="f full"><label>Department</label><select class="inp" data-d><option value="">All departments I manage</option>${R.state.department.filter(d => can('edit', d.id)).map(d => `<option value="${d.id}" ${UI.dept === d.id ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}</select></div></div>`,
    foot: '<span class="sp"></span><button class="btn" data-c>Cancel</button><button class="btn primary" data-ok>' + icon('magic') + 'Generate proposals</button>' });
  $('[data-c]', m.el).onclick = m.close;
  $('[data-ok]', m.el).onclick = async () => { const r = await act('roster.generate', { start: $('[data-f]', m.el).value, end: $('[data-t]', m.el).value, department_id: $('[data-d]', m.el).value || undefined }); if (r) { m.close(); UI.show = 'draft'; saveUI(); } };
}
function openBulk(from, to) {
  const shifts = visibleShifts(from, to, { mode: 'draft' }).filter(s => !s._raw.deleted && can('edit', s.department_id) && s.date >= from);
  const staff = R.state.staff.filter(s => s.status !== 'Inactive' && (!UI.dept || s.department_id === UI.dept));
  const m = modal({ title: 'Bulk assign', size: 'xwide', body: `<div class="grid2">
    <div><div class="row" style="margin-bottom:8px"><b class="grow">Shifts (${shifts.length})</b><button class="btn sm" data-short>Select unfilled</button><button class="btn sm" data-none>Clear</button></div>
      <div class="picker" style="max-height:52vh" data-sh>${shifts.map(s => `<label class="pk"><input type="checkbox" value="${s.id}"><span class="dot" style="background:${colorOf(s)}"></span><span><b>${esc(s.name)}</b><br><span class="muted small">${fmt.short(s.date)} ${s.start}–${s.end} · ${esc(dept(s.department_id).code)}</span></span><span class="w"><span class="tag ${coverage(s).short ? 'red' : 'green'}">${coverage(s).got}/${coverage(s).req}</span></span></label>`).join('') || '<div class="empty">No editable shifts in view.</div>'}</div></div>
    <div><div class="row" style="margin-bottom:8px"><b class="grow">Staff (${staff.length})</b></div>
      <div class="picker" style="max-height:52vh" data-st>${staff.map(s => `<label class="pk"><input type="checkbox" value="${s.id}"><span class="av">${esc(initials(s.name))}</span><span><b>${esc(s.name)}</b><br><span class="muted small">${esc(s.designation)}</span></span></label>`).join('')}</div></div></div>
    <p class="muted small" style="margin-top:10px">Each selected person is added to each selected shift. Overlaps, leave and inactive staff are skipped automatically and reported.</p>`,
    foot: '<span class="sp"></span><button class="btn" data-c>Cancel</button><button class="btn primary" data-ok>Assign selected</button>' });
  $('[data-short]', m.el).onclick = () => $$('[data-sh] input', m.el).forEach(i => { const s = shifts.find(x => x.id === i.value); i.checked = coverage(s).short > 0; });
  $('[data-none]', m.el).onclick = () => $$('[data-sh] input', m.el).forEach(i => (i.checked = false));
  $('[data-c]', m.el).onclick = m.close;
  $('[data-ok]', m.el).onclick = async () => {
    const shift_ids = $$('[data-sh] input:checked', m.el).map(i => i.value), staff_ids = $$('[data-st] input:checked', m.el).map(i => i.value);
    if (!shift_ids.length || !staff_ids.length) return toast('Select at least one shift and one person.', 'err');
    if (await act('assign.bulk', { shift_ids, staff_ids })) m.close();
  };
}

/* ------------------------------------------------------------------ */
/* exports                                                             */
/* ------------------------------------------------------------------ */
function rosterRows(from, to) {
  const list = visibleShifts(from, to).filter(s => s.date >= from && s.date <= to);
  const head = ['Date', 'Day', 'Department', 'Shift', 'Start', 'End', 'Hours', 'Location', 'Required', 'Assigned', 'Staff', 'Status'];
  const body = list.map(s => [s.date, fmt.dow(s.date), dept(s.department_id).name, s.name, s.start, s.end + (E.isOvernight(s) ? ' (+1)' : ''), E.hoursOf(s), s.location || '', s.required, s.staff.length,
    s.staff.map(id => { const p = staffById(id); return p ? p.name + ' (' + p.designation + ')' : ''; }).join('; ') || 'UNASSIGNED',
    showMode() === 'published' ? 'Published' : s._raw.deleted ? 'Deleted (pending)' : s._raw.dirty ? (s._raw.published ? 'Changed (draft)' : 'Draft') : 'Published']);
  return { head, body };
}
function exportRoster(kind, from, to) {
  const { head, body } = rosterRows(from, to);
  const depName = UI.dept ? dept(UI.dept).name : 'All departments';
  const meta = { org: settings().org_name, title: 'Duty roster — ' + depName, period: fmt.range(from, to), approval: approvalLine(from, to, UI.dept) + (showMode() === 'draft' ? ' · exported from DRAFT view' : '') };
  const base = 'asmh-roster-' + (UI.dept ? dept(UI.dept).code : 'all') + '-' + from;
  if (kind === 'csv') return download(base + '.csv', toCSV([head, ...body]), 'text/csv');
  if (kind === 'xlsx') return exportXLSX(base + '.xlsx', [{ name: 'Roster', rows: [head, ...body] }], meta).catch(e => toast(e.message, 'err'));
  if (kind === 'pdf') return exportPDF(base + '.pdf', meta, [{ head, body: body.map(r => r.map(String)) }]).catch(e => toast(e.message, 'err'));
  printDoc(meta, [{ head, body }]);
}
