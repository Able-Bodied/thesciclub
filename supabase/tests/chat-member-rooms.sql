-- ============================================================================
-- Member-started rooms: who can open one, what stops a second one, and what
-- nobody can do to a room once it exists. Run as members, under RLS.
-- ============================================================================
--   docker run --rm -i --network host -e PGPASSWORD=postgres postgres:17-alpine \
--     psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
--     -f - < supabase/tests/chat-member-rooms.sql
--
-- It rolls back and is safe to re-run. Do not point it at the hosted project.
--
-- Two steps carry the feature and are marked in place:
--
--   4  — two rooms cannot share a name, case and spacing ignored. **THE step.**
--        The split conversation is exactly what the twelve seeded rooms exist
--        to prevent, and the second "Shoulder pain" is always the one that
--        looks abandoned. The unique index is on lower(name); the function
--        checks first so that a member gets the existing room's name rather
--        than a constraint violation.
--   6  — a member who has started a room with nothing in it cannot start
--        another. It cannot fire in the ordinary course of things, because
--        chat_create_room writes the first topic itself and nothing in this
--        build deletes a topic — so the step has to empty the room as the
--        superuser to reach the check at all. That is the point of running it:
--        the latch is there for the day topics can be deleted, and a latch
--        nobody has ever heard click is a latch that does not exist.
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
  ('aaaaaaaa-8888-0000-0000-000000000001', 'peer',   'active',    'Ada A',       '19990008001', '1980-01-01', 'T1–T6', 'CA', true,  false),
  ('bbbbbbbb-8888-0000-0000-000000000002', 'peer',   'active',    'Bo B',        '19990008002', '1981-01-01', 'C5–C8', 'CA', true,  false),
  ('ffffffff-8888-0000-0000-000000000006', 'peer',   'suspended', 'Suspended S', '19990008006', '1985-01-01', 'C5–C8', 'CA', true,  false),
  ('99999999-8888-0000-0000-000000000007', 'mentor', 'active',    'Admin A',     '19990008007', '1986-01-01', 'T1–T6', 'CA', true,  true);

-- One of the seeded twelve is open, so that "the seeded ones keep working"
-- means something in the steps below.
update public.chat_rooms set opened_at = now() where id = 'bowel';

-- Any member rooms a developer has started by hand go first, inside the
-- transaction that rolls back. Names are unique, and the steps below start
-- rooms with ordinary names — "Shoulder pain", "Sailing" — so without this the
-- probe fails on its own realism the second time somebody uses the app locally.
delete from public.chat_rooms where created_by is not null;

\set QUIET off
\echo ''
\echo '== 0. we are a signed-in ordinary member, not the superuser =='
\echo '   expect: authenticated | aaaaaaaa-8888-... | t a_member | f admin'
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-8888-0000-0000-000000000001","role":"authenticated"}';
select current_user, auth.uid()::text as uid,
       public.is_member() as a_member, public.is_admin() as admin;

\echo ''
\echo '== 1. a member starts a room =='
\echo '   expect: an id of the shape shoulder-pain-xxxx.'
select public.chat_create_room(
  'Shoulder pain',
  'Overuse, transfers, and what actually helped.',
  'Body',
  'Twenty years of pushing',
  'My right shoulder has had enough. What did you change first?'
) as room_a \gset
select :'room_a' as id, :'room_a' like 'shoulder-pain-%' as slug_of_the_name;

\echo ''
\echo '== 2. the room is open from birth, has its starter, and has one topic =='
\echo '   expect: t open | t started_by_ada | t no_icon | t sorts_after_the_twelve,'
\echo '   then 1 member and 1 topic and 1 post. There is nobody to open a member'
\echo '   room, so it opens itself; and it cannot be born empty, which is the'
\echo '   whole answer to the objection in CONTEXT.md.'
select opened_at is not null as open,
       created_by = 'aaaaaaaa-8888-0000-0000-000000000001'::uuid as started_by_ada,
       icon is null as no_icon,
       sort_order >= 1000 as sorts_after_the_twelve
  from public.chat_rooms where id = :'room_a';
select
  (select count(*) from public.chat_room_members m where m.room_id = :'room_a') as members,
  (select count(*) from public.chat_topics t where t.room_id = :'room_a') as topics,
  (select count(*) from public.chat_posts p
     join public.chat_topics t on t.id = p.topic_id where t.room_id = :'room_a') as posts;

\echo ''
\echo '== 3. another member can read it at once =='
\echo '   expect: t sees_the_room | t can_read_it | Twenty years of pushing.'
\echo '   No administrator opened it and Bo did not join it. An open room and'
\echo '   everything in it is readable by every member — the same promise /chat'
\echo '   makes about the seeded twelve.'
set local request.jwt.claims = '{"sub":"bbbbbbbb-8888-0000-0000-000000000002","role":"authenticated"}';
select exists (select 1 from public.chat_rooms where id = :'room_a') as sees_the_room,
       public.chat_room_is_readable(:'room_a') as can_read_it;
select title from public.chat_topics where room_id = :'room_a';

