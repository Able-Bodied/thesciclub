-- ============================================================================
-- Groups: who can make one, who can add to one, who can read one, and who the
-- event's group is for. Run as a member, under RLS.
-- ============================================================================
--   docker run --rm -i --network host -e PGPASSWORD=postgres postgres:17-alpine \
--     psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
--     -f - < supabase/tests/chat-groups.sql
--
-- It rolls back and is safe to re-run. Do not point it at the hosted project.
--
-- Three steps carry the feature and are marked in place:
--
--   6  — somebody who is not in a group cannot add anybody to it. THE step for
--        chat_add_to_group. Being in the conversation is the whole permission,
--        so if that check is wrong then any member holding a thread id can put
--        themselves or anybody else into a private conversation.
--   8  — leaving stops the reads. A member who has left has to stop seeing the
--        thread, its roster and every word in it — including the words written
--        before they left. A "Leave" that only hides a row in a list is a lie
--        told to somebody who wanted out.
--   10 — Interested is not going. The event group's roster is the people who
--        said they would be there; an RSVP of Interested is a different
--        sentence and must not open the door.
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
  ('aaaaaaaa-5555-0000-0000-000000000001', 'peer',   'active',    'Ada A',       '19990005001', '1980-01-01', 'T1–T6',  'CA', true,  false),
  ('bbbbbbbb-5555-0000-0000-000000000002', 'peer',   'active',    'Bo B',        '19990005002', '1981-01-01', 'C5–C8',  'CA', true,  false),
  ('cccccccc-5555-0000-0000-000000000003', 'peer',   'active',    'Cass C',      '19990005003', '1982-01-01', 'T7–T12', 'CA', true,  false),
  ('dddddddd-5555-0000-0000-000000000004', 'peer',   'active',    'Onlooker O',  '19990005004', '1983-01-01', 'L1–S5',  'CA', true,  false),
  ('eeeeeeee-5555-0000-0000-000000000005', 'peer',   'active',    'Hidden H',    '19990005005', '1984-01-01', 'T1–T6',  'CA', false, false),
  ('ffffffff-5555-0000-0000-000000000006', 'peer',   'suspended', 'Suspended S', '19990005006', '1985-01-01', 'C5–C8',  'CA', true,  false),
  ('99999999-5555-0000-0000-000000000007', 'mentor', 'active',    'Admin A',     '19990005007', '1986-01-01', 'T1–T6',  'CA', true,  true);

-- One feed and two events: one still to come, one over. The group chat is the
-- thing under test, not the calendar.
insert into public.data_feeds (id, name, feed_url, feed_type)
values ('11111111-5555-0000-0000-0000000000f1', 'Probe feed',
        'https://example.invalid/probe-groups.ics', 'norcalsci-events');

insert into public.events (id, feed_id, external_id, title, start_time, end_time)
values
  ('22222222-5555-0000-0000-0000000000e1', '11111111-5555-0000-0000-0000000000f1', 'probe-soon',
   'Adaptive handcycling at Lighthouse Point', now() + interval '10 days', now() + interval '10 days 3 hours'),
  ('22222222-5555-0000-0000-0000000000e2', '11111111-5555-0000-0000-0000000000f1', 'probe-over',
   'Last spring''s rolling picnic', now() - interval '40 days', now() - interval '40 days' + interval '2 hours');

\set QUIET off
\echo ''
\echo '== 0. we are a signed-in ordinary member, not the superuser =='
\echo '   expect: authenticated | aaaaaaaa-5555-... | t a_member | f admin'
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-5555-0000-0000-000000000001","role":"authenticated"}';
select current_user, auth.uid()::text as uid,
       public.is_member() as a_member, public.is_admin() as admin;

\echo ''
\echo '== 1. starting a group =='
\echo '   expect: group | Saturday ride | 3 on the roster | t direct_key null.'
\echo '   The caller is on the roster without being named — a group you made and'
\echo '   are not in would be a conversation you cannot read.'
select public.chat_create_group('Saturday ride', array[
  'bbbbbbbb-5555-0000-0000-000000000002'::uuid,
  'cccccccc-5555-0000-0000-000000000003'::uuid]) as grp \gset
select t.kind, t.name,
       (select count(*) from public.chat_thread_members m where m.thread_id = t.id) as roster,
       t.direct_key is null and t.event_id is null as group_shape_holds,
       t.created_by = auth.uid() as made_by_me
  from public.chat_threads t where t.id = :'grp';

