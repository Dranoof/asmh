# ASMH CarePortal — Duty Roster: setup and architecture

The Staff Duty Roster opens inside the CarePortal itself (`index.html#/roster`, or the **Duty Roster** menu in the top navigation). Its account menu (role, demo "view as", notifications) sits in the portal header. The old `roster.html` address forwards there. It runs in two modes:

| Mode | Where | Data | Sign-in |
| --- | --- | --- | --- |
| **Demo** | GitHub Pages (`dranoof.github.io/asmh/#/roster`) or any host without the backend | Fictional staff generated in the browser and saved only in that browser. Clearly labelled "Demo data". | None. A "View as" switcher lets you try each role. |
| **Live** | Cloudflare Pages with D1 + Cloudflare Access | One shared database for every device | Cloudflare Access (email code or Google), verified on the server |

GitHub Pages only serves static files and cannot run a secure backend, so the live roster needs Cloudflare Pages (free plan). It uses the same Cloudflare Access setup described in *CarePortal Sign-in Setup*.

## Architecture

```
Browser (index.html + roster-embed.js + roster-*.js)
   │  fetch /api/state, /api/action, /api/rev (polled every 20 s)
   ▼
Cloudflare Pages worker (_worker.js, built from roster-worker.src.js)
   ├─ verifies the Cloudflare Access JWT (RS256, team certs, AUD)
   ├─ maps email → role (users table, staff email, ADMIN_EMAILS)
   ├─ validates every change with roster-engine.js (same rules as the UI)
   ├─ writes atomically to D1 (optimistic revision guard), appends the audit log
   └─ returns only what that user may see (drafts, contacts, others' requests redacted)
   ▼
Cloudflare D1 (SQLite): records, audit, meta
```

- **Roles:** Administrator · Roster administrator (per department) · Supervisor (approves leave and exchanges) · Staff (own roster and requests).
- **Draft and published:** editors work on a draft. *Publish* copies it into the published roster, creates a version, and notifies the staff whose duties changed. Staff see only published shifts.
- **Shift exchanges** change the published roster only after the colleague accepts and a supervisor approves.

## One-time setup (about 20 minutes, after the sign-in setup)

1. **Create the database.** In the Cloudflare dashboard, go to **Storage & Databases → D1 → Create** and name it `asmh-roster`.
2. **Bind it to the site.** Open **Workers & Pages → asmh-careportal → Settings → Bindings → Add → D1 database**. Set the variable name to `DB` and the database to `asmh-roster`. Do this for Production (and Preview if used).
3. **Add variables.** Go to **Settings → Variables and secrets**:
   - `ACCESS_TEAM_DOMAIN`: `https://<your-team>.cloudflareaccess.com`
   - `ACCESS_AUD`: the *Application Audience (AUD) Tag* from **Zero Trust → Access → Applications → (CarePortal) → Overview**
   - `ADMIN_EMAILS`: e.g. `dranooof@gmail.com` (comma-separated; these accounts are always administrators)
4. **Redeploy.** Go to **Deployments → … → Retry deployment**, or commit any change.
5. **Check.** Open `https://<site>.pages.dev/api/health`. It should show `"database": true, "access": true`.
6. **Open the roster.** Visit `/#/roster` (or `/roster.html`, which forwards there). The badge in the top bar should read **Live · synced**. Tables are created automatically, and the default departments and shift templates are added on first use.
7. **Add real data.** Add staff (each with their sign-in email) under **Staff Directory**. Under **Settings → Users & roles**, give roster administrators and supervisors their roles and departments. Then set staffing requirements and build the first roster.

Never set `DEV_INSECURE_AUTH` in Cloudflare. It exists only for local testing.

## Backups and recovery

- **Settings → Backup & restore** downloads a full JSON backup (all records plus the audit log) and can restore one. Every restore is recorded in the audit log.
- D1 also keeps 30 days of point-in-time recovery (Time Travel): `npx wrangler d1 time-travel restore asmh-roster --timestamp=<ISO time>`.
- We suggest a weekly manual backup saved to the hospital shared drive.

## Changing the code

The UI files (`index.html`, `roster.css`, `roster-*.js`) are served as they are. If you change `roster-engine.js` or `roster-worker.src.js`, rebuild the server bundle before committing:

```
npx esbuild roster-worker.src.js --bundle --format=esm --outfile=_worker.js
```

### Local testing

```
npx wrangler pages dev . --d1 DB=roster-db --binding DEV_INSECURE_AUTH=yes-local-only --binding ADMIN_EMAILS=you@example.com
```

Then send requests with the header `x-dev-user: you@example.com`.

## Not included yet

- **Email, SMS and push notifications.** Notifications appear inside the app (bell icon, My Roster badge). Sending email needs a mail provider and is not set up.
- **Real-time push.** Devices pick up changes by checking every 20 seconds, and immediately when the tab regains focus.
- **Scale.** The whole roster is loaded per request and cached per server instance. This suits a hospital of a few hundred staff. Archive rosters older than a year with a backup if the database grows large.
- **HR integration.** Staff profiles are entered in the roster. There is no sync with the HR system or Active Directory.
