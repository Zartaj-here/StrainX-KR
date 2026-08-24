# StrainX — code review guide (pre-launch)

**Status:** the care tool (Phase 0) is built; the HRV bench-validation study
(Phase 1) is built but **gated OFF in the database**. **No real participant data
has been collected**, and the system is **not live**. This package is for code
review before go-live — e.g. to finalize IRB wording against exactly what the app
captures, stores, and exports.

---

## Start here (reading order)
1. **CONTRIBUTING.md** — the rules that govern the whole codebase: the phase gate,
   the 10 invariants, the copy rules, the "do not build" lists, and the study spec.
   Everything below follows from these.
2. **README.md** — the three surfaces (check-in PWA, kiosk, staff dashboard) and how
   they fit.
3. **This file** — the data map, what to review, and how to run the checks.
4. **DEPLOYMENT.md** — how it goes live. Not needed to review the code.

## The phase gate (why the study can't "just run")
- Study features (raw video, HRV recording, Polar H10, self-report, vitals, export)
  **do not exist unless a center is in `study_mode`.**
- Postgres **refuses** `study_mode` unless `centers.ethics_approval_ref` +
  `ethics_approved_at` are set — a CHECK constraint in
  `supabase/migrations/0001_centers_phase_gate.sql`. Triggers reject every study
  write otherwise (`0003`, `0007`).
- To review the running Phase-1 path *before* approval, a POC center is opened with an
  explicit placeholder ref — `POC-DEV — NOT AN APPROVAL — NO REAL PARTICIPANT DATA`
  (`scripts/set-study-mode.mjs --poc`). It is never used to collect real data.
- **`supabase/tests/phase_gate_smoke.sql`** demonstrates the gate: every Phase-1 write
  is rejected in Phase 0 and accepted only once an approval reference is on file.

## Study data map (the IRB-relevant part)
Every data element the study captures, and where it lives:

| Data element | Captured on | Stored in | Readable by | Retention |
|---|---|---|---|---|
| Raw finger/face **video** | kiosk | `ppg-video` bucket (private) | staff only (kiosk write-only) | whole study |
| Per-frame **PPG waveform** + timestamps | kiosk | `ppg-raw` bucket (private) | staff only | whole study |
| Time-domain **HRV** (HR, RMSSD, SDNN, mean-RR, NN count, SQI) | kiosk (on-device) | `study_recordings` | staff | whole study |
| **0–10 stress self-report** (after each recording) | kiosk | `study_self_reports` | staff | whole study |
| **Vitals** (BP, temp, weight, sleep hours, activity) | staff/kiosk | `study_recording_vitals` | staff | whole study |
| **Covariates** (birth year→age, sex, height) | staff | `study_participant_profile` | staff | whole study |
| **Polar H10** reference RR stream | H10 (in-app BLE or offline-aligned) | `ppg-raw` + `ref_start_marker` | staff | whole study |

- **De-identification:** the export uses coded subject ids (`P001`, `P002`, …), never
  names — `scripts/export-fantasia.mjs` and the staff records tab.
- **Audio is never captured** — study video is recorded with audio off, and there is
  intentionally no audio storage bucket (Invariant 7).
- **`emergency_contacts`** is never read or written by any automated path (Invariant 3).
- **Self-report never feeds the care signal** — `stress_0_10` is a research anchor only;
  it never appears on a participant care screen and is never an input to `strain_index`
  (Invariant 5).

## What to review, by area
- **Phase gate + schema:** `supabase/migrations/0001_…`, `0007_study_validation.sql`;
  `supabase/tests/phase_gate_smoke.sql`.
- **Access control (RLS):** `0006_rls.sql` + the study policies in `0007`. The kiosk is
  write-only — it cannot read any capture table.
- **Study capture flow:** `apps/kiosk/src/screens/StudyCaptureScreen.tsx`; PPG math in
  `apps/kiosk/src/lib/ppg.ts`; Polar H10 in `apps/kiosk/src/lib/h10.ts`.
- **Staff review + covariate entry + export:** `apps/web/src/app/staff/records/page.tsx`.
- **Analysis export:** `scripts/export-fantasia.mjs` (shape for the Fantasia pipeline).
- **Care-language guard:** `scripts/copy-lint.mjs` — bans research/score wording in any
  UI string; runs in the web build.

## Build status (honest)
- **Built + checked here** (`lint:copy`, web `tsc`): schema + gate + RLS + both private
  buckets, kiosk study capture (video + waveform + HRV + H10 + 0–10 self-report +
  finger/face/light/session metadata), staff review/entry/export, POC gate opener,
  Fantasia export, governance docs.
- **Not done — needs a real environment:** apply `0007` to a live Postgres and run the
  smoke test; a kiosk device build (native camera/BLE can't be verified on a PC); the
  on-device video upload uses `fetch(file://)`, which may need `expo-file-system`.
- **Inherently external:** Fantasia field-name reconciliation, the H10 off-load format,
  and session-length tuning ("test 3–10 min, keep the best").

## How to run the checks
```bash
npm run lint:copy
cd apps/web && npm install && npm run typecheck && npm run build
node apps/kiosk/src/lib/ppg.test.mjs
# against a Postgres (proves the gate):
supabase db push && psql "$DB_URL" -f supabase/tests/phase_gate_smoke.sql
```

## Not live
`study_mode` is **false** in the shipped seed; no real participant data exists.
Bringing the system live is a separate, deliberate act (DEPLOYMENT.md §7) that requires
a genuine ethics-approval reference on file.
