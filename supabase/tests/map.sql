-- ============================================================================
-- The map: events, peers by city, organizations and home (20261025020000)
-- ============================================================================
-- Members, all active unless said: Viewer and Peer in Probetown; Hidden
-- (show_on_map off), Suspended, Blocked (by Viewer) and Unlisted (out of
-- browse) there too; Blocker in Probeburg, who blocked Viewer. Asked as each
-- signed-in member.
--
--   docker run --rm -i --network host -e PGPASSWORD=postgres postgres:17-alpine \
--     psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
--     -f - < supabase/tests/map.sql
--
-- Rolls back. Do not point it at the hosted project.
-- ============================================================================

\set ON_ERROR_STOP off
\pset pager off

begin;

insert into public.members (id, type, status, display_name, phone, birth_date, level_range, state, city, show_on_map, show_in_browse)
values
  ('aaaaaaaa-25a0-0000-0000-000000000001', 'peer', 'active',    'Viewer',    '19990025001', '1980-01-01', 'T1–T6', 'CA', 'Probetown', true,  true),
  ('aaaaaaaa-25a0-0000-0000-000000000002', 'peer', 'active',    'Peer',      '19990025002', '1980-01-01', 'T1–T6', 'CA', ' probetown ', true, true),
  ('aaaaaaaa-25a0-0000-0000-000000000003', 'peer', 'active',    'Hidden',    '19990025003', '1980-01-01', 'T1–T6', 'CA', 'Probetown', false, true),
  ('aaaaaaaa-25a0-0000-0000-000000000004', 'peer', 'suspended', 'Suspended', '19990025004', '1980-01-01', 'T1–T6', 'CA', 'Probetown', true,  true),
  ('aaaaaaaa-25a0-0000-0000-000000000005', 'peer', 'active',    'Blocked',   '19990025005', '1980-01-01', 'T1–T6', 'CA', 'Probetown', true,  true),
  ('aaaaaaaa-25a0-0000-0000-000000000006', 'peer', 'active',    'Blocker',   '19990025006', '1980-01-01', 'T1–T6', 'CA', 'Probeburg', true,  true),
  ('aaaaaaaa-25a0-0000-0000-000000000007', 'peer', 'active',    'Unlisted',  '19990025007', '1980-01-01', 'T1–T6', 'CA', 'Probetown', true,  false),
  ('aaaaaaaa-25a0-0000-0000-000000000008', 'peer', 'active',    'Unplaced',  '19990025008', '1980-01-01', 'T1–T6', 'NV', 'Probe Nowhere', true, true),
  ('aaaaaaaa-25a0-0000-0000-000000000009', 'peer', 'active',    'At a building', '19990025009', '1980-01-01', 'T1–T6', 'CA', 'Probe Medical Center', true, true),
  ('aaaaaaaa-25a0-0000-0000-00000000000a', 'peer', 'active',    'Refused place', '1999002500a', '1980-01-01', 'T1–T6', 'CA', 'Probe Hospital', true, true);

insert into public.member_blocks (blocker_id, blocked_id) values
  ('aaaaaaaa-25a0-0000-0000-000000000001', 'aaaaaaaa-25a0-0000-0000-000000000005'),
  ('aaaaaaaa-25a0-0000-0000-000000000006', 'aaaaaaaa-25a0-0000-0000-000000000001');

delete from public.city_places
 where city_key in ('probetown', 'probeburg', 'probe nowhere', 'twinville', 'probe medical center', 'probe hospital');
insert into public.city_places (city_key, state, latitude, longitude) values
  ('probetown', 'CA', 38.5815719, -121.4943996),
  ('probeburg', 'CA', 38.5449065, -121.7405167),
  ('probe nowhere', 'NV', null, null),
  ('twinville', 'CA', 37.1, -121.1),
  ('twinville', 'TX', 31.1, -97.1),
  ('probetown', 'TX', 30.1, -95.1);
-- Settlements, as the import confirms them (20261025020000); one not checked
-- yet (null), and one the check refused (false).
update public.city_places set settlement = true where latitude is not null;
insert into public.city_places (city_key, state, latitude, longitude, settlement) values
  ('probe medical center', 'CA', 38.55, -121.45, null),
  ('probe hospital', 'CA', 38.56, -121.46, false);

