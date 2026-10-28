-- ============================================================================
-- An organization's place has a ZIP code (20261028700000)
-- ============================================================================
-- An organization account saves a ZIP on its own place, never another's; a
-- bad ZIP is refused, by the function and by the table; a save without the
-- key keeps it; a ZIP alone asks for no new pin; members read it, signed-out
-- visitors read no place.
--
--   docker run --rm -i --network host -e PGPASSWORD=postgres postgres:17-alpine \
--     psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
--     -f - < supabase/tests/organization-place-zip.sql
--
-- Rolls back. Do not point it at the hosted project.
-- ============================================================================

\set ON_ERROR_STOP off
\pset pager off

begin;

insert into public.members (id, type, status, display_name, birth_date, level_range, state, is_admin) values
  ('aaaaaaaa-0e0e-0000-0000-000000000001', 'organization', 'active', 'Org account', '1980-01-01', 'T1–T6', 'CA', false),
  ('aaaaaaaa-0e0e-0000-0000-000000000002', 'peer', 'active', 'Member', '1980-01-01', 'T1–T6', 'CA', false);

insert into public.organizations (id, short_code, name, city, state) values
  ('bbbbbbbb-0e0e-0000-0000-000000000001', 'PZIA', 'Probe Zip Own', 'Berkeley', 'CA'),
  ('bbbbbbbb-0e0e-0000-0000-000000000002', 'PZIB', 'Probe Zip Other', 'Oakland', 'CA');

insert into public.organization_representatives (organization_id, member_id) values
  ('bbbbbbbb-0e0e-0000-0000-000000000001', 'aaaaaaaa-0e0e-0000-0000-000000000001');

-- Its main place, already pinned at its address.
insert into public.organization_places (id, organization_id, position, address, city, state,
                                        latitude, longitude, location_precision, geocoded_location) values
  ('cccccccc-0e0e-0000-0000-000000000001', 'bbbbbbbb-0e0e-0000-0000-000000000001', 0,
   '800 Potter St', 'Berkeley', 'CA', 37.85, -122.29, 'exact',
   public.geocode_key('800 Potter St', 'Berkeley', 'CA')),
  ('cccccccc-0e0e-0000-0000-000000000002', 'bbbbbbbb-0e0e-0000-0000-000000000002', 0,
   null, 'Oakland', 'CA', null, null, null, null);
delete from private.geocode_queue where target_id in
  ('cccccccc-0e0e-0000-0000-000000000001', 'cccccccc-0e0e-0000-0000-000000000002');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-0e0e-0000-0000-000000000001","role":"authenticated"}', true) is not null as ok;

\echo ''
\echo '== 1. the organization account saves ZIPs on its own places (expect 0 | 800 Potter St | 94710, 1 | null | 94703-1234) =='
select public.save_organization_places('bbbbbbbb-0e0e-0000-0000-000000000001', '[
  {"id": "cccccccc-0e0e-0000-0000-000000000001", "label": null, "address": "800 Potter St",
   "city": "Berkeley", "state": "CA", "postal_code": " 94710 "},
  {"label": "Pool", "address": null, "city": "Oakland", "state": "CA", "postal_code": "94703-1234"}
]'::jsonb);
select position, coalesce(address, 'null') as address, postal_code
  from public.organization_places
 where organization_id = 'bbbbbbbb-0e0e-0000-0000-000000000001' order by position;

\echo ''
\echo '== 2. a ZIP alone asks for no new pin (expect 37.85 | t, then 0 queued) =='
reset role;
select latitude, geocoded_location = public.geocode_key(address, city, state) as same_key
  from public.organization_places where id = 'cccccccc-0e0e-0000-0000-000000000001';
select count(*) as queued from private.geocode_queue
 where target_id = 'cccccccc-0e0e-0000-0000-000000000001';
set local role authenticated;

