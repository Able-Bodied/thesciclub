-- ============================================================================
-- Direct conversations: who can open one, who can read it, who can remove from
-- it. Run as a member, under RLS.
-- ============================================================================
--   docker run --rm -i --network host -e PGPASSWORD=postgres postgres:17-alpine \
--     psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
--     -f - < supabase/tests/chat-direct.sql
--
-- It rolls back and is safe to re-run. Do not point it at the hosted project.
--
-- Three steps carry the feature and are marked in place:
--
--   5  — a third member sees no thread, no roster and no message. THE step. A
--         room is open to every member by design; a conversation is open to two
--         people, and everything else here is decoration if this one is wrong.
--   3  — opening the same conversation twice returns the same thread. The unique
--         direct_key is what makes a double tap harmless instead of two threads
--         holding half a conversation each.
--   11 — a member cannot reach the tables around the functions. Every chat
--         migration revokes from `authenticated` as well as anon and public,
--         because Supabase grants every privilege on a new table by default and
--         an ungranted verb that RLS merely fails to match reports UPDATE 0 and
--         reads like a pass.
--
-- Step 0 prints current_user because as the superuser every step below turns
-- green while proving nothing — `postgres` is BYPASSRLS. Every expected refusal
-- has its own savepoint; without one the first error aborts the transaction and
-- everything after it prints "current transaction is aborted", which in a long
-- log reads like a pass.
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
  ('aaaaaaaa-4444-0000-0000-000000000001', 'peer',   'active',    'Ada A',       '19990004001', '1980-01-01', 'T1–T6',  'CA', true,  false),
  ('bbbbbbbb-4444-0000-0000-000000000002', 'peer',   'active',    'Bo B',        '19990004002', '1981-01-01', 'C5–C8',  'CA', true,  false),
  ('cccccccc-4444-0000-0000-000000000003', 'peer',   'active',    'Onlooker O',  '19990004003', '1982-01-01', 'T7–T12', 'CA', true,  false),
  ('dddddddd-4444-0000-0000-000000000004', 'peer',   'active',    'Hidden H',    '19990004004', '1983-01-01', 'L1–S5',  'CA', false, false),
  ('eeeeeeee-4444-0000-0000-000000000005', 'peer',   'suspended', 'Suspended S', '19990004005', '1984-01-01', 'T1–T6',  'CA', true,  false),
  ('ffffffff-4444-0000-0000-000000000006', 'mentor', 'active',    'Admin A',     '19990004006', '1985-01-01', 'C5–C8',  'CA', true,  true);

\set QUIET off
\echo ''
\echo '== 0. we are a signed-in ordinary member, not the superuser =='
\echo '   expect: authenticated | aaaaaaaa-4444-... | t a_member | f admin'
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-4444-0000-0000-000000000001","role":"authenticated"}';
select current_user, auth.uid()::text as uid,
       public.is_member() as a_member, public.is_admin() as admin;

\echo ''
\echo '== 1. a conversation needs somebody else in it =='
\echo '   expect: two ERRORs. Yourself is not a conversation — direct_key would'
\echo '   be x:x and the list would draw it as you. Null is the same mistake'
\echo '   arriving from a client that lost the id.'
savepoint self;
select public.chat_open_direct('aaaaaaaa-4444-0000-0000-000000000001');
rollback to savepoint self;
savepoint nobody;
select public.chat_open_direct(null);
rollback to savepoint nobody;

\echo ''
\echo '== 2. opening one with a member who can be found =='
\echo '   expect: a uuid, then kind direct | 2 on the roster | the ordered key.'
select public.chat_open_direct('bbbbbbbb-4444-0000-0000-000000000002') as thread \gset
select t.kind,
       (select count(*) from public.chat_thread_members m where m.thread_id = t.id) as roster,
       t.direct_key = least('aaaaaaaa-4444-0000-0000-000000000001'::uuid,
                            'bbbbbbbb-4444-0000-0000-000000000002'::uuid)::text
                      || ':' ||
                      greatest('aaaaaaaa-4444-0000-0000-000000000001'::uuid,
                               'bbbbbbbb-4444-0000-0000-000000000002'::uuid)::text
         as key_is_ordered,
       t.name is null and t.event_id is null as direct_shape_holds
  from public.chat_threads t where t.id = :'thread';

