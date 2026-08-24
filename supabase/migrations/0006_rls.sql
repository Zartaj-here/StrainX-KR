-- AT A GLANCE - RLS + RPCs + storage. staff/participant/kiosk roles; kiosk is write-only (no SELECT on captures); private ppg-raw bucket.

-- ============================================================================
-- 0006 — Row Level Security.
--
-- Roles (all via supabase auth, distinguished by which table claims the uid):
--   staff        — scoped to their center_id
--   participant  — reads only their own rows; writes only their own check-ins
--                  and voice features
--   kiosk        — WRITE-ONLY (Invariant 8): inserts captures, reads only the
--                  roster (via RPC) and today's activities. No SELECT on any
--                  capture table. Never another person's data on screen.
--   (no researcher role exists in Phase 0 — deliberately)
--
-- centers has NO insert/update/delete policy for any API role: flipping
-- study_mode is a deliberate service-role act performed with the ethics
-- approval reference in hand.
-- ============================================================================

-- Helper functions ------------------------------------------------------------
create or replace function auth_staff_center()
returns uuid language sql stable security definer set search_path = public as
$$ select center_id from staff where auth_user_id = auth.uid() $$;

create or replace function auth_staff_id()
returns uuid language sql stable security definer set search_path = public as
$$ select id from staff where auth_user_id = auth.uid() $$;

create or replace function auth_participant_id()
returns uuid language sql stable security definer set search_path = public as
$$ select id from participants where auth_user_id = auth.uid() $$;

create or replace function auth_participant_center()
returns uuid language sql stable security definer set search_path = public as
$$ select center_id from participants where auth_user_id = auth.uid() $$;

create or replace function auth_kiosk_id()
returns uuid language sql stable security definer set search_path = public as
$$ select id from kiosk_devices where auth_user_id = auth.uid() $$;

create or replace function auth_kiosk_center()
returns uuid language sql stable security definer set search_path = public as
$$ select center_id from kiosk_devices where auth_user_id = auth.uid() $$;

create or replace function participant_center(p_id uuid)
returns uuid language sql stable security definer set search_path = public as
$$ select center_id from participants where id = p_id $$;

-- Enable RLS everywhere --------------------------------------------------------
alter table centers              enable row level security;
alter table staff                enable row level security;
alter table kiosk_devices        enable row level security;
alter table participants         enable row level security;
alter table emergency_contacts   enable row level security;
alter table care_baseline        enable row level security;
alter table pairing_codes        enable row level security;
alter table daily_checkins       enable row level security;
alter table ppg_readings         enable row level security;
alter table activities           enable row level security;
alter table activity_roster      enable row level security;
alter table activity_captures    enable row level security;
alter table functional_tasks     enable row level security;
alter table research_instruments enable row level security;
alter table voice_features       enable row level security;
alter table pedometer_readings   enable row level security;
alter table clinical_measures    enable row level security;
alter table attendance           enable row level security;
alter table staff_notes          enable row level security;
alter table companion_state      enable row level security;
alter table context_daily        enable row level security;
alter table derived_daily        enable row level security;
alter table daily_state          enable row level security;
alter table activity_reactivity  enable row level security;
alter table telemetry_events     enable row level security;

-- centers: staff can see their own center (incl. study_mode, which gates UI).
-- Nobody can write via the API. Participants read study-irrelevant nothing.
create policy centers_staff_read on centers
  for select using (id = auth_staff_center() or id = auth_kiosk_center());

-- staff
create policy staff_read_own_center on staff
  for select using (center_id = auth_staff_center());

-- kiosk_devices
create policy kiosk_devices_staff_all on kiosk_devices
  for all using (center_id = auth_staff_center())
  with check (center_id = auth_staff_center());
create policy kiosk_devices_self_read on kiosk_devices
  for select using (auth_user_id = auth.uid());

-- participants
create policy participants_staff_all on participants
  for all using (center_id = auth_staff_center())
  with check (center_id = auth_staff_center());
create policy participants_self_read on participants
  for select using (auth_user_id = auth.uid());
-- kiosk gets the roster via the kiosk_roster() RPC below (name/photo only),
-- not via this table.

