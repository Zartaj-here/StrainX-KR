-- AT A GLANCE - HRV study (Phase 1, gated). study_recordings/self_reports/vitals/profile + their gate triggers + private ppg-video bucket.

-- ============================================================================
-- 0007 — HRV bench-validation study (Phase 1). EVERY table here is gated by the
--        same phase gate as 0003: the triggers at the bottom call
--        assert_study_mode_for_participant() so not a single study row can be
--        written unless the center is in study_mode (which itself requires an
--        ethics approval reference on file, per 0001). Nothing in this file
--        weakens that gate — it adds new things for the gate to reject.
--
-- Study: ~30 older adults, smartphone camera-PPG HRV validated against a Polar
-- H10 reference and the Fantasia dataset (age-stratified reliability). See
-- CONTRIBUTING.md "HRV bench-validation study".
-- ============================================================================

-- finger vs face (doc 1.4); the reference device; how it was captured.
create type ppg_site_t          as enum ('finger', 'face');
create type reference_device_t  as enum ('polar_h10');
create type ref_capture_t       as enum ('in_app', 'offline');

-- Core recording: a single 3–10 min camera-PPG session in study context. Kept
-- SEPARATE from Phase 0 ppg_readings (which is a 60s daily/activity care read
-- with a 2-min settle) so no care invariant is touched. Time-domain HRV only —
-- there are deliberately no LF/HF/frequency-domain columns (doc 0.2).
create table study_recordings (
  id                uuid primary key default gen_random_uuid(),
  participant_id    uuid not null references participants(id),
  device_id         uuid not null references kiosk_devices(id),
  operator_staff_id uuid not null references staff(id),
  session_no        int,                          -- doc 1.4: session #
  recorded_at       timestamptz not null default now(),  -- doc 5.1: recorded time
  local_date        date not null,                -- doc 5.1: recorded day
  duration_s        numeric not null,             -- doc 0.1: 3–10 min, tune to best data
  fps               numeric,                      -- doc 1.2: nominal 30
  ppg_site          ppg_site_t,                   -- doc 1.4: finger vs face
  ambient_light     text,                         -- doc 1.4: reliability covariate
  device_model      text,                         -- doc 1.4
  -- time-domain HRV only (doc 0.2)
  hr_bpm            numeric,
  mean_rr_ms        numeric,
  rmssd_ms          numeric,
  sdnn_ms           numeric,
  nn_count          int,                          -- # inter-beat intervals (validity of RMSSD/SDNN)
  sqi               numeric,
  -- raw retention (doc 1.1 / 1.3 / 6.1): pointers into private buckets.
  raw_waveform_ref  text,                         -- ppg-raw bucket: per-frame PPG + timestamps
  raw_video_ref     text,                         -- ppg-video bucket: full study (not first-collection-only)
  -- Polar H10 reference alignment (doc 4.x): a shared-clock start marker is the
  -- key that lets the two streams be aligned beat-to-beat offline.
  ref_device        reference_device_t,
  ref_capture       ref_capture_t,                -- 'in_app' (BLE) or 'offline' (Polar app export)
  ref_start_marker  timestamptz,                  -- shared-clock t0 for alignment
  ref_file_ref      text,                         -- pointer to the H10 export once ingested (offline)
  usable            boolean not null default true,
  created_at        timestamptz not null default now(),
  constraint study_duration_positive check (duration_s > 0)
);

comment on table study_recordings is
  'Phase 1 (study_mode only). A camera-PPG validation recording. Time-domain HRV '
  'only by design (doc 0.2). raw_video_ref points at identifiable facial video in '
  'the private, write-only ppg-video bucket — kiosk writes, only staff read.';

-- The self-report anchor (doc 3.x): a single 0–10 stress rating, collected AFTER
-- each recording, joined 1:1 to it. This is the validation label — it is NEVER
-- shown on a care screen and NEVER an input to strain_index (Invariant 5). The
-- care composite is computed only from ppg_readings + pedometer_readings; this
-- table is not on that path.
create table study_self_reports (
  recording_id   uuid primary key references study_recordings(id) on delete cascade,
  participant_id uuid not null references participants(id),
  stress_0_10    smallint not null check (stress_0_10 between 0 and 10),
  collected_at   timestamptz not null default now()
);

comment on column study_self_reports.stress_0_10 is
  'Research validation anchor only. Invariant 5: never feed self-report into '
  'strain_index; never surface it on a participant-facing care screen.';