insert into public.organizations (id, short_code, name, city, state, removed_at) values
  ('bbbbbbbb-25a0-0000-0000-000000000001', 'PMAA', 'Probe Map Probetown', 'Probetown', 'CA', null),
  ('bbbbbbbb-25a0-0000-0000-000000000002', 'PMAB', 'Probe Map Twinville', 'Twinville', 'TX', null),
  ('bbbbbbbb-25a0-0000-0000-000000000003', 'PMAC', 'Probe Map Removed', 'Probetown', 'CA', now()),
  ('bbbbbbbb-25a0-0000-0000-000000000004', 'PMAD', 'Probe Map Nowhere', 'Probe Nowhere', 'NV', null),
  ('bbbbbbbb-25a0-0000-0000-000000000005', 'PMAE', 'Probe Map No State', 'Probetown', null, null),
  ('bbbbbbbb-25a0-0000-0000-000000000006', 'PMAF', 'Probe Map No Place', 'Probetown', 'CA', null);

-- Places: a main one at a city's middle, a public address found for its
-- address, and one whose address changed since it was found.
insert into public.organization_places (organization_id, position, label, address, city, state,
                                        latitude, longitude, location_precision, geocoded_location)
values
  ('bbbbbbbb-25a0-0000-0000-000000000001', 0, null, null, 'Probetown', 'CA', null, null, null, null),
  ('bbbbbbbb-25a0-0000-0000-000000000001', 1, 'Gym', '1 Gym Rd', 'Probeburg', 'CA',
   38.5512345, -121.7312345, 'exact', '1 Gym Rd, Probeburg, CA'),
  ('bbbbbbbb-25a0-0000-0000-000000000001', 2, 'Pool', '2 New Pool Rd', 'Probeburg', 'CA',
   38.5598765, -121.7398765, 'exact', '2 Old Pool Rd, Probeburg, CA'),
  ('bbbbbbbb-25a0-0000-0000-000000000002', 0, null, null, 'Twinville', 'TX', null, null, null, null),
  ('bbbbbbbb-25a0-0000-0000-000000000003', 0, null, null, 'Probetown', 'CA', null, null, null, null),
  ('bbbbbbbb-25a0-0000-0000-000000000004', 0, null, null, 'Probe Nowhere', 'NV', null, null, null, null);

insert into public.events (id, title, start_time, end_time, location, city, state, latitude, longitude,
                           location_precision, organization_id, event_format, audience, host_name)
values
  ('eeeeeeee-25a0-0000-0000-000000000001', 'Exact', now() + interval '1 day', null,
   '1 Main St', 'Probetown', 'CA', 38.9123456, -121.5012345, 'exact', null, 'in_person', 'club', 'Probe host'),
  ('eeeeeeee-25a0-0000-0000-000000000002', 'Approximate', now() + interval '1 day', null,
   'Somewhere in town', 'Probetown', 'CA', 38.2222222, -121.2222222, 'approximate', null, 'in_person', 'public', 'Probe host'),
  ('eeeeeeee-25a0-0000-0000-000000000003', 'Exact, no location shown', now() + interval '1 day', null,
   '  ', 'Probetown', 'CA', 38.3333333, -121.3333333, 'exact', null, 'in_person', 'club', 'Probe host'),
  ('eeeeeeee-25a0-0000-0000-000000000004', 'Online', now() + interval '1 day', null,
   'Zoom', 'Probetown', 'CA', null, null, null, null, 'online', 'club', 'Probe host'),
  ('eeeeeeee-25a0-0000-0000-000000000005', 'Groups only', now() + interval '1 day', null,
   '1 Main St', 'Probetown', 'CA', 38.9123456, -121.5012345, 'exact', null, 'in_person', 'groups', 'Probe host'),
  ('eeeeeeee-25a0-0000-0000-000000000006', 'Over', now() - interval '2 days', now() - interval '1 day',
   '1 Main St', 'Probetown', 'CA', 38.9123456, -121.5012345, 'exact', null, 'in_person', 'club', 'Probe host'),
  ('eeeeeeee-25a0-0000-0000-000000000007', 'Hybrid, exact', now() + interval '1 day', null,
   '2 Main St', 'Probetown', 'CA', 38.4444444, -121.4444444, 'exact', null, 'hybrid', 'club', 'Probe host'),
  ('eeeeeeee-25a0-0000-0000-000000000008', 'No city, org in Probetown', now() + interval '1 day', null,
   'A gym', null, 'CA', null, null, null, 'bbbbbbbb-25a0-0000-0000-000000000001', 'in_person', 'club', 'Probe host'),
  ('eeeeeeee-25a0-0000-0000-000000000009', 'Own city not placed', now() + interval '1 day', null,
   'A gym', 'Probe Nowhere', 'NV', null, null, null, null, 'in_person', 'club', 'Probe host');

