-- ============================================================================
-- Can somebody part-way through onboarding see the profile they may claim?
-- ============================================================================
-- The answer used to be no, silently, and nothing caught it: onboarding read
-- `browse_members`, which requires the *viewer* to be an active member, and
-- the person signing up is not one yet. The view returned nothing, the client
-- treated that as "no claim to offer", and the seeded profile was retired in
-- exchange for a prompt nobody saw.
--
-- So step 1 below asserts the broken behaviour on purpose. If it ever starts
-- returning a row, `browse_members` has been loosened and that is a bigger
-- problem than this file.
--
--   docker run --rm -i --network host -e PGPASSWORD=postgres postgres:17-alpine \
--     psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
--     -f - < supabase/tests/claim-preview.sql
--
-- Rolls back. Do not point it at the hosted project.
-- ============================================================================

\set ON_ERROR_STOP off
\pset pager off

begin;

-- A real member, to prove the is_seed guard is doing something.
insert into public.members (id, type, status, display_name, phone, birth_date, level_range, state)
values ('99999999-0000-0000-0000-000000000009', 'peer', 'active', 'A Real Member',
        '14085557000', '1990-01-01', 'C5–C8', 'CA');

-- An organization invites 4085551000 and says the number belongs to Ajay.
insert into public.invites (phone_raw, invited_by_organization_id, seed_member_id)
select '4085551000', o.id, m.id
from public.organizations o, public.members m
where o.short_code = 'NCS' and m.display_name = 'Ajay' and m.is_seed;

-- And invites 4085552000 with no claim attached.
insert into public.invites (phone_raw, invited_by_organization_id)
select '4085552000', id from public.organizations where short_code = 'NCS';

-- An invite pointing at somebody real rather than a seeded row.
insert into public.invites (phone_raw, invited_by_organization_id, seed_member_id)
select '4085553000', id, '99999999-0000-0000-0000-000000000009'
from public.organizations where short_code = 'NCS';

-- Somebody who has verified 4085551000 and has no member row: exactly the
-- state onboarding is in when it asks.
select set_config('request.jwt.claims',
  '{"sub":"11111111-2222-3333-4444-555555555555","role":"authenticated","phone":"14085551000"}',
  true) is not null as ok;
set local role authenticated;

\echo ''
\echo '== 0. no member row, so not a member (expect 0) =='
select count(*) as own_member_rows from public.members where id = auth.uid();

\echo ''
\echo '== 1. the old lookup returns nothing — this is the bug (expect 0) =='
\echo '   browse_members requires the viewer to be an active member. Onboarding'
\echo '   asked it anyway and read the empty answer as "no claim".'
select count(*) as rows_from_browse_members
  from public.browse_members
 where id = (select seed_member_id from public.invites where phone = '14085551000');

\echo ''
\echo '== 2. the new one answers (expect 1 row: Ajay, San Jose) =='
select display_name, city, exact_level, affiliations from public.my_claimable_profile();

\echo ''
\echo '== 3. and gives away only the card, not the profile =='
\echo '   expect: 10 columns, and no bio, birth_date, phone or detail among them'
select pg_get_function_result('public.my_claimable_profile'::regproc) as returns;

\echo ''
\echo '== 4. somebody whose invite carries no claim sees nothing (expect 0) =='
select set_config('request.jwt.claims',
  '{"sub":"22222222-2222-3333-4444-555555555555","role":"authenticated","phone":"14085552000"}',
  true) is not null as ok;
select count(*) as rows_returned from public.my_claimable_profile();

\echo ''
\echo '== 5. an invite pointing at a real member yields nothing (expect 0) =='
\echo '   Without the is_seed guard this hands a member''s name and photograph'
\echo '   to whoever holds the number on a mistyped invite.'
select set_config('request.jwt.claims',
  '{"sub":"33333333-2222-3333-4444-555555555555","role":"authenticated","phone":"14085553000"}',
  true) is not null as ok;
select count(*) as rows_returned from public.my_claimable_profile();

\echo ''
\echo '== 6. a number on no invite at all sees nothing (expect 0) =='
select set_config('request.jwt.claims',
  '{"sub":"44444444-2222-3333-4444-555555555555","role":"authenticated","phone":"14085559999"}',
  true) is not null as ok;
select count(*) as rows_returned from public.my_claimable_profile();

\echo ''
\echo '== 7. a signed-out visitor cannot call it at all =='
\echo '   expect: ERROR:  permission denied for function my_claimable_profile'
savepoint anon_call;
set local role postgres;
select set_config('request.jwt.claims', '', true) is not null as ok;
set local role anon;
select * from public.my_claimable_profile();
rollback to savepoint anon_call;

set local role postgres;
rollback;