-- emergency_contacts: staff only. No participant, kiosk, or service path in
-- app code touches this table programmatically (Invariant 3).
create policy emergency_contacts_staff_all on emergency_contacts
  for all using (participant_center(participant_id) = auth_staff_center())
  with check (participant_center(participant_id) = auth_staff_center());

-- care_baseline: staff only.
create policy care_baseline_staff_all on care_baseline
  for all using (participant_center(participant_id) = auth_staff_center())
  with check (participant_center(participant_id) = auth_staff_center());

-- daily_checkins
create policy checkins_participant_insert on daily_checkins
  for insert with check (
    participant_id = auth_participant_id() and source = 'pwa'
  );
create policy checkins_participant_read on daily_checkins
  for select using (participant_id = auth_participant_id());
create policy checkins_staff_all on daily_checkins
  for all using (participant_center(participant_id) = auth_staff_center())
  with check (participant_center(participant_id) = auth_staff_center());

-- ppg_readings: kiosk INSERT only (write-only device, Invariant 8);
-- staff read; participants nothing (they see bands via daily_state, never
-- raw physiology).
create policy ppg_kiosk_insert on ppg_readings
  for insert with check (
    device_id = auth_kiosk_id()
    and participant_center(participant_id) = auth_kiosk_center()
  );
create policy ppg_staff_read on ppg_readings
  for select using (participant_center(participant_id) = auth_staff_center());

-- activities: staff manage; kiosk may read its center's activities (it must
-- list today's sessions to attach captures).
create policy activities_staff_all on activities
  for all using (center_id = auth_staff_center())
  with check (center_id = auth_staff_center());
create policy activities_kiosk_read on activities
  for select using (center_id = auth_kiosk_center());

-- activity_roster
create policy activity_roster_staff_all on activity_roster
  for all using (participant_center(participant_id) = auth_staff_center())
  with check (participant_center(participant_id) = auth_staff_center());
create policy activity_roster_kiosk_read on activity_roster
  for select using (participant_center(participant_id) = auth_kiosk_center());

-- activity_captures: kiosk insert, staff read/insert. No kiosk SELECT.
create policy activity_captures_kiosk_insert on activity_captures
  for insert with check (participant_center(participant_id) = auth_kiosk_center());
create policy activity_captures_staff_all on activity_captures
  for all using (participant_center(participant_id) = auth_staff_center())
  with check (participant_center(participant_id) = auth_staff_center());

-- functional_tasks: kiosk insert (the phase-gate trigger separately rejects
-- Phase 1 task types); staff read. Participants never read raw task metrics
-- (Invariant 6).
create policy functional_tasks_kiosk_insert on functional_tasks
  for insert with check (
    device_id = auth_kiosk_id()
    and participant_center(participant_id) = auth_kiosk_center()
  );
create policy functional_tasks_staff_read on functional_tasks
  for select using (participant_center(participant_id) = auth_staff_center());

-- research_instruments: staff-scoped policies exist so Phase 1 needs no RLS
-- migration, but every row is rejected by the phase-gate trigger until
-- study_mode is true. There is no Phase 0 UI for this table.
create policy research_instruments_staff_all on research_instruments
  for all using (participant_center(participant_id) = auth_staff_center())
  with check (participant_center(participant_id) = auth_staff_center());

-- voice_features: the participant's own device inserts features it computed
-- locally (audio already discarded); staff read.
create policy voice_participant_insert on voice_features
  for insert with check (participant_id = auth_participant_id());
create policy voice_staff_read on voice_features
  for select using (participant_center(participant_id) = auth_staff_center());

-- pedometer_readings / clinical_measures / attendance / staff_notes: staff only.
create policy pedometer_staff_all on pedometer_readings
  for all using (participant_center(participant_id) = auth_staff_center())
  with check (participant_center(participant_id) = auth_staff_center());
create policy clinical_staff_all on clinical_measures
  for all using (participant_center(participant_id) = auth_staff_center())
  with check (participant_center(participant_id) = auth_staff_center());
create policy attendance_staff_all on attendance
  for all using (participant_center(participant_id) = auth_staff_center())
  with check (participant_center(participant_id) = auth_staff_center());
create policy staff_notes_staff_all on staff_notes
  for all using (participant_center(participant_id) = auth_staff_center())
  with check (participant_center(participant_id) = auth_staff_center());