-- Moved to 9 New St: one pin still for the old address, one found for the new.
insert into public.events (id, title, start_time, location, city, state, latitude, longitude,
                           location_precision, event_format, audience, host_name)
values
  ('eeeeeeee-25a0-0000-0000-00000000000a', 'Moved, pin for the old address', now() + interval '1 day',
   '9 New St', 'Probetown', 'CA', 38.5555555, -121.5555555, 'exact', 'in_person', 'club', 'Probe host'),
  ('eeeeeeee-25a0-0000-0000-00000000000b', 'Moved, pin for the new address', now() + interval '1 day',
   '9 New St', 'Probetown', 'CA', 38.6666666, -121.6666666, 'exact', 'in_person', 'club', 'Probe host');

-- In Texas, hosted from Probetown, CA: not at Probetown, TX.
insert into public.events (id, title, start_time, location, state, organization_id, event_format, audience, host_name)
values
  ('eeeeeeee-25a0-0000-0000-00000000000c', 'No city, TX, org in Probetown CA', now() + interval '1 day',
   'A gym', 'TX', 'bbbbbbbb-25a0-0000-0000-000000000001', 'in_person', 'club', 'Probe host');

-- Hosted by an organization with no state, or a state but no confirmed
-- place: never at the directory's city text.
insert into public.events (id, title, start_time, location, state, organization_id, event_format, audience, host_name)
values
  ('eeeeeeee-25a0-0000-0000-00000000000e', 'No city, CA, org with no state', now() + interval '1 day',
   'A gym', 'CA', 'bbbbbbbb-25a0-0000-0000-000000000005', 'in_person', 'club', 'Probe host'),
  ('eeeeeeee-25a0-0000-0000-00000000000f', 'No city, CA, org with no place', now() + interval '1 day',
   'A gym', 'CA', 'bbbbbbbb-25a0-0000-0000-000000000006', 'in_person', 'club', 'Probe host');

-- "Exact", but 450 miles from Probetown's middle (a rewrite's wrong building),
-- and "exact" in a city with no known middle (20261026010000).
insert into public.events (id, title, start_time, location, city, state, latitude, longitude,
                           location_precision, event_format, audience, host_name)
values
  ('eeeeeeee-25a0-0000-0000-000000000011', 'Exact, 450 miles off', now() + interval '1 day',
   '9 Far St', 'Probetown', 'CA', 32.7157, -117.1611, 'exact', 'in_person', 'club', 'Probe host'),
  ('eeeeeeee-25a0-0000-0000-000000000012', 'Exact, no city middle', now() + interval '1 day',
   '9 Lone St', 'Probe Nowhere', 'NV', 39.5, -119.8, 'exact', 'in_person', 'club', 'Probe host');
insert into public.organization_places (organization_id, position, label, address, city, state,
                                        latitude, longitude, location_precision, geocoded_location)
values ('bbbbbbbb-25a0-0000-0000-000000000002', 1, 'Far', '9 Far St', 'Probetown', 'CA',
        32.7157, -117.1611, 'exact', '9 Far St, Probetown, CA');

-- Ended yesterday in Viewer's city: off the map, but in range for Past.
insert into public.events (id, title, start_time, end_time, location, city, state, event_format, audience, host_name)
values
  ('eeeeeeee-25a0-0000-0000-000000000010', 'Ended yesterday', now() - interval '1 day 2 hours',
   now() - interval '1 day', 'A gym', 'Probetown', 'CA', 'in_person', 'club', 'Probe host');

-- Found exactly, but with no state its match could be anywhere: off the map.
insert into public.events (id, title, start_time, location, city, latitude, longitude, location_precision,
                           event_format, audience, host_name, geocoded_location)
