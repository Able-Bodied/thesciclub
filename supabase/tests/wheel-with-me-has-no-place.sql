-- ============================================================================
-- Wheel With Me has no place (20261028310000)
-- ============================================================================
-- Wheel With Me keeps no city, state or place, so the map has nothing for
-- it. save_organization keeps an empty city as none, for a new organization
-- and an edit; a main place keeps its own city when the directory's is
-- emptied; a city over 160 characters is still refused.
--
--   docker run --rm -i --network host -e PGPASSWORD=postgres postgres:17-alpine \
--     psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
--     -f - < supabase/tests/wheel-with-me-has-no-place.sql
--
-- Rolls back. Do not point it at the hosted project.
-- ============================================================================

\set ON_ERROR_STOP off
\pset pager off

begin;

insert into public.members (id, type, status, display_name, phone, birth_date, level_range, state, is_admin) values
  ('aaaaaaaa-0e0e-0000-0000-000000000001', 'mentor', 'active', 'Admin', '19990000e0a', '1980-01-01', 'T1–T6', 'CA', true);

insert into public.organizations (id, short_code, name, city, state) values
  ('bbbbbbbb-0e0e-0000-0000-000000000001', 'PNOP', 'Probe No Place', 'Somewhere', 'CA');
insert into public.organization_places (organization_id, position, city, state) values
  ('bbbbbbbb-0e0e-0000-0000-000000000001', 0, 'Somewhere', 'CA');

\echo ''
\echo '== 1. Wheel With Me: no city, no state, no place (expect null | null | 0) =='
select coalesce(o.city, 'null') as city, coalesce(o.state, 'null') as state,
       (select count(*) from public.organization_places op where op.organization_id = o.id) as places
  from public.organizations o where o.short_code = 'WWM';

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-0e0e-0000-0000-000000000001","role":"authenticated"}', true) is not null as ok;

\echo ''
\echo '== 2. a member reads it with no place on the map (expect 0) =='
select count(*) from public.map_organizations() m
  join public.organizations o on o.id = m.id where o.short_code = 'WWM';

\echo ''
\echo '== 3. a new organization saved with no city keeps none (expect null) =='
select public.save_organization(null, 'PNEW', 'Probe New', '  ', '', array[]::text[], false) as new_id \gset
select coalesce(city, 'null') as city from public.organizations where id = :'new_id';

\echo ''
\echo '== 4. an edit empties the directory''s city; the main place keeps its own (expect null | Somewhere | CA) =='
select public.save_organization('bbbbbbbb-0e0e-0000-0000-000000000001', 'PNOP', 'Probe No Place', '',
                                '', array[]::text[], false) is not null as ok;
select coalesce(o.city, 'null') as city, op.city as place_city, op.state as place_state
  from public.organizations o
  join public.organization_places op on op.organization_id = o.id and op.position = 0
 where o.id = 'bbbbbbbb-0e0e-0000-0000-000000000001';

\echo ''
\echo '== 5. a city given again goes to the main place as before (expect Elsewhere | Elsewhere) =='
select public.save_organization('bbbbbbbb-0e0e-0000-0000-000000000001', 'PNOP', 'Probe No Place', ' Elsewhere ',
                                '', array[]::text[], false) is not null as ok;
select o.city, op.city as place_city
  from public.organizations o
  join public.organization_places op on op.organization_id = o.id and op.position = 0
 where o.id = 'bbbbbbbb-0e0e-0000-0000-000000000001';

\echo ''
\echo '== 6. a city over 160 characters is refused (expect ERROR: Enter a name, place, ...) =='
savepoint long_city;
select public.save_organization('bbbbbbbb-0e0e-0000-0000-000000000001', 'PNOP', 'Probe No Place', repeat('x', 161),
                                '', array[]::text[], false);
rollback to savepoint long_city;

rollback;