\echo ''
\echo '== 4. **THE step** — the same name again is refused, whatever the case =='
\echo '   expect: two ERRORs, each naming the room that already exists. Not a'
\echo '   unique-constraint violation: "There is already a room called Shoulder'
\echo '   pain" is what somebody can act on. The second one is the case that'
\echo '   got through the first draft — lowercasing alone let "SHOULDER   pain"'
\echo '   past, because the extra spaces made it a different string.'
savepoint dupe_exact;
select public.chat_create_room('Shoulder pain', 'Another one just like it.', 'Body',
                               'Also shoulders', 'Same subject, second room.');
rollback to savepoint dupe_exact;
savepoint dupe_case;
select public.chat_create_room('  SHOULDER   pain  ', 'Another one just like it.', 'Body',
                               'Also shoulders', 'Same subject, second room.');
rollback to savepoint dupe_case;

\echo ''
\echo '== 5. a second room with a different name is allowed =='
\echo '   expect: no error. The rule is one room per subject, not one room per'
\echo '   member.'
set local request.jwt.claims = '{"sub":"aaaaaaaa-8888-0000-0000-000000000001","role":"authenticated"}';
select public.chat_create_room(
  'Hand cycling',
  'Bikes, hills, and where to try one before buying.',
  'Life',
  'First ride',
  'What should I know before the first time out?'
) as room_b \gset
select :'room_b' as id;

\echo ''
\echo '== 6. **THE step** — an empty room of your own blocks the next one =='
\echo '   expect: ERROR naming Hand cycling, then success once the topic is'
\echo '   back. Nothing in this build deletes a topic, so the superuser has to'
\echo '   empty the room for the check to be reachable at all.'
savepoint emptied;
reset role;
delete from public.chat_topics where room_id = :'room_b';
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-8888-0000-0000-000000000001","role":"authenticated"}';
savepoint rate_limited;
select public.chat_create_room('Sailing', 'Adaptive dinghies and who runs them.', 'Life',
                               'Where to start', 'Has anybody sailed since their injury?');
rollback to savepoint rate_limited;
rollback to savepoint emptied;
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-8888-0000-0000-000000000001","role":"authenticated"}';
select public.chat_create_room('Sailing', 'Adaptive dinghies and who runs them.', 'Life',
                               'Where to start', 'Has anybody sailed since their injury?') is not null
  as started_once_the_room_was_filled;

\echo ''
\echo '== 7. an administrator is exempt from that one rule =='
\echo '   expect: no error, with a room of their own left empty. Somebody has'
\echo '   to be able to seed, and being blocked by a room they opened for'
\echo '   somebody else is not a moderation policy.'
reset role;
insert into public.chat_rooms (id, name, description, category, icon, sort_order, opened_at, created_by)
values ('admin-empty-0000', 'An empty one', 'Nothing in it at all, deliberately.', 'Kit',
        null, 1500, now(), '99999999-8888-0000-0000-000000000007');
set local role authenticated;
set local request.jwt.claims = '{"sub":"99999999-8888-0000-0000-000000000007","role":"authenticated"}';
select public.chat_create_room('Wheelchair rugby', 'Chairs, clubs, and the first session.', 'Life',
                               'Where do I try it', 'Who runs a come-and-try day?') is not null
  as an_admin_is_not_rate_limited;

\echo ''
\echo '== 8. somebody paused cannot start a room =='
\echo '   expect: t reads | f writes, then ERROR. Starting a room is writing,'
\echo '   and a suspended member reads and does not write.'
set local request.jwt.claims = '{"sub":"ffffffff-8888-0000-0000-000000000006","role":"authenticated"}';
select public.is_member() as reads, public.is_active_member() as writes;
savepoint suspended;
select public.chat_create_room('Paused persons club', 'Should not exist at all.', 'Life',
                               'Nope', 'Nope.');
rollback to savepoint suspended;

\echo ''
\echo '== 9. a category that is not one of the six is refused =='
\echo '   expect: ERROR. The column check would catch it too; the function says'
\echo '   which six rather than quoting the constraint.'
set local request.jwt.claims = '{"sub":"aaaaaaaa-8888-0000-0000-000000000001","role":"authenticated"}';
savepoint bad_category;
select public.chat_create_room('Somewhere else', 'A room outside the six.', 'Admin',
                               'Hello', 'Hello.');
rollback to savepoint bad_category;

\echo ''
\echo '== 9a. the three categories added on 2026-09-21 are accepted =='
\echo '   expect: no error and three rows — Mind, Family, Places. Mental health'
\echo '   and living independently were the two profile topics with no room to'
\echo '   go to; these are the headings a member starts those rooms under.'
select public.chat_create_room('Grief and the first year', 'The part nobody photographs.', 'Mind',
                               'The first anniversary', 'How did you get through it?');
select public.chat_create_room('Parenting from a chair', 'Kids, partners, and the people who help.', 'Family',
                               'School run', 'What works for pick-up?');
select public.chat_create_room('Airports that work', 'Which ones have a lift that lifts.', 'Places',
                               'SFO', 'Terminal 2 is fine. Terminal 1 is not.');