\echo ''
\echo '== 3. opening it again, from both ends, is the same thread =='
\echo '   THE STEP THAT MATTERS for the race. direct_key is ordered, so A→B and'
\echo '   B→A are one string and the unique constraint turns the loser of a'
\echo '   double tap into a re-select. expect: t | t | 1 thread in the table.'
select public.chat_open_direct('bbbbbbbb-4444-0000-0000-000000000002') = :'thread' as same_from_a;
savepoint from_b;
set local role postgres;
set local request.jwt.claims = '{"sub":"bbbbbbbb-4444-0000-0000-000000000002","role":"authenticated"}';
set local role authenticated;
select public.chat_open_direct('aaaaaaaa-4444-0000-0000-000000000001') = :'thread' as same_from_b;
set local role postgres;
select count(*) as threads_in_table from public.chat_threads;
set local request.jwt.claims = '{"sub":"aaaaaaaa-4444-0000-0000-000000000001","role":"authenticated"}';
set local role authenticated;
rollback to savepoint from_b;

\echo ''
\echo '== 4. saying something, and the thread activity moving with it =='
\echo '   expect: INSERT 0 1 twice, then t — the trigger is definer because'
\echo '   members have no update grant on chat_threads at all.'
insert into public.chat_messages (thread_id, author_id, body)
values (:'thread', 'aaaaaaaa-4444-0000-0000-000000000001',
        'You mentioned a handcycle at the Santa Cruz ride. Which frame?');
savepoint bo_replies;
set local role postgres;
set local request.jwt.claims = '{"sub":"bbbbbbbb-4444-0000-0000-000000000002","role":"authenticated"}';
set local role authenticated;
insert into public.chat_messages (thread_id, author_id, body)
values (:'thread', 'bbbbbbbb-4444-0000-0000-000000000002',
        'A Top End Force. The seat took three fittings to get right.');
set local role postgres;
set local request.jwt.claims = '{"sub":"aaaaaaaa-4444-0000-0000-000000000001","role":"authenticated"}';
set local role authenticated;
select t.last_message_at = (select max(m.created_at) from public.chat_messages m
                             where m.thread_id = t.id) as activity_matches
  from public.chat_threads t where t.id = :'thread';

\echo ''
\echo '== 5. a third member sees nothing of it =='
\echo '   THE STEP THAT MATTERS. A room is open to every member by design; a'
\echo '   conversation is open to two people. expect: f is_thread_member, then'
\echo '   0 | 0 | 0 against a table holding one thread, two roster rows and two'
\echo '   messages — and 0 rows from chat_my_threads.'
savepoint onlooker;
set local role postgres;
select (select count(*) from public.chat_threads) as threads_in_table,
       (select count(*) from public.chat_thread_members) as roster_rows_in_table,
       (select count(*) from public.chat_messages) as messages_in_table;
set local request.jwt.claims = '{"sub":"cccccccc-4444-0000-0000-000000000003","role":"authenticated"}';
set local role authenticated;
select public.is_thread_member(:'thread') as on_the_roster,
       (select count(*) from public.chat_threads) as threads_i_see,
       (select count(*) from public.chat_thread_members) as roster_rows_i_see,
       (select count(*) from public.chat_messages) as messages_i_see,
       (select count(*) from public.chat_my_threads()) as my_threads;

\echo ''
\echo '== 5b. ...and cannot write into it =='
\echo '   expect: ERROR (row-level security), then ERROR again when they try to'
\echo '   put themselves on the roster to earn the right.'
savepoint onlooker_writes;
insert into public.chat_messages (thread_id, author_id, body)
values (:'thread', 'cccccccc-4444-0000-0000-000000000003', 'Listening in.');
rollback to savepoint onlooker_writes;
savepoint onlooker_joins;
insert into public.chat_thread_members (thread_id, member_id)
values (:'thread', 'cccccccc-4444-0000-0000-000000000003');
rollback to savepoint onlooker_joins;

