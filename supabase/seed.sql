-- Local/dev seed. Creates one Phase 0 center so migrations + the app have
-- something to point at. Staff, kiosk devices, and participants are created
-- with the service role via scripts/provision.mjs (they need auth users, which
-- can't be minted from plain SQL). study_mode stays FALSE — this is a care
-- tool until an ethics approval reference exists.

insert into centers (id, name, airkorea_station, timezone)
values ('11111111-1111-1111-1111-111111111111', '햇살 데이케어 센터', '중구', 'Asia/Seoul')
on conflict (id) do nothing;