\echo ''
\echo '== 1b. the caller''s own id and a duplicate are dropped, not refused =='
\echo '   expect: 3 on the roster again. A picker that sends somebody twice, or'
\echo '   sends you yourself, is a client bug — making a member redo their list'
\echo '   over it helps nobody.'
savepoint sloppy_list;
select public.chat_create_group('Sloppy list', array[
  'bbbbbbbb-5555-0000-0000-000000000002'::uuid,
  'bbbbbbbb-5555-0000-0000-000000000002'::uuid,
  'aaaaaaaa-5555-0000-0000-000000000001'::uuid,
  'cccccccc-5555-0000-0000-000000000003'::uuid,
  null]) as sloppy \gset
select count(*) as roster from public.chat_thread_members where thread_id = :'sloppy';
rollback to savepoint sloppy_list;

\echo ''
\echo '== 2. a group needs a name and somebody else in it =='
\echo '   expect: four ERRORs. No name, whitespace only, a name past 60, and a'
\echo '   group of one — which would sit in the list looking exactly like a'
\echo '   group whose other members failed to load.'
savepoint no_name;
select public.chat_create_group('', array['bbbbbbbb-5555-0000-0000-000000000002'::uuid]);
rollback to savepoint no_name;
savepoint blank_name;
select public.chat_create_group('     ', array['bbbbbbbb-5555-0000-0000-000000000002'::uuid]);
rollback to savepoint blank_name;
savepoint long_name;
select public.chat_create_group(repeat('x', 61), array['bbbbbbbb-5555-0000-0000-000000000002'::uuid]);
rollback to savepoint long_name;
savepoint alone;
select public.chat_create_group('Just me', array['aaaaaaaa-5555-0000-0000-000000000001'::uuid]);
rollback to savepoint alone;

\echo ''
\echo '== 3. a member who cannot be found cannot be put in a group =='
\echo '   expect: two ERRORs. Hidden H is active and off the directory;'
\echo '   Suspended S is in it and not active. Neither can be *found* — and the'
\echo '   name of each still shows on anything they wrote, which is chat_authors.'
savepoint hidden_member;
select public.chat_create_group('With Hidden', array[
  'bbbbbbbb-5555-0000-0000-000000000002'::uuid,
  'eeeeeeee-5555-0000-0000-000000000005'::uuid]);
rollback to savepoint hidden_member;
savepoint suspended_member;
select public.chat_create_group('With Suspended', array[
  'ffffffff-5555-0000-0000-000000000006'::uuid]);
rollback to savepoint suspended_member;

\echo ''
\echo '== 4. the group is in the list, and it is a group not a pair =='
\echo '   expect: group | Saturday ride | 3 members | null other_member_id |'
\echo '   f unread. other_member_id is for drawing a face on a direct row and'
\echo '   there is no one face to draw for three people.'
select kind, name, member_count, other_member_id is null as no_other_member,
       last_at is null as nothing_said_yet, unread
  from public.chat_my_threads() where id = :'grp';

\echo ''
\echo '== 5. everybody in it can speak in it, and nobody else can =='
\echo '   expect: INSERT 0 1 from Bo, then 3 messages_i_see for Cass.'
savepoint talking;
set local role postgres;
set local request.jwt.claims = '{"sub":"bbbbbbbb-5555-0000-0000-000000000002","role":"authenticated"}';
set local role authenticated;
insert into public.chat_messages (thread_id, author_id, body)
values (:'grp', 'bbbbbbbb-5555-0000-0000-000000000002', 'Meeting at the lighthouse car park at nine.');
set local role postgres;
set local request.jwt.claims = '{"sub":"cccccccc-5555-0000-0000-000000000003","role":"authenticated"}';
set local role authenticated;
insert into public.chat_messages (thread_id, author_id, body)
values (:'grp', 'cccccccc-5555-0000-0000-000000000003', 'I will bring the pump.');
insert into public.chat_messages (thread_id, author_id, body)
values (:'grp', 'cccccccc-5555-0000-0000-000000000003', 'And a spare tube.');
select count(*) as messages_i_see from public.chat_messages where thread_id = :'grp';

\echo ''
\echo '== 5b. an onlooker sees no group, no roster and no word of it =='
\echo '   expect: f on_the_roster, then 0 | 0 | 0 against a table that holds the'
\echo '   thread, three roster rows and three messages. A group is a named few,'
\echo '   not a room.'
set local role postgres;
select (select count(*) from public.chat_thread_members where thread_id = :'grp') as roster_rows_in_table,
       (select count(*) from public.chat_messages where thread_id = :'grp') as messages_in_table;
