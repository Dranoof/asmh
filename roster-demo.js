/* =====================================================================
 * ASMH Duty Roster — DEMO DATA (fictional people, generated locally).
 * Used only when no roster server is connected (e.g. on github.io).
 * Built through the real engine actions so it behaves like live data.
 * ===================================================================== */
import * as E from './roster-engine.js';

const FIRST = ['Aishath', 'Mariyam', 'Fathimath', 'Hawwa', 'Aminath', 'Ahmed', 'Mohamed', 'Ibrahim', 'Hassan', 'Ali', 'Hussain', 'Ismail', 'Zeena', 'Shifa', 'Nashid', 'Riyaz', 'Priya', 'Anil', 'Sunita', 'Ramesh', 'Farah', 'Imran', 'Nadia', 'Kamal', 'Leena', 'Rohan', 'Thilini', 'Kasun', 'Meera', 'Sajid'];
const LAST = ['Rasheed', 'Naseer', 'Shareef', 'Waheed', 'Hameed', 'Saeed', 'Latheef', 'Manik', 'Zahir', 'Moosa', 'Sharma', 'Perera', 'Khan', 'Fernando', 'Nair', 'Hossain', 'Thapa', 'Silva', 'Rao', 'Ahmed'];

function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

/** department plan: [dept id, [[designation, count], ...], [[template id, required per day, designation?], ...]] */
const PLAN = [
  ['dep_ed', [['Consultant', 3], ['Medical Officer', 7]], [['tpl_morning', 2, 'Medical Officer'], ['tpl_evening', 2, 'Medical Officer'], ['tpl_night', 1, 'Medical Officer'], ['tpl_oncall', 1, 'Consultant']]],
  ['dep_med', [['Specialist', 4], ['Medical Officer', 3]], [['tpl_day', 1, 'Specialist'], ['tpl_oncall', 1, 'Specialist'], ['tpl_morning', 1, 'Medical Officer'], ['tpl_night', 1, 'Medical Officer']]],
  ['dep_surg', [['Specialist', 4], ['Medical Officer', 4]], [['tpl_day', 1, 'Specialist'], ['tpl_oncall', 1, 'Specialist'], ['tpl_h24', 1, 'Medical Officer']]],
  ['dep_paed', [['Specialist', 4], ['Medical Officer', 2]], [['tpl_day', 1, 'Specialist'], ['tpl_oncall', 1, 'Specialist']]],
  ['dep_obg', [['Specialist', 3], ['Medical Officer', 2]], [['tpl_day', 1, 'Specialist'], ['tpl_oncall', 1, 'Specialist']]],
  ['dep_anaes', [['Specialist', 3]], [['tpl_oncall', 1, 'Specialist']]],
  ['dep_rad', [['Specialist', 1]], [['tpl_day', 1, 'Specialist']]]
];

export const DEMO_ADMIN = { email: 'demo.admin@asmh.demo', role: 'admin', staff_id: null, dept_scope: null, name: 'Demo Administrator' };

