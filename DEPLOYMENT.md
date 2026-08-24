# StrainX — Deployment runbook

This is the end-to-end guide to standing StrainX up on a server: the **Phase 0
care tool**, plus the **Phase 1 HRV bench-validation study** additions (migration
`0007`) once a center is legitimately in `study_mode`.

Read [`CONTRIBUTING.md`](CONTRIBUTING.md) first — the invariants there are enforced by the
database and the build, not by convention. Nothing in this runbook weakens the
phase gate.

---

## 1. What gets deployed where

Three separate deploys; only the web app is a conventional "server":

| Piece | What it is | Where it runs |
|---|---|---|
| **Supabase** | Postgres + Auth + Storage + Edge Functions + `pg_cron` | Supabase Cloud (recommended, **Seoul** region) |
| **`apps/web`** | Check-in PWA **and** staff dashboard (Next.js 14, SSR + middleware — not a static export) | Vercel **or** an Ubuntu VPS |
| **`apps/kiosk`** | Native capture app for the center phones (Expo/RN, Vision Camera + BLE) | Installed on the phones via a dev/production build |

**Recommendation:** Supabase Cloud (Seoul) + Vercel is the lowest-effort correct
setup. The VPS path (specs in §5) is here if you must own the server.

---

## 2. Compliance guardrails (do not regress these during deploy)

- **Never** hand-set `centers.study_mode = true`. Open the gate only via
  `scripts/set-study-mode.mjs` with a real approval ref, or `--poc` for a
  code-review POC (writes an explicit placeholder). The Postgres CHECK refuses
  `study_mode` without `ethics_approval_ref` + `ethics_approved_at`.
- **Data residency:** choose the **Seoul (`ap-northeast-2`)** Supabase region —
  elderly-care + facial video of Korean seniors.
- `SUPABASE_SERVICE_ROLE_KEY` is god-mode (bypasses RLS). It belongs only in the
  edge-function environment (Supabase-injected) and the one-off `provision` /
  `set-study-mode` / `export-fantasia` runs on a trusted machine. **Never** in the
  web app, Vercel, the VPS, the kiosk, or any `NEXT_PUBLIC_*` / `EXPO_PUBLIC_*` var.
- Audio is still never stored (Invariant 7). The study records **video with audio
  off**; there is no audio bucket.
- The web build runs `lint:copy` in `prebuild`; a failure on banned words is the
  guard working — fix the copy, don't bypass it.

---

## 3. Prerequisites (your workstation)

- Node.js 20 LTS + npm
- Supabase CLI (`npm i -g supabase`)
- A Supabase account; and either a Vercel account or a VPS
- For the study: the 에어코리아 key (data.go.kr) for air quality; a Polar H10 if pairing in-app

---

## 4. Part 1 — Supabase backend

### 4a. Create the project
Supabase → New project → **Region: Northeast Asia (Seoul)** → strong DB password.
From **Project Settings → API** grab: **Project URL**, **anon/publishable key**
(public, safe), **service_role key** (secret).

### 4b. Apply migrations (order matters: `0001`→`0007`)
```bash
supabase login
supabase link --project-ref <your-project-ref>
supabase db push
```
`0007_study_validation.sql` adds the study tables, their phase-gate triggers, and
the private **`ppg-video`** bucket. `0006` created the **`ppg-raw`** bucket. No
manual bucket setup is needed — the migrations create both.

Prove the gate (optional but recommended):
```bash
psql "$DB_URL" -f supabase/tests/phase_gate_smoke.sql
```
Every block should print `OK` — including that study recordings are **rejected in
Phase 0** and accepted only once approval is on file.

### 4c. Edge functions + secrets + cron
```bash
supabase functions deploy nightly-metrics
supabase functions deploy airkorea-daily
supabase secrets set AIRKOREA_SERVICE_KEY=<data.go.kr-key>
```
`SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` are auto-injected into functions — do
not set them. Schedule both just after midnight KST (pg_cron runs in UTC, so
00:xx KST = 15:xx UTC) using `pg_cron` + `pg_net` + Vault, as in
[`README.md`](README.md) §2 / the earlier runbook.

### 4d. Provision the center, staff, and kiosks
Mints the auth users SQL can't. Run **once, locally**, never on the web server:
```bash
SUPABASE_URL=https://<ref>.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=<service_role_key> \
npm run provision -- \
  --center "햇살 데이케어 센터" \
  --staff-email staff@example.com --staff-password '<pw>' \
  --staff-name "김선생" --kiosks 6
```
Prints the center id, staff login, and each kiosk login. It never sets
`study_mode` (Phase 0).

---

## 5. Part 2 — Web app (`apps/web`)

Two **public** env vars, needed at **build time** (`NEXT_PUBLIC_*` is inlined):
```
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
```
The staff **"기록 내보내기" (records/export) tab appears only when the center is in
`study_mode`** — in Phase 0 the dashboard stays exactly three screens.

### Option A — Vercel (recommended)
1. Push to GitHub. Vercel → New Project → **Root Directory: `apps/web`**.
2. Add the two env vars (Production + Preview). Deploy. Add your domain (TLS auto).
3. Supabase **Auth → URL Configuration**: add the domain to allowed URLs.

### Option B — Self-managed VPS

**Server specs**