-- Per-recording covariates (doc 5.1). BP/temp/weight/sleep/activity vary by day,
-- so they hang off the recording, not the person.
create table study_recording_vitals (
  recording_id   uuid primary key references study_recordings(id) on delete cascade,
  participant_id uuid not null references participants(id),
  systolic       int     check (systolic between 50 and 300),
  diastolic      int     check (diastolic between 30 and 200),
  body_temp_c    numeric check (body_temp_c between 30 and 45),
  weight_kg      numeric check (weight_kg > 0),
  -- Self-reported TOTAL sleep duration (a covariate). This is NOT sleep staging
  -- and is NOT derived from any passive sensor (both banned any-phase).
  sleep_hours    numeric check (sleep_hours between 0 and 24),
  activity_rate  numeric,                         -- doc 5.1: "activity rate"
  recorded_at    timestamptz not null default now()
);

-- Person-level study covariates (doc 5.1). Age is the essential secondary
-- variable (young vs old); store birth_year and derive age at analysis time.
create table study_participant_profile (
  participant_id uuid primary key references participants(id),
  birth_year     int     check (birth_year between 1900 and 2025),
  sex            text,
  height_cm      numeric check (height_cm > 0),
  updated_at     timestamptz not null default now()
);

-- ============================================================================
-- RLS. Same shape as 0006: kiosk is WRITE-ONLY (Invariant 8 — insert, never
-- select); staff read within their center; participants get nothing (they never
-- see raw physiology or a research number). Vitals/profile are also staff-
-- writable for dashboard entry.
-- ============================================================================
alter table study_recordings         enable row level security;
alter table study_self_reports       enable row level security;
alter table study_recording_vitals   enable row level security;
alter table study_participant_profile enable row level security;

-- study_recordings: kiosk insert (this device, its center), staff read.
create policy study_recordings_kiosk_insert on study_recordings
  for insert with check (
    device_id = auth_kiosk_id()
    and participant_center(participant_id) = auth_kiosk_center()
  );
create policy study_recordings_staff_read on study_recordings
  for select using (participant_center(participant_id) = auth_staff_center());

-- study_self_reports: kiosk insert (collected on the kiosk right after the
-- recording), staff read.
create policy study_self_reports_kiosk_insert on study_self_reports
  for insert with check (participant_center(participant_id) = auth_kiosk_center());
create policy study_self_reports_staff_read on study_self_reports
  for select using (participant_center(participant_id) = auth_staff_center());

-- study_recording_vitals: kiosk insert + full staff management.
create policy study_vitals_kiosk_insert on study_recording_vitals
  for insert with check (participant_center(participant_id) = auth_kiosk_center());
create policy study_vitals_staff_all on study_recording_vitals
  for all using (participant_center(participant_id) = auth_staff_center())
  with check (participant_center(participant_id) = auth_staff_center());

-- study_participant_profile: staff-managed at enrollment.
create policy study_profile_staff_all on study_participant_profile
  for all using (participant_center(participant_id) = auth_staff_center())
  with check (participant_center(participant_id) = auth_staff_center());

-- ============================================================================
-- THE PHASE-GATE TRIGGERS. Every study table is rejected unless the center is
-- in study_mode. Identical mechanism to 0003.
-- ============================================================================
create trigger study_recordings_phase_gate
  before insert or update on study_recordings
  for each row execute function assert_study_mode_for_participant();

create trigger study_self_reports_phase_gate
  before insert or update on study_self_reports
  for each row execute function assert_study_mode_for_participant();

create trigger study_recording_vitals_phase_gate
  before insert or update on study_recording_vitals
  for each row execute function assert_study_mode_for_participant();

create trigger study_participant_profile_phase_gate
  before insert or update on study_participant_profile
  for each row execute function assert_study_mode_for_participant();

-- ============================================================================
-- Storage: private bucket for raw study video. Kiosk writes (write-only device,
-- Invariant 8); staff read. Mirrors ppg-raw. This is the ONLY place raw video
-- lives; there is still no audio bucket (Invariant 7 unchanged).
-- ============================================================================
insert into storage.buckets (id, name, public)
values ('ppg-video', 'ppg-video', false)
on conflict (id) do nothing;

create policy ppg_video_kiosk_write on storage.objects
  for insert with check (bucket_id = 'ppg-video' and auth_kiosk_center() is not null);
create policy ppg_video_staff_read on storage.objects
  for select using (bucket_id = 'ppg-video' and auth_staff_center() is not null);
