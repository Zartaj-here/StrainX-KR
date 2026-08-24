-- AT A GLANCE - Phase gate. centers table + the study_mode CHECK (needs an ethics ref) and the assert_study_mode_* fns every Phase 1 trigger calls.

-- ============================================================================
-- 0001 — THE PHASE GATE. This migration exists before any feature on purpose.
--
-- Phase 0 is a care tool. Phase 1 is human-subjects research and CANNOT run
-- without an ethics approval reference in this table. The gate is enforced by
-- Postgres, not by discipline: triggers created in 0003 call the assert
-- functions below and reject Phase 1 capture types (tug/ftsst/walk/phonation/
-- ddk, research instruments, is_control activities) for any center where
-- study_mode is false. study_mode cannot be set true without an approval ref.
-- ============================================================================

create table centers (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  study_mode          boolean not null default false,
  ethics_approval_ref text,
  ethics_approved_at  timestamptz,
  -- Air-quality context: nearest 에어코리아 station for the nightly cron.
  airkorea_station    text,
  timezone            text not null default 'Asia/Seoul',
  created_at          timestamptz not null default now(),
  constraint study_mode_requires_approval
    check (
      study_mode = false
      or (ethics_approval_ref is not null and ethics_approved_at is not null)
    )
);

comment on table centers is
  'A senior day-care center. study_mode=false means Phase 0 (care tool only). '
  'Flipping study_mode requires ethics_approval_ref + ethics_approved_at (CHECK '
  'constraint) and is deliberately service-role-only: no RLS policy allows any '
  'API role to update this table.';

comment on column centers.study_mode is
  'THE phase gate. All Phase 1 capture triggers and every Phase 1 UI surface '
  'key off this single flag. Do not add a second flag.';

-- Gate check for tables keyed by participant_id -----------------------------
create or replace function assert_study_mode_for_participant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  approved boolean;
begin
  select c.study_mode into approved
  from participants p
  join centers c on c.id = p.center_id
  where p.id = new.participant_id;

  if approved is distinct from true then
    raise exception
      'Phase 1 capture attempted without ethics approval on file (center not in study_mode)'
      using errcode = 'P0001',
            hint = 'Phase 1 requires centers.study_mode = true, which requires '
                   'ethics_approval_ref and ethics_approved_at.';
  end if;
  return new;
end;
$$;

-- Gate check for tables keyed by center_id ----------------------------------
create or replace function assert_study_mode_for_center()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  approved boolean;
begin
  select c.study_mode into approved
  from centers c
  where c.id = new.center_id;

  if approved is distinct from true then
    raise exception
      'Phase 1 capture attempted without ethics approval on file (center not in study_mode)'
      using errcode = 'P0001',
            hint = 'Phase 1 requires centers.study_mode = true, which requires '
                   'ethics_approval_ref and ethics_approved_at.';
  end if;
  return new;
end;
$$;