\echo ''
\echo '== 3. saved by id without the key (an older app): the ZIP stays; empty clears it (expect 94710 | null) =='
select public.save_organization_places('bbbbbbbb-0e0e-0000-0000-000000000001', jsonb_build_array(
  jsonb_build_object('id', 'cccccccc-0e0e-0000-0000-000000000001', 'label', null,
                     'address', '800 Potter St', 'city', 'Berkeley', 'state', 'CA'),
  jsonb_build_object('label', 'Pool', 'address', null, 'city', 'Oakland', 'state', 'CA', 'postal_code', '')));
select position, coalesce(postal_code, 'null') as postal_code
  from public.organization_places
 where organization_id = 'bbbbbbbb-0e0e-0000-0000-000000000001' order by position;

\echo ''
\echo '== 4. not on another organization''s place (expect ERROR: You cannot change this organization.; then null) =='
savepoint other_org;
select public.save_organization_places('bbbbbbbb-0e0e-0000-0000-000000000002', jsonb_build_array(
  jsonb_build_object('id', 'cccccccc-0e0e-0000-0000-000000000002',
                     'city', 'Oakland', 'state', 'CA', 'postal_code', '94612')));
rollback to savepoint other_org;
select coalesce(postal_code, 'null') as postal_code from public.organization_places
 where id = 'cccccccc-0e0e-0000-0000-000000000002';

\echo ''
\echo '== 5. bad ZIPs are refused (expect four ERRORs: A ZIP code is five digits, or five, a dash and four.) =='
savepoint four;
select public.save_organization_places('bbbbbbbb-0e0e-0000-0000-000000000001',
  '[{"city": "Berkeley", "state": "CA", "postal_code": "9471"}]');
rollback to savepoint four;
savepoint nine;
select public.save_organization_places('bbbbbbbb-0e0e-0000-0000-000000000001',
  '[{"city": "Berkeley", "state": "CA", "postal_code": "947101234"}]');
rollback to savepoint nine;
savepoint letters;
select public.save_organization_places('bbbbbbbb-0e0e-0000-0000-000000000001',
  '[{"city": "Berkeley", "state": "CA", "postal_code": "ABCDE"}]');
rollback to savepoint letters;
savepoint short_four;
select public.save_organization_places('bbbbbbbb-0e0e-0000-0000-000000000001',
  '[{"city": "Berkeley", "state": "CA", "postal_code": "94710-12"}]');
rollback to savepoint short_four;

\echo ''
\echo '== 6. nobody writes the table directly (expect ERROR: permission denied for table organization_places) =='
savepoint direct;
update public.organization_places set postal_code = '94612'
 where id = 'cccccccc-0e0e-0000-0000-000000000002';
rollback to savepoint direct;

\echo ''
\echo '== 7. the table refuses a bad ZIP even from the owner (expect ERROR: ... violates check constraint "organization_places_postal_code_check") =='
reset role;
savepoint table_check;
update public.organization_places set postal_code = '1234'
 where id = 'cccccccc-0e0e-0000-0000-000000000002';
rollback to savepoint table_check;

\echo ''
\echo '== 8. a member reads it beside the address (expect 800 Potter St | Berkeley | CA | 94710) =='
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-0e0e-0000-0000-000000000002","role":"authenticated"}', true) is not null as ok;
select address, city, state, postal_code from public.organization_places
 where id = 'cccccccc-0e0e-0000-0000-000000000001';

\echo ''
\echo '== 9. and cannot save one (expect ERROR: You cannot change this organization.) =='
savepoint member_save;
select public.save_organization_places('bbbbbbbb-0e0e-0000-0000-000000000001', jsonb_build_array(
  jsonb_build_object('id', 'cccccccc-0e0e-0000-0000-000000000001',
                     'city', 'Berkeley', 'state', 'CA', 'postal_code', '94702')));
rollback to savepoint member_save;

\echo ''
\echo '== 10. signed out: the column is granted, no row is seen (expect 0) =='
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true) is not null as ok;
select count(postal_code) as zips from public.organization_places;
reset role;

rollback;
