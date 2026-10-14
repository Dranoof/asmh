/* =====================================================================
 * ASMH Duty Roster — SAMPLE DATA (generated locally in the browser).
 * Used only when no roster server is connected (e.g. on github.io).
 * The week of 11–17 Oct 2026 is the ASMH Medical Officers duty roster
 * exactly as issued; other weeks repeat that pattern with the doctors
 * rotated. Built through the real engine actions so it behaves like
 * live data.
 * ===================================================================== */
import * as E from './roster-engine.js';

/** the issued sheet's week (Sunday) */
export const SAMPLE_WEEK = '2026-10-11';

/** departments used by the MO roster (service areas on the sheet) */
const DEPTS = [
  ['MO', 'Medical Officers', '#05557a'],
  ['ER', 'Emergency (ER)', '#e11d48'],
  ['WARD', 'Ward', '#7c3aed'],
  ['OPD', 'General OPD', '#0d9488'],
  ['PAED', 'Paediatrics', '#0891b2'],
  ['SURG', 'General Surgery', '#9333ea'],
  ['OBG', 'Obstetrics & Gynaecology', '#db2777'],
  ['IM', 'Internal Medicine', '#2563eb']
];

/** one shift template per sheet row: [key, name, start, end, kind, department code] */
export const MO_TEMPLATES = [
  ['n_er', 'Night · ER', '00:00', '08:00', 'night', 'ER'],
  ['n_ward', 'Night · Ward', '00:00', '08:00', 'night', 'WARD'],
  ['m_opd', 'Morning · General OPD', '08:00', '16:00', 'morning', 'OPD'],
  ['m_er_tl', 'Morning · ER (team leader)', '08:00', '16:00', 'morning', 'ER'],
  ['m_er', 'Morning · ER', '08:00', '16:00', 'morning', 'ER'],
  ['m_paed', 'Morning · Paediatrics', '08:00', '16:00', 'morning', 'PAED'],
  ['m_surg', 'Morning · G. Surgery', '08:00', '16:00', 'morning', 'SURG'],
  ['m_obg', 'Morning · OBG', '08:00', '16:00', 'morning', 'OBG'],
  ['m_surgobg', 'Morning · G. Surgery + OBG', '08:00', '16:00', 'morning', 'SURG'],
  ['m_im', 'Morning · IM', '08:00', '16:00', 'morning', 'IM'],
  ['admin', 'DIC-Admin / Relief MO', '08:00', '16:00', 'day', 'MO'],
  ['relief', 'Relief MO (1200–2000)', '12:00', '20:00', 'day', 'MO'],
  ['e_opd1', 'Evening · General OPD 1', '16:00', '00:00', 'evening', 'OPD'],
  ['e_opd2', 'Evening · General OPD 2', '16:00', '00:00', 'evening', 'OPD'],
  ['e_opd', 'Evening · General OPD 1 + 2', '16:00', '00:00', 'evening', 'OPD'],
  ['e_er_tl', 'Evening · ER (team leader)', '16:00', '00:00', 'evening', 'ER'],
  ['e_er', 'Evening · ER', '16:00', '00:00', 'evening', 'ER'],
  ['e_paed', 'Evening · Paediatrics', '16:00', '00:00', 'evening', 'PAED'],
  ['e_surgobg', 'Evening · G. Surgery / OBG', '16:00', '00:00', 'evening', 'SURG'],
  ['e_paedsurg', 'Evening · Paeds + G. Surgery / OBG', '16:00', '00:00', 'evening', 'PAED'],
  ['e_im', 'Evening · IM', '16:00', '00:00', 'evening', 'IM']
];

/** Medical Officers on the sheet (short names as written on the roster) */
const MOS = ['Amran', 'Lama', 'Nahaa', 'Hay Mar', 'Myo', 'Shamsu', 'Wai Mar', 'Win', 'Saad', 'Anoof', 'Kay', 'Thet', 'Manik', 'Zimaamu', 'Nafiz', 'Anaan', 'Hnin', 'Maha', 'Afa'];
/** MOs away for the sample week: [name, leave type, remarks] */
const AWAY = [['Maryam', 'Annual leave', 'AL'], ['Rebika', 'Official duty', 'Deputation to Gadhdhoo'], ['Mehtab', 'Official duty', 'Deputation to Faresmathoda']];

/**
 * The issued roster, 11–17 Oct 2026 (Sun → Sat).
 * Each entry is a list of doctors, null = no duty for that row that day.
 * Merged cells on the sheet use the combined templates (m_surgobg, e_opd, e_paedsurg).
 */
