-- ============================================================================
-- Within so many miles, for an event in another state
-- ============================================================================
-- 20261023020000, the owner's rule: an event with a state but no city is
-- placed by its organization's city in that state; one that cannot be placed
-- and is in another state than the member's is out of range; one with nothing
-- known shows at any distance. Since 20261025020000 the organization's city
-- counts only with the organization's own state, and online events are not
-- returned (the list shows them anywhere).
--
-- Atlanta is in two states here. Members: one at home in Sacramento, CA, one in Savannah, GA
-- (~220 miles from Atlanta). Asked as each signed-in member.
--
--   docker run --rm -i --network host -e PGPASSWORD=postgres postgres:17-alpine \
--     psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
--     -f - < supabase/tests/events-within-miles-out-of-state.sql
--
-- Rolls back. Do not point it at the hosted project.
-- ============================================================================

\set ON_ERROR_STOP off
\pset pager off

begin;

insert into public.members (id, type, status, display_name, phone, birth_date, level_range, state, city)
values
  ('aaaaaaaa-d2d2-0000-0000-00000000000a', 'peer', 'active', 'Home in Sacramento',
   '19990000d21', '1980-01-01', 'T1–T6', 'CA', 'Sacramento'),
  ('aaaaaaaa-d2d2-0000-0000-00000000000b', 'peer', 'active', 'Home in Savannah',
   '19990000d22', '1980-01-01', 'T1–T6', 'GA', 'Savannah');

delete from public.city_places
 where city_key in ('sacramento', 'savannah', 'atlanta', 'los angeles', 'nowhere');
insert into public.city_places (city_key, state, latitude, longitude) values
  ('sacramento', 'CA', 38.58, -121.49),
  ('savannah', 'GA', 32.08, -81.09),
  ('atlanta', 'GA', 33.75, -84.39),
  ('atlanta', 'TX', 33.11, -94.16),
  ('los angeles', 'CA', 34.05, -118.24),
  ('nowhere', 'NV', null, null);
-- Settlements, as the import keeps them (20261025020000).
update public.city_places set settlement = true where latitude is not null;

insert into public.organizations (id, short_code, name, city) values
  ('bbbbbbbb-d2d2-0000-0000-000000000001', 'PRAT', 'Probe Atlanta', 'Atlanta'),
  ('bbbbbbbb-d2d2-0000-0000-000000000002', 'PRNW', 'Probe Nowhere', 'Nowhere');
-- The same Atlanta, with its state known (20261025020000).
insert into public.organizations (id, short_code, name, city, state) values
  ('bbbbbbbb-d2d2-0000-0000-000000000003', 'PRAG', 'Probe Atlanta GA', 'Atlanta', 'GA');
insert into public.organization_places (organization_id, position, city, state)
values ('bbbbbbbb-d2d2-0000-0000-000000000003', 0, 'Atlanta', 'GA');

insert into public.events (id, title, start_time, location, city, state, latitude, longitude,
                           organization_id, event_format, host_name)