set local request.jwt.claims = '{"sub":"dddddddd-5555-0000-0000-000000000004","role":"authenticated"}';
set local role authenticated;
select public.is_thread_member(:'grp') as on_the_roster,
       (select count(*) from public.chat_threads) as threads_i_see,
       (select count(*) from public.chat_thread_members) as roster_rows_i_see,
       (select count(*) from public.chat_messages) as messages_i_see;

\echo ''
\echo '== 6. THE STEP THAT MATTERS: somebody outside the group cannot add =='
\echo '   expect: three ERRORs. The onlooker cannot add a member, cannot add'
\echo '   themselves, and cannot put a roster row in around the function. Being'
\echo '   in the conversation is the whole permission, so a wrong answer here'
\echo '   means any member holding a thread id is in any private group.'
savepoint outsider_adds;
select public.chat_add_to_group(:'grp', 'dddddddd-5555-0000-0000-000000000004');
rollback to savepoint outsider_adds;
savepoint outsider_adds_someone;
select public.chat_add_to_group(:'grp', 'eeeeeeee-5555-0000-0000-000000000005');
rollback to savepoint outsider_adds_someone;
savepoint outsider_inserts;
insert into public.chat_thread_members (thread_id, member_id)
values (:'grp', 'dddddddd-5555-0000-0000-000000000004');
rollback to savepoint outsider_inserts;

\echo ''
\echo '== 6b. an administrator is not in a group either =='
\echo '   expect: t admin | f on_the_roster | 0 messages | ERROR on adding'
\echo '   themselves. Administering the club is not being in its conversations.'
savepoint admin_adds;
set local role postgres;
set local request.jwt.claims = '{"sub":"99999999-5555-0000-0000-000000000007","role":"authenticated"}';
set local role authenticated;
select public.is_admin() as admin, public.is_thread_member(:'grp') as on_the_roster,
       (select count(*) from public.chat_messages) as messages_i_see;
select public.chat_add_to_group(:'grp', '99999999-5555-0000-0000-000000000007');
rollback to savepoint admin_adds;
rollback to savepoint talking;

\echo ''
\echo '== 7. somebody in the group can add, and the refusals hold =='
\echo '   expect: 4 on the roster after Ada adds Onlooker O, 4 still after she'
\echo '   adds him again — adding twice is one row and no error — then two'
\echo '   ERRORs for Hidden H and Suspended S, and an ERROR for adding a third'
\echo '   person to a conversation between two.'
select public.chat_add_to_group(:'grp', 'dddddddd-5555-0000-0000-000000000004');
select count(*) as roster from public.chat_thread_members where thread_id = :'grp';
select public.chat_add_to_group(:'grp', 'dddddddd-5555-0000-0000-000000000004');
select count(*) as roster_after_adding_again from public.chat_thread_members where thread_id = :'grp';
savepoint add_hidden;
select public.chat_add_to_group(:'grp', 'eeeeeeee-5555-0000-0000-000000000005');
rollback to savepoint add_hidden;
savepoint add_suspended;
select public.chat_add_to_group(:'grp', 'ffffffff-5555-0000-0000-000000000006');
rollback to savepoint add_suspended;
savepoint add_to_direct;
select public.chat_open_direct('bbbbbbbb-5555-0000-0000-000000000002') as pair \gset
select public.chat_add_to_group(:'pair', 'cccccccc-5555-0000-0000-000000000003');
rollback to savepoint add_to_direct;

\echo ''
\echo '== 8. THE STEP THAT MATTERS: leaving stops the reads =='
\echo '   expect: DELETE 1, then f on_the_roster and 0 | 0 | 0 — no thread, no'
\echo '   roster, not one of the words written while they were in it. A Leave'
\echo '   that only hides a row in a list is a lie told to somebody who wanted'
\echo '   out. And the group carries on: 3 roster rows and the messages intact.'
savepoint leaving;
set local role postgres;
set local request.jwt.claims = '{"sub":"dddddddd-5555-0000-0000-000000000004","role":"authenticated"}';
set local role authenticated;
insert into public.chat_messages (thread_id, author_id, body)
values (:'grp', 'dddddddd-5555-0000-0000-000000000004', 'Count me in.');
delete from public.chat_thread_members where thread_id = :'grp' and member_id = auth.uid();
select public.is_thread_member(:'grp') as on_the_roster,
       (select count(*) from public.chat_threads) as threads_i_see,
       (select count(*) from public.chat_thread_members) as roster_rows_i_see,
       (select count(*) from public.chat_messages) as messages_i_see,
       (select count(*) from public.chat_my_threads()) as my_threads;

