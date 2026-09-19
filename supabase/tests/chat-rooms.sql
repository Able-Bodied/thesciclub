-- ============================================================================
-- chat_rooms: a closed room does not exist. Run as a member, under RLS.
-- ============================================================================
-- The owner's decision is that rooms open one at a time, and the whole of that
-- decision is one `or` in one select policy. If it is wrong, every member sees
-- twelve empty rooms on the day Chat ships — which is precisely the failure
-- CONTEXT.md keeps Home a placeholder to avoid.
--
--   docker run --rm -i --network host -e PGPASSWORD=postgres postgres:17-alpine \
--     psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
--     -f - < supabase/tests/chat-rooms.sql
--
-- It rolls back and is safe to re-run. Do not point it at the hosted project.
--
-- Steps 2 and 3 are the pair that matters: the same table, the same moment, an
-- ordinary member and an administrator, and twelve rows of difference. Step 0
-- prints current_user because as the superuser every step below turns green
-- while proving nothing — `postgres` is BYPASSRLS.
--
-- Steps 5 to 7 are the refusals, each in its own savepoint. Without one the
-- first error aborts the transaction and everything after it prints "current
-- transaction is aborted", which in a long log reads like a pass.
-- ============================================================================

\set ON_ERROR_STOP off
\set QUIET on
\pset pager off

begin;

-- ------------------------------------------------------------------- set-up
-- Written as the superuser, before the role switch. These rows are the
-- situation, not the thing under test.
insert into public.members
  (id, type, status, display_name, phone, birth_date, level_range, state, show_in_browse, is_admin)
values
  ('aaaaaaaa-2222-0000-0000-000000000001', 'peer',   'active',    'Member M',    '19990002001', '1980-01-01', 'T1–T6',  'CA', true, false),
  ('bbbbbbbb-2222-0000-0000-000000000002', 'mentor', 'active',    'Admin A',     '19990002002', '1981-01-01', 'C5–C8',  'CA', true, true),
  ('cccccccc-2222-0000-0000-000000000003', 'peer',   'suspended', 'Suspended S', '19990002003', '1982-01-01', 'T7–T12', 'CA', true, false);

\set QUIET off
\echo ''
\echo '== 0. we are a signed-in ordinary member, not the superuser =='
\echo '   expect: authenticated | aaaaaaaa-2222-0000-0000-000000000001 | t | f'
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-2222-0000-0000-000000000001","role":"authenticated"}';
select current_user, auth.uid()::text as uid,
       public.is_member() as a_member, public.is_admin() as admin;

\echo ''
\echo '== 1. the seed is twelve rooms and every one of them is shut =='
\echo '   expect: 12 | 0. Read as the superuser because a member cannot see'
\echo '   them to count them, which is the next step.'
savepoint count_them;
set local role postgres;
select count(*) as rooms, count(opened_at) as open_rooms from public.chat_rooms;
rollback to savepoint count_them;

\echo ''
\echo '== 2. a member sees no room at all =='
\echo '   THE STEP THAT MATTERS. expect: 0 rows.'
select id, name from public.chat_rooms order by sort_order;

\echo ''
\echo '== 3. an administrator sees all twelve, closed ones included =='
\echo '   expect: 12, and Body/Life/Kit in that order with 5/5/2 in them —'
\echo '   ordering the categories by their lowest sort_order is what the'
\echo '   client does, so it is what is checked here.'
savepoint as_admin;
set local role postgres;
set local request.jwt.claims = '{"sub":"bbbbbbbb-2222-0000-0000-000000000002","role":"authenticated"}';
set local role authenticated;
select current_user, public.is_admin() as admin, count(*) as rooms from public.chat_rooms;
select category, count(*) as rooms, min(sort_order) as first
  from public.chat_rooms group by category order by min(sort_order);
rollback to savepoint as_admin;

