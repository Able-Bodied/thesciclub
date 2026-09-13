-- ============================================================================
-- Does a ban actually keep somebody out?
-- ============================================================================
-- The blocklist is enforced in three places and any one of them being wrong
-- leaves a way back in, so this runs all three as a real signed-in
-- administrator rather than as the superuser. Same shape as
-- mentor-invites.sql: `set local role authenticated` with request.jwt.claims,
-- so the policies and the definer functions' own is_admin() checks are what
-- answer.
--
--   docker run --rm -i --network host -e PGPASSWORD=postgres postgres:17-alpine \
--     psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
--     -f - < supabase/tests/blocked-numbers.sql
--
-- Rolls back. Do not point it at the hosted project.
-- ============================================================================

\set ON_ERROR_STOP off
\pset pager off

begin;

insert into public.members (id, type, status, display_name, phone, birth_date, level_range, state, is_admin)
values
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'peer',   'active', 'The Admin', '19990000010', '1980-01-01', 'T1–T6', 'CA', true),
  ('bbbbbbbb-0000-0000-0000-00000000000b', 'mentor', 'active', 'A Mentor',  '19990000011', '1981-01-01', 'T1–T6', 'CA', false),
  ('cccccccc-0000-0000-0000-00000000000c', 'peer',   'active', 'Nuisance',  '14085550150', '1982-01-01', 'C5–C8', 'CA', false),
  ('dddddddd-0000-0000-0000-00000000000d', 'peer',   'active', 'Bystander', '19990000013', '1983-01-01', 'C5–C8', 'CA', false),
  ('eeeeeeee-0000-0000-0000-00000000000e', 'peer',   'active', 'Co-admin',  '19990000012', '1984-01-01', 'C5–C8', 'CA', true);

-- The nuisance is here on an organization's invite, already used.
insert into public.invites (phone_raw, invited_by_organization_id, status, consumed_at)
select '14085550150', id, 'consumed', now() from public.organizations where short_code = 'NCS';
update public.members set invite_id = (select id from public.invites where phone = '14085550150')
 where id = 'cccccccc-0000-0000-0000-00000000000c';
-- And they had issued nothing; the mentor has a standing invite of their own.
insert into public.invites (phone_raw, invited_by_member_id)
values ('4085550151', 'bbbbbbbb-0000-0000-0000-00000000000b');

select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-0000-0000-0000-00000000000a","role":"authenticated"}', true) is not null as ok;
set local role authenticated;

\echo ''
\echo '== 0. we are a signed-in administrator (expect authenticated | t) =='
select current_user, public.is_admin() as admin;

\echo ''
\echo '== 1. before the ban, the number is admissible (expect t) =='
select public.has_active_invite('4085550150') as can_join;

\echo ''
\echo '== 2. ban it (expect no error) =='
select public.admin_block_number('(408) 555-0150', 'Harassing members');

\echo ''
\echo '== 3. the member is gone, and their invite is revoked =='
\echo '   expect: 0 members, and status revoked'
\echo ''
\echo '   Read through the admin views, NOT through public.members and'
\echo '   public.invites. An administrator has no select policy on either —'
\echo '   own row only on members, mentors-only on invites — so querying the'
\echo '   tables here returns zero rows whatever the ban did, and the'
\echo '   assertion passes without testing anything. This file made that'
\echo '   mistake before it made this comment.'
select count(*) as members_on_that_number from public.admin_members where phone = '14085550150';
select status from public.admin_invites where phone = '14085550150';

\echo ''
\echo '== 4. the gate refuses them (expect f) =='
\echo '   This is the one that matters: the members insert policy calls it.'
select public.has_active_invite('4085550150') as can_join;

\echo ''
\echo '== 5. an administrator cannot re-add them by accident =='
\echo '   expect: ERROR ... blocked from the club'
savepoint readd;
select public.admin_create_invite('4085550150',
  (select id from public.organizations where short_code = 'NCS'), null, 'Met at rugby');
rollback to savepoint readd;

\echo ''
\echo '== 6. nor can a mentor, writing through their own policy =='
\echo '   expect: ERROR ... blocked from the club'
savepoint mentor_readd;
select set_config('request.jwt.claims',
  '{"sub":"bbbbbbbb-0000-0000-0000-00000000000b","role":"authenticated"}', true) is not null as ok;
insert into public.invites (phone_raw, invited_by_member_id)
values ('4085550150', 'bbbbbbbb-0000-0000-0000-00000000000b');
rollback to savepoint mentor_readd;

\echo ''
\echo '== 7. an ordinary member cannot ban anybody =='
\echo '   expect: ERROR:  Not an administrator'
savepoint not_admin;
select set_config('request.jwt.claims',
  '{"sub":"dddddddd-0000-0000-0000-00000000000d","role":"authenticated"}', true) is not null as ok;
select public.admin_block_number('4085550199', 'because I said so');
rollback to savepoint not_admin;

\echo ''
\echo '== 8. you cannot ban your own number =='
\echo '   expect: ERROR:  You cannot block your own number'
savepoint ban_self;
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-0000-0000-0000-00000000000a","role":"authenticated"}', true) is not null as ok;
select public.admin_block_number('19990000010');
rollback to savepoint ban_self;

\echo ''
\echo '== 8b. nor another administrator’s =='
\echo '   Separately, because banning your own number trips the first guard'
\echo '   and the second would never run — an earlier draft of this file'
\echo '   claimed both from one statement and proved one.'
\echo '   expect: ERROR:  An administrator cannot be blocked'
savepoint ban_other_admin;
select public.admin_block_number('19990000012');
rollback to savepoint ban_other_admin;

\echo ''
\echo '== 9. a number nobody was ever on can be banned (expect no error) =='
select public.admin_block_number('4085559000', 'Never invited, still unwelcome');

\echo ''
\echo '== 10. unblocking puts the number back where it started =='
\echo '   expect: no error, then INSERT 0 1 — invitable again, not readmitted'
select public.admin_unblock_number('4085550150');
select public.admin_create_invite('4085550150',
  (select id from public.organizations where short_code = 'NCS'), null, 'Second chance');

\echo ''
\echo '== 11. the membership does NOT come back with the number (expect 0) =='
select count(*) as members_on_that_number from public.admin_members where phone = '14085550150';

\echo ''
\echo '== 12. unblocking a number that is not blocked says so =='
\echo '   expect: ERROR:  That number is not blocked'
savepoint not_blocked;
select public.admin_unblock_number('4085557777');
rollback to savepoint not_blocked;

\echo ''
\echo '== 13. the blocked list reads back for an administrator (expect 1 row) =='
select phone, reason, blocked_by from public.admin_blocked_numbers order by phone;

\echo ''
\echo '== 14. and not for anybody else (expect 0 rows) =='
select set_config('request.jwt.claims',
  '{"sub":"dddddddd-0000-0000-0000-00000000000d","role":"authenticated"}', true) is not null as ok;
select count(*) as rows_a_member_can_see from public.admin_blocked_numbers;

set local role postgres;
rollback;
