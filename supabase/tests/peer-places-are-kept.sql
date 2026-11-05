-- ============================================================================
-- A peer's place is kept (20261104214000)
-- ============================================================================
-- map_peer_cities now reads each member's kept place. Here it is compared
-- with today's way, which works every place out on each read (copied from
-- 20261029040000 as pg_temp.old_map), as every member in the database and as
-- nobody: after joining, after a member changes zip or city, and after the
-- nightly import places, moves, refuses and forgets cities and zips.
--
-- Members: zip and city, zip only, city only, neither, a zip in another
-- state, a zip not placed yet, blocked by the viewer, blocking the viewer,
-- paused, removed, off the map, out of Peers.
--
--   docker run --rm -i --network host -e PGPASSWORD=postgres postgres:17-alpine \
--     psql -h 127.0.0.1 -p <port> -U postgres -d postgres \
--     -f - < supabase/tests/peer-places-are-kept.sql
--
-- Rolls back. Do not point it at the hosted project.
-- ============================================================================

\set ON_ERROR_STOP on
\pset pager off

begin;

delete from public.city_places where city_key like 'probe kept%' or city_key like 'probe later%';
delete from public.zip_places where zip in ('99101', '99102', '99103', '99104', '99105');
insert into public.city_places (city_key, state, latitude, longitude, settlement) values
  ('probe kept', 'CA', 38.123456789, -121.987654321, true),
  ('probe kept', 'NV', 39.5, -119.8, true),
  ('probe kept other', 'CA', 37.2, -121.2, true),
  ('probe kept refused', 'CA', 37.3, -121.3, true);
insert into public.zip_places (zip, state, latitude, longitude) values
  ('99101', 'CA', 38.111111111, -121.111111111),
  ('99102', 'CA', 38.222222222, -121.222222222),
  ('99103', 'NV', 39.1, -119.1),
  ('99105', 'CA', 38.555555555, -121.555555555);

insert into public.members (id, type, status, display_name, phone, birth_date, level_range, state, city, zip, show_on_map, show_in_browse) values
  ('a0000000-1104-0000-0000-000000000001', 'peer', 'active',    'Viewer',       '19991104001', '1980-01-01', 'T1–T6', 'CA', 'Probe Kept',   '99101', true,  true),
  ('a0000000-1104-0000-0000-000000000002', 'peer', 'active',    'Zip only',     '19991104002', '1980-01-01', 'T1–T6', 'CA', null,           '99101', true,  true),
  ('a0000000-1104-0000-0000-000000000003', 'peer', 'active',    'City only',    '19991104003', '1980-01-01', 'T1–T6', 'CA', ' probe kept ', null,    true,  true),
  ('a0000000-1104-0000-0000-000000000004', 'peer', 'active',    'Neither',      '19991104004', '1980-01-01', 'T1–T6', 'CA', null,           null,    true,  true),
  ('a0000000-1104-0000-0000-000000000005', 'peer', 'active',    'Zip in NV',    '19991104005', '1980-01-01', 'T1–T6', 'CA', 'Probe Kept',   '99103', true,  true),
  ('a0000000-1104-0000-0000-000000000006', 'peer', 'active',    'Zip mover',    '19991104006', '1980-01-01', 'T1–T6', 'CA', 'Probe Kept',   '99101', true,  true),
  ('a0000000-1104-0000-0000-000000000007', 'peer', 'active',    'Blocked',      '19991104007', '1980-01-01', 'T1–T6', 'CA', 'Probe Kept',   '99102', true,  true),
  ('a0000000-1104-0000-0000-000000000008', 'peer', 'active',    'Blocker',      '19991104008', '1980-01-01', 'T1–T6', 'CA', 'Probe Kept',   null,    true,  true),
  ('a0000000-1104-0000-0000-000000000009', 'peer', 'suspended', 'Paused',       '19991104009', '1980-01-01', 'T1–T6', 'CA', 'Probe Kept',   '99101', true,  true),
  ('a0000000-1104-0000-0000-00000000000a', 'peer', 'removed',   'Removed',      '1999110400a', '1980-01-01', 'T1–T6', 'CA', 'Probe Kept',   '99101', true,  true),
  ('a0000000-1104-0000-0000-00000000000b', 'peer', 'active',    'Off the map',  '1999110400b', '1980-01-01', 'T1–T6', 'CA', 'Probe Kept',   '99101', false, true),
  ('a0000000-1104-0000-0000-00000000000c', 'peer', 'active',    'Out of Peers', '1999110400c', '1980-01-01', 'T1–T6', 'CA', 'Probe Kept',   null,    true,  false),
  ('a0000000-1104-0000-0000-00000000000d', 'peer', 'active',    'Zip later',    '1999110400d', '1980-01-01', 'T1–T6', 'CA', 'Probe Kept',   '99104', true,  true),
  ('a0000000-1104-0000-0000-00000000000e', 'peer', 'active',    'City later',   '1999110400e', '1980-01-01', 'T1–T6', 'CA', 'Probe Later',  null,    true,  true),
  ('a0000000-1104-0000-0000-00000000000f', 'peer', 'active',    'City mover',   '1999110400f', '1980-01-01', 'T1–T6', 'CA', 'Probe Kept',   null,    true,  true),
  ('a0000000-1104-0000-0000-000000000010', 'peer', 'active',    'Refused town', '19991104010', '1980-01-01', 'T1–T6', 'CA', 'Probe Kept Refused', null, true, true),
  ('a0000000-1104-0000-0000-000000000011', 'peer', 'active',    'Zip forgotten','19991104011', '1980-01-01', 'T1–T6', 'CA', 'Probe Kept',   '99105', true,  true),
  ('a0000000-1104-0000-0000-000000000012', 'peer', 'active',    'State mover',  '19991104012', '1980-01-01', 'T1–T6', 'CA', 'Probe Kept',   null,    true,  true);