const _ = null;
const WEEK = {
  n_er:      [['Amran'], ['Lama'], ['Nahaa'], ['Hay Mar'], ['Myo'], ['Shamsu'], ['Wai Mar']],
  n_ward:    [['Lama'], ['Nahaa'], ['Hay Mar'], ['Myo'], ['Shamsu'], ['Wai Mar'], ['Win']],
  m_opd:     [['Win'], ['Myo'], ['Saad'], ['Anoof'], ['Kay'], ['Thet'], ['Amran']],
  m_er_tl:   [['Hay Mar'], ['Hnin'], ['Nafiz', 'Anaan'], ['Maha'], ['Nahaa'], ['Manik'], ['Zimaamu']],
  m_er:      [['Thet'], ['Saad'], ['Anoof'], ['Wai Mar'], ['Amran'], ['Kay'], ['Thet']],
  m_paed:    [['Hnin'], ['Thet'], ['Shamsu'], ['Shamsu'], ['Anoof'], ['Amran'], ['Hnin']],
  m_surg:    [_, ['Anaan'], _, _, ['Manik'], _, ['Manik']],
  m_obg:     [_, ['Hay Mar'], _, _, ['Maha'], _, ['Lama']],
  m_surgobg: [['Zimaamu'], _, ['Maha'], ['Anaan'], _, ['Nahaa'], _],
  m_im:      [['Kay'], ['Win'], ['Myo'], ['Nafiz'], ['Wai Mar'], ['Win'], ['Kay']],
  admin:     [['Afa'], ['Afa'], ['Afa'], ['Afa'], ['Afa'], _, _],
  relief:    [['Saad'], _, _, ['Amran'], _, ['Lama'], ['Nafiz']],
  e_opd:     [['Manik'], ['Wai Mar'], ['Thet'], _, ['Nafiz'], _, _],
  e_opd1:    [_, _, _, ['Lama'], _, ['Hnin'], ['Nahaa']],
  e_opd2:    [_, _, _, ['Saad'], _, ['Saad'], ['Maha']],
  e_er_tl:   [['Nafiz'], ['Manik'], ['Amran'], ['Thet'], ['Zimaamu'], ['Anoof'], ['Anaan']],
  e_er:      [['Wai Mar'], ['Shamsu'], ['Kay'], ['Win'], ['Hnin'], ['Hay Mar'], ['Myo']],
  e_paedsurg:[['Shamsu'], ['Zimaamu'], ['Manik'], ['Zimaamu'], ['Anaan'], ['Maha'], ['Hay Mar']],
  e_im:      [['Maha'], ['Kay'], ['Win'], ['Hnin'], ['Lama'], ['Nafiz'], ['Anoof']]
};
/** notes written in cells on the sheet: [template key, day index, note] */
const NOTES = [['m_er', 2, 'Home Visit']];

export const DEMO_ADMIN = { email: 'demo.admin@asmh.demo', role: 'admin', staff_id: null, dept_scope: null, name: 'Demo Administrator' };

const nm = n => 'Dr ' + n;
const mail = n => n.toLowerCase().replace(/\s+/g, '.') + '@asmh.demo';

