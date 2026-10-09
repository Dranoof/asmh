/* =====================================================================
 * ASMH CarePortal — Cloudflare Pages worker (source)
 * Built into _worker.js by:  npx esbuild roster-worker.src.js --bundle --format=esm --outfile=_worker.js
 *
 * - Serves the static site unchanged (env.ASSETS).
 * - /api/* = Duty Roster backend: Cloudflare Access identity (JWT verified),
 *   role-based permissions, server-side validation (roster-engine.js),
 *   D1 storage, audit log, optimistic concurrency, backup/restore.
 *
 * Required bindings / variables (Cloudflare Pages → Settings):
 *   DB                  D1 database binding
 *   ACCESS_TEAM_DOMAIN  e.g. https://asmh.cloudflareaccess.com
 *   ACCESS_AUD          Application Audience (AUD) tag of the Access app
 *   ADMIN_EMAILS        comma-separated bootstrap administrators
 * Never set DEV_INSECURE_AUTH in production.
 * ===================================================================== */
import * as E from './roster-engine.js';

const SCHEMA = [
  "CREATE TABLE IF NOT EXISTS records (kind TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY (kind, id))",
  "CREATE TABLE IF NOT EXISTS audit (seq INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, actor TEXT NOT NULL, action TEXT NOT NULL, summary TEXT, payload TEXT, rev INTEGER)",
  "CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT NOT NULL)",
  "CREATE TABLE IF NOT EXISTS guard (x INTEGER CHECK (x = 1))",
  "CREATE INDEX IF NOT EXISTS audit_at ON audit (at)",
  "INSERT OR IGNORE INTO meta (k, v) VALUES ('rev', '0')"
];

let schemaReady = false;
let cache = null;              // { rev, state } — per isolate, refreshed when rev changes
let certs = null;              // { at, keys }

const json = (obj, status = 200) => new Response(JSON.stringify(obj), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }
});
const deny = (status, code, error, details) => json({ ok: false, code, error, details: details || null }, status);

/* ------------------------------------------------------------------ */
/* identity: Cloudflare Access JWT                                     */
/* ------------------------------------------------------------------ */
function b64url(s) { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; return Uint8Array.from(atob(s), c => c.charCodeAt(0)); }
async function accessKeys(team) {
  if (certs && Date.now() - certs.at < 3600e3) return certs.keys;
  const r = await fetch(team.replace(/\/$/, '') + '/cdn-cgi/access/certs');
  if (!r.ok) throw new Error('certs');
  certs = { at: Date.now(), keys: (await r.json()).keys || [] };
  return certs.keys;
}
async function verifyAccessJwt(token, env) {
  const [h, p, sig] = token.split('.');
  if (!h || !p || !sig) return null;
  const header = JSON.parse(new TextDecoder().decode(b64url(h)));
  const payload = JSON.parse(new TextDecoder().decode(b64url(p)));
  const jwk = (await accessKeys(env.ACCESS_TEAM_DOMAIN)).find(k => k.kid === header.kid);
  if (!jwk || header.alg !== 'RS256') return null;
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64url(sig), new TextEncoder().encode(h + '.' + p));
  if (!ok) return null;
  const now = Date.now() / 1000;
  const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (payload.exp && payload.exp < now) return null;
  if (!aud.includes(env.ACCESS_AUD)) return null;
  if (payload.iss && payload.iss.replace(/\/$/, '') !== env.ACCESS_TEAM_DOMAIN.replace(/\/$/, '')) return null;
  return payload.email ? String(payload.email).toLowerCase() : null;
}
async function identify(request, env) {
  if (env.DEV_INSECURE_AUTH === 'yes-local-only') {               // local development only
    const dev = request.headers.get('x-dev-user');
    if (dev) return dev.toLowerCase();
  }
  if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) return { error: 'Sign-in (Cloudflare Access) is not configured on the server.' };
  const cookie = (request.headers.get('cookie') || '').match(/(?:^|;\s*)CF_Authorization=([^;]+)/);
  const token = request.headers.get('cf-access-jwt-assertion') || (cookie && cookie[1]);
  if (!token) return null;
  try { return await verifyAccessJwt(token, env); } catch (e) { return null; }
}
function actorFor(email, state, env) {
  const boot = String(env.ADMIN_EMAILS || '').toLowerCase().split(/[\s,;]+/).filter(Boolean);
  const user = state.user.find(u => u.email === email && u.active !== false);
  const staff = state.staff.find(s => s.email && s.email.toLowerCase() === email && s.status !== 'Inactive');
  let role = user ? user.role : staff ? 'staff' : 'viewer';
  if (boot.includes(email)) role = 'admin';
  const staffId = (user && user.staff_id) || (staff && staff.id) || null;
  const st = staffId && state.staff.find(s => s.id === staffId);
  return { email, role, staff_id: staffId, dept_scope: role === 'admin' ? null : (user && user.dept_scope) || null, name: (st && st.name) || email };
}

