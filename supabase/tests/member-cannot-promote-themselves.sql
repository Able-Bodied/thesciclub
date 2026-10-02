-- ============================================================================
-- Can a member make themselves an administrator, a mentor, or active again?
-- ============================================================================
-- 20261003090000. Before it, every one of the refusals below succeeded with a
-- member's own session: joining as an administrator, a suspended member
-- reinstating themselves, a peer making themselves a mentor, a changed phone,
-- an administrator deleting their own row. And every allowance below has to
-- keep working, or the guard has broken a screen: Your details, the survey,
-- joining, and the administrators' own doors.
--
-- Run as the signed-in member in each section, not as the superuser: postgres
-- is BYPASSRLS and is not `authenticated`, which is exactly the writer the
-- guard lets through. Every expected refusal has its own savepoint.
--
--   docker run --rm -i --network host -e PGPASSWORD=postgres postgres:17-alpine \
--     psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
--     -f - < supabase/tests/member-cannot-promote-themselves.sql
--
-- Rolls back. Do not point it at the hosted project.
-- ============================================================================

\set ON_ERROR_STOP off
\pset pager off

begin;

-- ------------------------------------------------------------------- set-up
insert into public.members (id, type, status, display_name, phone, birth_date, level_range, state, is_admin)
values
  ('aaaaaaaa-9090-0000-0000-00000000000a', 'mentor', 'active',    'Admin',     '19990000090', '1980-01-01', 'T1–T6', 'CA', true),
  ('bbbbbbbb-9090-0000-0000-00000000000b', 'peer',   'active',    'Peer',      '19990000091', '1981-01-01', 'C5–C8', 'CA', false),
  ('cccccccc-9090-0000-0000-00000000000c', 'peer',   'suspended', 'Suspended', '19990000092', '1982-01-01', 'C5–C8', 'CA', false);

-- An invite for somebody about to join, and somebody else's, whose id the
-- joiner tries to claim in step 11. Read here, as the superuser: a member
-- cannot read invites, so selecting it in the step itself inserted nothing
-- and passed without testing anything (the first run of this file).
insert into public.invites (phone_raw, invited_by_organization_id, note)
select '19990000093', id, 'probe' from public.organizations where short_code = 'NCS';
insert into public.invites (phone_raw, invited_by_organization_id, note)
select '19990000094', id, 'probe, not theirs' from public.organizations where short_code = 'NCS';
select id as other_invite from public.invites where phone = '19990000094' \gset

-- ============================================================ as the peer
select set_config('request.jwt.claims',
  '{"sub":"bbbbbbbb-9090-0000-0000-00000000000b","role":"authenticated"}', true) is not null as ok;
set local role authenticated;

\echo ''
\echo '== 0. a signed-in member (expect authenticated | f) =='
select current_user, public.is_admin() as admin;

\echo ''
\echo '== 1. Your details still saves (expect UPDATE 1) =='
update public.members set display_name = 'Peer renamed', city = 'Fresno' where id = 'bbbbbbbb-9090-0000-0000-00000000000b';

\echo ''
\echo '== 2. the survey still saves, wanting to mentor included (expect UPDATE 1) =='
update public.members set wants_to_mentor = true, bio = 'hello' where id = 'bbbbbbbb-9090-0000-0000-00000000000b';

\echo ''
\echo '== 3. making yourself a mentor is refused =='
\echo '   expect: ERROR, becoming a mentor is decided by an administrator'
savepoint self_mentor;
update public.members set type = 'mentor' where id = 'bbbbbbbb-9090-0000-0000-00000000000b';
rollback to savepoint self_mentor;

\echo ''
\echo '== 4. changing your own phone is refused =='
\echo '   expect: ERROR, your phone number is your account'
savepoint self_phone;
update public.members set phone = '19990000097' where id = 'bbbbbbbb-9090-0000-0000-00000000000b';
rollback to savepoint self_phone;

\echo ''
\echo '== 5. marking yourself a seeded profile is refused (expect ERROR, a record of how you joined) =='
savepoint self_seed;
update public.members set is_seed = true where id = 'bbbbbbbb-9090-0000-0000-00000000000b';
rollback to savepoint self_seed;

\echo ''
\echo '== 6. making yourself an administrator is still refused (expect ERROR) =='
savepoint self_admin;
update public.members set is_admin = true where id = 'bbbbbbbb-9090-0000-0000-00000000000b';
rollback to savepoint self_admin;

