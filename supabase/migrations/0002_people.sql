-- AT A GLANCE - People. staff, kiosk_devices, participants (write-once kiosk), emergency_contacts (never automated), care_baseline, PWA pairing.

-- ============================================================================
-- 0002 — People: staff, kiosk devices, participants, emergency contacts,
--        care baseline, PWA device pairing.
-- ============================================================================

create type platform_t     as enum ('ios', 'android');
create type checkin_mode_t as enum ('self', 'self_nudge', 'staff');

create table staff (
  id           uuid primary key default gen_random_uuid(),
  center_id    uuid not null references centers(id),
  auth_user_id uuid unique references auth.users(id) on delete set null,
  display_name text not null,
  role         text not null default 'staff',
  created_at   timestamptz not null default now(),
  -- There is no researcher role in Phase 0. Do not add one here; a researcher
  -- role is a Phase 1 deliverable that itself sits behind the phase gate.
  constraint staff_role_no_researcher check (role in ('staff', 'admin'))
);

create table kiosk_devices (
  id           uuid primary key default gen_random_uuid(),
  center_id    uuid not null references centers(id),
  device_label text not null,              -- e.g. '키오스크 1'
  platform     platform_t,
  os_version   text,
  auth_user_id uuid unique references auth.users(id) on delete set null,
  created_at   timestamptz not null default now()
);

create table participants (
  id                       uuid primary key default gen_random_uuid(),
  center_id                uuid not null references centers(id),
  auth_user_id             uuid unique references auth.users(id) on delete set null,
  display_name             text not null,
  photo_url                text,
  enrolled_at              timestamptz not null default now(),
  withdrawn_at             timestamptz,
  platform                 platform_t,
  os_version               text,
  -- Invariant 9: FIXED for the whole deployment. Camera PPG is device-
  -- dependent; a fixed assignment lets device bias absorb into the personal
  -- baseline. Write-once, enforced by trigger below.
  assigned_kiosk_device_id uuid references kiosk_devices(id),
  checkin_mode             checkin_mode_t not null default 'self',
  voice_enabled            boolean not null default false,
  capacity_self_consent    boolean,
  legal_rep                jsonb,
  consent_flags            jsonb not null default '{}'::jsonb
);

-- Invariant 9: one kiosk phone per participant, for the whole deployment.
create or replace function prevent_kiosk_reassignment()
returns trigger
language plpgsql
as $$
begin
  if old.assigned_kiosk_device_id is not null
     and new.assigned_kiosk_device_id is distinct from old.assigned_kiosk_device_id then
    raise exception
      'assigned_kiosk_device_id is write-once (Invariant 9: fixed kiosk per participant)';
  end if;
  return new;
end;
$$;

create trigger participants_kiosk_write_once
before update on participants
for each row execute function prevent_kiosk_reassignment();

create table emergency_contacts (
  id             uuid primary key default gen_random_uuid(),
  participant_id uuid not null references participants(id),
  name           text not null,
  relationship   text,
  phone          text not null,
  share_opt_in   boolean not null default false,
  created_at     timestamptz not null default now()
);

comment on table emergency_contacts is
  'INVARIANT 3: human-initiated escalation ONLY. No trigger, cron, edge '
  'function, webhook, or app code path may write to this table or send '
  'anything based on it automatically. It is a phone book for a human staff '
  'member who has decided, themselves, to make a call. No inactivity '
  'alerting, no 고독사 detection, ever.';

create table care_baseline (
  id              uuid primary key default gen_random_uuid(),
  participant_id  uuid not null references participants(id),
  measured_at     timestamptz not null default now(),
  adl_score       int check (adl_score >= 0),
  af_flag         boolean not null default false,
  meds            jsonb not null default '[]'::jsonb,
  beta_blocker    boolean not null default false,
  rate_control    boolean not null default false,
  anticholinergic boolean not null default false
);

comment on column care_baseline.beta_blocker is
  'The single most important covariate in the schema. Beta-blockers flatten '
  'HRV and suppress HR; never interpret a PPG reading without it.';
comment on column care_baseline.af_flag is
  'Atrial fibrillation makes HRV meaningless. PPG readings for AF '
  'participants are stored but forced usable=false (HR is still kept).';

-- PWA pairing: the participant''s phone signs in anonymously and shows a
-- 6-digit code; staff claims it on the dashboard, linking auth_user_id to the
-- participant. Codes are short-lived and only touchable via SECURITY DEFINER
-- RPCs (0006).
create table pairing_codes (
  code         text primary key,
  auth_user_id uuid not null,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null default now() + interval '15 minutes'
);
