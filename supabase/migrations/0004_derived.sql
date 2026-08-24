-- AT A GLANCE - Derived (nightly). within-person z-scores -> band + reason (daily_state). Numeric strain_index is staff/service-only and never shown.

-- ============================================================================
-- 0004 — Derived metrics (written by the nightly edge function).
--
-- All modelling is within-person: z-scores vs a rolling 14-day personal
-- baseline. Never between-person (Invariant 10). Self-report is the label
-- and is NEVER an input to strain_index (Invariant 5) — only autonomic and
-- pedometer channels feed it.
-- ============================================================================

create type band_t as enum ('안정', '부담', '소진');

-- Internal table: staff- and service-facing. Contains the numeric composite,
-- so participants have NO read access to this table (see 0006). The number is
-- never exposed to anyone in the UI either — only the band, with its reason.
create table derived_daily (
  participant_id        uuid not null references participants(id),
  local_date            date not null,
  hr_z                  numeric,
  rmssd_z               numeric,
  resp_rate_z           numeric,
  steps_z               numeric,
  strain_index          numeric,  -- weighted z-composite; NEVER surfaced anywhere
  band                  band_t,
  band_reason           text,
  computed_at           timestamptz not null default now(),
  primary key (participant_id, local_date)
);

-- Participant-facing table: band + reason only. No numbers, by construction.
create table daily_state (
  participant_id uuid not null references participants(id),
  local_date     date not null,
  band           band_t not null,
  reason         text not null,  -- the band is ALWAYS shown with its reason (Invariant 1)
  primary key (participant_id, local_date)
);

-- Activity reactivity — the strongest thing in the product. Written by the
-- nightly function per (activity, participant), ALWAYS stratified by the
-- activity's physical_intensity. In Phase 0 these are care observations, not
-- causal claims, and every surface that shows them must say so in care
-- language.
create table activity_reactivity (
  activity_id           uuid not null references activities(id),
  participant_id        uuid not null references participants(id),
  physical_intensity    physical_intensity_t not null,
  delta_hr_pre_post     numeric,
  delta_rmssd_pre_post  numeric,
  recovery_slope_30min  numeric,
  delta_mood_pre_post   numeric,
  computed_at           timestamptz not null default now(),
  primary key (activity_id, participant_id)
);