\echo ''
\echo '== 5c. ...and marking it read is refused, not ignored =='
\echo '   expect: ERROR, there is no such conversation. chat_mark_thread_read is'
\echo '   definer, so RLS is off inside it and its own is_thread_member() call'
\echo '   is the only thing between a stranger and somebody elseʼs read line.'
savepoint onlooker_marks;
select public.chat_mark_thread_read(:'thread');
rollback to savepoint onlooker_marks;
rollback to savepoint onlooker;

\echo ''
\echo '== 5d. an administrator is not in a conversation either =='
\echo '   expect: f | 0 | 0. A private thread an administrator could read would'
\echo '   not be private. What they can do is remove a message by its id — see'
\echo '   step 13 — which is the audited action and not a reading right.'
savepoint admin_reads;
set local role postgres;
set local request.jwt.claims = '{"sub":"ffffffff-4444-0000-0000-000000000006","role":"authenticated"}';
set local role authenticated;
select public.is_admin() as admin, public.is_thread_member(:'thread') as on_the_roster,
       (select count(*) from public.chat_threads) as threads_i_see,
       (select count(*) from public.chat_messages) as messages_i_see;
rollback to savepoint admin_reads;

\echo ''
\echo '== 6. a member who is not findable cannot be messaged =='
\echo '   expect: two ERRORs, "that member cannot be messaged". Hidden H is'
\echo '   active and off the directory; Suspended S is in it and not active.'
\echo '   Neither can be *found* to start a conversation with — and the name of'
\echo '   each still shows on anything they wrote, which is chat_authors.'
savepoint hidden;
select public.chat_open_direct('dddddddd-4444-0000-0000-000000000004');
rollback to savepoint hidden;
savepoint suspended_target;
select public.chat_open_direct('eeeeeeee-4444-0000-0000-000000000005');
rollback to savepoint suspended_target;

\echo ''
\echo '== 6b. ...but a conversation that already exists still opens =='
\echo '   expect: t. Somebody who talked to you and then left the directory has'
\echo '   not unsent what they said. Hiding yourself stops new conversations; it'
\echo '   does not close the ones you are in. This is why chat_open_direct looks'
\echo '   the thread up before it applies the findable test.'
savepoint reopen_hidden;
set local role postgres;
insert into public.members
  (id, type, status, display_name, phone, birth_date, level_range, state, show_in_browse)
values
  ('dddddddd-4444-0000-0000-00000000dddd', 'peer', 'active', 'Went Quiet', '19990004007',
   '1986-01-01', 'T1–T6', 'CA', true);
set local request.jwt.claims = '{"sub":"aaaaaaaa-4444-0000-0000-000000000001","role":"authenticated"}';
set local role authenticated;
select public.chat_open_direct('dddddddd-4444-0000-0000-00000000dddd') as quiet_thread \gset
set local role postgres;
update public.members set show_in_browse = false
 where id = 'dddddddd-4444-0000-0000-00000000dddd';
set local request.jwt.claims = '{"sub":"aaaaaaaa-4444-0000-0000-000000000001","role":"authenticated"}';
set local role authenticated;
select public.chat_open_direct('dddddddd-4444-0000-0000-00000000dddd') = :'quiet_thread'
  as reopens_anyway;
rollback to savepoint reopen_hidden;

\echo ''
\echo '== 7. a suspended member reads their conversations and does not write =='
\echo '   expect: t a_member | f active | 1 thread | 2 messages, then ERROR on'
\echo '   the message and ERROR on opening a new conversation. Reading is not'
\echo '   what suspension takes away.'
savepoint suspended_caller;
set local role postgres;
insert into public.chat_thread_members (thread_id, member_id)
values (:'thread', 'eeeeeeee-4444-0000-0000-000000000005');
set local request.jwt.claims = '{"sub":"eeeeeeee-4444-0000-0000-000000000005","role":"authenticated"}';
set local role authenticated;
select public.is_member() as a_member, public.is_active_member() as active,
       (select count(*) from public.chat_threads) as threads_i_see,
       (select count(*) from public.chat_messages) as messages_i_see;