values
  ('eeeeeeee-d2d2-0000-0000-000000000001', 'Venue only, GA, org in Atlanta', now() + interval '1 day',
   'St. James United Methodist Church', null, 'GA', null, null, 'bbbbbbbb-d2d2-0000-0000-000000000001', 'in_person', 'Probe host'),
  ('eeeeeeee-d2d2-0000-0000-000000000002', 'No place, NV', now() + interval '1 day',
   'A gym', null, 'NV', null, null, 'bbbbbbbb-d2d2-0000-0000-000000000002', 'in_person', 'Probe host'),
  ('eeeeeeee-d2d2-0000-0000-000000000003', 'Own city not on the map, NV', now() + interval '1 day',
   'Main St', 'Nowhere', 'NV', null, null, null, 'in_person', 'Probe host'),
  ('eeeeeeee-d2d2-0000-0000-000000000004', 'No place, CA', now() + interval '1 day',
   'A gym', null, 'CA', null, null, 'bbbbbbbb-d2d2-0000-0000-000000000002', 'in_person', 'Probe host'),
  ('eeeeeeee-d2d2-0000-0000-000000000005', 'Nothing known', now() + interval '1 day',
   '', null, null, null, null, null, null, 'Probe host'),
  ('eeeeeeee-d2d2-0000-0000-000000000006', 'No state, org in two Atlantas', now() + interval '1 day',
   'A gym', null, null, null, null, 'bbbbbbbb-d2d2-0000-0000-000000000001', 'in_person', 'Probe host'),
  ('eeeeeeee-d2d2-0000-0000-000000000007', 'Online, GA, org in Atlanta', now() + interval '1 day',
   'Zoom', null, 'GA', null, null, 'bbbbbbbb-d2d2-0000-0000-000000000001', 'online', 'Probe host'),
  ('eeeeeeee-d2d2-0000-0000-000000000008', 'Own city Los Angeles, CA', now() + interval '1 day',
   'A park', 'Los Angeles', 'CA', null, null, null, 'in_person', 'Probe host'),
  ('eeeeeeee-d2d2-0000-0000-000000000009', 'Venue only, GA, org in Atlanta GA', now() + interval '1 day',
   'A gym', null, 'GA', null, null, 'bbbbbbbb-d2d2-0000-0000-000000000003', 'in_person', 'Probe host');

select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-d2d2-0000-0000-00000000000a","role":"authenticated"}', true) is not null as ok;
set local role authenticated;

\echo ''
\echo '== 0. we are the member, not the superuser (expect authenticated) =='
select current_user;

\echo ''
\echo '== 1. home in Sacramento, CA: in range at 20 and 500 miles =='
\echo '   expect:'
\echo '   Venue only, GA, org in Atlanta | f | f   (organization has no state: another state, not placed)'
\echo '   No place, NV                   | f | f   (another state, not placed)'
\echo '   Own city not on the map, NV    | f | f   (another state, not placed)'
\echo '   No place, CA                   | t | t   (same state, not placed)'
\echo '   Nothing known                  | t | t   (any distance)'
\echo '   No state, org in two Atlantas  | t | t   (no organization state: any distance)'
\echo '   Online, GA, org in Atlanta     | f | f   (online: not asked)'
\echo '   Own city Los Angeles, CA       | f | t   (its own city)'
\echo '   Venue only, GA, org in Atlanta GA | f | f   (Atlanta, GA: ~2,100 miles)'
select e.title,
       e.id = any (public.events_within_miles(20)) as at_20,
       e.id = any (public.events_within_miles(500)) as at_500
  from public.events e
 where e.id::text like 'eeeeeeee-d2d2-%'
 order by e.id;

\echo ''
\echo '== 2. home in Savannah, GA: an organization with a state places the event at Atlanta, GA =='
\echo '   expect:'
\echo '   Venue only, GA, org in Atlanta | t | t   (organization has no state: same state, not placed)'
\echo '   No place, NV                   | f | f'
\echo '   Own city not on the map, NV    | f | f'
\echo '   No place, CA                   | f | f   (another state now)'
\echo '   Nothing known                  | t | t'
\echo '   No state, org in two Atlantas  | t | t'
\echo '   Online, GA, org in Atlanta     | f | f'
\echo '   Own city Los Angeles, CA       | f | f'
\echo '   Venue only, GA, org in Atlanta GA | f | t   (Atlanta, GA: ~220 miles)'
reset role;
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-d2d2-0000-0000-00000000000b","role":"authenticated"}', true) is not null as ok;
set local role authenticated;
select e.title,
       e.id = any (public.events_within_miles(20)) as at_20,
       e.id = any (public.events_within_miles(500)) as at_500
  from public.events e
 where e.id::text like 'eeeeeeee-d2d2-%'
 order by e.id;

\echo ''
\echo '== 3. signed out, not callable (expect ERROR: permission denied) =='
reset role;
set local role anon;
savepoint anon_call;
select public.events_within_miles(20);
rollback to savepoint anon_call;
reset role;

rollback;