export function buildDemo(now = Date.now()) {
  const S = E.seedConfig(E.emptyState(), now);
  const A = DEMO_ADMIN;
  const act = (a, p) => E.apply(S, A, a, p, now).result;
  const soft = (a, p) => { try { return E.apply(S, A, a, p, now).result; } catch (e) { return null; } };

  // replace default departments/templates with the MO roster structure
  S.settings[0] = Object.assign({}, S.settings[0], { min_rest_hours: 8 });   // as practised on the issued MO roster
  S.department = DEPTS.map(([code, name, color], i) => ({ id: 'dep_' + code.toLowerCase(), code, name, color, active: true, sort: i, created_at: now }));
  S.template = MO_TEMPLATES.map(([key, name, start, end, kind], i) => ({ id: 'tpl_' + key, name, start, end, kind, color: E.SHIFT_KINDS[kind].color, active: true, sort: i, rest_exempt: false }));
  const depOf = Object.fromEntries(MO_TEMPLATES.map(r => [r[0], 'dep_' + r[5].toLowerCase()]));
  const tplOf = Object.fromEntries(MO_TEMPLATES.map(r => [r[0], r]));

  // staff
  let emp = 2001;
  const id = {};
  for (const n of MOS.concat(AWAY.map(a => a[0]))) {
    const r = act('staff.save', { name: nm(n), designation: 'Medical Officer', department_id: 'dep_mo', emp_id: 'ASMH-' + emp++, email: mail(n), phone: '', status: 'Active' });
    id[n] = r.id;
  }

  // weeks: one before the sheet, the sheet, and following weeks up to 3 weeks past today
  const today = E.todayStr(now), curWs = E.weekStartOf(today, 0);
  const lastWeek = Math.min(12, Math.max(3, Math.round((E.dayNum(curWs) - E.dayNum(SAMPLE_WEEK)) / 7) + 3));
  const draftFrom = Math.max(2, Math.round((E.dayNum(curWs) - E.dayNum(SAMPLE_WEEK)) / 7) + 2);   // weeks from here stay drafts
  const N = MOS.length;
  // duty spans per doctor in the issued week (minutes from Sunday 00:00), for rotation checks
  const spans = {};
  for (const [key, days] of Object.entries(WEEK)) days.forEach((docs, d) => (docs || []).forEach(n => {
    const t = tplOf[key], s = d * 1440 + E.toMin(t[2]); let e = d * 1440 + E.toMin(t[3]); if (e <= s) e += 1440;
    (spans[n] = spans[n] || []).push({ s, e, night: t[4] === 'night' });
  }));
  // how badly two consecutive weeks fit together for a doctor rotation (rest < 8 h, overlaps, >3 nights in a row)
  const clash = (rotA, rotB) => {
    let bad = 0;
    for (const n of MOS) {
      const a = spans[MOS[((MOS.indexOf(n) - rotA) % N + N) % N]] || [], b = spans[MOS[((MOS.indexOf(n) - rotB) % N + N) % N]] || [];
      const lastA = Math.max(-1e9, ...a.map(x => x.e)) - 7 * 1440, firstB = Math.min(1e9, ...b.map(x => x.s));
      if (firstB - lastA < 8 * 60) bad++;
      const nA = a.filter(x => x.night && x.s >= 4 * 1440).length, nB = b.filter(x => x.night && x.s < 3 * 1440).length;
      if (nA && nB && nA + nB > 3) bad++;
    }
    return bad;
  };
  const rots = { 0: 0 };
  for (let k = 1; k <= lastWeek; k++) { let best = 1, bv = 1e9; for (let r = 1; r < N; r++) { if (r === rots[k - 1]) continue; const v = clash(rots[k - 1], r); if (v < bv) { bv = v; best = r; } } rots[k] = best; }
  { let best = 1, bv = 1e9; for (let r = 1; r < N; r++) { const v = clash(r, 0); if (v < bv) { bv = v; best = r; } } rots[-1] = best; }
  for (let k = -1; k <= lastWeek; k++) {
    const ws = E.addDays(SAMPLE_WEEK, 7 * k);
    // rotate doctors for weeks other than the issued sheet (k = 0 is exact)
    const rot = rots[k];
    const who = n => MOS[(MOS.indexOf(n) + rot) % N];
    for (const [key, days] of Object.entries(WEEK)) {
      const t = tplOf[key];
      days.forEach((docs, d) => {
        if (!docs) return;
        const date = E.addDays(ws, d);
        const note = k === 0 ? (NOTES.find(x => x[0] === key && x[1] === d) || [])[2] : '';
        const staff = docs.map(who);
        const sh = act('shift.save', { date, start: t[2], end: t[3], department_id: depOf[key], template_id: 'tpl_' + key, name: t[1], required: docs.length, designation: 'Medical Officer', notes: note || '' });
        // later draft weeks: leave a few rows open so the builder has gaps to fill
        const gap = k >= draftFrom && (d * 7 + key.length) % 11 === 0;
        if (!gap) for (const s of staff) act('assign.add', { shift_id: sh.id, staff_id: id[s], force: true });
      });
    }
  }
  const firstDay = E.addDays(SAMPLE_WEEK, -7);
  const pubEnd = E.addDays(SAMPLE_WEEK, 7 * draftFrom - 1);
  soft('roster.publish', { start: firstDay, end: E.addDays(SAMPLE_WEEK, -1), note: 'Previous week' });
  soft('roster.publish', { start: SAMPLE_WEEK, end: E.addDays(SAMPLE_WEEK, 6), note: 'MO duty roster 11–17 Oct 2026 · prepared by Dr Afa' });
  if (pubEnd > E.addDays(SAMPLE_WEEK, 6)) soft('roster.publish', { start: E.addDays(SAMPLE_WEEK, 7), end: pubEnd, note: 'Following week(s)' });

  // leave / deputation shown on the sheet
  const asStaff = n => ({ email: mail(n), role: 'staff', staff_id: id[n], name: nm(n) });
  for (const [n, type, remarks] of AWAY) {
    try { const l = E.apply(S, asStaff(n), 'leave.create', { type, start: SAMPLE_WEEK, end: E.addDays(SAMPLE_WEEK, 6), remarks }, now).result; act('leave.decide', { id: l.id, decision: 'approve' }); } catch (e) {}
  }

  // demo users (roles) — for the role switcher
  S.user.push({ id: A.email, email: A.email, role: 'admin', staff_id: null, dept_scope: null, active: true, demo: true });
  S.user.push({ id: mail('Afa'), email: mail('Afa'), role: 'roster_admin', staff_id: id.Afa, dept_scope: null, active: true, demo: true });
  S.demo = true;
  return S;
}

/** demo personas offered in the "View as" switcher */
export function demoPersonas(S) {
  const u = S.user.filter(x => x.demo);
  const staffMo = S.staff.find(s => s.email === mail('Anoof')) || S.staff.find(s => s.designation === 'Medical Officer');
  const list = u.map(x => ({ key: x.email, label: (E.ROLE_LABEL[x.role]) + (x.staff_id ? ' — ' + (S.staff.find(s => s.id === x.staff_id) || {}).name : ''), actor: { email: x.email, role: x.role, staff_id: x.staff_id, dept_scope: x.dept_scope, name: x.staff_id ? (S.staff.find(s => s.id === x.staff_id) || {}).name : 'Demo Administrator' } }));
  if (staffMo) list.push({ key: staffMo.email, label: 'Staff — ' + staffMo.name, actor: { email: staffMo.email, role: 'staff', staff_id: staffMo.id, dept_scope: null, name: staffMo.name } });
  return list;
}