\echo ''
\echo '== 8b. ...and what they said stays, for the people still in it =='
\echo '   expect: 3 roster | 1 message from the member who left, still readable.'
\echo '   Leaving is not unsending. The delete policy is own-row-only, so it'
\echo '   cannot reach the message table at all.'
set local role postgres;
set local request.jwt.claims = '{"sub":"aaaaaaaa-5555-0000-0000-000000000001","role":"authenticated"}';
set local role authenticated;
select (select count(*) from public.chat_thread_members where thread_id = :'grp') as roster,
       (select count(*) from public.chat_messages where thread_id = :'grp'
         and author_id = 'dddddddd-5555-0000-0000-000000000004') as their_words;

\echo ''
\echo '== 8c. ...and they can be brought back in, by anybody still in it =='
\echo '   expect: 4 roster. Leaving is not a block; there is no blocking in this'
\echo '   build and this is not it by another name.'
select public.chat_add_to_group(:'grp', 'dddddddd-5555-0000-0000-000000000004');
select count(*) as roster from public.chat_thread_members where thread_id = :'grp';
rollback to savepoint leaving;

\echo ''
\echo '== 9. leaving a direct conversation is still refused =='
\echo '   expect: DELETE 0 — the policy matches no row — and t still_in_it. The'
\echo '   pair would otherwise be left with one half missing while direct_key'
\echo '   still says the thread exists.'
savepoint leave_pair;
select public.chat_open_direct('cccccccc-5555-0000-0000-000000000003') as pair2 \gset
delete from public.chat_thread_members where thread_id = :'pair2' and member_id = auth.uid();
select public.is_thread_member(:'pair2') as still_in_it;
rollback to savepoint leave_pair;

\echo ''
\echo '== 10. THE STEP THAT MATTERS: Interested is not going =='
\echo '   expect: ERROR with no RSVP at all, then ERROR with Interested, then a'
\echo '   uuid once the RSVP says going. "Interested" is a different sentence'
\echo '   about the same event and must not open the door.'
savepoint interested_only;
select public.chat_join_event_group('22222222-5555-0000-0000-0000000000e1');
rollback to savepoint interested_only;
insert into public.event_rsvps (event_id, member_id, status)
values ('22222222-5555-0000-0000-0000000000e1', auth.uid(), 'interested');
savepoint just_interested;
select public.chat_join_event_group('22222222-5555-0000-0000-0000000000e1');
rollback to savepoint just_interested;
update public.event_rsvps set status = 'going'
 where event_id = '22222222-5555-0000-0000-0000000000e1' and member_id = auth.uid();
select public.chat_join_event_group('22222222-5555-0000-0000-0000000000e1') as ev \gset
select t.kind, t.name, t.event_id = '22222222-5555-0000-0000-0000000000e1' as for_the_event,
       (select count(*) from public.chat_thread_members m where m.thread_id = t.id) as roster
  from public.chat_threads t where t.id = :'ev';

\echo ''
\echo '== 10b. the second person going joins the same group, not a second one =='
\echo '   expect: t same_thread | 2 roster | 1 event group in the table. The'
\echo '   thread is made lazily by whoever opens it first, and event_id is unique'
\echo '   so a simultaneous tap from two people is a re-select and not two'
\echo '   groups holding half a conversation each.'
savepoint second_joiner;
set local role postgres;
set local request.jwt.claims = '{"sub":"bbbbbbbb-5555-0000-0000-000000000002","role":"authenticated"}';
set local role authenticated;
insert into public.event_rsvps (event_id, member_id, status)
values ('22222222-5555-0000-0000-0000000000e1', auth.uid(), 'going');
select public.chat_join_event_group('22222222-5555-0000-0000-0000000000e1') = :'ev' as same_thread;
select public.chat_join_event_group('22222222-5555-0000-0000-0000000000e1') = :'ev' as same_again;
set local role postgres;
select (select count(*) from public.chat_thread_members where thread_id = :'ev') as roster,
       (select count(*) from public.chat_threads where event_id is not null) as event_groups;
