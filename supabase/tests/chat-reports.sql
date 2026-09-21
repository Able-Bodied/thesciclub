-- ============================================================================
-- Reporting: what one member can hand to the administrators, and the very much
-- longer list of what they cannot. Run as members, under RLS.
-- ============================================================================
--   docker run --rm -i --network host -e PGPASSWORD=postgres postgres:17-alpine \
--     psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
--     -f - < supabase/tests/chat-reports.sql
--
-- It rolls back and is safe to re-run. Do not point it at the hosted project.
--
-- Three steps carry the feature and are marked in place:
--
--   5  — a member who is not in a direct conversation cannot report a message
--        in it. **THE step.** chat_report_message is security definer, so RLS
--        is off inside it and the select policy on chat_messages is protecting
--        nothing; the is_thread_member() line is the entire defence. Without
--        it, anybody holding a message id can push a private message onto the
--        administrators' screen — a disclosure the two people in the
--        conversation never chose, made by somebody who was not in it.
--   10 — the reporter can read back three columns and not a fourth. The grant
--        is column-level so that the client can draw "Reported" and nothing
--        else; a reporter who could select body_snapshot would have a second,
--        API-readable copy of somebody else's words.
--   14 — the administrators' list carries no thread id. If it did, the next
--        reasonable-looking change would be a "see the context" link, and the
--        promise that a conversation is private even from administrators would
--        be gone without anybody deciding to end it.
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
  ('aaaaaaaa-7777-0000-0000-000000000001', 'peer',   'active',    'Ada A',       '19990007001', '1980-01-01', 'T1–T6',  'CA', true,  false),
  ('bbbbbbbb-7777-0000-0000-000000000002', 'peer',   'active',    'Bo B',        '19990007002', '1981-01-01', 'C5–C8',  'CA', true,  false),
  ('dddddddd-7777-0000-0000-000000000004', 'peer',   'active',    'Onlooker O',  '19990007004', '1983-01-01', 'L1–S5',  'CA', true,  false),
  ('ffffffff-7777-0000-0000-000000000006', 'peer',   'suspended', 'Suspended S', '19990007006', '1985-01-01', 'C5–C8',  'CA', true,  false),
  ('99999999-7777-0000-0000-000000000007', 'mentor', 'active',    'Admin A',     '19990007007', '1986-01-01', 'T1–T6',  'CA', true,  true);

-- One of the twelve is open and one is not. A member can read the first and
-- cannot see that the second exists.
update public.chat_rooms set opened_at = now() where id = 'bowel';
update public.chat_rooms set opened_at = null where id = 'skin';

-- A topic in the open room, started by Bo, and a reply from Ada so that there
-- is a post of her own for her to fail to report.
insert into public.chat_topics (id, room_id, title, author_id)
values ('11111111-7777-0000-0000-00000000a001'::uuid, 'bowel', 'What fits in a rucksack',
        'bbbbbbbb-7777-0000-0000-000000000002');
insert into public.chat_posts (id, topic_id, author_id, body)
values
  ('22222222-7777-0000-0000-00000000b001', '11111111-7777-0000-0000-00000000a001',
   'bbbbbbbb-7777-0000-0000-000000000002', 'Buy my miracle supplement, cash only.'),
  ('22222222-7777-0000-0000-00000000b002', '11111111-7777-0000-0000-00000000a001',
   'aaaaaaaa-7777-0000-0000-000000000001', 'A post of Ada''s own.'),
  ('22222222-7777-0000-0000-00000000b003', '11111111-7777-0000-0000-00000000a001',
   'bbbbbbbb-7777-0000-0000-000000000002', 'Already taken down.');

-- A topic in the room nobody can see.
insert into public.chat_topics (id, room_id, title, author_id)
values ('11111111-7777-0000-0000-00000000a002'::uuid, 'skin', 'Seeded while closed',
        'bbbbbbbb-7777-0000-0000-000000000002');
insert into public.chat_posts (id, topic_id, author_id, body)
values ('22222222-7777-0000-0000-00000000b009', '11111111-7777-0000-0000-00000000a002',
        'bbbbbbbb-7777-0000-0000-000000000002', 'Nobody outside can read this.');

\set QUIET off
\echo ''
\echo '== 0. we are a signed-in ordinary member, not the superuser =='
\echo '   expect: authenticated | aaaaaaaa-7777-... | t a_member | f admin'
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-7777-0000-0000-000000000001","role":"authenticated"}';
select current_user, auth.uid()::text as uid,
       public.is_member() as a_member, public.is_admin() as admin;