insert into public.member_blocks (blocker_id, blocked_id) values
  ('a0000000-1104-0000-0000-000000000001', 'a0000000-1104-0000-0000-000000000007'),
  ('a0000000-1104-0000-0000-000000000008', 'a0000000-1104-0000-0000-000000000001');

-- Today's map_peer_cities, as 20261029040000.
create function pg_temp.old_map()
returns table (city text, state text, latitude double precision, longitude double precision, member_ids uuid[])
language sql stable as $$
  with placed as (
    select m.id, btrim(m.city) as city, m.state,
      round(at.latitude::numeric, 5)::double precision as latitude,
      round(at.longitude::numeric, 5)::double precision as longitude
    from public.members m
    cross join lateral private.member_middle(m.id) at
    where m.show_on_map
      and (
        m.id in (select b.id from public.browse_members b)
        or (m.id = (select auth.uid()) and m.status = 'active')
      )
  )
  select mode() within group (order by p.city collate "C"),
    p.state, p.latitude, p.longitude,
    array_agg(p.id order by p.id)
  from placed p
  group by p.state, p.latitude, p.longitude;
$$;

-- As every member and as nobody: viewers asked, viewers whose two answers
-- differ, and rows seen in all (the same either way).
create function pg_temp.compare() returns table (viewers bigint, differing bigint, rows_seen bigint)
language plpgsql as $$
declare
  who uuid;
  n_old bigint;
  n_new bigint;
  odd bigint;
begin
  viewers := 0; differing := 0; rows_seen := 0;
  for who in select null::uuid union all select id from public.members loop
    perform set_config('request.jwt.claims',
      case when who is null then '' else json_build_object('sub', who, 'role', 'authenticated')::text end, true);
    select count(*) into odd from (
      (select * from pg_temp.old_map() except all select * from public.map_peer_cities())
      union all
      (select * from public.map_peer_cities() except all select * from pg_temp.old_map())) d;
    select count(*) into n_old from pg_temp.old_map();
    viewers := viewers + 1;
    rows_seen := rows_seen + n_old;
    if odd > 0 then
      differing := differing + 1;
      raise notice 'differs for %', coalesce(who::text, 'nobody');
    end if;
  end loop;
  perform set_config('request.jwt.claims', '', true);
  return next;
end;
$$;

\echo '== 1. after joining: the same for everybody'
\echo '   expect: viewers = members + 1 | 0 | rows > 0'
select (select count(*) + 1 from public.members) as expect_viewers, * from pg_temp.compare();

\echo ''
\echo '== 2. the viewer''s map: Blocked, Blocker, Paused, Removed, Off the map, Out of'
\echo '   Peers, Neither, Zip only and City later are not on it'
\echo '   expect: Probe Kept Refused | CA | 37.3     | -121.3     | {10}'
\echo '           Probe Kept         | CA | 38.11111 | -121.11111 | {01,06}'
\echo '           Probe Kept         | CA | 38.12346 | -121.98765 | {03,05,0d,0f,12}'
\echo '           Probe Kept         | CA | 38.55556 | -121.55556 | {11}'
set local request.jwt.claims = '{"sub":"a0000000-1104-0000-0000-000000000001","role":"authenticated"}';
set local role authenticated;
select city, state, latitude, longitude,
       array(select right(u::text, 2) from unnest(member_ids) u) as members
  from public.map_peer_cities()
 where exists (select 1 from unnest(member_ids) u where u::text like 'a0000000-1104-%')
 order by latitude;