set local request.jwt.claims = '{"sub":"aaaaaaaa-5555-0000-0000-000000000001","role":"authenticated"}';
set local role authenticated;

\echo ''
\echo '== 10c. changing your mind about the event does not take you out =='
\echo '   expect: t still_in_it after the RSVP is deleted, and the group still'
\echo '   opens. Un-RSVPing is a sentence about a day, not about a conversation'
\echo '   somebody is in — there is no trigger across the two, deliberately.'
delete from public.event_rsvps
 where event_id = '22222222-5555-0000-0000-0000000000e1' and member_id = auth.uid();
select public.is_thread_member(:'ev') as still_in_it;
select public.chat_join_event_group('22222222-5555-0000-0000-0000000000e1') = :'ev' as still_opens;
rollback to savepoint second_joiner;

\echo ''
\echo '== 10d. an event group does not take members by hand =='
\echo '   expect: ERROR. Its roster is the people who said they are going, and'
\echo '   each of them joins it themselves. Two answers to "who is in this'
\echo '   group" is one too many.'
savepoint add_to_event_group;
select public.chat_add_to_group(:'ev', 'cccccccc-5555-0000-0000-000000000003');
rollback to savepoint add_to_event_group;

\echo ''
\echo '== 11. an event that is over takes no new joins =='
\echo '   expect: ERROR even with a going RSVP, then t — whoever was already in'
\echo '   it still opens it. A group chat that can still be joined a year later'
\echo '   is a mailing list for a day that happened.'
savepoint past_event;
insert into public.event_rsvps (event_id, member_id, status)
values ('22222222-5555-0000-0000-0000000000e2', auth.uid(), 'going');
savepoint join_past;
select public.chat_join_event_group('22222222-5555-0000-0000-0000000000e2');
rollback to savepoint join_past;
set local role postgres;
insert into public.chat_threads (id, kind, name, event_id, created_by)
values ('33333333-5555-0000-0000-000000000033', 'group', 'Last spring''s rolling picnic',
        '22222222-5555-0000-0000-0000000000e2', 'aaaaaaaa-5555-0000-0000-000000000001');
insert into public.chat_thread_members (thread_id, member_id)
values ('33333333-5555-0000-0000-000000000033', 'aaaaaaaa-5555-0000-0000-000000000001');
set local request.jwt.claims = '{"sub":"aaaaaaaa-5555-0000-0000-000000000001","role":"authenticated"}';
set local role authenticated;
select public.chat_join_event_group('22222222-5555-0000-0000-0000000000e2')
       = '33333333-5555-0000-0000-000000000033' as already_in_still_opens;
rollback to savepoint past_event;

\echo ''
\echo '== 12. a long event title is cut, and says it was cut =='
\echo '   expect: 60 characters ending in an ellipsis. chat_threads.name stops'
\echo '   at 60 and a scraped feed does not; cutting at 60 leaves a name that'
\echo '   looks like somebody typed it and stopped.'
savepoint long_title;
set local role postgres;
insert into public.events (id, feed_id, external_id, title, start_time)
values ('22222222-5555-0000-0000-0000000000e3', '11111111-5555-0000-0000-0000000000f1', 'probe-long',
        'An extremely long and thoroughly over-described adaptive recreation afternoon',
        now() + interval '20 days');
set local request.jwt.claims = '{"sub":"aaaaaaaa-5555-0000-0000-000000000001","role":"authenticated"}';
set local role authenticated;
insert into public.event_rsvps (event_id, member_id, status)
values ('22222222-5555-0000-0000-0000000000e3', auth.uid(), 'going');
-- Two statements, not one. A call to the function inside the where clause of a
-- select on chat_threads returns nothing: the select policy is a security
-- barrier qual and is applied to the rows before the volatile function in the
-- where clause has created the one being looked for.
select public.chat_join_event_group('22222222-5555-0000-0000-0000000000e3') as long_group \gset
select char_length(t.name) as name_length, right(t.name, 1) = '…' as ends_cut, t.name
  from public.chat_threads t where t.id = :'long_group';
rollback to savepoint long_title;