| | Minimum | Recommended |
|---|---|---|
| vCPU | 1 | 2 |
| RAM | 2 GB (build can OOM at 1 GB) | 4 GB |
| Disk | 20 GB SSD | 40 GB SSD |
| OS | Ubuntu 22.04/24.04 LTS | same |
| Node | 20 LTS | 20 LTS |

Region near Seoul/Tokyo for low latency to Supabase.

```bash
# base
sudo apt update && sudo apt -y upgrade
sudo apt -y install nginx git
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt -y install nodejs
sudo npm i -g pm2
sudo ufw allow OpenSSH && sudo ufw allow 'Nginx Full' && sudo ufw enable

# build
git clone <repo> /srv/strainx && cd /srv/strainx/apps/web
printf 'NEXT_PUBLIC_SUPABASE_URL=%s\nNEXT_PUBLIC_SUPABASE_ANON_KEY=%s\n' \
  "https://<ref>.supabase.co" "<anon>" > .env.local
npm ci && npm run build      # prebuild runs lint:copy, then next build

# run + reverse proxy
pm2 start "npm run start" --name strainx-web --cwd /srv/strainx/apps/web
pm2 save && pm2 startup
```
Nginx reverse-proxies `:3000`; TLS is **mandatory** (PWA service worker + secure
cookies):
```bash
sudo apt -y install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.example
```
Then add the domain to Supabase Auth URL config. Update later with
`git pull && npm ci && npm run build && pm2 reload strainx-web`.

---

## 6. Part 3 — Kiosk (the center phones)

Vision Camera + BLE are native → **Expo Go won't run it; you need a dev/production
build.** `app.json` already declares the camera and (for the study) Bluetooth
config via the `react-native-ble-plx` plugin.

```bash
cd apps/kiosk
npm install          # picks up react-native-ble-plx
EXPO_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co \
EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon> \
npx expo run:android      # or run:ios
```
For real distribution use EAS Build → internal `.apk`/`.aab` (Android) or
TestFlight/ad-hoc (iOS). Sign each phone into its kiosk login once. **One kiosk
per participant is write-once** (DB trigger). The study "건강 기록" capture button
appears on a phone only when its center is in `study_mode`.

---

## 7. Part 4 — Turning on the study (Phase 1)

The study features (kiosk study capture, staff records/export tab) are inert until
the center is in `study_mode`. Open the gate deliberately:

### POC / mentor code review (before IRB is finalized)
```bash
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
npm run study:enable -- --center <center-uuid> --poc
```
Writes the placeholder `POC-DEV — NOT AN APPROVAL — NO REAL PARTICIPANT DATA` so the
whole Phase-1 path runs for review. **Do not collect real participant data under a
POC ref.**

### Real study (approval on file)
```bash
npm run study:enable -- --center <center-uuid> \
  --ethics-ref "IRB-2026-0142" --approved-at 2026-08-01
```
To return a center to Phase 0: `npm run study:enable -- --center <uuid> --off`.

What flips on once `study_mode` is true:
- Kiosk shows the **long study capture** (3–10 min PPG + raw video + optional
  in-app Polar H10, then a 0–10 self-report).
- Staff dashboard shows the **records/export** tab.
- Study writes stop being rejected by the DB gate.

The Polar H10 can be paired **in-app** (BLE, if the dev build has
`react-native-ble-plx`) or recorded **independently and aligned offline** via the
shared-clock start marker stored on each recording.

---

## 8. Part 5 — Data export for the Fantasia pipeline

De-identified (coded subject ids), one row per recording. Two ways:

- **Staff, in-browser:** the records tab → **내보내기 (JSON)** downloads the manifest
  (no service role, RLS-scoped to the center).
- **Service-role script** (adds raw-signal/video download):
  ```bash
  SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
  npm run export:fantasia -- --center <uuid> --out ./export --with-signals
  ```
  Add `--with-video` to pull the raw video too (large, identifiable — keep it on a
  controlled machine). The script refuses to run on a non-study center.

Confirm the JSON field names against your Fantasia comparison script before the
first real analysis run (doc 6.3).

---

## 9. Part 6 — Verification

```bash
npm run lint:copy                          # research/score language guard
cd apps/web && npm run typecheck && npm run build
node apps/kiosk/src/lib/ppg.test.mjs       # PPG HR-recovery + SQI rejection
psql "$DB_URL" -f supabase/tests/phase_gate_smoke.sql   # gate rejects Phase 1 in Phase 0
```
Manual: unauthenticated `/staff/*` redirects to `/staff/login`; the PWA installs to
home screen over HTTPS; after the first nightly cron, `derived_daily`/`daily_state`
populate. In study_mode: the kiosk shows the study capture, a recording lands in
`study_recordings`, and it appears on the staff records tab.

---

## 10. Deployment delta introduced by the study (0007)

If you already deployed Phase 0, going to the study adds only:
1. `supabase db push` (applies `0007` — new tables, gate triggers, `ppg-video` bucket).
2. A fresh kiosk build (`npm install` for `react-native-ble-plx`, then `expo run:*`).
3. `npm run study:enable -- --center <uuid> [--poc | --ethics-ref … --approved-at …]`.

The web app needs no rebuild for the study — the records tab is gated at runtime on
`study_mode`.
