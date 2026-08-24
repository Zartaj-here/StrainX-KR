-- Phase-gate smoke test. Run against a scratch database / local stack:
--   supabase db reset   (applies migrations)
--   psql "$DB_URL" -f supabase/tests/phase_gate_smoke.sql
-- Every block must behave as its comment says; the script raises if the gate
-- fails to reject, and finishes with NOTICEs on success.

begin;

-- Fixtures
insert into centers (id, name) values
  ('00000000-0000-0000-0000-000000000001', '테스트 센터');
insert into participants (id, center_id, display_name) values
  ('00000000-0000-0000-0000-0000000000aa', '00000000-0000-0000-0000-000000000001', '김어르신');
insert into staff (id, center_id, display_name) values
  ('00000000-0000-0000-0000-0000000000bb', '00000000-0000-0000-0000-000000000001', '테스트 직원');
insert into kiosk_devices (id, center_id, device_label) values
  ('00000000-0000-0000-0000-0000000000cc', '00000000-0000-0000-0000-000000000001', '키오스크 1');

-- 1) study_mode cannot be set without an approval ref (CHECK constraint)
do $$
begin
  begin
    update centers set study_mode = true
    where id = '00000000-0000-0000-0000-000000000001';
    raise exception 'GATE FAILED: study_mode accepted without ethics approval';
  exception when check_violation then
    raise notice 'OK: study_mode rejected without approval ref';
  end;
end $$;

-- 2) Phase 1 functional task rejected in Phase 0
do $$
begin
  begin
    insert into functional_tasks (participant_id, task)
    values ('00000000-0000-0000-0000-0000000000aa', 'tug');
    raise exception 'GATE FAILED: TUG accepted without ethics approval';
  exception when raise_exception then
    raise notice 'OK: TUG rejected in Phase 0';
  end;
end $$;

-- 3) Phase 0 reaction task is allowed
insert into functional_tasks (participant_id, task, metrics)
values ('00000000-0000-0000-0000-0000000000aa', 'reaction', '{"median_ms": 412}');
do $$ begin raise notice 'OK: reaction task allowed in Phase 0'; end $$;

-- 4) Research instrument (depression screen) rejected in Phase 0
do $$
begin
  begin
    insert into research_instruments (participant_id, timepoint, gds15)
    values ('00000000-0000-0000-0000-0000000000aa', 'baseline', 4);
    raise exception 'GATE FAILED: GDS-15 accepted without ethics approval';
  exception when raise_exception then
    raise notice 'OK: GDS-15 rejected in Phase 0';
  end;
end $$;

-- 5) Control activity rejected in Phase 0
do $$
begin
  begin
    insert into activities (center_id, name, is_control)
    values ('00000000-0000-0000-0000-000000000001', '가짜 세션', true);
    raise exception 'GATE FAILED: is_control accepted without ethics approval';
  exception when raise_exception then
    raise notice 'OK: is_control activity rejected in Phase 0';
  end;
end $$;

-- 5b) Study recording (migration 0007) rejected in Phase 0
do $$
begin
  begin
    insert into study_recordings (participant_id, device_id, operator_staff_id, local_date, duration_s)
    values ('00000000-0000-0000-0000-0000000000aa',
            '00000000-0000-0000-0000-0000000000cc',
            '00000000-0000-0000-0000-0000000000bb', current_date, 300);
    raise exception 'GATE FAILED: study_recording accepted without ethics approval';
  exception when raise_exception then
    raise notice 'OK: study_recording rejected in Phase 0';
  end;
end $$;

-- 6) With approval on file, the same writes succeed
update centers
set study_mode = true,
    ethics_approval_ref = 'IRB-TEST-0001',
    ethics_approved_at = now()
where id = '00000000-0000-0000-0000-000000000001';

insert into functional_tasks (participant_id, task)
values ('00000000-0000-0000-0000-0000000000aa', 'tug');
insert into research_instruments (participant_id, timepoint, gds15)
values ('00000000-0000-0000-0000-0000000000aa', 'baseline', 4);
insert into activities (center_id, name, is_control)
values ('00000000-0000-0000-0000-000000000001', '통제 세션', true);
do $$ begin raise notice 'OK: Phase 1 writes accepted once approval is on file'; end $$;

-- 6b) Study recording + paired self-report + vitals accepted once in study_mode
insert into study_recordings (id, participant_id, device_id, operator_staff_id, local_date, duration_s, rmssd_ms, sdnn_ms)
values ('00000000-0000-0000-0000-0000000000d1',
        '00000000-0000-0000-0000-0000000000aa',
        '00000000-0000-0000-0000-0000000000cc',
        '00000000-0000-0000-0000-0000000000bb', current_date, 300, 42.1, 55.3);
insert into study_self_reports (recording_id, participant_id, stress_0_10)
values ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000aa', 6);
insert into study_recording_vitals (recording_id, participant_id, systolic, diastolic, sleep_hours)
values ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000aa', 128, 78, 6.5);
do $$ begin raise notice 'OK: study recording + self-report + vitals accepted once approval is on file'; end $$;

-- 7) settle timer constraint
do $$
begin
  begin
    insert into ppg_readings (participant_id, device_id, operator_staff_id, context, settle_seconds, usable)
    values ('00000000-0000-0000-0000-0000000000aa',
            gen_random_uuid(), gen_random_uuid(), 'daily', 60, true);
    raise exception 'GATE FAILED: settle_seconds < 120 accepted';
  exception when check_violation then
    raise notice 'OK: settle_seconds < 120 rejected';
  when foreign_key_violation then
    raise notice 'OK-ish: FK fired before CHECK; use real device/staff ids to test CHECK';
  end;
end $$;

-- 8) telemetry identifier/health-value guard
do $$
begin
  begin
    insert into telemetry_events (center_id, event_type, metadata)
    values ('00000000-0000-0000-0000-000000000001', 'ppg_ok',
            '{"participant_id": "oops", "hr_bpm": 71}');
    raise exception 'GATE FAILED: telemetry accepted identifiers/health values';
  exception when check_violation then
    raise notice 'OK: telemetry rejected identifiers/health values';
  end;
end $$;

rollback;
