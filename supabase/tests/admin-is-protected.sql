-- ============================================================================
-- Can one administrator end another administrator's membership?
-- ============================================================================
-- Three functions can end a membership, and each has to refuse an
-- administrator on its own — there is no shared gate they all pass through.
-- Two of them already did; admin_set_member_status did not look at the target
-- at all, which left "pause the other admin" as a way to take the club.
--
-- Every expected failure sits inside its own savepoint. Without one the first
-- refusal aborts the transaction and every step after it reports "current
-- transaction is aborted" — which reads like a row of passing checks in a log
-- nobody scrolls, while proving nothing. The first run of this file did exactly
-- that: step 2 was real and steps 3 to 8 were noise.
--
-- Run as a real signed-in administrator, not as the superuser: these are
-- security definer functions whose own is_admin() check is half of what is
-- being tested, and postgres is BYPASSRLS.
--
--   docker run --rm -i --network host -e PGPASSWORD=postgres postgres:17-alpine \
--     psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
--     -f - < supabase/tests/admin-is-protected.sql
--
-- Rolls back. Do not point it at the hosted project.
-- ============================================================================

\set ON_ERROR_STOP off
\pset pager off

begin;

insert into public.members (id, type, status, display_name, phone, birth_date, level_range, state, is_admin)
values
  ('aaaaaaaa-1111-0000-0000-00000000000a', 'peer', 'active', 'The Admin', '19990000020', '1980-01-01', 'T1–T6', 'CA', true),
  ('eeeeeeee-1111-0000-0000-00000000000e', 'peer', 'active', 'Co-admin',  '19990000021', '1981-01-01', 'C5–C8', 'CA', true),
  ('cccccccc-1111-0000-0000-00000000000c', 'peer', 'active', 'Ordinary',  '19990000022', '1982-01-01', 'C5–C8', 'CA', false);

select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-1111-0000-0000-00000000000a","role":"authenticated"}', true) is not null as ok;
set local role authenticated;

\echo ''
\echo '== 0. we are a signed-in administrator (expect authenticated | t) =='
select current_user, public.is_admin() as admin;

\echo ''
\echo '== 1. pausing an ordinary member still works (expect no error) =='
select public.admin_set_member_status('cccccccc-1111-0000-0000-00000000000c', 'suspended');
select status from public.admin_members where id = 'cccccccc-1111-0000-0000-00000000000c';

\echo ''
\echo '== 2. pausing the OTHER administrator is refused =='
\echo '   expect: ERROR, an administrator''s membership cannot be changed'
\echo '   This is the one that was open. A suspended admin fails is_admin(),'
\echo '   which reads status = active — so this was a way to take the club.'
savepoint pause_admin;
select public.admin_set_member_status('eeeeeeee-1111-0000-0000-00000000000e', 'suspended');
rollback to savepoint pause_admin;

\echo ''
\echo '== 3. and so is removing them by status (expect ERROR) =='
savepoint remove_admin;
select public.admin_set_member_status('eeeeeeee-1111-0000-0000-00000000000e', 'removed');
rollback to savepoint remove_admin;

\echo ''
\echo '== 4. the other administrator is untouched (expect active) =='
select status from public.admin_members where id = 'eeeeeeee-1111-0000-0000-00000000000e';

\echo ''
\echo '== 5. deleting them is refused, as it already was (expect ERROR) =='
savepoint delete_admin;
select public.admin_delete_member('eeeeeeee-1111-0000-0000-00000000000e');
rollback to savepoint delete_admin;

\echo ''
\echo '== 6. blocking their number is refused, as it already was (expect ERROR) =='
savepoint block_admin;
select public.admin_block_number('19990000021', 'trying it on');
rollback to savepoint block_admin;

\echo ''
\echo '== 7. changing your OWN status still says so in its own words =='
\echo '   expect: ERROR about your own membership, not about administrators'
savepoint pause_self;
select public.admin_set_member_status('aaaaaaaa-1111-0000-0000-00000000000a', 'suspended');
rollback to savepoint pause_self;

\echo ''
\echo '== 8. nothing stuck: both administrators are still active (expect 2) =='
select count(*) as admins_active from public.admin_members where is_admin and status = 'active';

\echo ''
\echo '== 9. an administrator is a mentor, whatever the insert said (expect 2) =='
\echo '   Both were inserted as peers at the top of this file.'
select count(*) as admins_who_are_mentors
  from public.admin_members where is_admin and type = 'mentor';

\echo ''
\echo '== 10. and cannot be made a peer (expect ERROR) =='
savepoint demote_admin;
select public.admin_set_member_type('eeeeeeee-1111-0000-0000-00000000000e', 'peer');
rollback to savepoint demote_admin;

\echo ''
\echo '== 11. an ordinary member can still be made a mentor (expect mentor) =='
select public.admin_set_member_type('cccccccc-1111-0000-0000-00000000000c', 'mentor');
select type from public.admin_members where id = 'cccccccc-1111-0000-0000-00000000000c';

rollback;