values
  ('eeeeeeee-25a0-0000-0000-00000000000d', 'Exact, no state', now() + interval '1 day',
   '1 Main St', 'Probetown', 38.3, -121.3, 'exact', 'in_person', 'club', 'Probe host', '1 Main St, Probetown');

-- Each pin found for the place the event has now (20261025020000), but one.
update public.events set geocoded_location = public.geocode_key(location, city, state)
 where id::text like 'eeeeeeee-25a0-%';
update public.events set geocoded_location = '1 Old St, Probetown, CA'
 where id = 'eeeeeeee-25a0-0000-0000-00000000000a';

-- Names for the ids that come back. Read as the superuser: through RLS a
-- leaked event would have no title, and drop out of the join unseen.
create temporary table probe_names (id uuid, name text) on commit drop;
insert into probe_names
select id, display_name from public.members where id::text like 'aaaaaaaa-25a0-%'
union all select id, title from public.events where id::text like 'eeeeeeee-25a0-%'
union all select id, name from public.organizations where id::text like 'bbbbbbbb-25a0-%';
grant select on probe_names to authenticated;

\echo ''
\echo '== 1. signed out, none callable (expect four ERRORs: permission denied for function) =='
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true) is not null as ok;
savepoint anon_events;
select * from public.map_events();
rollback to savepoint anon_events;
savepoint anon_peers;
select * from public.map_peer_cities();
rollback to savepoint anon_peers;
savepoint anon_orgs;
select * from public.map_organizations();
rollback to savepoint anon_orgs;
savepoint anon_home;
select * from public.map_home();
rollback to savepoint anon_home;
reset role;

select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-25a0-0000-0000-000000000001","role":"authenticated"}', true) is not null as ok;
set local role authenticated;

\echo ''
\echo '== 2. we are Viewer, not the superuser (expect authenticated) =='
select current_user;

\echo ''
\echo '== 3. home is the middle of Probetown, rounded (expect 38.58157 | -121.4944) =='
select * from public.map_home();

\echo ''
\echo '== 4. peers in the probe cities, as Viewer =='
\echo '   expect one row: Probetown | CA | 38.58157 | -121.4944 | {Peer, Viewer}'
\echo '   (not Hidden, Suspended, Blocked or Unlisted; Probeburg absent: its only'
\echo '   member blocked Viewer; Probe Nowhere absent: not placed)'
select c.city, c.state, c.latitude, c.longitude,
       array(select n.name from probe_names n where n.id = any (c.member_ids) order by n.name) as members
  from public.map_peer_cities() c
 where lower(c.city) in ('probetown', 'probeburg', 'probe nowhere');

\echo ''
\echo '== 5. events, as Viewer =='
\echo '   expect, in order:'
\echo '   Exact                     | 38.91235 | -121.50123 | t'
\echo '   Approximate               | 38.58157 | -121.4944  | f   (city middle)'
\echo '   Exact, no location shown  | 38.58157 | -121.4944  | f   (city middle)'
\echo '   Hybrid, exact             | 38.44444 | -121.44444 | t'
\echo '   No city, org in Probetown | 38.58157 | -121.4944  | f   (org city in CA)'
\echo '   Moved, pin for the old address | 38.58157 | -121.4944  | f   (see 5b)'
\echo '   Moved, pin for the new address | 38.66667 | -121.66667 | t'
\echo '   Exact, 450 miles off           | 38.58157 | -121.4944  | f   (city middle, 20261026010000)'
\echo '   Exact, no city middle          | 39.5     | -119.8     | t   (its own pin)'
\echo '   (not Online, Groups only, Over, Own city not placed, No city, TX, org in Probetown CA,'
\echo '   Exact, no state, No city, CA, org with no state, or No city, CA, org with no place)'
select t.name as title, m.latitude, m.longitude, m.exact
  from public.map_events() m
  join probe_names t on t.id = m.id
 where m.id::text like 'eeeeeeee-25a0-%'
 order by m.id;

\echo ''
\echo '== 5b. a pin found for an older address is at the city middle; one for this address is exact =='
\echo '   expect:'
\echo '   Moved, pin for the old address | 38.58157 | -121.4944  | f'
\echo '   Moved, pin for the new address | 38.66667 | -121.66667 | t'
select t.name as title, m.latitude, m.longitude, m.exact
  from public.map_events() m
  join probe_names t on t.id = m.id
 where m.id in ('eeeeeeee-25a0-0000-0000-00000000000a', 'eeeeeeee-25a0-0000-0000-00000000000b')
 order by m.id;

