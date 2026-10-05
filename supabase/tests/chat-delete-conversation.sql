-- ============================================================================
-- Who can delete a conversation, which ones, and what goes with it
-- ============================================================================
-- 20261005000000: a member can delete a direct conversation whose other half
-- has deleted their account. Not one with somebody still in the club, not a
-- group, and not somebody else's. Everything in it goes except what a report
-- copied. The client removes the photographs first, through a second storage
-- policy that also reaches the gone member's files; this file can only test
-- that policy's predicate (storage.protect_delete refuses every delete from
-- SQL), and `pnpm check-chat-photo-policy` does the real deletes.
--
-- Run as real signed-in members, not as the superuser: postgres is BYPASSRLS.
-- The superuser writes the rows, deletes the gone member, and reads what is
-- left in 7, between role switches. Every expected refusal sits in its own
-- savepoint.
--
--   docker run --rm -i --network host -e PGPASSWORD=postgres postgres:17-alpine \
--     psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
--     -f - < supabase/tests/chat-delete-conversation.sql
--
-- Rolls back. Do not point it at the hosted project.
-- ============================================================================

\set ON_ERROR_STOP off
\pset pager off

begin;

insert into public.members (id, type, status, display_name, phone, birth_date, level_range, state)
values
  ('aaaaaaaa-6666-0000-0000-00000000000a', 'peer', 'active', 'Asker',   '19990000060', '1980-01-01', 'C5–C8', 'CA'),
  ('bbbbbbbb-6666-0000-0000-00000000000b', 'peer', 'active', 'Gone',    '19990000061', '1981-01-01', 'C5–C8', 'CA'),
  ('cccccccc-6666-0000-0000-00000000000c', 'peer', 'active', 'Stays',   '19990000062', '1982-01-01', 'C5–C8', 'CA'),
  ('dddddddd-6666-0000-0000-00000000000d', 'peer', 'active', 'Outside', '19990000063', '1983-01-01', 'C5–C8', 'CA');

-- 1 is Asker and Gone, 2 is Asker and Stays, 3 is a group of Asker and Stays,
-- 4 is Gone and somebody who left before them: nobody is left in it at all.
insert into public.chat_threads (id, kind, direct_key, name) values
  ('11111111-6666-0000-0000-000000000001', 'direct',
   'aaaaaaaa-6666-0000-0000-00000000000a:bbbbbbbb-6666-0000-0000-00000000000b', null),
  ('22222222-6666-0000-0000-000000000002', 'direct',
   'aaaaaaaa-6666-0000-0000-00000000000a:cccccccc-6666-0000-0000-00000000000c', null),
  ('33333333-6666-0000-0000-000000000003', 'group', null, 'Probe group'),
  ('44444444-6666-0000-0000-000000000004', 'direct',
   'bbbbbbbb-6666-0000-0000-00000000000b:ffffffff-6666-0000-0000-00000000000f', null);
insert into public.chat_thread_members (thread_id, member_id) values
  ('11111111-6666-0000-0000-000000000001', 'aaaaaaaa-6666-0000-0000-00000000000a'),
  ('11111111-6666-0000-0000-000000000001', 'bbbbbbbb-6666-0000-0000-00000000000b'),
  ('22222222-6666-0000-0000-000000000002', 'aaaaaaaa-6666-0000-0000-00000000000a'),
  ('22222222-6666-0000-0000-000000000002', 'cccccccc-6666-0000-0000-00000000000c'),
  ('33333333-6666-0000-0000-000000000003', 'aaaaaaaa-6666-0000-0000-00000000000a'),
  ('33333333-6666-0000-0000-000000000003', 'cccccccc-6666-0000-0000-00000000000c'),
  ('44444444-6666-0000-0000-000000000004', 'bbbbbbbb-6666-0000-0000-00000000000b');