export function buildDemo(now = Date.now()) {
  const S = E.seedConfig(E.emptyState(), now);
  const rand = rng(42);
  const pick = a => a[Math.floor(rand() * a.length)];
  const A = DEMO_ADMIN;
  const act = (a, p) => { try { return E.apply(S, A, a, p, now); } catch (e) { return null; } };
  const used = new Set();
  const name = (des) => { let n; do { n = pick(FIRST) + ' ' + pick(LAST); } while (used.has(n)); used.add(n); return (['Consultant', 'Specialist', 'Medical Officer'].includes(des) ? 'Dr. ' : '') + n; };

  let emp = 1001;
  for (const [dep, roles] of PLAN) for (const [des, n] of roles) for (let i = 0; i < n; i++) {
    const nm = name(des), id = 'ASMH-' + emp++;
    act('staff.save', { name: nm, designation: des, department_id: dep, emp_id: id, email: nm.replace(/^Dr\. /, '').toLowerCase().replace(/\s+/g, '.') + '@asmh.demo', phone: '+960 7' + Math.floor(100000 + rand() * 899999), status: 'Active' });
  }
  // a few illustrative statuses
  const someone = S.staff[5]; act('staff.save', Object.assign({}, someone, { availability: 'No night duties (approved medical note)' }));

  // staffing requirements
  for (const [dep, , slots] of PLAN) for (const [tpl, req] of slots) act('requirement.save', { department_id: dep, template_id: tpl, required: req });

  // shifts for last week → three weeks ahead
  const today = E.todayStr(now), ws = E.weekStartOf(today, 0);
  const start = E.addDays(ws, -7), end = E.addDays(ws, 27);
  const tplName = id => S.template.find(t => t.id === id);
  for (const [dep, , slots] of PLAN) {
    for (const [tpl, req, des] of slots) {
      const t = tplName(tpl);
      for (let d = E.dayNum(start); d <= E.dayNum(end); d++) {
        const date = E.dayStr(d);
        if ((tpl === 'tpl_day') && E.isWeekend(date)) continue;               // day duty: working days only
        act('shift.save', { date, start: t.start, end: t.end, department_id: dep, template_id: tpl, required: req, designation: des, name: t.name + (des && !['Consultant', 'Specialist'].includes(des) ? ' · ' + (des === 'Medical Officer' ? 'MO' : des) : ''), location: dep === 'dep_ed' ? 'Emergency' : '' });
      }
    }
  }
  // fill with the engine's generator, then leave gaps in later weeks
  act('roster.generate', { start, end: E.addDays(ws, 13) });
  act('roster.proposals', { decision: 'approve', start, end: E.addDays(ws, 13) });
  act('roster.generate', { start: E.addDays(ws, 14), end });
  // remove some proposals in week 3–4 so the demo has unassigned shifts to work on
  S.assignment.filter(a => a.proposed).forEach((a, i) => { if (i % 3 === 0) E.apply(S, A, 'assign.remove', { shift_id: a.shift_id, staff_id: a.staff_id }, now); });
  act('roster.proposals', { decision: 'approve', start: E.addDays(ws, 14), end });
  // publish last week, this week and next week; weeks 3-4 stay drafts
  act('roster.publish', { start, end: E.addDays(ws, -1), note: 'Demo: previous week' });
  act('roster.publish', { start: ws, end: E.addDays(ws, 13), note: 'Demo: current and next week approved' });
  // a couple of draft edits on this week, and two unassigned slots tomorrow
  const tomorrow = E.addDays(today, 1);
  const edShift = S.shift.find(s => s.department_id === 'dep_ed' && s.date === tomorrow && s.template_id === 'tpl_evening');
  if (edShift) { const ids = E.staffIdsOf(S, edShift); if (ids[0]) act('assign.remove', { shift_id: edShift.id, staff_id: ids[0] }); }
  act('shift.save', { date: tomorrow, start: '10:00', end: '18:00', department_id: 'dep_surg', name: 'Elective list (extra) · MO', required: 1, designation: 'Medical Officer', location: 'Theatre 2', notes: 'Additional orthopaedic list' });

  // leave and exchange requests
  const mo = S.staff.filter(s => s.designation === 'Medical Officer' && s.department_id === 'dep_ed');
  const asStaff = st => ({ email: st.email, role: 'staff', staff_id: st.id, name: st.name });
  try { E.apply(S, asStaff(mo[3]), 'leave.create', { type: 'Annual leave', start: E.addDays(ws, 16), end: E.addDays(ws, 20), remarks: 'Family trip to Malé' }, now); } catch (e) {}
  try { E.apply(S, asStaff(mo[1]), 'leave.create', { type: 'Study leave', start: E.addDays(ws, 23), end: E.addDays(ws, 24), remarks: 'ACLS course' }, now); } catch (e) {}
  try { const l = E.apply(S, asStaff(mo[2]), 'leave.create', { type: 'Sick leave', start: E.addDays(today, -3), end: E.addDays(today, -2), remarks: '' }, now).result; act('leave.decide', { id: l.id, decision: 'approve' }); } catch (e) {}
  // exchange request between two ED MOs on a published shift later this week
  for (const s of S.shift) {
    if (!s.published || s.department_id !== 'dep_ed' || s.date <= tomorrow || s.date > E.addDays(ws, 13)) continue;
    const from = s.published.staff_ids.find(id => mo.some(m => m.id === id));
    const to = from && mo.find(m => m.id !== from && !s.published.staff_ids.includes(m.id) && !E.checkAssign(S, s.id, m.id, 'published').some(x => x.hard));
    if (from && to) {
      try {
        const sw = E.apply(S, asStaff(S.staff.find(x => x.id === from)), 'swap.create', { shift_id: s.id, to_staff_id: to.id, reason: 'Personal commitment' }, now).result;
        E.apply(S, asStaff(to), 'swap.respond', { id: sw.id, accept: true }, now);
        break;
      } catch (e) {}
    }
  }
  // demo users (roles) — for the role switcher
  S.user.push({ id: A.email, email: A.email, role: 'admin', staff_id: null, dept_scope: null, active: true, demo: true });
  const edCons = S.staff.find(s => s.department_id === 'dep_ed' && s.designation === 'Consultant');
  S.user.push({ id: edCons.email, email: edCons.email, role: 'roster_admin', staff_id: edCons.id, dept_scope: ['dep_ed'], active: true, demo: true });
  const paedSp = S.staff.find(s => s.department_id === 'dep_paed' && s.designation === 'Specialist');
  S.user.push({ id: paedSp.email, email: paedSp.email, role: 'supervisor', staff_id: paedSp.id, dept_scope: ['dep_paed'], active: true, demo: true });
  S.demo = true;
  return S;
}

/** demo personas offered in the "View as" switcher */
export function demoPersonas(S) {
  const u = S.user.filter(x => x.demo);
  const staffMo = S.staff.find(s => s.designation === 'Medical Officer' && s.department_id === 'dep_ed');
  const list = u.map(x => ({ key: x.email, label: (E.ROLE_LABEL[x.role]) + (x.staff_id ? ' — ' + (S.staff.find(s => s.id === x.staff_id) || {}).name : ''), actor: { email: x.email, role: x.role, staff_id: x.staff_id, dept_scope: x.dept_scope, name: x.staff_id ? (S.staff.find(s => s.id === x.staff_id) || {}).name : 'Demo Administrator' } }));
  if (staffMo) list.push({ key: staffMo.email, label: 'Staff — ' + staffMo.name, actor: { email: staffMo.email, role: 'staff', staff_id: staffMo.id, dept_scope: null, name: staffMo.name } });
  return list;
}