reset role;

\echo ''
\echo '== 2b. the paused and the removed member see nobody, themselves included'
\echo '   expect: 0 | 0'
set local request.jwt.claims = '{"sub":"a0000000-1104-0000-0000-000000000009","role":"authenticated"}';
select count(*) as paused from public.map_peer_cities() \gset
set local request.jwt.claims = '{"sub":"a0000000-1104-0000-0000-00000000000a","role":"authenticated"}';
select :paused as paused, count(*) as removed from public.map_peer_cities();

\echo ''
\echo '== 3. a refused town is refused: the stored place goes when the import says so'
update public.city_places set settlement = false where city_key = 'probe kept refused';
\echo '   expect: 0 kept for Refused town'
select count(*) from private.member_places where member_id = 'a0000000-1104-0000-0000-000000000010';

\echo ''
\echo '== 4. members move: a new zip, a new city, a new state'
update public.members set zip = '99102' where id = 'a0000000-1104-0000-0000-000000000006';
update public.members set city = 'Probe Kept Other' where id = 'a0000000-1104-0000-0000-00000000000f';
update public.members set state = 'NV' where id = 'a0000000-1104-0000-0000-000000000012';
update public.members set zip = null where id = 'a0000000-1104-0000-0000-000000000009';
\echo '   expect: 38.22222 | -121.22222 (Zip mover at its new zip)'
select latitude, longitude from private.member_places where member_id = 'a0000000-1104-0000-0000-000000000006';
\echo '   expect: viewers = members + 1 | 0 | rows > 0'
select (select count(*) + 1 from public.members) as expect_viewers, * from pg_temp.compare();

\echo ''
\echo '== 5. the import: a zip and a city placed, a zip moved, a zip forgotten'
insert into public.zip_places (zip, state, latitude, longitude) values ('99104', 'CA', 38.444444444, -121.444444444);
insert into public.city_places (city_key, state, latitude, longitude, settlement) values ('probe later', 'CA', 36.9, -120.9, true);
update public.zip_places set latitude = 38.666666666 where zip = '99101';
delete from public.zip_places where zip = '99105';
update public.city_places set latitude = 38.13 where city_key = 'probe kept' and state = 'CA';
update public.city_places set placed_at = now() where city_key = 'probe kept other';
\echo '   expect: viewers = members + 1 | 0 | rows > 0'
select (select count(*) + 1 from public.members) as expect_viewers, * from pg_temp.compare();

\echo ''
\echo '== 6. a member unblocked, paused, reinstated, removed'
delete from public.member_blocks where blocker_id = 'a0000000-1104-0000-0000-000000000001';
update public.members set status = 'suspended' where id = 'a0000000-1104-0000-0000-000000000003';
update public.members set status = 'active' where id = 'a0000000-1104-0000-0000-000000000009';
update public.members set status = 'removed' where id = 'a0000000-1104-0000-0000-000000000002';
\echo '   expect: viewers = members + 1 | 0 | rows > 0'
select (select count(*) + 1 from public.members) as expect_viewers, * from pg_temp.compare();

\echo ''
\echo '== 7. every kept place is the one worked out today'
\echo '   expect: 0 | 0'
select
  (select count(*) from (
     select m.id, round(at.latitude::numeric, 5)::double precision, round(at.longitude::numeric, 5)::double precision
       from public.members m cross join lateral private.member_middle(m.id) at
     except select member_id, latitude, longitude from private.member_places) d) as missing_or_wrong,
  (select count(*) from (
     select member_id, latitude, longitude from private.member_places
     except
     select m.id, round(at.latitude::numeric, 5)::double precision, round(at.longitude::numeric, 5)::double precision
       from public.members m cross join lateral private.member_middle(m.id) at) d) as extra;

\echo ''
\echo '== 8. only the database reads kept places'
\echo '   expect: f | f | t'
select has_table_privilege('authenticated', 'private.member_places', 'select') as authenticated_reads,
       has_table_privilege('anon', 'private.member_places', 'select') as anon_reads,
       has_function_privilege('authenticated', 'public.map_peer_cities()', 'execute') as members_ask;

rollback;