\echo ''
\echo '== 0a. a post has to be removable before it can be "already removed" =='
\echo '   expect: t. Ada is not the author, so this is the administrator path —'
\echo '   except she is not one either. Done as Bo, its author, below.'
set local request.jwt.claims = '{"sub":"bbbbbbbb-7777-0000-0000-000000000002","role":"authenticated"}';
select public.chat_remove_post('22222222-7777-0000-0000-00000000b003');
set local request.jwt.claims = '{"sub":"aaaaaaaa-7777-0000-0000-000000000001","role":"authenticated"}';

\echo ''
\echo '== 1. reporting a post in a room you can read =='
\echo '   expect: no error, one row, post, Bowel management › What fits in a'
\echo '   rucksack, the words as they were, and the post''s own written_at.'
select public.chat_report_post('22222222-7777-0000-0000-00000000b001',
  'Selling to members.');
select count(*) as rows from public.chat_reports;
-- Read back as the superuser: the reporter is not granted these columns, which
-- is step 10's business. This is about what was stored.
reset role;
select r.kind, r.place, r.body_snapshot, r.note,
       r.written_at = p.created_at as kept_the_posts_own_time,
       r.topic_id is not null and r.room_id = 'bowel' as can_open_the_topic
  from public.chat_reports r
  join public.chat_posts p on p.id = r.post_id;
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-7777-0000-0000-000000000001","role":"authenticated"}';

\echo ''
\echo '== 2. your own post is not reportable =='
\echo '   expect: ERROR. Removing it is the control for that, and it is already'
\echo '   on the screen beside this one.'
savepoint own_post;
select public.chat_report_post('22222222-7777-0000-0000-00000000b002', null);
rollback to savepoint own_post;

\echo ''
\echo '== 3. a post in a room you cannot see is not reportable =='
\echo '   expect: ERROR, and the same "no such post" a missing id gets — a'
\echo '   different sentence would confirm that the closed room has something'
\echo '   in it.'
savepoint closed_room;
select public.chat_report_post('22222222-7777-0000-0000-00000000b009', null);
rollback to savepoint closed_room;

\echo ''
\echo '== 4. a post that has already been removed is not reportable =='
\echo '   expect: ERROR. Its body is blank, so the snapshot would be blank, and'
\echo '   whoever removed it has already acted.'
savepoint gone_already;
select public.chat_report_post('22222222-7777-0000-0000-00000000b003', null);
rollback to savepoint gone_already;

-- ---------------------------------------------------------------- messages
\echo ''
\echo '== 4a. a conversation between Ada and Bo, and a group with Onlooker in it =='
\echo '   expect: two thread ids and three messages. Set-up, not the test.'
select public.chat_open_direct('bbbbbbbb-7777-0000-0000-000000000002') as dm \gset
insert into public.chat_messages (thread_id, author_id, body)
values (:'dm', 'aaaaaaaa-7777-0000-0000-000000000001', 'A message of Ada''s own.');
select public.chat_create_group('Saturday ride',
  array['bbbbbbbb-7777-0000-0000-000000000002'::uuid,
        'dddddddd-7777-0000-0000-000000000004'::uuid]) as grp \gset

set local request.jwt.claims = '{"sub":"bbbbbbbb-7777-0000-0000-000000000002","role":"authenticated"}';
insert into public.chat_messages (thread_id, author_id, body)
values (:'dm', 'bbbbbbbb-7777-0000-0000-000000000002', 'Something nobody else should ever read.')
returning id as nasty \gset
insert into public.chat_messages (thread_id, author_id, body)
values (:'grp', 'bbbbbbbb-7777-0000-0000-000000000002', 'And something in the group.')
returning id as in_group \gset
select :'dm' <> :'grp' as two_threads;

\echo ''
\echo '== 5. *** somebody outside the conversation cannot report a message in it ***'
\echo '   expect: ERROR, as Onlooker, who holds the id and is not on the roster.'
\echo '   THE step. Without the is_thread_member() check inside the function,'
\echo '   anybody holding a message id could push a private message onto the'
\echo '   administrators'' screen. Sabotage it and this step must go red.'
savepoint outsider;
set local request.jwt.claims = '{"sub":"dddddddd-7777-0000-0000-000000000004","role":"authenticated"}';
select public.chat_report_message(:'nasty', 'I found this id somewhere.');
rollback to savepoint outsider;