savepoint suspended_writes;
insert into public.chat_messages (thread_id, author_id, body)
values (:'thread', 'eeeeeeee-4444-0000-0000-000000000005', 'Still here.');
rollback to savepoint suspended_writes;
savepoint suspended_opens;
select public.chat_open_direct('cccccccc-4444-0000-0000-000000000003');
rollback to savepoint suspended_opens;
rollback to savepoint suspended_caller;

\echo ''
\echo '== 8. nobody can pass somebody else off as the author =='
\echo '   expect: ERROR. author_id = auth.uid() is a third of the insert check,'
\echo '   and the other two thirds are active and on the roster.'
savepoint forge;
insert into public.chat_messages (thread_id, author_id, body)
values (:'thread', 'bbbbbbbb-4444-0000-0000-000000000002', 'Not my words.');
rollback to savepoint forge;

\echo ''
\echo '== 9. the conversation list =='
\echo '   expect: one row — direct | 2 members | Bo B as the other member |'
\echo '   Boʼs message last | t unread, because the last thing said was said by'
\echo '   somebody else and Ada has not looked since.'
select kind, member_count,
       other_member_id = 'bbbbbbbb-4444-0000-0000-000000000002' as other_is_bo,
       left(last_body, 18) as last_starts,
       last_author_id = 'bbbbbbbb-4444-0000-0000-000000000002' as last_is_bos,
       last_removed, unread
  from public.chat_my_threads();
select public.chat_unread_count() as dot;

\echo ''
\echo '== 9b. reading it clears the mark; saying something does not set it =='
\echo '   expect: f unread | 0 dot after marking read, and f unread again after'
\echo '   Ada speaks. "Unread" is somebody elseʼs words newer than you last'
\echo '   looked — not last_message_at > last_read_at, which would go bold the'
\echo '   moment you spoke and stay bold until you reopened what you were'
\echo '   already reading.'
select public.chat_mark_thread_read(:'thread');
select unread from public.chat_my_threads();
select public.chat_unread_count() as dot;
insert into public.chat_messages (thread_id, author_id, body)
values (:'thread', 'aaaaaaaa-4444-0000-0000-000000000001', 'Force it is. Thank you.');
select unread as unread_after_my_own_message from public.chat_my_threads();

\echo ''
\echo '== 9c. ...and it is set again for the other end =='
\echo '   expect: t | 1. Bo has not looked since Ada replied.'
savepoint bos_list;
set local role postgres;
set local request.jwt.claims = '{"sub":"bbbbbbbb-4444-0000-0000-000000000002","role":"authenticated"}';
set local role authenticated;
select unread from public.chat_my_threads();
select public.chat_unread_count() as dot;
rollback to savepoint bos_list;

\echo ''
\echo '== 10. a conversation with nothing said in it still appears =='
\echo '   expect: one extra row, with a null last message and f unread. The'
\echo '   lateral join is a LEFT one: tapping Message and navigating away must'
\echo '   not lose the thread.'
savepoint empty_thread;
select public.chat_open_direct('cccccccc-4444-0000-0000-000000000003') as quiet \gset
select count(*) as threads_listed,
       count(*) filter (where last_at is null) as with_nothing_said,
       count(*) filter (where unread) as unread_ones
  from public.chat_my_threads();
rollback to savepoint empty_thread;

\echo ''
\echo '== 11. a member cannot reach the tables around the functions =='
\echo '   THE STEP THAT MATTERS for the grants. expect: permission denied five'
\echo '   times — not five zero-row no-ops. Supabase grants every privilege on a'
\echo '   new table by default, so revoking from anon and public only leaves'
\echo '   insert, update and delete in place and RLS fails them silently:'
\echo '   `update ...` reports UPDATE 0 and succeeds.'
savepoint no_insert_thread;
insert into public.chat_threads (kind, direct_key) values ('direct', 'forged:key');
rollback to savepoint no_insert_thread;
savepoint no_insert_roster;
insert into public.chat_thread_members (thread_id, member_id)
values (:'thread', 'cccccccc-4444-0000-0000-000000000003');
rollback to savepoint no_insert_roster;
savepoint no_update_read_line;
update public.chat_thread_members set last_read_at = now()
 where thread_id = :'thread' and member_id = auth.uid();
