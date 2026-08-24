# StrainX — Phase 0 (the care tool)

A care tool for a senior day-care center: a daily check-in the members do
themselves, camera-PPG heart readings and activity before/after captures on
center-owned kiosk phones, and a three-screen staff dashboard. **Phase 0 only**
is built here. Phase 1 (the research study) does not exist until a center is put
into `study_mode`, which the database refuses without an ethics approval
reference. See [`CONTRIBUTING.md`](CONTRIBUTING.md) for the rules that govern the code.

## Why the phase split is real, not cosmetic
Phase 1 capture types are rejected **by Postgres**, not by discipline:
- `centers.study_mode` can't be set true without `ethics_approval_ref` +
  `ethics_approved_at` (CHECK constraint).
- Triggers reject any TUG/FTSST/walk/phonation/DDK task, any research
  instrument (PSS-10/GDS-15/UCLA-3), and any `is_control` activity while the
  center is not in study_mode.
Run `supabase/tests/phase_gate_smoke.sql` to see every rejection fire.

## Layout
```
supabase/
  migrations/   0001 phase gate · 0002 people · 0003 capture+gate triggers
                0004 derived · 0005 telemetry · 0006 RLS + RPCs + storage
  functions/    nightly-metrics (within-person z-scores, bands, reactivity)
                airkorea-daily  (per-center air quality + weather context)
  tests/        phase_gate_smoke.sql
apps/web/       Next.js 14 — check-in PWA (/checkin,/trends,/companion,/pair)
                + staff dashboard (/staff/today,/activities,/weekly)
apps/kiosk/     Expo / React Native — the 6 center phones (PPG, activity, game)
scripts/        copy-lint.mjs — fails the build on research/score language
```

## Three surfaces
- **Check-in PWA** — the senior's own phone, add-to-home-screen, offline-first,
  four taps. Nobody installs anything.
- **Kiosk** — 6 center-owned phones (native, for camera/torch/accelerometer).
  Write-only. The PPG protocol (10s hand-rub → 2-min settle → 60s reading → SQI
  gate) is enforced by the app; a bad read is discarded, never stored as good.
- **Staff dashboard** — a tablet/laptop URL. Three screens.

## Setup
1. Create a Supabase project. Apply migrations in order:
   ```
   supabase db push        # or: psql "$DB_URL" -f each migration in 0001..0006 order
   psql "$DB_URL" -f supabase/tests/phase_gate_smoke.sql   # optional: prove the gate
   ```
2. Deploy edge functions and schedule them (KST):
   ```
   supabase functions deploy nightly-metrics
   supabase functions deploy airkorea-daily
   # In SQL, with pg_cron + pg_net, schedule both just after local midnight.
   ```
   Secrets: `AIRKOREA_SERVICE_KEY` (data.go.kr) for air quality.
3. Web app:
   ```
   cd apps/web
   cp .env.local.example .env.local   # fill NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY
   npm install && npm run dev
   ```
4. Kiosk (needs a dev build — Vision Camera is native, not Expo Go):
   ```
   cd apps/kiosk
   EXPO_PUBLIC_SUPABASE_URL=... EXPO_PUBLIC_SUPABASE_ANON_KEY=... npx expo run:ios
   ```
   Provision 6 `kiosk_devices` rows, one auth user each; sign each phone in once.

## Provisioning a center and people
There is no researcher role in Phase 0. A center, its staff, and its 6 kiosk
devices need auth users, which plain SQL can't mint — provision them with the
service role:
```
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run provision -- \
  --center "햇살 데이케어 센터" \
  --staff-email staff@example.com --staff-password 'pw' --staff-name "김선생" \
  --kiosks 6
```
It prints the created ids and each kiosk's login, and never sets `study_mode`.
Then sign the staff account in on the dashboard and enroll members under the
**어르신 관리** (member management) area:
- profile, phone platform, check-in mode
- **write-once kiosk assignment** — one fixed kiosk per member so camera-PPG
  device bias cancels into her personal baseline (the DB trigger refuses a later
  change)
- **care consent** (self-consent or legal rep; care-record / photo / voice flags)
- **care baseline** — ADL, `af_flag`, and `beta_blocker` (the covariate the PPG
  readings can't be interpreted without); each save appends a new baseline row
- **emergency contacts** — human-initiated escalation only; nothing automated
  ever reads this table

## Checks
```
npm run lint:copy                       # research/score language guard (root)
cd apps/web && npm run typecheck && npm run build
node apps/kiosk/src/lib/ppg.test.mjs    # PPG HR recovery + SQI rejection
```
The PPG test needs a one-time compile step (printed by the test when the
compiled module is absent).

## Non-negotiables baked in
No 0–100 score (three bands + reason only) · no burnout/risk/score copy · no
inactivity or 고독사 alerting · nothing automated ever touches
`emergency_contacts` · the companion only grows (no streaks, no death) ·
self-report never feeds the composite it's compared against · raw task times
never shown to a participant · audio never stored (features on-device, blob
discarded) · kiosk is write-only · one kiosk per participant · all modelling is
within-person vs a 14-day baseline.

## Open items carried from the handoff (need center input, not code)
1. Center enrollment capacity.
2. PPG frequency = attendance frequency (~12/month, thin for daily trends).
3. No PPG reference device yet → HRV is an **unvalidated candidate**; label it so.
4. Voice module is exploratory (built, on-device only) — confirm or cut.
5. Ethics approval is the Phase 1 gate; not a Phase 0 blocker.