\echo ''
\echo '== 13. a suspended member reads a group and does not write to it =='
\echo '   expect: t a_member | f active | 1 thread, then ERROR on the message,'
\echo '   ERROR on starting a group and ERROR on adding — and DELETE 1 for'
\echo '   leaving. Reading is not what suspension takes away, and a door that'
\echo '   opens and does not close is worse than no door.'
savepoint suspended_caller;
set local role postgres;
insert into public.chat_thread_members (thread_id, member_id)
values (:'grp', 'ffffffff-5555-0000-0000-000000000006');
set local request.jwt.claims = '{"sub":"ffffffff-5555-0000-0000-000000000006","role":"authenticated"}';
set local role authenticated;
select public.is_member() as a_member, public.is_active_member() as active,
       (select count(*) from public.chat_threads) as threads_i_see;
savepoint suspended_writes;
insert into public.chat_messages (thread_id, author_id, body)
values (:'grp', 'ffffffff-5555-0000-0000-000000000006', 'Still here.');
rollback to savepoint suspended_writes;
savepoint suspended_creates;
select public.chat_create_group('Mine', array['aaaaaaaa-5555-0000-0000-000000000001'::uuid]);
rollback to savepoint suspended_creates;
savepoint suspended_adds;
select public.chat_add_to_group(:'grp', 'cccccccc-5555-0000-0000-000000000003');
rollback to savepoint suspended_adds;
delete from public.chat_thread_members where thread_id = :'grp' and member_id = auth.uid();
select public.is_thread_member(:'grp') as still_in_it;
rollback to savepoint suspended_caller;

\echo ''
\echo '== 14. a member cannot reach the tables around the functions =='
\echo '   THE STEP THAT MATTERS for the grants. expect: permission denied four'
\echo '   times — not four zero-row no-ops. Supabase grants every privilege on a'
\echo '   new table by default, so revoking from anon and public only leaves'
\echo '   insert, update and delete in place and RLS fails them silently:'
\echo '   `update ...` reports UPDATE 0 and succeeds.'
savepoint no_insert_group;
insert into public.chat_threads (kind, name, created_by)
values ('group', 'Forged', auth.uid());
rollback to savepoint no_insert_group;
savepoint no_rename;
update public.chat_threads set name = 'Renamed by a member' where id = :'grp';
rollback to savepoint no_rename;
savepoint no_add_roster;
insert into public.chat_thread_members (thread_id, member_id)
values (:'grp', 'eeeeeeee-5555-0000-0000-000000000005');
rollback to savepoint no_add_roster;
savepoint no_evict;
delete from public.chat_thread_members
 where thread_id = :'grp' and member_id = 'bbbbbbbb-5555-0000-0000-000000000002';
select count(*) as roster_after_trying_to_evict
  from public.chat_thread_members where thread_id = :'grp';
rollback to savepoint no_evict;

\echo ''
\echo '== 15. the cap =='
\echo '   expect: ERROR past 50, and ERROR adding to a full group. Not a scaling'
\echo '   limit: a flat thread bigger than this is a room without a room''s'
\echo '   reading rules, and the club has rooms.'
savepoint cap;
set local role postgres;
insert into public.members (id, type, status, display_name, phone, birth_date, level_range, state, show_in_browse)
select ('cafe0000-5555-0000-0000-' || lpad(n::text, 12, '0'))::uuid,
       'peer', 'active', 'Crowd ' || n, '1999006' || lpad(n::text, 4, '0'),
       '1980-01-01', 'T1–T6', 'CA', true
  from generate_series(1, 60) as n;
set local request.jwt.claims = '{"sub":"aaaaaaaa-5555-0000-0000-000000000001","role":"authenticated"}';
set local role authenticated;
savepoint over_cap;
select public.chat_create_group('Too many', (
  select array_agg(('cafe0000-5555-0000-0000-' || lpad(n::text, 12, '0'))::uuid)
    from generate_series(1, 50) as n));
rollback to savepoint over_cap;
select public.chat_create_group('Exactly full', (
  select array_agg(('cafe0000-5555-0000-0000-' || lpad(n::text, 12, '0'))::uuid)
    from generate_series(1, 49) as n)) as full_group \gset
select count(*) as roster from public.chat_thread_members where thread_id = :'full_group';
savepoint one_too_many;
select public.chat_add_to_group(:'full_group', 'bbbbbbbb-5555-0000-0000-000000000002');
rollback to savepoint one_too_many;
\echo '   ...and somebody already in a full group is still a no-op, not a refusal:'
select public.chat_add_to_group(:'full_group', 'cafe0000-5555-0000-0000-000000000001');
rollback to savepoint cap;

\echo ''
\echo '== done. nothing above was written. =='
rollback;
