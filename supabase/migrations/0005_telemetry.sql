-- AT A GLANCE - Telemetry. product analytics keyed by center (never participant); a CHECK rejects identifiers and health values.

-- ============================================================================
-- 0005 — Product telemetry. This belongs to StrainX; care data belongs to the
--        center. Do not let them touch (§5 of the handoff).
--
-- Aggregate only. No health values. No identifiers. Keyed by center_id, NOT
-- participant_id — deliberately, so it is structurally impossible to join
-- telemetry back to a person. The CHECK below hard-rejects rows whose
-- metadata smuggles in identifiers or health values.
-- ============================================================================

create table telemetry_events (
  id         uuid primary key default gen_random_uuid(),
  center_id  uuid not null references centers(id),   -- NOT participant_id
  event_type text not null,
  -- 'install_ok','install_fail','checkin_done','checkin_assisted',
  -- 'ppg_ok','ppg_failed_sqi','ppg_abandoned','ppg_retry',
  -- 'reaction_done','voice_done','push_unavailable', ...
  platform   text,
  os_version text,
  metadata   jsonb,
  created_at timestamptz not null default now(),
  constraint telemetry_no_identifiers_no_health check (
    metadata is null
    or not (metadata ?| array[
      'participant_id', 'participant', 'auth_user_id', 'name', 'display_name',
      'phone', 'photo_url',
      'hr_bpm', 'rmssd_ms', 'sdnn_ms', 'pnn50', 'resp_rate',
      'mood_1_5', 'energy_1_5', 'pain_1_5',
      'systolic', 'diastolic', 'weight_kg', 'grip_strength_kg', 'steps',
      'pss10', 'gds15', 'ucla3'
    ])
  )
);

comment on table telemetry_events is
  'StrainX product analytics: install success, adherence %, PPG usable-read '
  'rate, session counts, crash logs. This is what tells us whether the tool '
  'works. It is NOT care data and must never contain health values or '
  'identifiers — the CHECK constraint rejects the obvious keys, and code '
  'review rejects the rest.';
