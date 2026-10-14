// roster-engine.js
var VERSION = "1.0.0";
var ROLES = { admin: 4, roster_admin: 3, supervisor: 2, staff: 1, viewer: 0 };
var ROLE_LABEL = { admin: "Administrator", roster_admin: "Roster administrator", supervisor: "Supervisor", staff: "Staff", viewer: "Viewer" };
var DESIGNATIONS = ["Consultant", "Specialist", "Medical Officer", "House Officer"];
var LEAVE_TYPES = ["Annual leave", "Sick leave", "Family responsibility", "Maternity / paternity", "Study leave", "Official duty", "Other"];
var EMPLOYMENT = ["Active", "On leave", "Inactive"];
var KINDS = ["settings", "department", "template", "staff", "user", "requirement", "shift", "assignment", "leave", "swap", "version", "ack", "notif"];
var DEFAULT_SETTINGS = {
  org_name: "Dr. Abdul Samad Memorial Hospital",
  min_rest_hours: 11,
  max_weekly_hours: 60,
  max_consecutive_nights: 3,
  weekend_days: [5, 6],
  // Friday, Saturday
  week_start: 0,
  // Sunday
  night_window: ["22:00", "06:00"]
};
var DEFAULT_DEPARTMENTS = [
  ["ED", "Emergency Department", "#e11d48"],
  ["MED", "Internal Medicine", "#2563eb"],
  ["SURG", "General Surgery", "#7c3aed"],
  ["PAED", "Paediatrics", "#0891b2"],
  ["OBG", "Obstetrics & Gynaecology", "#db2777"],
  ["ANAES", "Anaesthesiology", "#0d9488"],
  ["RAD", "Radiology", "#4f46e5"]
];
var DEFAULT_TEMPLATES = [
  ["Morning shift", "08:00", "16:00", "morning"],
  ["Evening shift", "16:00", "00:00", "evening"],
  ["Night shift", "00:00", "08:00", "night"],
  ["Day duty", "08:00", "14:00", "day"],
  ["On-call duty", "16:00", "08:00", "oncall"],
  ["24-hour duty", "08:00", "08:00", "h24"]
];
var SHIFT_KINDS = {
  morning: { label: "Morning", color: "#0ea5e9" },
  evening: { label: "Evening", color: "#f59e0b" },
  night: { label: "Night", color: "#6366f1" },
  day: { label: "Day duty", color: "#10b981" },
  oncall: { label: "On-call", color: "#ec4899" },
  h24: { label: "24-hour", color: "#ef4444" },
  custom: { label: "Custom", color: "#64748b" }
};
var RosterError = class extends Error {
  constructor(code, message, details) {
    super(message);
    this.code = code;
    this.details = details || null;
  }
};
var fail = (code, msg, details) => {
  throw new RosterError(code, msg, details);
};
function uid(prefix) {
  const a = new Uint8Array(9);
  (globalThis.crypto || {}).getRandomValues ? globalThis.crypto.getRandomValues(a) : a.forEach((_, i) => a[i] = Math.random() * 256);
  return (prefix ? prefix + "_" : "") + Array.from(a, (b) => (b % 36).toString(36)).join("");
}
var clone = (o) => JSON.parse(JSON.stringify(o));
var str = (v, max = 200) => String(v == null ? "" : v).trim().slice(0, max);
var DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
var TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
function dayNum(date) {
  const [y, m, d] = date.split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 864e5);
}
function dayStr(n) {
  return new Date(n * 864e5).toISOString().slice(0, 10);
}
function addDays(date, n) {
  return dayStr(dayNum(date) + n);
}
function weekday(date) {
  return new Date(dayNum(date) * 864e5).getUTCDay();
}
function toMin(t) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}
function todayStr(now) {
  const d = now ? new Date(now) : /* @__PURE__ */ new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
function nowMinAbs(now) {
  const d = now ? new Date(now) : /* @__PURE__ */ new Date();
  return dayNum(todayStr(d)) * 1440 + d.getHours() * 60 + d.getMinutes();
}
function weekStartOf(date, ws = 0) {
  const wd = weekday(date);
  return addDays(date, -((wd - ws + 7) % 7));
}
function isValidDate(s) {
  return typeof s === "string" && DATE_RE.test(s) && dayStr(dayNum(s)) === s;
}
function span(sh) {
  const d = dayNum(sh.date) * 1440, s = toMin(sh.start);
  let e = toMin(sh.end);
  if (e <= s) e += 1440;
  return { s: d + s, e: d + e };
}
function hoursOf(sh) {
  const p = span(sh);
  return (p.e - p.s) / 60;
}
function overlaps(a, b) {
  return a.s < b.e && b.s < a.e;
}
function nightMinutes(sh, settings = DEFAULT_SETTINGS) {
  const p = span(sh), [ns, ne] = settings.night_window.map(toMin);
  let tot = 0;
  for (let d = dayNum(sh.date) - 1; d <= dayNum(sh.date) + 1; d++) {
    const w = { s: d * 1440 + ns, e: d * 1440 + (ne <= ns ? ne + 1440 : ne) };
    tot += Math.max(0, Math.min(p.e, w.e) - Math.max(p.s, w.s));
  }
  return tot;
}
function isNight(sh, settings) {
  return nightMinutes(sh, settings) >= 240;
}
function restExempt(sh, state) {
  const t = sh.template_id && state.template.find((x) => x.id === sh.template_id);
  return !!(t && t.rest_exempt);
}
function emptyState() {
  const s = { meta: { rev: 0, updated_at: null } };
  KINDS.forEach((k) => s[k] = []);
  return s;
}
function settingsOf(state) {
  return Object.assign({}, DEFAULT_SETTINGS, state.settings[0] || {});
}
function seedConfig(state, now = Date.now()) {
  if (!state.settings.length) state.settings.push({ id: "main", ...DEFAULT_SETTINGS });
  if (!state.department.length) DEFAULT_DEPARTMENTS.forEach(([code, name, color], i) => state.department.push({ id: "dep_" + code.toLowerCase(), code, name, color, active: true, sort: i, created_at: now }));
  if (!state.template.length) DEFAULT_TEMPLATES.forEach(([name, start, end, kind], i) => state.template.push({ id: "tpl_" + kind, name, start, end, kind, color: SHIFT_KINDS[kind].color, active: true, sort: i, rest_exempt: kind === "oncall" }));
  return state;
}
var byId = (state, kind, id) => state[kind].find((x) => x.id === id);
function inScope(actor, deptId) {
  return !actor.dept_scope || !actor.dept_scope.length || actor.dept_scope.includes(deptId);
}
function can(actor, cap, deptId) {
  const r = ROLES[actor.role] || 0;
  switch (cap) {
    case "settings":
      return r >= ROLES.admin;
    case "users":
      return r >= ROLES.admin;
    case "staff_edit":
      return r >= ROLES.roster_admin && (deptId === void 0 || inScope(actor, deptId));
    case "edit":
      return r >= ROLES.roster_admin && (deptId === void 0 || inScope(actor, deptId));
    case "publish":
      return r >= ROLES.roster_admin && (deptId === void 0 || inScope(actor, deptId));
    case "approve":
      return r >= ROLES.supervisor && (deptId === void 0 || inScope(actor, deptId));
    case "contacts":
      return r >= ROLES.supervisor;
    case "drafts":
      return r >= ROLES.roster_admin;
    case "audit":
      return r >= ROLES.roster_admin;
    case "backup":
      return r >= ROLES.admin;
    default:
      return false;
  }
}
function need(actor, cap, deptId) {
  if (!can(actor, cap, deptId)) fail("forbidden", "You do not have permission for this action.");
}
function view(sh, mode) {
  if (mode === "published") return sh.published ? Object.assign({ id: sh.id, series_id: sh.series_id }, sh.published) : null;
  return sh.deleted ? null : sh;
}
function staffIdsOf(state, sh, mode) {
  if (mode === "published") return (sh.published ? sh.published.staff_ids : sh.staff_ids) || [];
  return state.assignment.filter((a) => a.shift_id === sh.id).map((a) => a.staff_id);
}
function shiftsIn(state, from, to, mode = "draft") {
  const a = dayNum(from) - 1, b = dayNum(to);
  const out = [];
  for (const sh of state.shift) {
    const v = view(sh, mode);
    if (!v) continue;
    const d = dayNum(v.date);
    if (d >= a && d <= b) out.push(v);
  }
  return out;
}
function approvedLeave(state, staffId, date) {
  return state.leave.find((l) => l.staff_id === staffId && l.status === "approved" && l.start <= date && l.end >= date);
}
function checkAssign(state, shiftId, staffId, mode = "draft") {
  const sh = byId(state, "shift", shiftId), s = byId(state, "staff", staffId);
  if (!sh || !s) return [];
  const v = view(sh, mode);
  if (!v) return [];
  const st = settingsOf(state), p = span(v), out = [];
  if (s.status === "Inactive") out.push({ type: "inactive", hard: true, text: s.name + " is inactive." });
  const lv = approvedLeave(state, staffId, v.date);
  if (lv) out.push({ type: "leave", hard: true, text: s.name + " is on " + lv.type.toLowerCase() + " (" + lv.start + " to " + lv.end + ")." });
  for (const o of shiftsIn(state, addDays(v.date, -2), addDays(v.date, 2), mode)) {
    if (o.id === sh.id || !staffIdsOf(state, o, mode).includes(staffId)) continue;
    const q = span(o);
    if (overlaps(p, q)) out.push({ type: "overlap", hard: true, text: s.name + " already works " + o.name + " " + o.date + " " + o.start + "\u2013" + o.end + "." });
    else if (!restExempt(v, state) && !restExempt(o, state)) {
      const rest = (p.s >= q.e ? p.s - q.e : q.s - p.e) / 60;
      if (rest < st.min_rest_hours) out.push({ type: "rest", hard: false, text: "Only " + Math.round(rest * 10) / 10 + " h rest next to " + o.name + " on " + o.date + "." });
    }
  }
  return out;
}
function tx(state) {
  const changes = [];
  return {
    changes,
    put(kind, row) {
      const i = state[kind].findIndex((x) => x.id === row.id);
      if (i >= 0) state[kind][i] = row;
      else state[kind].push(row);
      changes.push({ kind, op: "put", id: row.id, row });
      return row;
    },
    del(kind, id) {
      const i = state[kind].findIndex((x) => x.id === id);
      if (i >= 0) state[kind].splice(i, 1);
      changes.push({ kind, op: "del", id });
    }
  };
}
function cleanShiftInput(state, p, base) {
  const o = Object.assign({}, base || {});
  const set = (k, v) => {
    if (v !== void 0) o[k] = v;
  };
  set("name", p.name !== void 0 ? str(p.name, 60) : void 0);
  set("date", p.date);
  set("start", p.start);
  set("end", p.end);
  set("department_id", p.department_id);
  set("template_id", p.template_id === "" ? null : p.template_id);
  set("location", p.location !== void 0 ? str(p.location, 80) : void 0);
  set("notes", p.notes !== void 0 ? str(p.notes, 500) : void 0);
  set("designation", p.designation !== void 0 ? p.designation || null : void 0);
  if (p.required !== void 0) o.required = Math.max(0, Math.min(50, parseInt(p.required, 10) || 0));
  if (!isValidDate(o.date)) fail("invalid", "Choose a valid date.");
  if (!TIME_RE.test(o.start || "") || !TIME_RE.test(o.end || "")) fail("invalid", "Start and end times must be HH:MM.");
  const dep = byId(state, "department", o.department_id);
  if (!dep) fail("invalid", "Choose a department.");
  if (!base && dep.active === false) fail("invalid", dep.name + " is deactivated.");
  if (o.template_id && !byId(state, "template", o.template_id)) o.template_id = null;
  if (o.designation && !DESIGNATIONS.includes(o.designation)) o.designation = null;
  if (!o.name) {
    const t = o.template_id && byId(state, "template", o.template_id);
    o.name = t ? t.name : "Custom shift";
  }
  if (o.required == null) o.required = 1;
  return o;
}
function setAssignments(state, t, actor, shift, staffIds, opts = {}) {
  staffIds = Array.from(new Set((staffIds || []).filter(Boolean)));
  const current = state.assignment.filter((a) => a.shift_id === shift.id);
  const warnings = [];
  for (const sid of staffIds) {
    if (!byId(state, "staff", sid)) fail("invalid", "Unknown staff member.");
    if (current.some((a) => a.staff_id === sid)) continue;
    const temp = { id: uid("as"), shift_id: shift.id, staff_id: sid, proposed: !!opts.proposed, by: actor.email, at: opts.now };
    state.assignment.push(temp);
    const iss = checkAssign(state, shift.id, sid).filter((x) => x.type !== "none");
    state.assignment.pop();
    const hard = iss.filter((x) => x.hard);
    if (hard.length && !opts.force) fail("conflict", hard.map((x) => x.text).join(" "), { staff_id: sid, issues: iss });
    iss.forEach((x) => warnings.push(x.text));
    t.put("assignment", temp);
  }
  for (const a of current) if (!staffIds.includes(a.staff_id)) t.del("assignment", a.id);
  return warnings;
}
function touchShift(t, sh, actor, now) {
  sh.dirty = true;
  sh.updated_at = now;
  sh.updated_by = actor.email;
  t.put("shift", sh);
}
function notify(t, toStaffId, text, kind, ref, now, toEmail) {
  if (!toStaffId && !toEmail) return;
  t.put("notif", { id: uid("nt"), to_staff_id: toStaffId || null, to_email: toEmail || null, text: str(text, 300), kind, ref: ref || null, at: now, read: false });
}
function approvers(state, deptId) {
  return state.user.filter((u) => u.active !== false && can(u, "approve", deptId));
}
var ACTIONS = {
  /* ---------------- configuration ---------------- */
  "settings.save"(state, actor, p, t) {
    need(actor, "settings");
    const cur = settingsOf(state), n = Object.assign({}, cur);
    ["min_rest_hours", "max_weekly_hours", "max_consecutive_nights"].forEach((k) => {
      if (p[k] !== void 0) n[k] = Math.max(0, Math.min(168, Number(p[k]) || 0));
    });
    if (Array.isArray(p.weekend_days)) n.weekend_days = p.weekend_days.map(Number).filter((d) => d >= 0 && d <= 6);
    if (p.week_start !== void 0) n.week_start = Number(p.week_start) === 1 ? 1 : 0;
    t.put("settings", Object.assign({ id: "main" }, n));
    return { summary: "Updated roster rules" };
  },
  "department.save"(state, actor, p, t, now) {
    need(actor, "settings");
    const name = str(p.name, 60);
    if (!name) fail("invalid", "Department name is required.");
    const ex = p.id && byId(state, "department", p.id);
    if (state.department.some((d) => d.name.toLowerCase() === name.toLowerCase() && d.id !== p.id)) fail("invalid", "A department with that name exists.");
    const row = Object.assign({}, ex || { id: uid("dep"), created_at: now, sort: state.department.length }, {
      name,
      code: str(p.code || name.replace(/[^A-Za-z]/g, "").slice(0, 5).toUpperCase(), 8),
      color: /^#[0-9a-f]{6}$/i.test(p.color || "") ? p.color : ex && ex.color || "#0a8f9e",
      active: p.active !== void 0 ? !!p.active : ex ? ex.active !== false : true,
      min_staff: p.min_staff !== void 0 ? Math.max(0, parseInt(p.min_staff, 10) || 0) : ex && ex.min_staff || 0
    });
    t.put("department", row);
    return { summary: (ex ? "Updated" : "Added") + " department " + name, result: row };
  },
  "template.save"(state, actor, p, t) {
    need(actor, "settings");
    const name = str(p.name, 40);
    if (!name) fail("invalid", "Template name is required.");
    if (!TIME_RE.test(p.start || "") || !TIME_RE.test(p.end || "")) fail("invalid", "Times must be HH:MM.");
    const ex = p.id && byId(state, "template", p.id);
    const kind = SHIFT_KINDS[p.kind] ? p.kind : "custom";
    const row = Object.assign({}, ex || { id: uid("tpl"), sort: state.template.length }, { name, start: p.start, end: p.end, kind, color: /^#[0-9a-f]{6}$/i.test(p.color || "") ? p.color : SHIFT_KINDS[kind].color, active: p.active !== void 0 ? !!p.active : true, rest_exempt: p.rest_exempt !== void 0 ? !!p.rest_exempt : ex ? !!ex.rest_exempt : kind === "oncall" });
    t.put("template", row);
    return { summary: (ex ? "Updated" : "Added") + " shift template " + name, result: row };
  },
  "requirement.save"(state, actor, p, t) {
    need(actor, "edit", p.department_id);
    if (!byId(state, "department", p.department_id) || !byId(state, "template", p.template_id)) fail("invalid", "Unknown department or template.");
    const id = p.department_id + "|" + p.template_id, required = Math.max(0, Math.min(50, parseInt(p.required, 10) || 0));
    t.put("requirement", { id, department_id: p.department_id, template_id: p.template_id, required });
    return { summary: "Set staffing requirement " + required };
  },
  "user.save"(state, actor, p, t, now) {
    need(actor, "users");
    const email = str(p.email, 120).toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fail("invalid", "Enter a valid email.");
    if (!ROLES.hasOwnProperty(p.role)) fail("invalid", "Unknown role.");
    if (email === actor.email && ROLES[p.role] < ROLES.admin) fail("invalid", "You cannot remove your own admin role.");
    const ex = byId(state, "user", email);
    t.put("user", Object.assign({}, ex || { id: email, email, created_at: now }, { role: p.role, staff_id: p.staff_id || null, dept_scope: Array.isArray(p.dept_scope) && p.dept_scope.length ? p.dept_scope : null, active: p.active !== false }));
    return { summary: "Set " + email + " as " + ROLE_LABEL[p.role] };
  },
  /* ---------------- staff ---------------- */
  "staff.save"(state, actor, p, t, now) {
    need(actor, "staff_edit", p.department_id);
    const name = str(p.name, 80);
    if (!name) fail("invalid", "Full name is required.");
    if (!DESIGNATIONS.includes(p.designation)) fail("invalid", "Choose a designation.");
    if (!byId(state, "department", p.department_id)) fail("invalid", "Choose a department.");
    const emp = str(p.emp_id, 20);
    if (emp && state.staff.some((s) => s.emp_id === emp && s.id !== p.id)) fail("invalid", "Employee ID " + emp + " is already used.");
    const email = str(p.email, 120).toLowerCase();
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fail("invalid", "Email looks invalid.");
    const ex = p.id && byId(state, "staff", p.id);
    if (ex) need(actor, "staff_edit", ex.department_id);
    const row = Object.assign({}, ex || { id: uid("st"), created_at: now }, {
      name,
      designation: p.designation,
      department_id: p.department_id,
      emp_id: emp,
      email,
      phone: str(p.phone, 30),
      status: EMPLOYMENT.includes(p.status) ? p.status : "Active",
      availability: str(p.availability, 120),
      updated_at: now
    });
    t.put("staff", row);
    return { summary: (ex ? "Updated" : "Added") + " staff " + name, result: row };
  },
  /* ---------------- shifts ---------------- */
  "shift.save"(state, actor, p, t, now) {
    const ex = p.id && byId(state, "shift", p.id);
    if (ex) need(actor, "edit", ex.department_id);
    const row = cleanShiftInput(state, p, ex ? Object.assign({}, ex) : null);
    need(actor, "edit", row.department_id);
    if (!ex) Object.assign(row, { id: uid("sh"), created_at: now, created_by: actor.email, published: null, deleted: false, series_id: p.series_id || null });
    touchShift(t, row, actor, now);
    const warnings = p.staff_ids ? setAssignments(state, t, actor, row, p.staff_ids, { force: p.force, now }) : [];
    return { summary: (ex ? "Edited " : "Created ") + row.name + " " + row.date + " " + row.start + "\u2013" + row.end, result: row, warnings };
  },
  "shift.move"(state, actor, p, t, now) {
    const ex = byId(state, "shift", p.id);
    if (!ex || ex.deleted) fail("notfound", "Shift not found.");
    need(actor, "edit", ex.department_id);
    const row = cleanShiftInput(state, { date: p.date, start: p.start, end: p.end }, Object.assign({}, ex));
    if (p.department_id) {
      row.department_id = p.department_id;
      need(actor, "edit", p.department_id);
    }
    const before = state.shift.indexOf(ex);
    state.shift[before] = row;
    const hard = [];
    for (const a of state.assignment.filter((a2) => a2.shift_id === row.id)) checkAssign(state, row.id, a.staff_id).filter((x) => x.hard && x.type !== "inactive").forEach((x) => hard.push(x.text));
    state.shift[before] = ex;
    if (hard.length && !p.force) fail("conflict", hard.join(" "));
    touchShift(t, row, actor, now);
    return { summary: "Moved " + row.name + " to " + row.date + " " + row.start + "\u2013" + row.end, result: row };
  },
  "shift.delete"(state, actor, p, t, now) {
    const ex = byId(state, "shift", p.id);
    if (!ex) fail("notfound", "Shift not found.");
    need(actor, "edit", ex.department_id);
    const ids = p.series && ex.series_id ? state.shift.filter((s) => s.series_id === ex.series_id && s.date >= ex.date && !s.deleted).map((s) => s.id) : [ex.id];
    for (const id of ids) {
      const sh = byId(state, "shift", id);
      if (sh.published) {
        const r = Object.assign({}, sh, { deleted: true });
        touchShift(t, r, actor, now);
      } else {
        state.assignment.filter((a) => a.shift_id === id).forEach((a) => t.del("assignment", a.id));
        t.del("shift", id);
      }
    }
    return { summary: "Deleted " + ids.length + " shift" + (ids.length > 1 ? "s" : "") + " (" + ex.name + " " + ex.date + ")" };
  },
  "shift.duplicate"(state, actor, p, t, now) {
    const ex = byId(state, "shift", p.id);
    if (!ex || ex.deleted) fail("notfound", "Shift not found.");
    need(actor, "edit", ex.department_id);
    const dates = (p.dates || []).filter(isValidDate).slice(0, 62);
    if (!dates.length) fail("invalid", "Choose at least one date.");
    const staff = p.with_staff ? state.assignment.filter((a) => a.shift_id === ex.id && !a.proposed).map((a) => a.staff_id) : [];
    const created = [], warnings = [];
    for (const d of dates) {
      const row = Object.assign({}, ex, { id: uid("sh"), date: d, published: null, deleted: false, series_id: null, created_at: now, created_by: actor.email });
      touchShift(t, row, actor, now);
      staff.forEach((sid) => {
        try {
          warnings.push(...setAssignments(state, t, actor, row, staffIdsOf(state, row).concat(sid), { now }));
        } catch (e) {
          warnings.push(e.message);
        }
      });
      created.push(row.id);
    }
    return { summary: "Duplicated " + ex.name + " to " + dates.length + " date(s)", result: created, warnings };
  },
  "shift.recur"(state, actor, p, t, now) {
    const base = cleanShiftInput(state, p.shift || {}, null);
    need(actor, "edit", base.department_id);
    const days = (p.weekdays || []).map(Number).filter((d) => d >= 0 && d <= 6);
    const every = Math.max(1, Math.min(4, parseInt(p.every_weeks, 10) || 1));
    if (!isValidDate(p.until) || p.until < base.date) fail("invalid", "Choose an end date after the first date.");
    if (dayNum(p.until) - dayNum(base.date) > 366) fail("invalid", "Recurring patterns can run for up to one year.");
    if (!days.length) fail("invalid", "Choose at least one weekday.");
    const series = uid("sr"), w0 = dayNum(weekStartOf(base.date, settingsOf(state).week_start));
    const created = [], warnings = [];
    for (let d = dayNum(base.date); d <= dayNum(p.until); d++) {
      const date = dayStr(d);
      if (!days.includes(weekday(date)) || Math.floor((d - w0) / 7) % every) continue;
      const row = Object.assign({}, base, { id: uid("sh"), date, series_id: series, published: null, deleted: false, created_at: now, created_by: actor.email });
      touchShift(t, row, actor, now);
      for (const sid of p.shift.staff_ids || []) {
        try {
          warnings.push(...setAssignments(state, t, actor, row, staffIdsOf(state, row).concat(sid), { now }));
        } catch (e) {
          warnings.push(date + ": " + e.message);
        }
      }
      created.push(row.id);
      if (created.length > 400) break;
    }
    if (!created.length) fail("invalid", "No dates matched that pattern.");
    return { summary: "Created recurring " + base.name + " \xD7 " + created.length, result: created, warnings: warnings.slice(0, 20) };
  },
  /* ---------------- assignments ---------------- */
  "assign.add"(state, actor, p, t, now) {
    const sh = byId(state, "shift", p.shift_id);
    if (!sh || sh.deleted) fail("notfound", "Shift not found.");
    need(actor, "edit", sh.department_id);
    const s = byId(state, "staff", p.staff_id);
    if (!s) fail("notfound", "Staff member not found.");
    const warnings = setAssignments(state, t, actor, sh, staffIdsOf(state, sh).concat(p.staff_id), { force: p.force, now });
    if (p.from_shift_id && p.from_shift_id !== sh.id) {
      const from = byId(state, "shift", p.from_shift_id);
      if (from) {
        need(actor, "edit", from.department_id);
        setAssignments(state, t, actor, from, staffIdsOf(state, from).filter((x) => x !== p.staff_id), { now });
        touchShift(t, Object.assign({}, from), actor, now);
      }
    }
    touchShift(t, Object.assign({}, sh), actor, now);
    return { summary: "Assigned " + s.name + " to " + sh.name + " " + sh.date, warnings };
  },
  "assign.remove"(state, actor, p, t, now) {
    const sh = byId(state, "shift", p.shift_id);
    if (!sh) fail("notfound", "Shift not found.");
    need(actor, "edit", sh.department_id);
    setAssignments(state, t, actor, sh, staffIdsOf(state, sh).filter((x) => x !== p.staff_id), { now });
    touchShift(t, Object.assign({}, sh), actor, now);
    const s = byId(state, "staff", p.staff_id);
    return { summary: "Removed " + (s ? s.name : "staff") + " from " + sh.name + " " + sh.date };
  },
  "assign.bulk"(state, actor, p, t, now) {
    const shifts = (p.shift_ids || []).map((id) => byId(state, "shift", id)).filter((s) => s && !s.deleted);
    const staff = (p.staff_ids || []).filter((id) => byId(state, "staff", id));
    if (!shifts.length || !staff.length) fail("invalid", "Choose shifts and staff.");
    let n = 0;
    const skipped = [];
    for (const sh of shifts) {
      need(actor, "edit", sh.department_id);
      for (const sid of staff) {
        if (staffIdsOf(state, sh).includes(sid)) continue;
        try {
          setAssignments(state, t, actor, sh, staffIdsOf(state, sh).concat(sid), { now });
          n++;
        } catch (e) {
          skipped.push(sh.date + ": " + e.message);
        }
      }
      touchShift(t, Object.assign({}, sh), actor, now);
    }
    return { summary: "Bulk-assigned " + n + " slot(s)", result: { assigned: n }, warnings: skipped.slice(0, 20) };
  },
  /* ---------------- roster building ---------------- */
  "roster.copyWeek"(state, actor, p, t, now) {
    const st = settingsOf(state);
    const to = weekStartOf(p.to_week, st.week_start), from = addDays(to, -7);
    const dep = p.department_id || null;
    if (dep) need(actor, "edit", dep);
    else need(actor, "edit");
    const src = state.shift.filter((s) => !s.deleted && s.date >= from && s.date <= addDays(from, 6) && (!dep || s.department_id === dep) && inScope(actor, s.department_id));
    if (!src.length) fail("invalid", "There are no shifts in the previous week to copy.");
    const existing = state.shift.filter((s) => !s.deleted && s.date >= to && s.date <= addDays(to, 6) && (!dep || s.department_id === dep) && inScope(actor, s.department_id));
    if (existing.length && !p.replace) fail("confirm", existing.length + " shift(s) already exist in this week.", { existing: existing.length });
    if (p.replace) for (const e of existing) ACTIONS["shift.delete"](state, actor, { id: e.id }, t, now);
    let n = 0;
    const warnings = [];
    for (const s of src) {
      const row = Object.assign({}, s, { id: uid("sh"), date: addDays(s.date, 7), published: null, deleted: false, series_id: null, created_at: now, created_by: actor.email });
      touchShift(t, row, actor, now);
      n++;
      for (const a of state.assignment.filter((a2) => a2.shift_id === s.id && !a2.proposed)) {
        try {
          setAssignments(state, t, actor, row, staffIdsOf(state, row).concat(a.staff_id), { now });
        } catch (e) {
          warnings.push(row.date + ": " + e.message);
        }
      }
    }
    return { summary: "Copied " + n + " shift(s) from week of " + from, result: { copied: n }, warnings: warnings.slice(0, 20) };
  },
  "roster.generate"(state, actor, p, t, now) {
    if (!isValidDate(p.start) || !isValidDate(p.end) || p.end < p.start) fail("invalid", "Choose a valid date range.");
    if (dayNum(p.end) - dayNum(p.start) > 62) fail("invalid", "Generate at most two months at a time.");
    const dep = p.department_id || null;
    if (dep) need(actor, "edit", dep);
    else need(actor, "edit");
    const st = settingsOf(state);
    const shiftMap = new Map(state.shift.filter((s) => !s.deleted).map((s) => [s.id, s]));
    const target = Array.from(shiftMap.values()).filter((s) => s.date >= p.start && s.date <= p.end && (!dep || s.department_id === dep) && inScope(actor, s.department_id)).sort((a, b) => span(a).s - span(b).s);
    const idx = /* @__PURE__ */ new Map(), onShift = /* @__PURE__ */ new Map();
    for (const a of state.assignment) {
      const sh = shiftMap.get(a.shift_id);
      if (!sh) continue;
      if (!idx.has(a.staff_id)) idx.set(a.staff_id, []);
      idx.get(a.staff_id).push({ sp: span(sh), sh });
      if (!onShift.has(sh.id)) onShift.set(sh.id, /* @__PURE__ */ new Set());
      onShift.get(sh.id).add(a.staff_id);
    }
    const lo = dayNum(p.start) * 1440, hi = (dayNum(p.end) + 1) * 1440;
    const load = (id) => (idx.get(id) || []).reduce((h, x) => x.sp.s >= lo && x.sp.s < hi ? h + (x.sp.e - x.sp.s) / 60 : h, 0);
    const weekHours = (id, wk) => (idx.get(id) || []).reduce((h, x) => weekStartOf(x.sh.date, st.week_start) === wk ? h + (x.sp.e - x.sp.s) / 60 : h, 0);
    const ok = (s, sh) => {
      const sp = span(sh), ex = restExempt(sh, state);
      if (approvedLeave(state, s.id, sh.date)) return false;
      for (const x of idx.get(s.id) || []) {
        if (overlaps(sp, x.sp)) return false;
        if (!ex && !restExempt(x.sh, state)) {
          const gap = (sp.s >= x.sp.e ? sp.s - x.sp.e : x.sp.s - sp.e) / 60;
          if (gap < st.min_rest_hours) return false;
        }
      }
      if (weekHours(s.id, weekStartOf(sh.date, st.week_start)) + (sp.e - sp.s) / 60 > st.max_weekly_hours) return false;
      if (isNight(sh, st)) {
        let run = 0;
        for (let k = 1; k <= st.max_consecutive_nights; k++) {
          const d = addDays(sh.date, -k);
          if ((idx.get(s.id) || []).some((x) => x.sh.date === d && isNight(x.sh, st))) run++;
          else break;
        }
        if (run >= st.max_consecutive_nights) return false;
      }
      return true;
    };
    const pool = state.staff.filter((s) => s.status === "Active");
    const loads = new Map(pool.map((s) => [s.id, load(s.id)]));
    let filled = 0;
    const unfilled = [];
    for (const sh of target) {
      const have = onShift.get(sh.id) || /* @__PURE__ */ new Set();
      let needN = Math.max(0, (sh.required == null ? 1 : sh.required) - have.size);
      if (!needN) continue;
      const cands = pool.filter((s) => s.department_id === sh.department_id && (!sh.designation || s.designation === sh.designation) && !have.has(s.id) && ok(s, sh)).map((s) => ({ s, score: loads.get(s.id) + Math.random() * 0.5 })).sort((a, b) => a.score - b.score);
      for (const c of cands) {
        if (!needN) break;
        t.put("assignment", { id: uid("as"), shift_id: sh.id, staff_id: c.s.id, proposed: true, by: actor.email, at: now });
        if (!idx.has(c.s.id)) idx.set(c.s.id, []);
        idx.get(c.s.id).push({ sp: span(sh), sh });
        have.add(c.s.id);
        onShift.set(sh.id, have);
        loads.set(c.s.id, loads.get(c.s.id) + hoursOf(sh));
        needN--;
        filled++;
      }
      if (needN) unfilled.push(sh.date + " " + sh.name + " (" + needN + " short)");
      touchShift(t, Object.assign({}, sh), actor, now);
    }
    return { summary: "Auto-generated " + filled + " proposed assignment(s) for " + p.start + " to " + p.end, result: { filled, unfilled: unfilled.length }, warnings: unfilled.slice(0, 20).map((x) => "Could not fill: " + x) };
  },
  "roster.proposals"(state, actor, p, t, now) {
    const keep = p.decision === "approve";
    const list = state.assignment.filter((a) => a.proposed && (!p.start || ((s) => s && s.date >= p.start && s.date <= p.end)(byId(state, "shift", a.shift_id))));
    let n = 0;
    for (const a of list) {
      const sh = byId(state, "shift", a.shift_id);
      if (!sh || !can(actor, "edit", sh.department_id) || p.department_id && sh.department_id !== p.department_id) continue;
      if (keep) t.put("assignment", Object.assign({}, a, { proposed: false, by: actor.email, at: now }));
      else t.del("assignment", a.id);
      n++;
    }
    return { summary: (keep ? "Approved " : "Discarded ") + n + " proposed assignment(s)", result: { count: n } };
  },
  "roster.publish"(state, actor, p, t, now) {
    if (!isValidDate(p.start) || !isValidDate(p.end) || p.end < p.start) fail("invalid", "Choose a valid period to publish.");
    const dep = p.department_id || null;
    if (dep) need(actor, "publish", dep);
    else need(actor, "publish");
    const list = state.shift.filter((s) => s.date >= p.start && s.date <= p.end && (!dep || s.department_id === dep) && can(actor, "publish", s.department_id));
    const pending = state.assignment.filter((a) => a.proposed && list.some((s) => s.id === a.shift_id));
    if (pending.length) fail("invalid", pending.length + " auto-generated assignment(s) still need review. Approve or discard them before publishing.");
    const dirty = list.filter((s) => s.dirty);
    if (!dirty.length) fail("invalid", "Nothing has changed since the last publish for this period.");
    const changes = [], affected = /* @__PURE__ */ new Set();
    const desc = (s) => ({ date: s.date, name: s.name, time: s.start + "\u2013" + s.end, department_id: s.department_id });
    for (const s of dirty) {
      const oldIds = s.published && s.published.staff_ids || [];
      if (s.deleted) {
        oldIds.forEach((x) => affected.add(x));
        changes.push(Object.assign({ type: "removed" }, desc(s.published || s)));
        state.assignment.filter((a) => a.shift_id === s.id).forEach((a) => t.del("assignment", a.id));
        t.del("shift", s.id);
        continue;
      }
      const ids = staffIdsOf(state, s);
      const pub = { date: s.date, start: s.start, end: s.end, name: s.name, department_id: s.department_id, template_id: s.template_id || null, location: s.location || "", notes: s.notes || "", required: s.required, designation: s.designation || null, staff_ids: ids };
      const changed = !s.published || JSON.stringify(s.published) !== JSON.stringify(pub);
      if (changed) {
        changes.push(Object.assign({ type: s.published ? "changed" : "added" }, desc(s)));
        ids.concat(oldIds).forEach((x) => affected.add(x));
      }
      t.put("shift", Object.assign({}, s, { published: pub, dirty: false }));
    }
    const no = state.version.reduce((m, v) => Math.max(m, v.no || 0), 0) + 1;
    const ver = {
      id: uid("vr"),
      no,
      at: now,
      by: actor.email,
      by_name: actor.name || actor.email,
      start: p.start,
      end: p.end,
      department_id: dep,
      note: str(p.note, 300),
      kind: "publish",
      counts: { added: changes.filter((c) => c.type === "added").length, changed: changes.filter((c) => c.type === "changed").length, removed: changes.filter((c) => c.type === "removed").length },
      changes: changes.slice(0, 300),
      affected: Array.from(affected)
    };
    t.put("version", ver);
    affected.forEach((sid) => notify(t, sid, "Roster v" + no + " published (" + p.start + " to " + p.end + "). Your duties changed \u2014 please review and acknowledge.", "roster", ver.id, now));
    return { summary: "Published roster v" + no + " for " + p.start + " to " + p.end + " (" + changes.length + " change(s))", result: ver };
  },
  "roster.ack"(state, actor, p, t, now) {
    if (!actor.staff_id) fail("invalid", "Your account is not linked to a staff profile.");
    const v = byId(state, "version", p.version_id);
    if (!v) fail("notfound", "Version not found.");
    t.put("ack", { id: v.id + ":" + actor.staff_id, version_id: v.id, staff_id: actor.staff_id, at: now });
    return { summary: "Acknowledged roster v" + v.no };
  },
  /* ---------------- leave ---------------- */
  "leave.create"(state, actor, p, t, now) {
    const sid = p.staff_id || actor.staff_id;
    const s = byId(state, "staff", sid);
    if (!s) fail("invalid", "Choose a staff member.");
    if (sid !== actor.staff_id) need(actor, "approve", s.department_id);
    if (!isValidDate(p.start) || !isValidDate(p.end) || p.end < p.start) fail("invalid", "Choose valid leave dates.");
    if (!LEAVE_TYPES.includes(p.type)) fail("invalid", "Choose a leave type.");
    if (state.leave.some((l) => l.staff_id === sid && ["pending", "approved"].includes(l.status) && l.start <= p.end && l.end >= p.start)) fail("invalid", "This overlaps an existing leave request.");
    const row = { id: uid("lv"), staff_id: sid, type: p.type, start: p.start, end: p.end, remarks: str(p.remarks, 400), status: "pending", created_by: actor.email, created_at: now };
    t.put("leave", row);
    approvers(state, s.department_id).forEach((u) => notify(t, u.staff_id, s.name + " requested " + p.type.toLowerCase() + " " + p.start + " to " + p.end + ".", "leave", row.id, now, u.email));
    return { summary: "Leave request: " + s.name + " " + p.start + " to " + p.end, result: row };
  },
  "leave.decide"(state, actor, p, t, now) {
    const l = byId(state, "leave", p.id);
    if (!l) fail("notfound", "Request not found.");
    const s = byId(state, "staff", l.staff_id);
    need(actor, "approve", s && s.department_id);
    if (l.status !== "pending") fail("invalid", "This request was already " + l.status + ".");
    const ok = p.decision === "approve";
    t.put("leave", Object.assign({}, l, { status: ok ? "approved" : "rejected", decided_by: actor.email, decided_at: now, comment: str(p.comment, 300) }));
    notify(t, l.staff_id, "Your " + l.type.toLowerCase() + " (" + l.start + " to " + l.end + ") was " + (ok ? "approved" : "rejected") + ".", "leave", l.id, now);
    const clashes = ok ? state.assignment.filter((a) => a.staff_id === l.staff_id && ((sh) => sh && !sh.deleted && sh.date >= l.start && sh.date <= l.end)(byId(state, "shift", a.shift_id))).length : 0;
    return { summary: (ok ? "Approved" : "Rejected") + " leave for " + (s ? s.name : "staff"), warnings: clashes ? [clashes + " rostered shift(s) fall in this leave \u2014 reassign them in the roster."] : [] };
  },
  "leave.cancel"(state, actor, p, t, now) {
    const l = byId(state, "leave", p.id);
    if (!l) fail("notfound", "Request not found.");
    const s = byId(state, "staff", l.staff_id);
    if (l.staff_id !== actor.staff_id) need(actor, "approve", s && s.department_id);
    if (!["pending", "approved"].includes(l.status)) fail("invalid", "Only pending or approved leave can be cancelled.");
    t.put("leave", Object.assign({}, l, { status: "cancelled", decided_by: actor.email, decided_at: now }));
    return { summary: "Cancelled leave " + l.start + " to " + l.end };
  },
  /* ---------------- shift exchange ---------------- */
  "swap.create"(state, actor, p, t, now) {
    const sh = byId(state, "shift", p.shift_id);
    if (!sh || !sh.published || sh.deleted) fail("invalid", "Only published shifts can be exchanged.");
    const from = p.from_staff_id && can(actor, "approve", sh.department_id) ? p.from_staff_id : actor.staff_id;
    if (!from || !sh.published.staff_ids.includes(from)) fail("invalid", "You are not rostered on this shift.");
    const to = byId(state, "staff", p.to_staff_id);
    if (!to || to.id === from || to.status !== "Active") fail("invalid", "Choose an active colleague.");
    if (sh.published.staff_ids.includes(to.id)) fail("invalid", to.name + " is already on this shift.");
    const fromS = byId(state, "staff", from);
    if (fromS && to.designation !== fromS.designation && !p.allow_other_designation) fail("invalid", "Choose a colleague with the same designation (" + fromS.designation + ").");
    if (span(sh.published).s < nowMinAbs(now)) fail("invalid", "This shift has already started.");
    let target = null;
    if (p.target_shift_id) {
      target = byId(state, "shift", p.target_shift_id);
      if (!target || !target.published || !target.published.staff_ids.includes(to.id)) fail("invalid", "The colleague is not rostered on the shift offered in exchange.");
    }
    if (state.swap.some((x) => x.shift_id === sh.id && x.from_staff_id === from && ["pending_peer", "pending_approval"].includes(x.status))) fail("invalid", "You already have an open request for this shift.");
    const iss = checkAssign(state, sh.id, to.id, "published").filter((x) => x.hard);
    if (iss.length) fail("conflict", iss.map((x) => x.text).join(" "));
    const row = { id: uid("sw"), shift_id: sh.id, target_shift_id: target ? target.id : null, from_staff_id: from, to_staff_id: to.id, reason: str(p.reason, 300), status: "pending_peer", created_at: now, created_by: actor.email };
    t.put("swap", row);
    notify(t, to.id, (fromS ? fromS.name : "A colleague") + " asked you to take " + sh.published.name + " on " + sh.published.date + " " + sh.published.start + "\u2013" + sh.published.end + (target ? " in exchange for your " + target.published.date + " duty" : "") + ".", "swap", row.id, now);
    return { summary: "Shift exchange requested: " + sh.published.date + " " + sh.published.name, result: row };
  },
  "swap.respond"(state, actor, p, t, now) {
    const x = byId(state, "swap", p.id);
    if (!x) fail("notfound", "Request not found.");
    if (x.to_staff_id !== actor.staff_id) fail("forbidden", "Only the receiving colleague can respond.");
    if (x.status !== "pending_peer") fail("invalid", "This request is no longer waiting for you.");
    const ok = !!p.accept;
    t.put("swap", Object.assign({}, x, { status: ok ? "pending_approval" : "declined", peer_at: now }));
    const sh = byId(state, "shift", x.shift_id);
    notify(t, x.from_staff_id, "Your exchange request for " + (sh && sh.published ? sh.published.date : "") + " was " + (ok ? "accepted and sent for approval" : "declined") + ".", "swap", x.id, now);
    if (ok && sh) approvers(state, sh.department_id).forEach((u) => notify(t, u.staff_id, "Shift exchange waiting for approval: " + sh.published.date + " " + sh.published.name + ".", "swap", x.id, now, u.email));
    return { summary: (ok ? "Accepted" : "Declined") + " shift exchange request" };
  },
  "swap.decide"(state, actor, p, t, now) {
    const x = byId(state, "swap", p.id);
    if (!x) fail("notfound", "Request not found.");
    const sh = byId(state, "shift", x.shift_id);
    if (!sh || !sh.published) fail("invalid", "The shift is no longer published.");
    need(actor, "approve", sh.department_id);
    if (x.status !== "pending_approval") fail("invalid", "This request is not awaiting approval.");
    const ok = p.decision === "approve";
    if (ok) {
      const tgt = x.target_shift_id ? byId(state, "shift", x.target_shift_id) : null;
      const swapIn = (s, out, inn) => {
        if (!s.published.staff_ids.includes(out)) fail("invalid", "The roster changed since this request was made.");
        const pub = Object.assign({}, s.published, { staff_ids: s.published.staff_ids.map((i) => i === out ? inn : i) });
        state.assignment.filter((a) => a.shift_id === s.id && a.staff_id === out).forEach((a) => t.put("assignment", Object.assign({}, a, { staff_id: inn, at: now, by: actor.email })));
        t.put("shift", Object.assign({}, s, { published: pub }));
      };
      swapIn(sh, x.from_staff_id, x.to_staff_id);
      if (tgt && tgt.published) swapIn(byId(state, "shift", tgt.id), x.to_staff_id, x.from_staff_id);
      const no = state.version.reduce((m, v) => Math.max(m, v.no || 0), 0) + 1;
      const fs = byId(state, "staff", x.from_staff_id), ts = byId(state, "staff", x.to_staff_id);
      t.put("version", {
        id: uid("vr"),
        no,
        at: now,
        by: actor.email,
        by_name: actor.name || actor.email,
        start: sh.published.date,
        end: tgt && tgt.published ? tgt.published.date : sh.published.date,
        department_id: sh.department_id,
        kind: "swap",
        note: "Shift exchange approved: " + (fs ? fs.name : "") + " \u2192 " + (ts ? ts.name : ""),
        counts: { added: 0, changed: tgt ? 2 : 1, removed: 0 },
        changes: [{ type: "changed", date: sh.published.date, name: sh.published.name, time: sh.published.start + "\u2013" + sh.published.end, department_id: sh.department_id }],
        affected: [x.from_staff_id, x.to_staff_id]
      });
    }
    t.put("swap", Object.assign({}, x, { status: ok ? "approved" : "rejected", decided_by: actor.email, decided_at: now, comment: str(p.comment, 300) }));
    [x.from_staff_id, x.to_staff_id].forEach((sid) => notify(t, sid, "Shift exchange for " + sh.published.date + " " + sh.published.name + " was " + (ok ? "approved \u2014 the published roster is updated." : "rejected."), "swap", x.id, now));
    return { summary: (ok ? "Approved" : "Rejected") + " shift exchange " + sh.published.date };
  },
  "swap.cancel"(state, actor, p, t, now) {
    const x = byId(state, "swap", p.id);
    if (!x) fail("notfound", "Request not found.");
    if (x.from_staff_id !== actor.staff_id) fail("forbidden", "Only the requester can cancel.");
    if (!["pending_peer", "pending_approval"].includes(x.status)) fail("invalid", "This request is closed.");
    t.put("swap", Object.assign({}, x, { status: "cancelled", decided_at: now }));
    return { summary: "Cancelled shift exchange request" };
  },
  /* ---------------- notifications ---------------- */
  "notif.read"(state, actor, p, t) {
    const mine = state.notif.filter((n) => !n.read && (n.to_staff_id === actor.staff_id && actor.staff_id || n.to_email === actor.email) && (!p.ids || p.ids.includes(n.id)));
    mine.forEach((n) => t.put("notif", Object.assign({}, n, { read: true })));
    return { summary: null };
  }
};
var ACTION_NAMES = Object.keys(ACTIONS);
function apply(state, actor, action, payload, now = Date.now()) {
  const fn = ACTIONS[action];
  if (!fn) fail("invalid", "Unknown action: " + action);
  if (!actor || !actor.email) fail("forbidden", "Not signed in.");
  const t = tx(state);
  const out = fn(state, actor, payload || {}, t, now) || {};
  state.meta = { rev: (state.meta.rev || 0) + 1, updated_at: now, updated_by: actor.email };
  return { changes: t.changes, summary: out.summary || null, result: out.result === void 0 ? null : out.result, warnings: out.warnings || [] };
}
function viewFor(state, actor) {
  const v = clone(state);
  const drafts = can(actor, "drafts");
  if (!drafts) {
    v.shift = v.shift.filter((s) => s.published).map((s) => Object.assign({ id: s.id, series_id: s.series_id }, s.published, { published: s.published, dirty: false, deleted: false }));
    v.assignment = [];
    v.shift.forEach((s) => s.published.staff_ids.forEach((sid) => v.assignment.push({ id: s.id + ":" + sid, shift_id: s.id, staff_id: sid, proposed: false })));
  } else if (actor.dept_scope && actor.dept_scope.length) {
    v.shift = v.shift.map((s) => inScope(actor, s.department_id) ? s : s.published ? Object.assign({}, s, s.published, { dirty: false, deleted: false }) : null).filter(Boolean);
    const ok = new Set(v.shift.map((s) => s.id));
    v.assignment = v.assignment.filter((a) => ok.has(a.shift_id));
  }
  if (!can(actor, "contacts")) v.staff.forEach((s) => {
    if (s.id !== actor.staff_id) {
      delete s.email;
      delete s.phone;
    }
  });
  if (!can(actor, "users")) v.user = v.user.filter((u) => u.email === actor.email);
  const approver = can(actor, "approve");
  v.leave = v.leave.filter((l) => l.staff_id === actor.staff_id || approver && can(actor, "approve", (state.staff.find((s) => s.id === l.staff_id) || {}).department_id) || l.status === "approved").map((l) => l.staff_id === actor.staff_id || approver ? l : { id: l.id, staff_id: l.staff_id, start: l.start, end: l.end, status: l.status, type: "Leave" });
  v.swap = v.swap.filter((x) => x.from_staff_id === actor.staff_id || x.to_staff_id === actor.staff_id || approver);
  v.notif = v.notif.filter((n) => actor.staff_id && n.to_staff_id === actor.staff_id || n.to_email === actor.email).slice(-100);
  v.ack = v.ack.filter((a) => a.staff_id === actor.staff_id || approver);
  return v;
}

// roster-worker.src.js
var SCHEMA = [
  "CREATE TABLE IF NOT EXISTS records (kind TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY (kind, id))",
  "CREATE TABLE IF NOT EXISTS audit (seq INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, actor TEXT NOT NULL, action TEXT NOT NULL, summary TEXT, payload TEXT, rev INTEGER)",
  "CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT NOT NULL)",
  "CREATE TABLE IF NOT EXISTS guard (x INTEGER CHECK (x = 1))",
  "CREATE INDEX IF NOT EXISTS audit_at ON audit (at)",
  "INSERT OR IGNORE INTO meta (k, v) VALUES ('rev', '0')"
];
var schemaReady = false;
var cache = null;
var certs = null;
var json = (obj, status = 200) => new Response(JSON.stringify(obj), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" }
});
var deny = (status, code, error, details) => json({ ok: false, code, error, details: details || null }, status);
function b64url(s) {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}
async function accessKeys(team) {
  if (certs && Date.now() - certs.at < 36e5) return certs.keys;
  const r = await fetch(team.replace(/\/$/, "") + "/cdn-cgi/access/certs");
  if (!r.ok) throw new Error("certs");
  certs = { at: Date.now(), keys: (await r.json()).keys || [] };
  return certs.keys;
}
async function verifyAccessJwt(token, env) {
  const [h, p, sig] = token.split(".");
  if (!h || !p || !sig) return null;
  const header = JSON.parse(new TextDecoder().decode(b64url(h)));
  const payload = JSON.parse(new TextDecoder().decode(b64url(p)));
  const jwk = (await accessKeys(env.ACCESS_TEAM_DOMAIN)).find((k) => k.kid === header.kid);
  if (!jwk || header.alg !== "RS256") return null;
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64url(sig), new TextEncoder().encode(h + "." + p));
  if (!ok) return null;
  const now = Date.now() / 1e3;
  const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (payload.exp && payload.exp < now) return null;
  if (!aud.includes(env.ACCESS_AUD)) return null;
  if (payload.iss && payload.iss.replace(/\/$/, "") !== env.ACCESS_TEAM_DOMAIN.replace(/\/$/, "")) return null;
  return payload.email ? String(payload.email).toLowerCase() : null;
}
async function identify(request, env) {
  if (env.DEV_INSECURE_AUTH === "yes-local-only") {
    const dev = request.headers.get("x-dev-user");
    if (dev) return dev.toLowerCase();
  }
  if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) return { error: "Sign-in (Cloudflare Access) is not configured on the server." };
  const cookie = (request.headers.get("cookie") || "").match(/(?:^|;\s*)CF_Authorization=([^;]+)/);
  const token = request.headers.get("cf-access-jwt-assertion") || cookie && cookie[1];
  if (!token) return null;
  try {
    return await verifyAccessJwt(token, env);
  } catch (e) {
    return null;
  }
}
function actorFor(email, state, env) {
  const boot = String(env.ADMIN_EMAILS || "").toLowerCase().split(/[\s,;]+/).filter(Boolean);
  const user = state.user.find((u) => u.email === email && u.active !== false);
  const staff = state.staff.find((s) => s.email && s.email.toLowerCase() === email && s.status !== "Inactive");
  let role = user ? user.role : staff ? "staff" : "viewer";
  if (boot.includes(email)) role = "admin";
  const staffId = user && user.staff_id || staff && staff.id || null;
  const st = staffId && state.staff.find((s) => s.id === staffId);
  return { email, role, staff_id: staffId, dept_scope: role === "admin" ? null : user && user.dept_scope || null, name: st && st.name || email };
}
async function ensureSchema(db) {
  if (schemaReady) return;
  await db.batch(SCHEMA.map((s) => db.prepare(s)));
  schemaReady = true;
}
async function currentRev(db) {
  const r = await db.prepare("SELECT v FROM meta WHERE k = 'rev'").first();
  return r ? Number(r.v) : 0;
}
async function loadState(db) {
  const rev = await currentRev(db);
  if (cache && cache.rev === rev) return { rev, state: structuredClone(cache.state) };
  const state = emptyState();
  const { results } = await db.prepare("SELECT kind, data FROM records").all();
  for (const r of results) if (state[r.kind]) state[r.kind].push(JSON.parse(r.data));
  state.meta = { rev };
  if (!state.settings.length) {
    seedConfig(state);
    const now = Date.now(), stmts = [];
    for (const k of ["settings", "department", "template"]) for (const row of state[k]) stmts.push(upsert(db, k, row, now));
    await db.batch(stmts);
  }
  cache = { rev, state };
  return { rev, state: structuredClone(state) };
}
function upsert(db, kind, row, now) {
  return db.prepare("INSERT INTO records (kind, id, data, updated_at) VALUES (?1, ?2, ?3, ?4) ON CONFLICT (kind, id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at").bind(kind, String(row.id), JSON.stringify(row), now);
}
async function commit(db, baseRev, changes, audit) {
  const now = Date.now(), newRev = baseRev + 1;
  const stmts = [db.prepare("INSERT INTO guard (x) SELECT CASE WHEN (SELECT v FROM meta WHERE k = 'rev') = ?1 THEN 1 ELSE 0 END").bind(String(baseRev))];
  for (const c of changes) {
    if (!KINDS.includes(c.kind)) continue;
    stmts.push(c.op === "del" ? db.prepare("DELETE FROM records WHERE kind = ?1 AND id = ?2").bind(c.kind, String(c.id)) : upsert(db, c.kind, c.row, now));
  }
  if (audit) stmts.push(db.prepare("INSERT INTO audit (at, actor, action, summary, payload, rev) VALUES (?1, ?2, ?3, ?4, ?5, ?6)").bind(now, audit.actor, audit.action, audit.summary, audit.payload, newRev));
  stmts.push(db.prepare("UPDATE meta SET v = ?1 WHERE k = 'rev'").bind(String(newRev)));
  stmts.push(db.prepare("DELETE FROM guard"));
  await db.batch(stmts);
  return newRev;
}
async function readBody(request, max) {
  const len = Number(request.headers.get("content-length") || 0);
  if (len > max) throw new RosterError("invalid", "Request too large.");
  const text = await request.text();
  if (text.length > max) throw new RosterError("invalid", "Request too large.");
  return text ? JSON.parse(text) : {};
}
var STATUS = { forbidden: 403, notfound: 404, conflict: 409, confirm: 409, invalid: 400 };
async function api(request, env, path) {
  if (path === "/api/health") return json({ ok: true, app: "asmh-roster", version: VERSION, configured: { database: !!env.DB, access: !!(env.ACCESS_TEAM_DOMAIN && env.ACCESS_AUD) } });
  if (!env.DB) return deny(503, "not_configured", 'The roster database (D1 binding "DB") is not configured.');
  const who = await identify(request, env);
  if (who && who.error) return deny(503, "not_configured", who.error);
  if (!who) return deny(401, "unauthenticated", "Please sign in.");
  if (request.method === "POST" && request.headers.get("content-type") && !/json|text\/plain/.test(request.headers.get("content-type"))) return deny(415, "invalid", "Unsupported content type.");
  await ensureSchema(env.DB);
  let { rev, state } = await loadState(env.DB);
  let actor = actorFor(who, state, env);
  if (request.method === "GET" && path === "/api/rev") return json({ ok: true, rev });
  if (request.method === "GET" && (path === "/api/state" || path === "/api/me")) {
    return json({ ok: true, rev, me: actor, state: path === "/api/me" ? void 0 : viewFor(state, actor) });
  }
  if (request.method === "GET" && path === "/api/audit") {
    if (!can(actor, "audit")) return deny(403, "forbidden", "Not permitted.");
    const url = new URL(request.url), limit = Math.min(1e3, Number(url.searchParams.get("limit")) || 300);
    const { results } = await env.DB.prepare("SELECT seq, at, actor, action, summary, rev FROM audit ORDER BY seq DESC LIMIT ?1").bind(limit).all();
    return json({ ok: true, audit: results });
  }
  if (request.method === "GET" && path === "/api/backup") {
    if (!can(actor, "backup")) return deny(403, "forbidden", "Not permitted.");
    const { results } = await env.DB.prepare("SELECT seq, at, actor, action, summary, rev FROM audit ORDER BY seq").all();
    return new Response(JSON.stringify({ app: "asmh-roster", version: VERSION, exported_at: (/* @__PURE__ */ new Date()).toISOString(), rev, state, audit: results }), {
      headers: { "content-type": "application/json", "content-disposition": 'attachment; filename="asmh-roster-backup-' + (/* @__PURE__ */ new Date()).toISOString().slice(0, 10) + '.json"', "cache-control": "no-store" }
    });
  }
  if (request.method === "POST" && path === "/api/restore") {
    if (!can(actor, "backup")) return deny(403, "forbidden", "Not permitted.");
    const body = await readBody(request, 2e7);
    const src = body.state || {};
    for (const k of KINDS) if (src[k] && !Array.isArray(src[k])) return deny(400, "invalid", "Backup file is not valid.");
    const now = Date.now(), stmts = [env.DB.prepare("DELETE FROM records")];
    for (const k of KINDS) for (const row of src[k] || []) if (row && row.id != null) stmts.push(upsert(env.DB, k, row, now));
    stmts.push(env.DB.prepare("INSERT INTO audit (at, actor, action, summary, payload, rev) VALUES (?1, ?2, ?3, ?4, ?5, ?6)").bind(now, actor.email, "backup.restore", "Restored backup from " + (body.exported_at || "file"), null, rev + 1));
    stmts.push(env.DB.prepare("UPDATE meta SET v = ?1 WHERE k = 'rev'").bind(String(rev + 1)));
    await env.DB.batch(stmts);
    cache = null;
    return json({ ok: true, rev: rev + 1 });
  }
  if (request.method === "POST" && path === "/api/action") {
    const body = await readBody(request, 1e6);
    const action = String(body.action || "");
    if (!ACTION_NAMES.includes(action)) return deny(400, "invalid", "Unknown action.");
    for (let attempt = 0; attempt < 6; attempt++) {
      if (attempt) await new Promise((r) => setTimeout(r, 15 + Math.random() * 60 * attempt));
      try {
        const out = apply(state, actor, action, body.payload || {}, Date.now());
        const audit = out.summary ? { actor: actor.email, action, summary: out.summary, payload: JSON.stringify(body.payload || {}).slice(0, 4e3) } : null;
        let newRev;
        try {
          newRev = await commit(env.DB, rev, out.changes, audit);
        } catch (e) {
          if (/CHECK constraint/i.test(String(e && e.message))) {
            ({ rev, state } = await loadState(env.DB));
            actor = actorFor(who, state, env);
            continue;
          }
          throw e;
        }
        state.meta = { rev: newRev };
        cache = { rev: newRev, state: structuredClone(state) };
        return json({ ok: true, rev: newRev, summary: out.summary, result: out.result, warnings: out.warnings, me: actor, state: viewFor(state, actor) });
      } catch (e) {
        if (e instanceof RosterError) return deny(STATUS[e.code] || 400, e.code, e.message, e.details);
        throw e;
      }
    }
    return deny(409, "busy", "The roster is being edited by someone else. Please try again.");
  }
  return deny(404, "notfound", "Unknown endpoint.");
}
var roster_worker_src_default = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      try {
        return await api(request, env, url.pathname);
      } catch (e) {
        return deny(500, "server_error", "Server error. The change was not saved.", String(e && e.message || e).slice(0, 200));
      }
    }
    if (/^\/(roster-worker\.src\.js|_worker\.js|package(-lock)?\.json)$/.test(url.pathname)) return new Response("Not found", { status: 404 });
    return env.ASSETS.fetch(request);
  }
};
export {
  roster_worker_src_default as default
};