-- In 1: a photograph from each of them, one Gone took back (its picture is
-- kept in chat_removed_bodies), and one Asker reported (the report copies
-- its picture's path).
insert into public.chat_messages (id, thread_id, author_id, body, attachments, removed_at) values
  ('a1111111-6666-0000-0000-000000000001', '11111111-6666-0000-0000-000000000001',
   'aaaaaaaa-6666-0000-0000-00000000000a', 'Mine', '{threads/11111111-6666-0000-0000-000000000001/a.webp}', null),
  ('b1111111-6666-0000-0000-000000000002', '11111111-6666-0000-0000-000000000001',
   'bbbbbbbb-6666-0000-0000-00000000000b', 'Theirs', '{threads/11111111-6666-0000-0000-000000000001/b.webp}', null),
  ('b1111111-6666-0000-0000-000000000003', '11111111-6666-0000-0000-000000000001',
   'bbbbbbbb-6666-0000-0000-00000000000b', '', '{}', now()),
  ('b1111111-6666-0000-0000-000000000004', '11111111-6666-0000-0000-000000000001',
   'bbbbbbbb-6666-0000-0000-00000000000b', 'Reported', '{threads/11111111-6666-0000-0000-000000000001/reported.webp}', null),
  ('a2222222-6666-0000-0000-000000000005', '22222222-6666-0000-0000-000000000002',
   'cccccccc-6666-0000-0000-00000000000c', 'Still here', '{threads/22222222-6666-0000-0000-000000000002/c.webp}', null);
insert into public.chat_removed_bodies (message_id, body, attachments, removed_by) values
  ('b1111111-6666-0000-0000-000000000003', 'Taken back',
   '{threads/11111111-6666-0000-0000-000000000001/removed.webp}', 'bbbbbbbb-6666-0000-0000-00000000000b');
insert into public.chat_reports
  (kind, context_kind, message_id, reporter_id, reported_author_id, body_snapshot, written_at, place, attachments)
values
  ('message', 'direct', 'b1111111-6666-0000-0000-000000000004', 'aaaaaaaa-6666-0000-0000-00000000000a',
   'bbbbbbbb-6666-0000-0000-00000000000b', 'Reported', now(), 'a direct conversation',
   '{threads/11111111-6666-0000-0000-000000000001/reported.webp}');

-- Gone deletes their account. Their membership of 1 goes with the row.
delete from public.members where id = 'bbbbbbbb-6666-0000-0000-00000000000b';

\echo ''
\echo '== 0. Gone is no longer in conversation 1 (expect 1) =='
select count(*) from public.chat_thread_members
 where thread_id = '11111111-6666-0000-0000-000000000001';

\echo ''
\echo '== 1. signed out, the function is not there to call (expect ERROR: permission denied for function chat_delete_conversation) =='
set local role anon;
savepoint as_anon;
select public.chat_delete_conversation('11111111-6666-0000-0000-000000000001');
rollback to savepoint as_anon;
reset role;

select set_config('request.jwt.claims',
  '{"sub":"dddddddd-6666-0000-0000-00000000000d","role":"authenticated"}', true) is not null as ok;
set local role authenticated;

\echo ''
\echo '== 2. somebody who was never in it (expect ERROR: That conversation is not there any more.) =='
savepoint outsider;
select public.chat_delete_conversation('11111111-6666-0000-0000-000000000001');
rollback to savepoint outsider;

reset role;
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-6666-0000-0000-00000000000a","role":"authenticated"}', true) is not null as ok;
set local role authenticated;

\echo ''
\echo '== 3. a conversation with somebody still in the club (expect ERROR: Only a conversation with a deleted member can be deleted.) =='
savepoint still_here;
select public.chat_delete_conversation('22222222-6666-0000-0000-000000000002');
rollback to savepoint still_here;

\echo ''
\echo '== 4. a group (expect ERROR: Only a conversation with a deleted member can be deleted.) =='
savepoint a_group;
select public.chat_delete_conversation('33333333-6666-0000-0000-000000000003');
rollback to savepoint a_group;

\echo ''
\echo '== 5. which files the new storage policy reaches, for Asker (expect t | t | f | f | f | f | f) =='
select
  public.chat_file_is_in_a_deletable_conversation('threads/11111111-6666-0000-0000-000000000001/b.webp') as gone_theirs,
  public.chat_file_is_in_a_deletable_conversation('threads/11111111-6666-0000-0000-000000000001/a.webp') as gone_mine,
  public.chat_file_is_in_a_deletable_conversation('threads/22222222-6666-0000-0000-000000000002/c.webp') as still_here,
  public.chat_file_is_in_a_deletable_conversation('threads/33333333-6666-0000-0000-000000000003/x.webp') as a_group,
  public.chat_file_is_in_a_deletable_conversation('rooms/bladder/x.webp') as a_room,
  public.chat_file_is_in_a_deletable_conversation('threads/not-a-uuid/x.webp') as not_a_conversation,
  public.chat_file_is_in_a_deletable_conversation('threads/11111111-6666-0000-0000-000000000001/deeper/x.webp') as too_deep;

\echo ''
\echo '== 5b. and for somebody who was never in 1, or in 4, which has nobody left in it (expect f | f) =='
reset role;
select set_config('request.jwt.claims',
  '{"sub":"dddddddd-6666-0000-0000-00000000000d","role":"authenticated"}', true) is not null as ok;
set local role authenticated;
select public.chat_file_is_in_a_deletable_conversation('threads/11111111-6666-0000-0000-000000000001/b.webp') as outsider,
       public.chat_file_is_in_a_deletable_conversation('threads/44444444-6666-0000-0000-000000000004/x.webp') as nobody_left;

\echo ''
\echo '== 5c. nor can they delete 4 (expect ERROR: That conversation is not there any more.) =='
savepoint nobody_left;
select public.chat_delete_conversation('44444444-6666-0000-0000-000000000004');
rollback to savepoint nobody_left;

reset role;
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-6666-0000-0000-00000000000a","role":"authenticated"}', true) is not null as ok;
set local role authenticated;

\echo ''
\echo '== 6. Asker deletes 1 (expect one empty row: it returns nothing) =='
select public.chat_delete_conversation('11111111-6666-0000-0000-000000000001');

\echo ''
\echo '== 6b. and it is gone from their list (expect 2 rows: the other direct and the group) =='
select kind, member_count from public.chat_my_threads() order by kind;

reset role;

\echo ''
\echo '== 7. what is left, read as the superuser (expect 0 | 0 | 0 | 0 | 1 | t | 1) =='
select
  (select count(*) from public.chat_threads where id = '11111111-6666-0000-0000-000000000001') as thread,
  (select count(*) from public.chat_thread_members where thread_id = '11111111-6666-0000-0000-000000000001') as members,
  (select count(*) from public.chat_messages where thread_id = '11111111-6666-0000-0000-000000000001') as messages,
  (select count(*) from public.chat_removed_bodies where message_id = 'b1111111-6666-0000-0000-000000000003') as removed,
  (select count(*) from public.chat_reports where reporter_id = 'aaaaaaaa-6666-0000-0000-00000000000a') as reports,
  (select message_id is null and cardinality(attachments) = 1 from public.chat_reports
    where reporter_id = 'aaaaaaaa-6666-0000-0000-00000000000a') as report_keeps_its_copy,
  (select count(*) from public.chat_messages where thread_id = '22222222-6666-0000-0000-000000000002') as other_untouched;

select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-6666-0000-0000-00000000000a","role":"authenticated"}', true) is not null as ok;
set local role authenticated;

\echo ''
\echo '== 8. after, the policy reaches nothing in it: there is no conversation to delete (expect f) =='
select public.chat_file_is_in_a_deletable_conversation('threads/11111111-6666-0000-0000-000000000001/b.webp');

\echo ''
\echo '== 9. the reported photograph stays protected (expect t) =='
select public.chat_file_is_on_a_report('threads/11111111-6666-0000-0000-000000000001/reported.webp');

\echo ''
\echo '== 10. deleting it twice (expect ERROR: That conversation is not there any more.) =='
savepoint twice;
select public.chat_delete_conversation('11111111-6666-0000-0000-000000000001');
rollback to savepoint twice;

rollback;