reset role;
select category, name from public.chat_rooms
 where created_by = 'aaaaaaaa-8888-0000-0000-000000000001'
   and category in ('Mind', 'Family', 'Places')
 order by sort_order;
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-8888-0000-0000-000000000001","role":"authenticated"}';

\echo ''
\echo '== 10. a name or a description that is too short or too long is refused =='
\echo '   expect: four ERRORs. Trimmed first, so spaces do not buy length.'
savepoint short_name;
select public.chat_create_room('  A  ', 'A perfectly fine description of it.', 'Life',
                               'Hello', 'Hello.');
rollback to savepoint short_name;
savepoint long_name;
select public.chat_create_room(repeat('x', 41), 'A perfectly fine description of it.', 'Life',
                               'Hello', 'Hello.');
rollback to savepoint long_name;
savepoint short_description;
select public.chat_create_room('A fine name', '  short ', 'Life', 'Hello', 'Hello.');
rollback to savepoint short_description;
savepoint long_description;
select public.chat_create_room('A fine name', repeat('x', 201), 'Life', 'Hello', 'Hello.');
rollback to savepoint long_description;

\echo ''
\echo '== 11. an empty topic is refused, and takes the room with it =='
\echo '   expect: ERROR from chat_posts'' own check constraint, then 0 rooms'
\echo '   called Half a room. The constraint''s wording is not a sentence to'
\echo '   show anybody, and it does not have to be: the screen keeps the submit'
\echo '   disabled until all five fields are filled. What this step is for is'
\echo '   the transaction — a room whose first topic failed must not survive'
\echo '   the attempt, or the next member to look finds an empty room.'
savepoint no_topic;
select public.chat_create_room('Half a room', 'It should not exist afterwards.', 'Life',
                               'A title', '   ');
rollback to savepoint no_topic;
select count(*) as half_rooms from public.chat_rooms where name = 'Half a room';

\echo ''
\echo '== 12. a member cannot reach the table around the function =='
\echo '   expect: three ERRORs, each "permission denied", not "0 rows". The'
\echo '   verbs were never granted to authenticated — revoking from anon and'
\echo '   public alone would leave an update reporting UPDATE 0 and succeeding.'
savepoint no_insert;
insert into public.chat_rooms (id, name, description, category, sort_order, opened_at)
values ('smuggled', 'Smuggled in', 'Straight past the function.', 'Life', 2000, now());
rollback to savepoint no_insert;
savepoint no_update;
update public.chat_rooms set name = 'Renamed by its starter' where id = :'room_a';
rollback to savepoint no_update;
savepoint no_delete;
delete from public.chat_rooms where id = :'room_a';
rollback to savepoint no_delete;

\echo ''
\echo '== 13. nobody renames or deletes a room, not even an administrator =='
\echo '   expect: two ERRORs. The topics in a room belong to whoever wrote'
\echo '   them, and closing it is the whole moderation lever.'
set local request.jwt.claims = '{"sub":"99999999-8888-0000-0000-000000000007","role":"authenticated"}';
savepoint admin_no_update;
update public.chat_rooms set name = 'Renamed by an administrator' where id = :'room_a';
rollback to savepoint admin_no_update;
savepoint admin_no_delete;
delete from public.chat_rooms where id = :'room_a';
rollback to savepoint admin_no_delete;

\echo ''
\echo '== 14. the close switch still works on a member room =='
\echo '   expect: null when closed, then a timestamp, and Bo loses sight of it'
\echo '   in between. The one control an administrator has over a room they did'
\echo '   not start is the one they already had.'
select public.admin_set_room_open(:'room_a', false) as closed;
set local request.jwt.claims = '{"sub":"bbbbbbbb-8888-0000-0000-000000000002","role":"authenticated"}';
select exists (select 1 from public.chat_rooms where id = :'room_a') as bo_still_sees_it,
       public.chat_room_is_readable(:'room_a') as bo_can_still_read_it;
set local request.jwt.claims = '{"sub":"99999999-8888-0000-0000-000000000007","role":"authenticated"}';
select public.admin_set_room_open(:'room_a', true) is not null as reopened;

\echo ''
\echo '== 15. a peer cannot work the switch =='
\echo '   expect: ERROR. Unchanged by this migration, and worth re-asking now'
\echo '   that a member can own a room — starting one is not moderating one.'
set local request.jwt.claims = '{"sub":"aaaaaaaa-8888-0000-0000-000000000001","role":"authenticated"}';
savepoint peer_switch;
select public.admin_set_room_open(:'room_a', false);
rollback to savepoint peer_switch;

\echo ''
\echo '== 16. the rooms are on the wire =='
\echo '   expect: 1. A room appearing on everybody''s list the moment it is'
\echo '   started is the point of letting members start them, and the select'
\echo '   policy still decides who is handed the row.'
reset role;
select count(*) as published from pg_publication_tables
 where pubname = 'supabase_realtime' and tablename = 'chat_rooms';

rollback;
\echo ''
\echo '== rolled back =='