-- companion_state: participant reads own; staff read. Writes happen only via
-- the SECURITY DEFINER check-in trigger.
create policy companion_participant_read on companion_state
  for select using (participant_id = auth_participant_id());
create policy companion_staff_read on companion_state
  for select using (participant_center(participant_id) = auth_staff_center());

-- context_daily: readable by staff and participants of the center.
create policy context_staff_read on context_daily
  for select using (center_id = auth_staff_center());
create policy context_participant_read on context_daily
  for select using (center_id = auth_participant_center());

-- derived_daily / activity_reactivity: STAFF ONLY. Contains strain_index and
-- z-scores; participants must never be able to read a number (Invariant 1).
create policy derived_staff_read on derived_daily
  for select using (participant_center(participant_id) = auth_staff_center());
create policy reactivity_staff_read on activity_reactivity
  for select using (participant_center(participant_id) = auth_staff_center());

-- daily_state: band + reason only — participant reads own; staff read.
create policy daily_state_participant_read on daily_state
  for select using (participant_id = auth_participant_id());
create policy daily_state_staff_read on daily_state
  for select using (participant_center(participant_id) = auth_staff_center());

-- telemetry_events: any authenticated surface may INSERT for its own center;
-- nobody reads via the API (StrainX reads with the service role).
create policy telemetry_insert on telemetry_events
  for insert with check (
    center_id = coalesce(auth_staff_center(), auth_kiosk_center(), auth_participant_center())
  );

-- pairing_codes: no direct access; RPCs only.

-- ============================================================================
-- RPCs
-- ============================================================================

-- Kiosk roster: name + photo grid only. This is the ONLY way a kiosk reads
-- participant data (Invariant 8).
create or replace function kiosk_roster()
returns table (id uuid, display_name text, photo_url text, assigned_kiosk_device_id uuid)
language sql stable security definer set search_path = public as
$$
  select p.id, p.display_name, p.photo_url, p.assigned_kiosk_device_id
  from participants p
  where p.center_id = auth_kiosk_center()
    and p.withdrawn_at is null
  order by p.display_name
$$;

-- PWA pairing: participant phone (anonymous auth) mints a 6-digit code.
create or replace function create_pairing_code()
returns text
language plpgsql security definer set search_path = public as
$$
declare
  new_code text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if auth_participant_id() is not null then
    raise exception 'this device is already linked';
  end if;
  new_code := lpad((floor(random() * 1000000))::int::text, 6, '0');
  delete from pairing_codes where auth_user_id = auth.uid() or expires_at < now();
  insert into pairing_codes (code, auth_user_id) values (new_code, auth.uid());
  return new_code;
end;
$$;

-- Staff claims the code, linking the anonymous auth user to a participant.
create or replace function claim_pairing_code(p_code text, p_participant uuid)
returns void
language plpgsql security definer set search_path = public as
$$
declare
  pc record;
begin
  if auth_staff_center() is null
     or participant_center(p_participant) is distinct from auth_staff_center() then
    raise exception 'not authorized for this participant';
  end if;
  select * into pc from pairing_codes
  where code = p_code and expires_at > now();
  if not found then
    raise exception 'code not found or expired';
  end if;
  update participants set auth_user_id = pc.auth_user_id where id = p_participant;
  delete from pairing_codes where code = p_code;
end;
$$;

-- The participant page asks "who am I" once after anonymous sign-in.
create or replace function get_my_participant()
returns table (id uuid, display_name text, voice_enabled boolean, checkin_mode checkin_mode_t)
language sql stable security definer set search_path = public as
$$
  select p.id, p.display_name, p.voice_enabled, p.checkin_mode
  from participants p
  where p.auth_user_id = auth.uid()
$$;

-- ============================================================================
-- Storage: private bucket for raw PPG waveforms. Kiosk can write (never
-- read back — write-only device); staff can read. No audio bucket exists.
-- ============================================================================
insert into storage.buckets (id, name, public)
values ('ppg-raw', 'ppg-raw', false)
on conflict (id) do nothing;

create policy ppg_raw_kiosk_write on storage.objects
  for insert with check (bucket_id = 'ppg-raw' and auth_kiosk_center() is not null);
create policy ppg_raw_staff_read on storage.objects
  for select using (bucket_id = 'ppg-raw' and auth_staff_center() is not null);
