-- AT A GLANCE - Capture + gate triggers. check-ins, PPG, activities, functional tasks, voice, companion; triggers reject Phase 1 capture types in Phase 0.

-- ============================================================================
-- 0003 — Capture tables + the phase-gate triggers that make Phase 1 capture
--        types physically impossible without ethics approval on file.
-- ============================================================================

create type checkin_source_t     as enum ('pwa', 'staff');
create type ppg_context_t        as enum ('daily', 'activity');
create type physical_intensity_t as enum ('none', 'light', 'moderate');
create type capture_phase_t      as enum ('pre', 'post', 'recovery30');
-- 'reaction' is Phase 0 (a game, zero physical risk). Everything after it is
-- Phase 1 and rejected by trigger below until study_mode is true.
create type functional_task_t    as enum ('reaction', 'walk', 'ftsst', 'tug', 'phonation', 'ddk');
create type timepoint_t          as enum ('baseline', 'weekly', 'endline');
create type note_outcome_t       as enum ('fine', 'unwell', 'away', 'hospitalized', 'device_issue');

-- Daily check-in: four taps, ~30 seconds ------------------------------------
create table daily_checkins (
  id               uuid primary key default gen_random_uuid(),
  participant_id   uuid not null references participants(id),
  local_date       date not null,
  mood_1_5         smallint check (mood_1_5   between 1 and 5),
  energy_1_5       smallint check (energy_1_5 between 1 and 5),
  pain_1_5         smallint check (pain_1_5   between 1 and 5),
  medication_taken boolean,
  assisted         boolean not null default false,
  source           checkin_source_t not null,
  completed_at     timestamptz not null default now(),
  latency_s        numeric,  -- notification shown -> completion; free psychomotor measure
  unique (participant_id, local_date)
);

-- PPG readings (kiosk only) --------------------------------------------------
create table ppg_readings (
  id                uuid primary key default gen_random_uuid(),
  participant_id    uuid not null references participants(id),
  device_id         uuid not null references kiosk_devices(id),
  operator_staff_id uuid not null references staff(id),
  captured_at       timestamptz not null default now(),
  context           ppg_context_t not null,
  -- The 2-minute seated settle is enforced by the app AND by this constraint.
  settle_seconds    int not null,
  hr_bpm            numeric,
  rmssd_ms          numeric,
  sdnn_ms           numeric,
  pnn50             numeric,
  resp_rate         numeric,
  perfusion_index   numeric,
  sqi               numeric,
  motion_index      numeric,
  -- usable refers to HRV usability: (sqi >= threshold) AND (af_flag = false).
  -- For AF participants HR is still meaningful and kept; HRV is not.
  usable            boolean not null,
  raw_waveform_ref  text,  -- storage ref; the raw waveform is the only way to fix the algorithm later
  constraint settle_enforced_2min check (settle_seconds >= 120)
);

-- AF makes HRV meaningless: force usable=false at the database, whatever the
-- client computed. HR columns are untouched.
create or replace function enforce_af_hrv_unusable()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  af boolean;
begin
  select cb.af_flag into af
  from care_baseline cb
  where cb.participant_id = new.participant_id
  order by cb.measured_at desc
  limit 1;

  if af is true then
    new.usable := false;
  end if;
  return new;
end;
$$;

create trigger ppg_af_gate
before insert or update on ppg_readings
for each row execute function enforce_af_hrv_unusable();

-- Activities -----------------------------------------------------------------
create table activities (
  id                 uuid primary key default gen_random_uuid(),
  center_id          uuid not null references centers(id),
  created_by_staff_id uuid references staff(id),
  name               text not null,           -- free text: 체조, 노래교실, ...
  activity_type      text,
  physical_intensity physical_intensity_t not null default 'none',
  -- PHASE 1 ONLY. A control condition exists for exactly one reason; its
  -- presence IS the evidence that this is research. Gated by trigger below.
  is_control         boolean not null default false,
  scheduled_start    timestamptz,
  scheduled_end      timestamptz
);

comment on column activities.physical_intensity is
  'Determines interpretation of before/after PPG. After moderate exertion '
  '(체조) the post reading measures exertion and the meaningful variable is '
  'the +30min recovery slope; after none (노래교실) the pre/post HRV change '
  'is a clean affect signal. Read the tag or the analysis is nonsense.';

create table activity_roster (
  activity_id    uuid not null references activities(id) on delete cascade,
  participant_id uuid not null references participants(id),
  primary key (activity_id, participant_id)
);

create table activity_captures (
  id               uuid primary key default gen_random_uuid(),
  activity_id      uuid not null references activities(id),
  participant_id   uuid not null references participants(id),
  phase            capture_phase_t not null,
  ppg_reading_id   uuid references ppg_readings(id),
  mood_1_5         smallint check (mood_1_5   between 1 and 5),
  energy_1_5       smallint check (energy_1_5 between 1 and 5),
  pain_1_5         smallint check (pain_1_5   between 1 and 5),
  voice_feature_id uuid,  -- FK added in 0003 after voice_features exists
  captured_at      timestamptz not null default now(),
  unique (activity_id, participant_id, phase)
);

-- Functional tasks ------------------------------------------------------------
create table functional_tasks (
  id             uuid primary key default gen_random_uuid(),
  participant_id uuid not null references participants(id),
  device_id      uuid references kiosk_devices(id),
  captured_at    timestamptz not null default now(),
  task           functional_task_t not null,
  metrics        jsonb not null default '{}'::jsonb,
  raw_accel_ref  text,
  usable         boolean not null default true
);