rollback to savepoint no_update_read_line;
savepoint no_update_message;
update public.chat_messages set body = 'Mine now' where thread_id = :'thread';
rollback to savepoint no_update_message;
savepoint no_read_bodies;
select count(*) from public.chat_removed_bodies;
rollback to savepoint no_read_bodies;

\echo ''
\echo '== 12. leaving: a group yes, a conversation no =='
\echo '   expect: DELETE 0 on the direct thread — the delete policy matches no'
\echo '   row, so nothing goes — then DELETE 1 on a group. Leaving a direct'
\echo '   thread would leave the pair in place with one half missing, readable by'
\echo '   the other person and no longer readable by the leaver, while'
\echo '   direct_key still says the thread exists. Blocking and deleting a'
\echo '   conversation are both real and both out of this build.'
\echo '   (Phase 5 writes the groups; this one is inserted as the superuser'
\echo '   because there is no function for it yet.)'
savepoint leaving;
delete from public.chat_thread_members
 where thread_id = :'thread' and member_id = 'aaaaaaaa-4444-0000-0000-000000000001';
select public.is_thread_member(:'thread') as still_in_my_conversation;
rollback to savepoint leaving;

savepoint leaving_group;
set local role postgres;
insert into public.chat_threads (id, kind, name, created_by)
values ('99999999-4444-0000-0000-000000000009', 'group', 'Saturday ride',
        'aaaaaaaa-4444-0000-0000-000000000001');
insert into public.chat_thread_members (thread_id, member_id)
values ('99999999-4444-0000-0000-000000000009', 'aaaaaaaa-4444-0000-0000-000000000001'),
       ('99999999-4444-0000-0000-000000000009', 'bbbbbbbb-4444-0000-0000-000000000002');
set local request.jwt.claims = '{"sub":"aaaaaaaa-4444-0000-0000-000000000001","role":"authenticated"}';
set local role authenticated;
delete from public.chat_thread_members
 where thread_id = '99999999-4444-0000-0000-000000000009' and member_id = auth.uid();
select public.is_thread_member('99999999-4444-0000-0000-000000000009') as still_in_it,
       (select count(*) from public.chat_threads
         where id = '99999999-4444-0000-0000-000000000009') as group_i_can_see;
rollback to savepoint leaving_group;

\echo ''
\echo '== 13. removal: a third member cannot, the author can =='
\echo '   expect: ERROR from the onlooker (who cannot even see it), then the'
\echo '   author blanks their own message and the row stays.'
savepoint removal;
select id as first_message from public.chat_messages
 where thread_id = :'thread' order by created_at limit 1 \gset
savepoint third_party;
set local role postgres;
set local request.jwt.claims = '{"sub":"cccccccc-4444-0000-0000-000000000003","role":"authenticated"}';
set local role authenticated;
select public.chat_remove_message(:'first_message');
rollback to savepoint third_party;

select public.chat_remove_message(:'first_message');
select body = '' as body_blanked, removed_at is not null as removed, removed_by_admin
  from public.chat_messages where id = :'first_message';
select count(*) as messages_still_there from public.chat_messages where thread_id = :'thread';

\echo ''
\echo '== 13b. the words are kept where no session can read them =='
\echo '   expect: one row as the superuser, holding what the message said, with'
\echo '   post_id null. Step 11 is the half that shows a member cannot reach it.'
savepoint kept;
set local role postgres;
select left(body, 22) as starts_with, post_id is null as not_a_post,
       message_id = :'first_message' as points_at_the_message
  from public.chat_removed_bodies;
rollback to savepoint kept;

