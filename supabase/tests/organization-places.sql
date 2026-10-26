-- ============================================================================
-- An organization's places (20261025015000)
-- ============================================================================
-- save_organization_places replaces the list in order, for whoever may edit
-- the organization; a place sent with its id keeps its found pin; the main
-- place is copied to the directory. Members read places without coordinates.
--
--   docker run --rm -i --network host -e PGPASSWORD=postgres postgres:17-alpine \
--     psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
--     -f - < supabase/tests/organization-places.sql
--
-- Rolls back. Do not point it at the hosted project.
-- ============================================================================

\set ON_ERROR_STOP off
\pset pager off

begin;

insert into public.members (id, type, status, display_name, phone, birth_date, level_range, state, is_admin) values
  ('aaaaaaaa-0d0d-0000-0000-000000000001', 'mentor', 'active', 'Admin', '19990000d0a', '1980-01-01', 'T1–T6', 'CA', true),
  ('aaaaaaaa-0d0d-0000-0000-000000000002', 'peer', 'active', 'Member', '19990000d0b', '1980-01-01', 'T1–T6', 'CA', false);

insert into public.organizations (id, short_code, name, city, state) values
  ('bbbbbbbb-0d0d-0000-0000-000000000001', 'PPLA', 'Probe Places', 'Somewhere', null);

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-0d0d-0000-0000-000000000001","role":"authenticated"}', true) is not null as ok;

\echo ''
\echo '== 1. the administrator saves two places; the first is the directory''s (expect Berkeley | CA) =='
select public.save_organization_places('bbbbbbbb-0d0d-0000-0000-000000000001', '[
  {"label": null, "address": "3075 Adeline St", "city": "Berkeley", "state": "ca"},
  {"label": "Pool", "address": null, "city": " Oakland ", "state": "CA"}
]'::jsonb);
select city, state from public.organizations where id = 'bbbbbbbb-0d0d-0000-0000-000000000001';

\echo ''
\echo '== 1b. the older editor changes the city: the main place follows, the state stays (expect Albany | CA | Albany | CA) =='
select public.save_organization('bbbbbbbb-0d0d-0000-0000-000000000001', 'PPLA', 'Probe Places', 'Albany',
                                '', array[]::text[], false, '') is not null as ok;
select o.city, o.state, op.city as place_city, op.state as place_state
  from public.organizations o
  join public.organization_places op on op.organization_id = o.id and op.position = 0
 where o.id = 'bbbbbbbb-0d0d-0000-0000-000000000001';
select public.save_organization('bbbbbbbb-0d0d-0000-0000-000000000001', 'PPLA', 'Probe Places', 'Berkeley',
                                '', array[]::text[], false) is not null as ok;

\echo ''
\echo '== 2. read in order, without coordinates (expect 0 | null | 3075 Adeline St | Berkeley, then 1 | Pool | null | Oakland) =='
select position, coalesce(label, 'null') as label, coalesce(address, 'null') as address, city
  from public.organization_places
 where organization_id = 'bbbbbbbb-0d0d-0000-0000-000000000001'
 order by position;

\echo ''
\echo '== 3. a member cannot read where a place was found (expect ERROR: permission denied for table organization_places) =='
savepoint coords;
select latitude from public.organization_places limit 1;
rollback to savepoint coords;

\echo ''
\echo '== 4. reordered by id: the found pin stays (expect 0 | Oakland | null, 1 | Berkeley | 37.9; then Oakland | CA) =='
reset role;
update public.organization_places
   set latitude = 37.9, longitude = -122.3, location_precision = 'exact',
       geocoded_location = '3075 Adeline St, Berkeley, CA'
 where organization_id = 'bbbbbbbb-0d0d-0000-0000-000000000001' and position = 0;
select id as berkeley from public.organization_places
 where organization_id = 'bbbbbbbb-0d0d-0000-0000-000000000001' and position = 0 \gset
set local role authenticated;
select public.save_organization_places('bbbbbbbb-0d0d-0000-0000-000000000001',
  jsonb_build_array(
    jsonb_build_object('label', 'Pool', 'address', null, 'city', 'Oakland', 'state', 'CA'),
    jsonb_build_object('id', :'berkeley', 'label', null, 'address', '3075 Adeline St', 'city', 'Berkeley', 'state', 'CA')));
reset role;
select position, city, latitude from public.organization_places
 where organization_id = 'bbbbbbbb-0d0d-0000-0000-000000000001' order by position;
select city, state from public.organizations where id = 'bbbbbbbb-0d0d-0000-0000-000000000001';
set local role authenticated;

\echo ''
\echo '== 5. bad places are refused (expect three ERRORs: Each place needs a city and a two-letter state...) =='
savepoint no_state;
select public.save_organization_places('bbbbbbbb-0d0d-0000-0000-000000000001', '[{"city": "Berkeley", "state": ""}]');
rollback to savepoint no_state;
savepoint no_city;
select public.save_organization_places('bbbbbbbb-0d0d-0000-0000-000000000001', '[{"city": " ", "state": "CA"}]');
rollback to savepoint no_city;
savepoint long_address;
select public.save_organization_places('bbbbbbbb-0d0d-0000-0000-000000000001',
  jsonb_build_array(jsonb_build_object('city', 'Berkeley', 'state', 'CA', 'address', repeat('x', 201))));
rollback to savepoint long_address;

\echo ''
\echo '== 6. a member who does not speak for it cannot save (expect ERROR: You cannot change this organization.) =='
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-0d0d-0000-0000-000000000002","role":"authenticated"}', true) is not null as ok;
savepoint member_save;
select public.save_organization_places('bbbbbbbb-0d0d-0000-0000-000000000001', '[]');
rollback to savepoint member_save;

\echo ''
\echo '== 7. none left: off the map, the directory keeps its city text (expect Oakland | null) =='
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-0d0d-0000-0000-000000000001","role":"authenticated"}', true) is not null as ok;
select public.save_organization_places('bbbbbbbb-0d0d-0000-0000-000000000001', '[]');
select city, coalesce(state, 'null') as state from public.organizations where id = 'bbbbbbbb-0d0d-0000-0000-000000000001';

\echo ''
\echo '== 8. signed out (expect ERROR: permission denied for function save_organization_places) =='
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true) is not null as ok;
savepoint anon_save;
select public.save_organization_places('bbbbbbbb-0d0d-0000-0000-000000000001', '[]');
rollback to savepoint anon_save;
\echo '   and anon reads no place (expect 0)'
select count(*) as places from public.organization_places;
reset role;

rollback;