/* ------------------------------------------------------------------ */
/* storage                                                             */
/* ------------------------------------------------------------------ */
async function ensureSchema(db) {
  if (schemaReady) return;
  await db.batch(SCHEMA.map(s => db.prepare(s)));
  schemaReady = true;
}
async function currentRev(db) { const r = await db.prepare("SELECT v FROM meta WHERE k = 'rev'").first(); return r ? Number(r.v) : 0; }
async function loadState(db) {
  const rev = await currentRev(db);
  if (cache && cache.rev === rev) return { rev, state: structuredClone(cache.state) };
  const state = E.emptyState();
  const { results } = await db.prepare('SELECT kind, data FROM records').all();
  for (const r of results) if (state[r.kind]) state[r.kind].push(JSON.parse(r.data));
  state.meta = { rev };
  if (!state.settings.length) {                                   // first run: default departments/templates
    E.seedConfig(state);
    const now = Date.now(), stmts = [];
    for (const k of ['settings', 'department', 'template']) for (const row of state[k]) stmts.push(upsert(db, k, row, now));
    await db.batch(stmts);
  }
  cache = { rev, state };
  return { rev, state: structuredClone(state) };
}
function upsert(db, kind, row, now) {
  return db.prepare('INSERT INTO records (kind, id, data, updated_at) VALUES (?1, ?2, ?3, ?4) ON CONFLICT (kind, id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at')
    .bind(kind, String(row.id), JSON.stringify(row), now);
}
/** atomic write: aborts (CHECK constraint) if someone else wrote first */
async function commit(db, baseRev, changes, audit) {
  const now = Date.now(), newRev = baseRev + 1;
  const stmts = [db.prepare("INSERT INTO guard (x) SELECT CASE WHEN (SELECT v FROM meta WHERE k = 'rev') = ?1 THEN 1 ELSE 0 END").bind(String(baseRev))];
  for (const c of changes) {
    if (!E.KINDS.includes(c.kind)) continue;
    stmts.push(c.op === 'del' ? db.prepare('DELETE FROM records WHERE kind = ?1 AND id = ?2').bind(c.kind, String(c.id)) : upsert(db, c.kind, c.row, now));
  }
  if (audit) stmts.push(db.prepare('INSERT INTO audit (at, actor, action, summary, payload, rev) VALUES (?1, ?2, ?3, ?4, ?5, ?6)').bind(now, audit.actor, audit.action, audit.summary, audit.payload, newRev));
  stmts.push(db.prepare("UPDATE meta SET v = ?1 WHERE k = 'rev'").bind(String(newRev)));
  stmts.push(db.prepare('DELETE FROM guard'));
  await db.batch(stmts);
  return newRev;
}

/* ------------------------------------------------------------------ */
/* API                                                                 */
/* ------------------------------------------------------------------ */
async function readBody(request, max) {
  const len = Number(request.headers.get('content-length') || 0);
  if (len > max) throw new E.RosterError('invalid', 'Request too large.');
  const text = await request.text();
  if (text.length > max) throw new E.RosterError('invalid', 'Request too large.');
  return text ? JSON.parse(text) : {};
}
const STATUS = { forbidden: 403, notfound: 404, conflict: 409, confirm: 409, invalid: 400 };