\echo ''
\echo '== 6. organizations, as Viewer: each place, in its own state =='
\echo '   expect:'
\echo '   Probe Map Probetown | (main) | Probetown | CA | 38.58157 | -121.4944  | f'
\echo '   Probe Map Probetown | Gym    | Probeburg | CA | 38.55123 | -121.73123 | t   (its address, found)'
\echo '   Probe Map Probetown | Pool   | Probeburg | CA | 38.54491 | -121.74052 | f   (address changed: city middle)'
\echo '   Probe Map Twinville | (main) | Twinville | TX | 31.1     | -97.1      | f   (Twinville, TX, not CA)'
\echo '   Probe Map Twinville | Far    | Probetown | CA | 38.58157 | -121.4944  | f   (450 miles off: city middle, 6h)'
\echo '   (not Removed; not Nowhere, not placed; not No State, which has no place)'
select t.name, coalesce(m.label, '(main)') as label, m.city, m.state, m.latitude, m.longitude, m.exact
  from public.map_organizations() m
  join probe_names t on t.id = m.id
 where m.id::text like 'bbbbbbbb-25a0-%'
 order by t.name, m.label nulls first;

\echo ''
\echo '== 6b. nobody is counted at a place not confirmed a settlement, or refused (expect 0) =='
select count(*) as cities from public.map_peer_cities() c
 where lower(c.city) in ('probe medical center', 'probe hospital');

\echo ''
\echo '== 6c. within 20 miles, measured where the map shows each, of what Viewer may see =='
\echo '   expect: Approximate (its raw point ~29 miles off; its city middle is home),'
\echo '   Exact, no location shown; Exact, no state (not placed, no state: any distance);'
\echo '   Hybrid, exact; Moved, pin for the new address; Moved, pin for the old address;'
\echo '   No city, CA, org with no place and No city, CA, org with no state (not placed, home state);'
\echo '   No city, org in Probetown; Ended yesterday (finished, for Past); Exact, 450 miles off'
\echo '   (measured at its city middle); not Exact, no city middle (its own pin, in Nevada)'
\echo '   (not Exact, ~23 miles; nor Groups only, Online, Own city not placed, the Texas one)'
select t.name
  from unnest(public.events_within_miles(20)) w(id)
  join probe_names t on t.id = w.id
 where w.id::text like 'eeeeeeee-25a0-%'
 order by t.name;

\echo ''
\echo '== 6d. not checked yet: home and distance work as before (expect 1 | t) =='
reset role;
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-25a0-0000-0000-000000000009","role":"authenticated"}', true) is not null as ok;
set local role authenticated;
select (select count(*) from public.map_home()) as home,
       public.events_within_miles(20) is not null as narrows;

\echo ''
\echo '== 6e. refused by the check: no home, nothing narrowed (expect 0 | t) =='
reset role;
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-25a0-0000-0000-00000000000a","role":"authenticated"}', true) is not null as ok;
set local role authenticated;
select (select count(*) from public.map_home()) as home,
       public.events_within_miles(20) is null as unplaced;
reset role;
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-25a0-0000-0000-000000000001","role":"authenticated"}', true) is not null as ok;
set local role authenticated;

\echo ''
\echo '== 6f. within 500 miles: never an event Viewer may not see or an online one; a finished one is (expect t | f | f | t) =='
select 'eeeeeeee-25a0-0000-0000-000000000001'::uuid = any (w.ids) as exact,
       'eeeeeeee-25a0-0000-0000-000000000005'::uuid = any (w.ids) as groups_only,
       'eeeeeeee-25a0-0000-0000-000000000004'::uuid = any (w.ids) as online,
       'eeeeeeee-25a0-0000-0000-000000000006'::uuid = any (w.ids) as over
  from (select public.events_within_miles(500) as ids) w;

\echo ''
\echo '== 6g. an event that ended yesterday in Viewer''s city: in range, not on the map (expect t | f) =='
select 'eeeeeeee-25a0-0000-0000-000000000010'::uuid = any (public.events_within_miles(20)) as in_range,
       exists (select 1 from public.map_events() m where m.id = 'eeeeeeee-25a0-0000-0000-000000000010') as on_map;