\echo ''
\echo '== 5a. nor can an administrator who is not in it =='
\echo '   expect: ERROR. chat_remove_message lets an administrator act on an id'
\echo '   they were handed; filing a report about a conversation they are not in'
\echo '   would mean reading it.'
savepoint admin_outsider;
set local request.jwt.claims = '{"sub":"99999999-7777-0000-0000-000000000007","role":"authenticated"}';
select public.chat_report_message(:'nasty', null);
rollback to savepoint admin_outsider;

\echo ''
\echo '== 6. the person it was sent to can report it =='
\echo '   expect: no error, then: message | A direct conversation | the words.'
\echo '   "A direct conversation" is all the place says. A pair has no name and'
\echo '   is not given one.'
set local request.jwt.claims = '{"sub":"aaaaaaaa-7777-0000-0000-000000000001","role":"authenticated"}';
select public.chat_report_message(:'nasty', 'This is what I meant.');
reset role;
select kind, place, body_snapshot, note from public.chat_reports where message_id = :'nasty';
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-7777-0000-0000-000000000001","role":"authenticated"}';

\echo ''
\echo '== 6a. a group''s message is placed by the group''s name =='
\echo '   expect: Saturday ride. A group has a name somebody chose and it is'
\echo '   not private from the people in it.'
select public.chat_report_message(:'in_group', null);
reset role;
select place from public.chat_reports where message_id = :'in_group';
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-7777-0000-0000-000000000001","role":"authenticated"}';

\echo ''
\echo '== 7. your own message is not reportable =='
\echo '   expect: ERROR.'
savepoint own_message;
select public.chat_report_message(
  (select id from public.chat_messages
    where thread_id = :'dm' and author_id = 'aaaaaaaa-7777-0000-0000-000000000001'
    limit 1), null);
rollback to savepoint own_message;

\echo ''
\echo '== 8. reporting the same message twice is one row and no error =='
\echo '   expect: no error and 1 row. A member who taps it again because'
\echo '   nothing visibly happened has not done anything wrong.'
select public.chat_report_message(:'nasty', 'A different note this time.');
reset role;
select count(*) as rows_for_that_message from public.chat_reports where message_id = :'nasty';
select note as note_is_still_the_first_one from public.chat_reports where message_id = :'nasty';
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-7777-0000-0000-000000000001","role":"authenticated"}';

\echo ''
\echo '== 9. the snapshot survives the author taking the message back =='
\echo '   expect: blank body on the message, and the words still in the report.'
\echo '   This is why the report copies rather than points: otherwise the'
\echo '   fastest way out of a complaint would be to remove what you sent.'
set local request.jwt.claims = '{"sub":"bbbbbbbb-7777-0000-0000-000000000002","role":"authenticated"}';
select public.chat_remove_message(:'nasty');
reset role;
select m.body = '' as message_is_blank, r.body_snapshot as report_still_says
  from public.chat_messages m join public.chat_reports r on r.message_id = m.id
 where m.id = :'nasty';
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-7777-0000-0000-000000000001","role":"authenticated"}';

\echo ''
\echo '== 10. *** the reporter reads back three columns, and not a fourth ***'
\echo '   expect: 3 rows of ids, then an ERROR on body_snapshot. The grant is'
\echo '   column-level so the client can draw "Reported" and learn nothing else'
\echo '   — not the snapshot, not its own note back, not whether anybody acted.'
select id is not null as has_id, post_id is not null as about_a_post,
       message_id is not null as about_a_message
  from public.chat_reports order by about_a_post desc, about_a_message desc;
savepoint reads_the_snapshot;
select body_snapshot from public.chat_reports;
rollback to savepoint reads_the_snapshot;
savepoint reads_its_note;
select note from public.chat_reports;
rollback to savepoint reads_its_note;

\echo ''
\echo '== 11. another member sees no reports at all =='
\echo '   expect: 0. Not "somebody reported something", not a count — nothing.'
set local request.jwt.claims = '{"sub":"dddddddd-7777-0000-0000-000000000004","role":"authenticated"}';
select count(*) as rows_onlooker_can_see from public.chat_reports;

\echo ''
\echo '== 12. every verb the table does not grant is refused, not a no-op =='
\echo '   expect: three ERRORs saying permission denied. RLS alone would report'
\echo '   UPDATE 0 and DELETE 0 and succeed — the Phase 1 lesson, which is why'
\echo '   the revoke names `authenticated`.'
set local request.jwt.claims = '{"sub":"aaaaaaaa-7777-0000-0000-000000000001","role":"authenticated"}';
savepoint tries_insert;
insert into public.chat_reports (kind, post_id, reporter_id, body_snapshot, written_at, place)
values ('post', '22222222-7777-0000-0000-00000000b001',
        'aaaaaaaa-7777-0000-0000-000000000001', 'made up', now(), 'nowhere');