\echo ''
\echo '== 4. an administrator opens one, and the member sees exactly that one =='
\echo '   expect: a timestamp, then one row: bowel | Bowel management.'
set local role postgres;
set local request.jwt.claims = '{"sub":"bbbbbbbb-2222-0000-0000-000000000002","role":"authenticated"}';
set local role authenticated;
select public.admin_set_room_open('bowel', true) as opened_at;

set local role postgres;
set local request.jwt.claims = '{"sub":"aaaaaaaa-2222-0000-0000-000000000001","role":"authenticated"}';
set local role authenticated;
select id, name from public.chat_rooms order by sort_order;

\echo ''
\echo '== 4b. opening it twice keeps the date it first opened =='
\echo '   expect: t. A double tap on the switch is not a rewrite of history.'
savepoint twice;
set local role postgres;
set local request.jwt.claims = '{"sub":"bbbbbbbb-2222-0000-0000-000000000002","role":"authenticated"}';
set local role authenticated;
select public.admin_set_room_open('bowel', true)
         = (select opened_at from public.chat_rooms where id = 'bowel') as unchanged;
rollback to savepoint twice;

\echo ''
\echo '== 5. an ordinary member cannot open a room =='
\echo '   expect: ERROR, Only an administrator can open or close a room.'
savepoint member_opens;
select public.admin_set_room_open('bladder', true);
rollback to savepoint member_opens;

\echo ''
\echo '== 5b. nor close the one that is open =='
\echo '   expect: ERROR, the same sentence — and then bowel still open.'
savepoint member_closes;
select public.admin_set_room_open('bowel', false);
rollback to savepoint member_closes;
select id from public.chat_rooms;

\echo ''
\echo '== 6. a member cannot reach the table around the function =='
\echo '   expect: three "permission denied" errors, not three zero-row'
\echo '   no-ops. This step is why the migration revokes from `authenticated`'
\echo '   as well as anon and public: Supabase grants every privilege on a new'
\echo '   table by default, so before that revoke the update and the delete'
\echo '   here reported UPDATE 0 and DELETE 0 and looked like passes.'
savepoint no_insert;
insert into public.chat_rooms (id, name, description, category, icon, sort_order)
values ('mine', 'My room', 'x', 'Life', '◇', 99);
rollback to savepoint no_insert;

savepoint no_update;
update public.chat_rooms set opened_at = now() where id = 'bladder';
rollback to savepoint no_update;

savepoint no_delete;
delete from public.chat_rooms where id = 'bowel';
rollback to savepoint no_delete;

\echo ''
\echo '== 7. a session that was never invited sees nothing and may open nothing =='
\echo '   expect: f | 0, then ERROR. Somebody who got through phone'
\echo '   verification and no further has no members row.'
savepoint uninvited;
set local role postgres;
set local request.jwt.claims = '{"sub":"ffffffff-2222-0000-0000-00000000000f","role":"authenticated"}';
set local role authenticated;
select public.is_member() as a_member, count(*) as rooms_visible from public.chat_rooms;
select public.admin_set_room_open('bowel', false);
rollback to savepoint uninvited;

\echo ''
\echo '== 8. a signed-out visitor is refused outright =='
\echo '   expect: ERROR, permission denied for table chat_rooms'
savepoint anon;
set local role postgres;
set local request.jwt.claims = '';
set local role anon;
select count(*) from public.chat_rooms;
rollback to savepoint anon;

\echo ''
\echo '== 9. a suspended member reads the open room like anybody else =='
\echo '   expect: t | f | 1. Reading is not what suspension takes away.'
savepoint suspended;
set local role postgres;
set local request.jwt.claims = '{"sub":"cccccccc-2222-0000-0000-000000000003","role":"authenticated"}';
set local role authenticated;
select public.is_member() as a_member, public.is_active_member() as active,
       count(*) as rooms_visible from public.chat_rooms;
rollback to savepoint suspended;

set local role postgres;
rollback;
