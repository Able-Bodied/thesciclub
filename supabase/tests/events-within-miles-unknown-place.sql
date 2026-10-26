-- ============================================================================
-- Within so many miles, when an event's place is unknown
-- ============================================================================
-- 20261023010000, the owner's rule: an event's own coordinates or own city
-- first; with no city, its organization's city; with neither on the map, it
-- shows at any distance. Online events show anywhere in the list already,
-- and since 20261025020000 are not returned; an organization's city counts
-- only with the organization's state.
--
-- The member's home is Sacramento. Distances from it: Los Angeles ~360 miles,
-- Menlo Park ~90. Asked as that signed-in member.
--
--   docker run --rm -i --network host -e PGPASSWORD=postgres postgres:17-alpine \
--     psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
--     -f - < supabase/tests/events-within-miles-unknown-place.sql
--
-- Rolls back. Do not point it at the hosted project.
-- ============================================================================

\set ON_ERROR_STOP off
\pset pager off

begin;

insert into public.members (id, type, status, display_name, phone, birth_date, level_range, state, city)
values ('aaaaaaaa-d1d1-0000-0000-00000000000a', 'peer', 'active', 'Home in Sacramento',
        '19990000d01', '1980-01-01', 'T1–T6', 'CA', 'Sacramento');

delete from public.city_places
 where city_key in ('sacramento', 'los angeles', 'menlo park', 'portland', 'nowhere');
insert into public.city_places (city_key, state, latitude, longitude) values
  ('sacramento', 'CA', 38.58, -121.49),
  ('los angeles', 'CA', 34.05, -118.24),
  ('menlo park', 'CA', 37.45, -122.18),
  ('portland', 'OR', 45.52, -122.68),
  ('portland', 'ME', 43.66, -70.26),
  ('nowhere', 'CA', null, null);
-- Settlements, as the import keeps them (20261025020000).
update public.city_places set settlement = true where latitude is not null;

insert into public.organizations (id, short_code, name, city, state) values
  ('bbbbbbbb-d1d1-0000-0000-000000000001', 'PRDS', 'Probe Sacramento', 'Sacramento', 'CA'),
  ('bbbbbbbb-d1d1-0000-0000-000000000002', 'PRDL', 'Probe Los Angeles', 'Los Angeles', 'CA'),
  ('bbbbbbbb-d1d1-0000-0000-000000000003', 'PRDB', 'Probe Bay Area', 'Bay Area', null),
  ('bbbbbbbb-d1d1-0000-0000-000000000004', 'PRDP', 'Probe Portland', 'Portland', null);
-- Their confirmed main places (20261025015000); the directory's text is not used.
insert into public.organization_places (organization_id, position, city, state) values
  ('bbbbbbbb-d1d1-0000-0000-000000000001', 0, 'Sacramento', 'CA'),
  ('bbbbbbbb-d1d1-0000-0000-000000000002', 0, 'Los Angeles', 'CA');

-- Hand-made, so no coordinates, unless given.
insert into public.events (id, title, start_time, location, city, state, latitude, longitude,
                           organization_id, event_format)
values
  ('eeeeeeee-d1d1-0000-0000-000000000001', 'No city, org in Sacramento', now() + interval '1 day',
   'The gym', null, null, null, null, 'bbbbbbbb-d1d1-0000-0000-000000000001', 'in_person'),
  ('eeeeeeee-d1d1-0000-0000-000000000002', 'No city, org in Los Angeles', now() + interval '1 day',
   'The gym', null, null, null, null, 'bbbbbbbb-d1d1-0000-0000-000000000002', 'in_person'),
  ('eeeeeeee-d1d1-0000-0000-000000000003', 'No city, org in the Bay Area', now() + interval '1 day',
   'The gym', null, null, null, null, 'bbbbbbbb-d1d1-0000-0000-000000000003', 'in_person'),
  ('eeeeeeee-d1d1-0000-0000-000000000004', 'No city, org in two Portlands', now() + interval '1 day',
   'The gym', null, null, null, null, 'bbbbbbbb-d1d1-0000-0000-000000000004', 'in_person'),
  ('eeeeeeee-d1d1-0000-0000-000000000005', 'Menlo Park, org in Sacramento', now() + interval '1 day',
   '1 Hacker Wy', 'Menlo Park', 'CA', null, null, 'bbbbbbbb-d1d1-0000-0000-000000000001', 'in_person'),
  ('eeeeeeee-d1d1-0000-0000-000000000006', 'Own coordinates in LA, org in Sacramento', now() + interval '1 day',
   'A park', 'Los Angeles', 'CA', 34.05, -118.24, 'bbbbbbbb-d1d1-0000-0000-000000000001', 'in_person'),
  ('eeeeeeee-d1d1-0000-0000-000000000007', 'A city not on the map', now() + interval '1 day',
   'Main St', 'Nowhere', 'CA', null, null, 'bbbbbbbb-d1d1-0000-0000-000000000002', 'in_person'),
  ('eeeeeeee-d1d1-0000-0000-000000000008', 'Online, org in Los Angeles', now() + interval '1 day',
   '', null, null, null, null, 'bbbbbbbb-d1d1-0000-0000-000000000002', 'online');

select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-d1d1-0000-0000-00000000000a","role":"authenticated"}', true) is not null as ok;
set local role authenticated;

\echo ''
\echo '== 0. we are the member, not the superuser (expect authenticated) =='
select current_user;

\echo ''
\echo '== 1. which probe events are in range at 20, 150 and 500 miles =='
\echo '   expect:'
\echo '   No city, org in Sacramento              | t | t | t   (the organization''s city)'
\echo '   No city, org in Los Angeles             | f | f | t   (the organization''s city)'
\echo '   No city, org in the Bay Area            | t | t | t   (not on the map: any distance)'
\echo '   No city, org in two Portlands           | t | t | t   (no organization state: any distance)'
\echo '   Menlo Park, org in Sacramento           | f | t | t   (its own city wins)'
\echo '   Own coordinates in LA, org in Sacramento| f | f | t   (its own coordinates win)'
\echo '   A city not on the map                   | t | t | t   (any distance)'
\echo '   Online, org in Los Angeles              | f | f | f   (online: not asked; the list shows it)'
select e.title,
       e.id = any (public.events_within_miles(20)) as at_20,
       e.id = any (public.events_within_miles(150)) as at_150,
       e.id = any (public.events_within_miles(500)) as at_500
  from public.events e
 where e.id::text like 'eeeeeeee-d1d1-%'
 order by e.id;

\echo ''
\echo '== 2. a home not on the map narrows nothing (expect null) =='
reset role;
update public.members set city = 'Nowhere' where id = 'aaaaaaaa-d1d1-0000-0000-00000000000a';
set local role authenticated;
select coalesce(public.events_within_miles(20)::text, 'null') as answer;

\echo ''
\echo '== 3. signed out, not callable (expect ERROR: permission denied) =='
reset role;
set local role anon;
savepoint anon_call;
select public.events_within_miles(20);
rollback to savepoint anon_call;
reset role;

rollback;