\echo ''
\echo '== 7. deleting your own row through the table does nothing (expect DELETE 0) =='
delete from public.members where id = 'bbbbbbbb-9090-0000-0000-00000000000b';

reset role;

-- ======================================================= as the suspended
select set_config('request.jwt.claims',
  '{"sub":"cccccccc-9090-0000-0000-00000000000c","role":"authenticated"}', true) is not null as ok;
set local role authenticated;

\echo ''
\echo '== 8. a suspended member cannot reinstate themselves =='
\echo '   expect: ERROR, membership status is changed by an administrator'
savepoint self_reinstate;
update public.members set status = 'active' where id = 'cccccccc-9090-0000-0000-00000000000c';
rollback to savepoint self_reinstate;

reset role;

-- ========================================================== as the joiner
select set_config('request.jwt.claims',
  '{"sub":"dddddddd-9090-0000-0000-00000000000d","role":"authenticated","phone":"19990000093"}', true) is not null as ok;
set local role authenticated;

\echo ''
\echo '== 9. joining as an administrator is refused =='
\echo '   expect: ERROR, a new member joins as an active peer'
\echo '   This is the one that was open: the flag trigger only watched updates.'
savepoint join_admin;
insert into public.members (id, display_name, phone, birth_date, level_range, state, is_admin)
values ('dddddddd-9090-0000-0000-00000000000d', 'Joiner', '19990000093', '1985-01-01', 'T1–T6', 'CA', true);
rollback to savepoint join_admin;

\echo ''
\echo '== 10. joining as a mentor is refused (expect ERROR, a new member joins as an active peer) =='
savepoint join_mentor;
insert into public.members (id, display_name, phone, birth_date, level_range, state, type)
values ('dddddddd-9090-0000-0000-00000000000d', 'Joiner', '19990000093', '1985-01-01', 'T1–T6', 'CA', 'mentor');
rollback to savepoint join_mentor;

\echo ''
\echo '== 11. joining on somebody else''s invite id is refused (expect ERROR, a new member joins as an active peer) =='
savepoint join_invite;
insert into public.members (id, display_name, phone, birth_date, level_range, state, invite_id)
values ('dddddddd-9090-0000-0000-00000000000d', 'Joiner', '19990000093', '1985-01-01', 'T1–T6', 'CA', :'other_invite');
rollback to savepoint join_invite;

\echo ''
\echo '== 12. joining as the app does still works (expect INSERT 0 1) =='
insert into public.members (id, display_name, phone, birth_date, level_range, state)
values ('dddddddd-9090-0000-0000-00000000000d', 'Joiner', '19990000093', '1985-01-01', 'T1–T6', 'CA');

reset role;

\echo ''
\echo '== 13. and they are an active peer on the invite they were given (expect peer | active | f | t) =='
select type, status, is_admin, invite_id is not null as has_invite
  from public.members where id = 'dddddddd-9090-0000-0000-00000000000d';

-- ========================================================== as the admin
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-9090-0000-0000-00000000000a","role":"authenticated"}', true) is not null as ok;
set local role authenticated;

\echo ''
\echo '== 14. an administrator can still make the peer a mentor (expect no error) =='
select public.admin_set_member_type('bbbbbbbb-9090-0000-0000-00000000000b', 'mentor');

\echo ''
\echo '== 15. and reinstate the suspended member (expect no error) =='
select public.admin_set_member_status('cccccccc-9090-0000-0000-00000000000c', 'active');

\echo ''
\echo '== 16. but cannot suspend themselves through the table =='
\echo '   expect: ERROR, membership status is changed by an administrator'
savepoint admin_self_suspend;
update public.members set status = 'suspended' where id = 'aaaaaaaa-9090-0000-0000-00000000000a';
rollback to savepoint admin_self_suspend;

\echo ''
\echo '== 17. nor delete their own row through the table (expect DELETE 0) =='
delete from public.members where id = 'aaaaaaaa-9090-0000-0000-00000000000a';

reset role;

\echo ''
\echo '== 18. where everyone ended up (expect Admin mentor active t; Peer mentor active f;'
\echo '   Suspended peer active f; Joiner peer active f; Peer renamed, Fresno, wants to mentor) =='
select display_name, type, status, is_admin, city, wants_to_mentor
  from public.members where id::text like '%-9090-%' order by display_name;

rollback;
