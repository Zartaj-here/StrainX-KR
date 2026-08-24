# StrainX — rules for anyone touching this codebase

Phase 0 only is built. Phase 0 is a **care tool** owned by the center. Phase 1 is a
**research study** and does not exist until `centers.study_mode = true`, which the
schema refuses unless `ethics_approval_ref` + `ethics_approved_at` are on file.
The gate lives in Postgres (`supabase/migrations/0001_centers_phase_gate.sql`), not in
app code. Do not weaken it, work around it, or add Phase 1 features "behind a flag" —
the flag IS the database gate.

### Running Phase 1 as a POC before approval
The CHECK requires that `ethics_approval_ref` + `ethics_approved_at` *exist*, not that
they are "real." To run and review the Phase 1 code path before the IRB is finalized
(e.g. for a mentor code review), open the gate on a **dev/POC center** with an explicit
placeholder ref that says so — `scripts/set-study-mode.mjs --poc` writes
`POC-DEV — NOT AN APPROVAL — NO REAL PARTICIPANT DATA`. Never collect real participant
data until a genuine approval reference is on file. Do **not** remove or relax the CHECK
itself: the same repo ships to the real center, where the gate is the only thing between
code review and pre-approval collection of real seniors' video and vitals.

## Stack
- Next.js 14 App Router + TypeScript + Tailwind (`apps/web`) — check-in PWA + staff dashboard
- Expo / React Native (`apps/kiosk`) — the 6 center-owned kiosk phones only
- Supabase — Postgres, RLS, Storage, Edge Functions (`supabase/`)

## Invariants (violating any of these is a bug, not a style choice)
1. No 0–100 stress score anywhere. Three bands only (안정/부담/소진), always with a reason.
2. No "burnout"/"risk"/"score" language in any UI string, notification, or export.
   `npm run lint:copy` enforces the banned-word list; it runs in the web build.
3. No inactivity alerting, no automated notifications to family/staff/authorities.
   Nothing programmatic ever writes to or triggers off `emergency_contacts`.
4. The companion only grows (rolling 14-day completion rate). No streaks, no sickness, no death.
5. Self-report (mood/energy/pain) is the label. Never feed it into `strain_index`.
6. Never show a raw task time (reaction, and later TUG/FTSST) to a participant.
7. Audio is never stored or uploaded. Features extracted on-device; the blob is discarded.
   There is intentionally no storage bucket for audio.
8. The kiosk is write-only: it inserts captures and reads only the roster + today's
   activities. RLS gives kiosk devices no SELECT on any capture table.
9. One kiosk phone per participant for the whole deployment —
   `participants.assigned_kiosk_device_id` is write-once (DB trigger).
10. All modelling is within-person vs a rolling 14-day baseline. Never between-person.

## Copy rules (Korean, care language)
Never in a UI string: 연구, 실험, 피험자, 데이터 수집, 측정 프로토콜, 기준선, 결과지표,
번아웃, 위험도, 점수 / study, subject, trial, burnout, risk score.
Use: 돌봄, 어르신, 이용자, 오늘의 기록, 건강 확인, 평소, 변화.
Internal identifiers (table/column/variable names) are exempt; screens are not.
All web UI copy lives in `apps/web/src/lib/copy.ts`; kiosk copy in `apps/kiosk/src/lib/copy.ts`.

## Do not build (any phase)
Screen time, unlock counts, location, ambient audio, comms metadata, sleep staging,
0–100 scores, inactivity/고독사 alerting, Phase 0 research export.
Bluetooth integrations are banned in every phase **except** the Polar H10 reference-device
pairing used for HRV bench-validation, which is permitted **only** while `study_mode` is
true (Phase 1) and is never part of the care tool. The care surfaces stay Bluetooth-free.
Note "sleep staging" (REM/deep/light, banned) is not the same as a self-reported total
sleep duration collected as a study covariate (`study_recording_vitals.sleep_hours`).

## Phase 1 (do not build until study_mode is true in the database)
TUG/FTSST/walk, phonation/DDK, PSS-10/GDS-15/UCLA-3, `is_control` sessions,
crisis escalation pathway (mandatory with GDS-15), de-identified export.
The tables/enum values already exist so the gate triggers have something to reject —
that is intentional. The UI for them must not exist in Phase 0.

### HRV bench-validation study (migration 0007, all gated on study_mode)
A ~30-adult study validating smartphone camera-PPG HRV against a Polar H10 reference and
the Fantasia dataset (age-stratified reliability). Gated Phase 1 additions:
- `study_recordings` — 3–10 min camera-PPG sessions; time-domain HRV only (RMSSD, SDNN —
  no frequency-domain at short lengths); raw waveform + **raw video** pointers.
- `ppg-video` storage bucket — private, kiosk write-only, staff read (mirrors `ppg-raw`).
  Raw facial video of a protected population; retained for the whole study.
- `study_self_reports` — single 0–10 stress rating, collected **after** each recording and
  joined to it. It is a research anchor: never shown on a care screen, never fed into
  `strain_index` (Invariant 5). Its capture UI still passes `lint:copy` — no 점수/score copy.
- `study_recording_vitals` / `study_participant_profile` — BP, temp, weight, sleep duration,
  activity, age/height covariates.
- Polar H10 reference pairing (in-app BLE) OR offline-recorded + aligned via a shared-clock
  start marker (`study_recordings.ref_start_marker`). Both allowed per session.
- De-identified Fantasia export (`scripts/export-fantasia.mjs`) — coded IDs only.