comment on table functional_tasks is
  'Invariant 6: raw task times are internal variables, never surfaced to a '
  'participant. Phase 0 allows only task=''reaction''; the rest are gated.';

-- Research instruments — the table exists so the gate has something to reject.
-- No Phase 0 UI writes here, and the trigger below rejects every row until
-- ethics approval is on file.
create table research_instruments (
  id             uuid primary key default gen_random_uuid(),
  participant_id uuid not null references participants(id),
  measured_at    timestamptz not null default now(),
  timepoint      timepoint_t not null,
  pss10          smallint check (pss10 between 0 and 40),
  gds15          smallint check (gds15 between 0 and 15),
  ucla3          smallint check (ucla3 between 3 and 9)
);

-- Voice features — AUDIO IS NEVER STORED (Invariant 7). Features are
-- extracted on-device and the recording is discarded immediately. There is
-- intentionally no audio column and no audio storage bucket in this project.
create table voice_features (
  id                uuid primary key default gen_random_uuid(),
  participant_id    uuid not null references participants(id),
  captured_at       timestamptz not null default now(),
  f0_mean           numeric,
  f0_sd             numeric,
  jitter            numeric,
  shimmer           numeric,
  hnr               numeric,
  speech_rate       numeric,
  articulation_rate numeric,
  pause_ratio       numeric,
  snr_db            numeric,
  usable            boolean not null default true
);

alter table activity_captures
  add constraint activity_captures_voice_fk
  foreign key (voice_feature_id) references voice_features(id);

-- Staff-entered measures -------------------------------------------------------
create table pedometer_readings (
  id                  uuid primary key default gen_random_uuid(),
  participant_id      uuid not null references participants(id),
  local_date          date not null,
  steps               int not null check (steps >= 0),
  entered_by_staff_id uuid not null references staff(id),
  entered_at          timestamptz not null default now(),
  unique (participant_id, local_date)
  -- Device holds 7 days; staff enters a week at a time on Monday.
  -- This is the ONLY activity ground truth (no passive phone steps in Phase 0).
);

create table clinical_measures (
  id               uuid primary key default gen_random_uuid(),
  participant_id   uuid not null references participants(id),
  measured_at      timestamptz not null default now(),
  grip_strength_kg numeric check (grip_strength_kg >= 0),
  systolic         int check (systolic between 50 and 300),
  diastolic        int check (diastolic between 30 and 200),
  weight_kg        numeric check (weight_kg > 0)
);

create table attendance (
  participant_id uuid not null references participants(id),
  local_date     date not null,
  attended       boolean not null,
  primary key (participant_id, local_date)
  -- From the center roster. PPG frequency = attendance frequency.
);

create table staff_notes (
  id             uuid primary key default gen_random_uuid(),
  participant_id uuid not null references participants(id),
  staff_id       uuid not null references staff(id),
  created_at     timestamptz not null default now(),
  note           text,
  outcome        note_outcome_t
  -- 'away'/'hospitalized' marks are REQUIRED so empty days read as absence,
  -- not disengagement.
);

-- Companion ---------------------------------------------------------------------
create table companion_state (
  participant_id     uuid primary key references participants(id),
  growth_level       numeric not null default 0,
  completion_rate_14d numeric not null default 0,
  last_event_at      timestamptz
);

comment on table companion_state is
  'Invariant 4: the companion grows more or grows less — it cannot get sick, '
  'sad, or die. Growth is driven by a rolling 14-day completion rate, NOT a '
  'streak, because streaks punish people for the center being closed on '
  'weekends. Maintained by the trigger below; growth_level never decreases.';

-- Every check-in grows the companion. Faster when the rolling 14-day
-- completion rate is higher; never backwards; no streak logic anywhere.
create or replace function bump_companion_on_checkin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  rate numeric;
begin
  select count(*)::numeric / 14.0 into rate
  from daily_checkins dc
  where dc.participant_id = new.participant_id
    and dc.local_date > new.local_date - 14
    and dc.local_date <= new.local_date;

  insert into companion_state (participant_id, growth_level, completion_rate_14d, last_event_at)
  values (new.participant_id, 0.5 + rate, rate, now())
  on conflict (participant_id) do update
    set growth_level        = companion_state.growth_level + 0.5 + excluded.completion_rate_14d,
        completion_rate_14d = excluded.completion_rate_14d,
        last_event_at       = now();
  return new;
end;
$$;

create trigger checkin_grows_companion
after insert on daily_checkins
for each row execute function bump_companion_on_checkin();

-- Environmental context ------------------------------------------------------
create table context_daily (
  center_id  uuid not null references centers(id),
  local_date date not null,
  pm10       numeric,
  pm25       numeric,
  temp_c     numeric,
  precip_mm  numeric,
  primary key (center_id, local_date)
  -- Nightly cron <- 에어코리아 API. Without this, a 나쁨 air-quality day
  -- looks like low mood in the trends.
);

-- ============================================================================
-- THE PHASE-GATE TRIGGERS. It is not possible to run a TUG test, record a
-- depression screen, or create a control session without an ethics approval
-- reference in the database. Not "we agreed not to." Cannot.
-- ============================================================================

create trigger functional_tasks_phase_gate
before insert or update on functional_tasks
for each row
when (new.task in ('walk', 'ftsst', 'tug', 'phonation', 'ddk'))
execute function assert_study_mode_for_participant();

create trigger research_instruments_phase_gate
before insert or update on research_instruments
for each row
execute function assert_study_mode_for_participant();

create trigger activities_control_phase_gate
before insert or update on activities
for each row
when (new.is_control = true)
execute function assert_study_mode_for_center();