\echo ''
\echo '== 13c. removing is idempotent =='
\echo '   expect: no error, removed_by_admin still f, and the stored body not'
\echo '   overwritten with the blank that replaced it. Two taps on a slow'
\echo '   connection is the ordinary case.'
select public.chat_remove_message(:'first_message');
select removed_by_admin from public.chat_messages where id = :'first_message';
savepoint kept_again;
set local role postgres;
select left(body, 22) as still_says from public.chat_removed_bodies;
rollback to savepoint kept_again;

\echo ''
\echo ''
\echo '== 13d. the list says a removed message was removed rather than blank =='
\echo '   expect: t last_removed | t last_is_blank once Ada takes back the most'
\echo '   recent thing said. The row stays in the list and the row stays in the'
\echo '   thread; what goes is the words.'
select public.chat_remove_message(
  (select id from public.chat_messages where thread_id = :'thread'
    and author_id = 'aaaaaaaa-4444-0000-0000-000000000001' order by created_at desc limit 1));
select last_removed, last_body = '' as last_is_blank from public.chat_my_threads();

\echo ''
\echo '== 13e. an administrator removes a message in a thread they cannot read =='
\echo '   expect: 0 messages_i_see, then no error, then removed_by_admin = t.'
\echo '   Acting on a complaint must not require being in the conversation, and'
\echo '   being able to remove is not being able to read: the id is captured'
\echo '   here the way an administrator gets it in life, from somebody else.'
set local role postgres;
select id as bos_message from public.chat_messages
 where thread_id = :'thread' and author_id = 'bbbbbbbb-4444-0000-0000-000000000002'
 order by created_at limit 1 \gset
set local request.jwt.claims = '{"sub":"ffffffff-4444-0000-0000-000000000006","role":"authenticated"}';
set local role authenticated;
select (select count(*) from public.chat_messages) as messages_i_see;
select public.chat_remove_message(:'bos_message');
savepoint check_admin_removal;
set local role postgres;
select removed_by_admin, body = '' as blanked from public.chat_messages where id = :'bos_message';
rollback to savepoint check_admin_removal;
rollback to savepoint removal;

\echo '== 14. a session that was never invited reads nothing and opens nothing =='
\echo '   expect: f | 0 | 0, then ERROR. Somebody who got through phone'
\echo '   verification and no further has no members row.'
savepoint uninvited;
set local role postgres;
set local request.jwt.claims = '{"sub":"ffffffff-4444-0000-0000-0000000000ff","role":"authenticated"}';
set local role authenticated;
select public.is_member() as a_member,
       (select count(*) from public.chat_threads) as threads,
       (select count(*) from public.chat_messages) as messages;
select public.chat_open_direct('aaaaaaaa-4444-0000-0000-000000000001');
rollback to savepoint uninvited;

\echo ''
\echo '== 15. a signed-out visitor is refused outright =='
\echo '   expect: permission denied for table chat_messages.'
savepoint anon;
set local role postgres;
set local request.jwt.claims = '';
set local role anon;
select count(*) from public.chat_messages;
rollback to savepoint anon;

\echo ''
\echo '== 16. the body is bounded, and a thread cannot be the wrong shape =='
\echo '   expect: ERROR on a blank body, ERROR on 4001 characters, and ERROR on'
\echo '   a direct thread carrying a name — the check that keeps the two kinds'
\echo '   from drifting into one nullable mess.'
set local role postgres;
set local request.jwt.claims = '{"sub":"aaaaaaaa-4444-0000-0000-000000000001","role":"authenticated"}';
set local role authenticated;
savepoint blank_body;
insert into public.chat_messages (thread_id, author_id, body)
values (:'thread', 'aaaaaaaa-4444-0000-0000-000000000001', '   ');
rollback to savepoint blank_body;
savepoint long_body;
insert into public.chat_messages (thread_id, author_id, body)
values (:'thread', 'aaaaaaaa-4444-0000-0000-000000000001', repeat('x', 4001));
rollback to savepoint long_body;
savepoint wrong_shape;
set local role postgres;
insert into public.chat_threads (kind, direct_key, name) values ('direct', 'x:y', 'Named pair');
rollback to savepoint wrong_shape;

set local role postgres;
rollback;