rollback to savepoint tries_insert;
savepoint tries_update;
update public.chat_reports set resolved_at = now();
rollback to savepoint tries_update;
savepoint tries_delete;
delete from public.chat_reports;
rollback to savepoint tries_delete;

\echo ''
\echo '== 13. a member cannot read or resolve the administrators'' list =='
\echo '   expect: two ERRORs. Both functions are definer, so their own is_admin()'
\echo '   line is the whole of the access control.'
savepoint peer_reads;
select count(*) from public.admin_chat_reports();
rollback to savepoint peer_reads;
savepoint peer_resolves;
select public.admin_resolve_chat_report(
  (select id from public.chat_reports limit 1), 'Nothing to see here.');
rollback to savepoint peer_resolves;

\echo ''
\echo '== 14. *** what an administrator is given, and what they are not ***'
\echo '   expect: 3 reports, open ones first; Bo named as the author and Ada as'
\echo '   the reporter; the direct-message one says "A direct conversation" and'
\echo '   carries no room or topic to follow. There is no thread id in the'
\echo '   answer at all — see the column list below.'
set local request.jwt.claims = '{"sub":"99999999-7777-0000-0000-000000000007","role":"authenticated"}';
select kind, place, reported_author_name, reporter_name, report_count,
       already_removed, resolved_at is null as still_open,
       (topic_id is not null or room_id is not null) as has_a_way_back
  from public.admin_chat_reports()
 order by place;
\echo '   the whole column list, which must contain no thread id:'
select string_agg(a.attname, ', ' order by a.attnum) as columns
  from pg_proc p
  join unnest(p.proallargtypes, p.proargnames)
       with ordinality as a(atttypid, attname, attnum) on true
 where p.proname = 'admin_chat_reports' and a.attname is not null;

\echo ''
\echo '== 14a. two members reporting the same thing is two rows and one count =='
\echo '   expect: report_count 2 on the group message. Nothing is automatic at'
\echo '   any number — a strike stays a person''s decision on the member''s row.'
set local request.jwt.claims = '{"sub":"dddddddd-7777-0000-0000-000000000004","role":"authenticated"}';
select public.chat_report_message(:'in_group', 'Same here.');
set local request.jwt.claims = '{"sub":"99999999-7777-0000-0000-000000000007","role":"authenticated"}';
select report_count from public.admin_chat_reports() where place = 'Saturday ride' limit 1;

\echo ''
\echo '== 15. resolving takes a sentence, and takes it once =='
\echo '   expect: ERROR on the blank one, then no error twice, and the first'
\echo '   sentence still standing — two taps on a slow connection must'
\echo '   not rewrite who decided or what they said.'
select id as rep from public.admin_chat_reports() where kind = 'post' limit 1 \gset
savepoint blank_resolution;
select public.admin_resolve_chat_report(:'rep', '   ');
rollback to savepoint blank_resolution;
select public.admin_resolve_chat_report(:'rep', 'Removed the post and spoke to Bo.');
select public.admin_resolve_chat_report(:'rep', 'Changed my mind.');
select resolution, resolved_by_name, resolved_at is not null as has_a_time
  from public.admin_chat_reports() where id = :'rep';

\echo ''
\echo '== 15a. resolved reports sort below the open ones =='
\echo '   expect: the three open ones first, the resolved one last.'
select resolved_at is null as still_open, place from public.admin_chat_reports();

\echo ''
\echo '== 16. somebody paused can still say what was done to them =='
\echo '   expect: t reads | f writes, then no error. is_member() and not'
\echo '   is_active_member(): being unable to write in a room is not the same'
\echo '   as being unable to report what somebody wrote in one.'
reset role;
insert into public.chat_thread_members (thread_id, member_id)
values (:'grp', 'ffffffff-7777-0000-0000-000000000006');
set local role authenticated;
set local request.jwt.claims = '{"sub":"ffffffff-7777-0000-0000-000000000006","role":"authenticated"}';
select public.is_member() as reads, public.is_active_member() as writes;
select public.chat_report_message(:'in_group', 'Paused, and still reporting.');

\echo ''
\echo '== 17. nothing here is on the wire =='
\echo '   expect: 0. Realtime reads tables and applies their select policy, so a'
\echo '   published chat_reports would put a report — and the words it quotes —'
\echo '   on a socket the moment it is filed.'
reset role;
select count(*) as published from pg_publication_tables
 where pubname = 'supabase_realtime' and tablename = 'chat_reports';

rollback;
\echo ''
\echo '== rolled back =='