async function api(request, env, path) {
  if (path === '/api/health') return json({ ok: true, app: 'asmh-roster', version: E.VERSION, configured: { database: !!env.DB, access: !!(env.ACCESS_TEAM_DOMAIN && env.ACCESS_AUD) } });
  if (!env.DB) return deny(503, 'not_configured', 'The roster database (D1 binding "DB") is not configured.');
  const who = await identify(request, env);
  if (who && who.error) return deny(503, 'not_configured', who.error);
  if (!who) return deny(401, 'unauthenticated', 'Please sign in.');
  if (request.method === 'POST' && request.headers.get('content-type') && !/json|text\/plain/.test(request.headers.get('content-type'))) return deny(415, 'invalid', 'Unsupported content type.');

  await ensureSchema(env.DB);
  let { rev, state } = await loadState(env.DB);
  let actor = actorFor(who, state, env);

  if (request.method === 'GET' && path === '/api/rev') return json({ ok: true, rev });
  if (request.method === 'GET' && (path === '/api/state' || path === '/api/me')) {
    return json({ ok: true, rev, me: actor, state: path === '/api/me' ? undefined : E.viewFor(state, actor) });
  }
  if (request.method === 'GET' && path === '/api/audit') {
    if (!E.can(actor, 'audit')) return deny(403, 'forbidden', 'Not permitted.');
    const url = new URL(request.url), limit = Math.min(1000, Number(url.searchParams.get('limit')) || 300);
    const { results } = await env.DB.prepare('SELECT seq, at, actor, action, summary, rev FROM audit ORDER BY seq DESC LIMIT ?1').bind(limit).all();
    return json({ ok: true, audit: results });
  }
  if (request.method === 'GET' && path === '/api/backup') {
    if (!E.can(actor, 'backup')) return deny(403, 'forbidden', 'Not permitted.');
    const { results } = await env.DB.prepare('SELECT seq, at, actor, action, summary, rev FROM audit ORDER BY seq').all();
    return new Response(JSON.stringify({ app: 'asmh-roster', version: E.VERSION, exported_at: new Date().toISOString(), rev, state, audit: results }), {
      headers: { 'content-type': 'application/json', 'content-disposition': 'attachment; filename="asmh-roster-backup-' + new Date().toISOString().slice(0, 10) + '.json"', 'cache-control': 'no-store' }
    });
  }
  if (request.method === 'POST' && path === '/api/restore') {
    if (!E.can(actor, 'backup')) return deny(403, 'forbidden', 'Not permitted.');
    const body = await readBody(request, 20e6);
    const src = body.state || {};
    for (const k of E.KINDS) if (src[k] && !Array.isArray(src[k])) return deny(400, 'invalid', 'Backup file is not valid.');
    const now = Date.now(), stmts = [env.DB.prepare('DELETE FROM records')];
    for (const k of E.KINDS) for (const row of (src[k] || [])) if (row && row.id != null) stmts.push(upsert(env.DB, k, row, now));
    stmts.push(env.DB.prepare('INSERT INTO audit (at, actor, action, summary, payload, rev) VALUES (?1, ?2, ?3, ?4, ?5, ?6)').bind(now, actor.email, 'backup.restore', 'Restored backup from ' + (body.exported_at || 'file'), null, rev + 1));
    stmts.push(env.DB.prepare("UPDATE meta SET v = ?1 WHERE k = 'rev'").bind(String(rev + 1)));
    await env.DB.batch(stmts);
    cache = null;
    return json({ ok: true, rev: rev + 1 });
  }
  if (request.method === 'POST' && path === '/api/action') {
    const body = await readBody(request, 1e6);
    const action = String(body.action || '');
    if (!E.ACTION_NAMES.includes(action)) return deny(400, 'invalid', 'Unknown action.');
    for (let attempt = 0; attempt < 6; attempt++) {
      if (attempt) await new Promise(r => setTimeout(r, 15 + Math.random() * 60 * attempt));
      try {
        const out = E.apply(state, actor, action, body.payload || {}, Date.now());
        const audit = out.summary ? { actor: actor.email, action, summary: out.summary, payload: JSON.stringify(body.payload || {}).slice(0, 4000) } : null;
        let newRev;
        try { newRev = await commit(env.DB, rev, out.changes, audit); }
        catch (e) {
          if (/CHECK constraint/i.test(String(e && e.message))) { ({ rev, state } = await loadState(env.DB)); actor = actorFor(who, state, env); continue; }
          throw e;
        }
        state.meta = { rev: newRev };
        cache = { rev: newRev, state: structuredClone(state) };
        return json({ ok: true, rev: newRev, summary: out.summary, result: out.result, warnings: out.warnings, me: actor, state: E.viewFor(state, actor) });
      } catch (e) {
        if (e instanceof E.RosterError) return deny(STATUS[e.code] || 400, e.code, e.message, e.details);
        throw e;
      }
    }
    return deny(409, 'busy', 'The roster is being edited by someone else. Please try again.');
  }
  return deny(404, 'notfound', 'Unknown endpoint.');
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      try { return await api(request, env, url.pathname); }
      catch (e) { return deny(500, 'server_error', 'Server error. The change was not saved.', String(e && e.message || e).slice(0, 200)); }
    }
    // keep build/source files private
    if (/^\/(roster-worker\.src\.js|_worker\.js|package(-lock)?\.json)$/.test(url.pathname)) return new Response('Not found', { status: 404 });
    return env.ASSETS.fetch(request);
  }
};
