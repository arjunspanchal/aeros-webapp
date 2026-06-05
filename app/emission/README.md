# Emission · Service OS — UI module

Self-contained route module under `app/emission/*` inside the Aeros webapp. It has
its **own** theme, fonts, PIN gate, and data layer, and is **not** in
`middleware.js`'s matcher — so the host Aeros app's auth/nav/layout never touch
it, and Emission code never reaches back into the host (one-directional imports).

```
app/emission/
  layout.js                 scopes .emission-root + loads Shell (PIN gate)
  emission.css              scoped theme (greyscale + gold-on-dark) + fonts
  page.js                   → redirects to /emission/jobs
  _lib/    config, schemas (zod), format, client (PostgREST/RPC/Storage), auth, data
  _components/  AuthProvider, Shell, PinGate, TopBar, SignaturePad, ui
  intake/                   /JOB INTAKE  (?historical=1 = back-entry mode)
  jobs/                     /JOB LIST
  jobs/[jobNo]/             job detail (status, line items, warranty, money)
  dashboard/                /OWNER DASHBOARD  (dark, gold, admin PIN only)
  status/                   /PUBLIC STATUS LOOKUP (anon, no PIN)
```

## How it talks to the backend
Client-side direct PostgREST. On PIN entry the gate calls the `emission-verify-pin`
edge function, which returns a signed JWT whose `role` claim is the dedicated DB
role (`emission_staff` / `emission_admin`). Every data call sends that token as
`Authorization: Bearer` with `Content-Profile: emission`, so **Postgres RLS + the
column-grant money wall enforce everything** — the browser is never trusted.
Token is kept in `localStorage` (trusted-device: admin 7-day / staff 30-day expiry).

The money wall is real in the UI too: staff requests select only non-financial
columns (`JOB_STAFF_COLUMNS`), the dashboard RPCs are admin-only, and writes pass
a role-scoped `?select=` so a staff `RETURNING *` never 403s on financial columns.

## Run locally
```bash
cd aeros-catalog
npm run dev            # http://localhost:3000/emission
```

## Env vars (already added to `.env.local`; both are PUBLIC, safe to ship)
```
NEXT_PUBLIC_SUPABASE_URL=https://smcfbapcsjhxaxigcpjj.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<legacy anon key>
```
Add the same two to Vercel (Production + Preview) for deploys.

## Before the UI can load/save data — the Paste-1 backend go-live steps
The UI is built and verified, but data flow needs these (see
`emission-service-os/README.md`), all done once in the Supabase dashboard:
1. **Expose the `emission` schema** (Settings → API → Exposed schemas). Until then
   PostgREST returns `PGRST106 Invalid schema: emission`.
2. Set edge secrets `EMISSION_SUPA_JWT_SECRET` + `EMISSION_SETUP_SECRET`. Until then
   `emission-verify-pin` returns `server_misconfigured` and login can't mint a token.
3. Set the two PINs via `emission-set-pins`, and the cutover job number.

## Verified (local dev)
- All 6 routes compile + serve 200; zero console errors.
- PIN gate renders (no session); `/emission/status` renders bypassing the gate.
- Host routes `/`, `/catalog`, `/login`, `/warehouse` unaffected (200).
- Client correctly hits Supabase; `emission-verify-pin` reachable (CORS + verify_jwt OK).
- Blocked only by the dashboard steps above — both surfaced precise, expected errors.