\echo ''
\echo '== 6h. an exact pin 450 miles from its city''s known middle is at the middle, not exact; one whose'
\echo '   city has no known middle keeps its own pin (expect 38.58157 | -121.4944 | f, then'
\echo '   39.5 | -119.8 | t, then t, then Far | 38.58157 | -121.4944 | f)'
select m.latitude, m.longitude, m.exact from public.map_events() m
 where m.id = 'eeeeeeee-25a0-0000-0000-000000000011';
select m.latitude, m.longitude, m.exact from public.map_events() m
 where m.id = 'eeeeeeee-25a0-0000-0000-000000000012';
select 'eeeeeeee-25a0-0000-0000-000000000011'::uuid = any (public.events_within_miles(20)) as measured_at_middle;
select m.label, m.latitude, m.longitude, m.exact from public.map_organizations() m where m.label = 'Far';

\echo ''
\echo '== 7. no coordinate anywhere is finer than 5 decimals (expect 0 | 0 | 0 | 0) =='
select
  (select count(*) from public.map_events()
    where latitude <> round(latitude::numeric, 5)::double precision
       or longitude <> round(longitude::numeric, 5)::double precision) as events,
  (select count(*) from public.map_peer_cities()
    where latitude <> round(latitude::numeric, 5)::double precision
       or longitude <> round(longitude::numeric, 5)::double precision) as peers,
  (select count(*) from public.map_organizations()
    where latitude <> round(latitude::numeric, 5)::double precision
       or longitude <> round(longitude::numeric, 5)::double precision) as organizations,
  (select count(*) from public.map_home()
    where latitude <> round(latitude::numeric, 5)::double precision
       or longitude <> round(longitude::numeric, 5)::double precision) as home;

\echo ''
\echo '== 8. Viewer turns the map off on their own row (expect UPDATE 1, then {Peer}) =='
update public.members set show_on_map = false where id = 'aaaaaaaa-25a0-0000-0000-000000000001';
select array(select n.name from probe_names n where n.id = any (c.member_ids) order by n.name) as members
  from public.map_peer_cities() c
 where lower(c.city) = 'probetown';

\echo ''
\echo '== 9. as Blocker: Viewer is hidden the other way too =='
\echo '   expect: Probeburg | {Blocker}, then Probetown | {Blocked, Peer}'
reset role;
update public.members set show_on_map = true where id = 'aaaaaaaa-25a0-0000-0000-000000000001';
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-25a0-0000-0000-000000000006","role":"authenticated"}', true) is not null as ok;
set local role authenticated;
select c.city,
       array(select n.name from probe_names n where n.id = any (c.member_ids) order by n.name) as members
  from public.map_peer_cities() c
 where lower(c.city) in ('probetown', 'probeburg')
 order by c.city;

\echo ''
\echo '== 10. as Suspended: no peers at all (expect 0) =='
reset role;
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-25a0-0000-0000-000000000004","role":"authenticated"}', true) is not null as ok;
set local role authenticated;
select count(*) as cities from public.map_peer_cities();

\echo ''
\echo '== 11. as somebody not in the club: nothing (expect 0 | 0 | 0 | 0) =='
reset role;
select set_config('request.jwt.claims',
  '{"sub":"99999999-25a0-0000-0000-000000000009","role":"authenticated"}', true) is not null as ok;
set local role authenticated;
select (select count(*) from public.map_events()) as events,
       (select count(*) from public.map_peer_cities()) as peers,
       (select count(*) from public.map_organizations()) as organizations,
       (select count(*) from public.map_home()) as home;

reset role;

\echo ''
\echo '== 12. the shapes (expect four rows, as named) =='
\echo '   map_events        | TABLE(id uuid, latitude double precision, longitude double precision, exact boolean)'
\echo '   map_home          | TABLE(latitude double precision, longitude double precision)'
\echo '   map_organizations | TABLE(place_id uuid, id uuid, label text, city text, state text, latitude double precision, longitude double precision, exact boolean)'
\echo '   map_peer_cities   | TABLE(city text, state text, latitude double precision, longitude double precision, member_ids uuid[])'
select p.proname, pg_get_function_result(p.oid)
  from pg_proc p
 where p.pronamespace = 'public'::regnamespace and p.proname like 'map\_%'
 order by p.proname;

rollback;
