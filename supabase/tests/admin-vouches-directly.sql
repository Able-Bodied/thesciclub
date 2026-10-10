-- ============================================================================
-- An administrator inviting in their own name
-- ============================================================================
-- Run as a signed-in administrator, because every rule here lives inside a
-- SECURITY DEFINER function that checks is_admin() and reads auth.uid().
--
--   docker run --rm -i --network host -e PGPASSWORD=postgres postgres:17-alpine \
--     psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
--     -f - < supabase/tests/admin-vouches-directly.sql
--
-- Rolls back. Reads verification through `admin_invites`, never through
-- `public.invites`: an administrator has no select policy on that table, so
-- querying it here would return nothing whatever the function did. Three
-- probes in this directory have been caught by that.
-- ============================================================================

\set ON_ERROR_STOP off
\pset pager off

begin;

-- The seeded directory was removed (20261010020000), so the seeded profile
-- this exercises is made here, inside the transaction, with what the steps
-- below expect of it. Made-up details; not a real person's.
insert into public.members (id, is_seed, type, display_name, phone, birth_date, level_range,
                            exact_level, completeness, city, state, photo_path, bio,
                            interests, topics, self_care, affiliations, languages)
select 'aaaaaaaa-5eed-0000-0000-00000000a1a1', true, 'peer', 'Ajay', '15555550999', '1990-01-01',
       'C5–C8', 'C7', 'Incomplete', 'San Jose', 'CA',
       'seed/c85c10bf-0226-394f-8c91-2a2ffc40a147.webp', 'A made-up profile for this probe.',
       array['Adaptive sport', 'Travel', 'Cooking'],
       array['Bowel', 'Bladder', 'Skin', 'Pain', 'Work'],
       array['Stretching', 'Standing frame'],
       array['NorCal SCI'],
       array['English']
 where not exists (select 1 from public.members where display_name = 'Ajay' and is_seed);

insert into public.members (id, type, status, display_name, phone, birth_date, level_range, state, is_admin)
values ('aaaaaaaa-2222-2222-2222-222222222222', 'peer', 'active', 'Club Admin',
        '19990000030', '1980-01-01', 'T1–T6', 'CA', true),
       ('bbbbbbbb-2222-2222-2222-222222222222', 'peer', 'active', 'Ordinary',
        '19990000031', '1980-01-01', 'T1–T6', 'CA', false);

-- Every id the steps below need, captured now. As the authenticated
-- administrator these subqueries return nothing — members is own-row-only and
-- organizations is readable, but an inline `select ... from members` for Ajay
-- silently yields null and turns an expected refusal into a pass. An earlier
-- draft of this file did exactly that and reported steps 4 and 5 green.
select id as ncs_id from public.organizations where short_code = 'NCS' \gset
select id as no_invite_id from public.organizations where not can_invite limit 1 \gset
select id as ajay_id from public.members where display_name = 'Ajay' and is_seed \gset

select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-2222-2222-2222-222222222222","role":"authenticated"}', true) is not null as ok;
set local role authenticated;

\echo ''
\echo '== 1. an invite with no organization is attributed to the admin =='
\echo '   expect: invited_by_organization empty, invited_by_member Club Admin, is_admin t'
select public.admin_create_invite('4085552100', null, null, 'Met at an event') as id;
select invited_by_organization, invited_by_member, invited_by_member_is_admin
  from public.admin_invites where phone = '14085552100';

\echo ''
\echo '== 2. naming an organization still works and is attributed to it =='
\echo '   expect: NorCal SCI | empty | empty'
select public.admin_create_invite('4085552200', :'ncs_id', null, null) as id;
select invited_by_organization, invited_by_member, invited_by_member_is_admin
  from public.admin_invites where phone = '14085552200';

\echo ''
\echo '== 3. exactly one inviter is recorded, never two =='
\echo '   expect: 1 | 1 — one row with only an org, one with only a member'
select count(*) filter (where invited_by_organization is not null and invited_by_member is null) as org_only,
       count(*) filter (where invited_by_member is not null and invited_by_organization is null) as member_only
  from public.admin_invites where phone in ('14085552100', '14085552200');

\echo ''
\echo '== 4. an administrator vouching alone may still attach a claim =='
\echo '   expect: Ajay named as claimable, vouched for by the admin'
\echo '   The rule against this was borrowed from a policy about mentors —'
\echo '   who cannot call this function at all, and whose own insert policy'
\echo '   still forbids them a claim. See 20260913080000.'
select public.admin_create_invite('4085552300', null, :'ajay_id', null) as id;
select claimable_name, invited_by_member, invited_by_member_is_admin
  from public.admin_invites where phone = '14085552300';

\echo ''
\echo '== 4b. but a claim on somebody real is still refused =='
\echo '   expect: ERROR:  That profile is not one of the seeded directory entries'
savepoint claim_real_member;
select public.admin_create_invite('4085552350', null,
  'bbbbbbbb-2222-2222-2222-222222222222', null);
rollback to savepoint claim_real_member;

\echo ''
\echo '== 5. a claim with an organization is still accepted =='
\echo '   expect: Ajay named as claimable'
select public.admin_create_invite('4085552400', :'ncs_id', :'ajay_id', null) as id;
select claimable_name from public.admin_invites where phone = '14085552400';

\echo ''
\echo '== 6. an organization that cannot invite is still refused =='
\echo '   expect: ERROR:  That organization cannot issue invites'
savepoint bad_org;
select public.admin_create_invite('4085552500', :'no_invite_id', null, null);
rollback to savepoint bad_org;

\echo ''
\echo '== 7. an ordinary member cannot call it at all =='
\echo '   expect: ERROR:  Not an administrator'
savepoint not_admin;
select set_config('request.jwt.claims',
  '{"sub":"bbbbbbbb-2222-2222-2222-222222222222","role":"authenticated"}', true) is not null as ok;
select public.admin_create_invite('4085552600', null, null, null);
rollback to savepoint not_admin;

set local role postgres;
rollback;
