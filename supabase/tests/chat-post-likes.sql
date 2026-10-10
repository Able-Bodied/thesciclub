-- ============================================================================
-- Likes: who may like a post, and who may see who liked it. Run as members,
-- under RLS.
-- ============================================================================
--   docker run --rm -i --network host -e PGPASSWORD=postgres postgres:17-alpine \
--     psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
--     -f - < supabase/tests/chat-post-likes.sql
--
-- It rolls back and is safe to re-run. Do not point it at the hosted project.
--
-- 20260930010000, HOME-PLAN.md step 3. Two steps carry the feature and are
-- marked in place:
--
--   6 — a post in a closed room cannot be liked, and its likes cannot be read.
--       The names are the owner's decision to show, to the room's readers and
--       to nobody else; a closed room has no member readers, so it has no
--       visible likes either.
--   7 — another member reads who liked a post in an open room. That is
--       decision 4 itself: names shown.
--
-- Step 0 prints current_user because as the superuser every step below turns
-- green while proving nothing — `postgres` is BYPASSRLS. Every expected refusal
-- has its own savepoint; without one the first error aborts the transaction and
-- everything after it prints "current transaction is aborted", which in a long
-- log reads like a pass.
--
-- Nobody here has joined a room. Since 20260930000000 nothing needs it, and
-- liking is no exception.
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
  ('aaaaaaaa-7777-0000-0000-000000000001', 'peer',   'active',    'Liker L',   '19990007001', '1980-01-01', 'T1–T6',  'CA', true, false),
  ('bbbbbbbb-7777-0000-0000-000000000002', 'peer',   'active',    'Writer W',  '19990007002', '1981-01-01', 'C5–C8',  'CA', true, false),
  ('cccccccc-7777-0000-0000-000000000003', 'peer',   'active',    'Reader R',  '19990007003', '1982-01-01', 'T7–T12', 'CA', true, false),
  ('dddddddd-7777-0000-0000-000000000004', 'peer',   'suspended', 'Paused P',  '19990007004', '1983-01-01', 'L1–S5',  'CA', true, false),
  ('eeeeeeee-7777-0000-0000-000000000005', 'mentor', 'active',    'Admin A',   '19990007005', '1984-01-01', 'T1–T6',  'CA', true, true);

-- bowel is open. bladder is open long enough for Writer to post and Reader to
-- like, then closed — the way a room an administrator shuts still holds what
-- was written and liked in it.
update public.chat_rooms set opened_at = now() where id in ('bowel', 'bladder');

insert into public.chat_topics (id, room_id, title, author_id) values
  ('70000000-0000-0000-0000-00000000000a', 'bowel',   'A cushion that finally worked', 'bbbbbbbb-7777-0000-0000-000000000002'),
  ('70000000-0000-0000-0000-00000000000b', 'bladder', 'Catheters on a long flight',    'bbbbbbbb-7777-0000-0000-000000000002');

-- p1: Writer's opening post. p2: Liker's own reply. p3: Writer's post in the
-- room about to close. p4: Writer's reply, taken back.
insert into public.chat_posts (id, topic_id, author_id, body) values
  ('70000000-0000-0000-0000-0000000000a1', '70000000-0000-0000-0000-00000000000a', 'bbbbbbbb-7777-0000-0000-000000000002', 'Air cells, after four years of foam.'),
  ('70000000-0000-0000-0000-0000000000a2', '70000000-0000-0000-0000-00000000000a', 'aaaaaaaa-7777-0000-0000-000000000001', 'Which one? Mine bottoms out.'),
  ('70000000-0000-0000-0000-0000000000b3', '70000000-0000-0000-0000-00000000000b', 'bbbbbbbb-7777-0000-0000-000000000002', 'Aisle seat, and a bag in the cabin.'),
  ('70000000-0000-0000-0000-0000000000a4', '70000000-0000-0000-0000-00000000000a', 'bbbbbbbb-7777-0000-0000-000000000002', 'Wrong topic, sorry.');

insert into public.chat_post_likes (post_id, member_id)
values ('70000000-0000-0000-0000-0000000000b3', 'cccccccc-7777-0000-0000-000000000003');

update public.chat_rooms set opened_at = null where id = 'bladder';
update public.chat_posts set removed_at = now() where id = '70000000-0000-0000-0000-0000000000a4';

\set p1 '70000000-0000-0000-0000-0000000000a1'
\set p2 '70000000-0000-0000-0000-0000000000a2'
\set p3 '70000000-0000-0000-0000-0000000000b3'
\set p4 '70000000-0000-0000-0000-0000000000a4'

\set QUIET off
\echo ''
\echo '== 0. we are a signed-in ordinary member, not the superuser =='
\echo '   expect: authenticated | aaaaaaaa-7777-... | t active | f admin | 0 joined'
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-7777-0000-0000-000000000001","role":"authenticated"}';
select current_user, auth.uid()::text as uid,
       public.is_active_member() as active, public.is_admin() as admin,
       (select count(*) from public.chat_room_members
         where member_id = 'aaaaaaaa-7777-0000-0000-000000000001') as joined;

\echo ''
\echo '== 1. a member likes a post in an open room, having joined nothing =='
\echo '   expect: INSERT 0 1, then 1 like.'
insert into public.chat_post_likes (post_id, member_id)
values (:'p1', 'aaaaaaaa-7777-0000-0000-000000000001');
select count(*) as likes from public.chat_post_likes where post_id = :'p1';

\echo ''
\echo '== 2. liking twice is one row =='
\echo '   expect: INSERT 0 0 (the client''s ignoreDuplicates, on conflict do'
\echo '   nothing, which needs no update grant), then still 1 like; then ERROR'
\echo '   duplicate key for a plain second insert.'
insert into public.chat_post_likes (post_id, member_id)
values (:'p1', 'aaaaaaaa-7777-0000-0000-000000000001')
on conflict (post_id, member_id) do nothing;
select count(*) as likes from public.chat_post_likes where post_id = :'p1';
savepoint twice;
insert into public.chat_post_likes (post_id, member_id)
values (:'p1', 'aaaaaaaa-7777-0000-0000-000000000001');
rollback to savepoint twice;

\echo ''
\echo '== 3. a member can like their own post =='
\echo '   expect: INSERT 0 1, then 1 own like.'
savepoint own;
insert into public.chat_post_likes (post_id, member_id)
values (:'p2', 'aaaaaaaa-7777-0000-0000-000000000001');
select count(*) as own_likes from public.chat_post_likes where post_id = :'p2';
rollback to savepoint own;

\echo ''
\echo '== 4. a member cannot like as somebody else =='
\echo '   expect: ERROR, new row violates row-level security policy. On p1, which'
\echo '   Reader could like as themselves, so the forged name is the only reason.'
savepoint forged;
insert into public.chat_post_likes (post_id, member_id)
values (:'p1', 'cccccccc-7777-0000-0000-000000000003');
rollback to savepoint forged;

\echo ''
\echo '== 5. a member cannot choose liked_at, on the way in or afterwards =='
\echo '   expect: ERROR permission denied, twice — the insert names a column'
\echo '   nobody was granted, and there is no update grant at all. Privileges'
\echo '   are checked before any row is looked at, so the duplicate never matters.'
savepoint dated;
insert into public.chat_post_likes (post_id, member_id, liked_at)
values (:'p1', 'aaaaaaaa-7777-0000-0000-000000000001', now() + interval '1 year');
rollback to savepoint dated;
savepoint redated;
update public.chat_post_likes set liked_at = now() + interval '1 year'
 where post_id = :'p1';
rollback to savepoint redated;

\echo ''
\echo '== 6. THE STEP: a post in a closed room cannot be liked, and its likes cannot be read =='
\echo '   expect: f readable | 0 likes seen, then ERROR on the insert. Then, as'
\echo '   the administrator, t readable | 1 like — the row is there, and the 0'
\echo '   above is the policy, not an empty table.'
select public.chat_room_is_readable('bladder') as readable,
       (select count(*) from public.chat_post_likes where post_id = :'p3') as likes_seen;
savepoint closed;
insert into public.chat_post_likes (post_id, member_id)
values (:'p3', 'aaaaaaaa-7777-0000-0000-000000000001');
rollback to savepoint closed;

savepoint admin_looks;
set local role postgres;
set local request.jwt.claims = '{"sub":"eeeeeeee-7777-0000-0000-000000000005","role":"authenticated"}';
set local role authenticated;
select public.chat_room_is_readable('bladder') as readable,
       (select count(*) from public.chat_post_likes where post_id = :'p3') as likes_seen;
rollback to savepoint admin_looks;

\echo ''
\echo '== 7. THE STEP: another member reads who liked a post in an open room =='
\echo '   expect: Reader likes it too (INSERT 0 1), then Reader reads two rows'
\echo '   named Liker L and Reader R. Then Writer, whose post it is, reads the'
\echo '   same two names.'
set local role postgres;
set local request.jwt.claims = '{"sub":"cccccccc-7777-0000-0000-000000000003","role":"authenticated"}';
set local role authenticated;
select current_user, auth.uid()::text as uid;
insert into public.chat_post_likes (post_id, member_id)
values (:'p1', 'cccccccc-7777-0000-0000-000000000003');
select a.display_name as liked_by
  from public.chat_post_likes l
  join public.chat_authors a on a.id = l.member_id
 where l.post_id = :'p1'
 order by a.display_name;

set local role postgres;
set local request.jwt.claims = '{"sub":"bbbbbbbb-7777-0000-0000-000000000002","role":"authenticated"}';
set local role authenticated;
select a.display_name as liked_by
  from public.chat_post_likes l
  join public.chat_authors a on a.id = l.member_id
 where l.post_id = :'p1'
 order by a.display_name;

\echo ''
\echo '== 8. a paused member cannot like, and still reads =='
\echo '   expect: t a_member | f active | 2 likes seen, then ERROR on the'
\echo '   insert. Reading is not what suspension takes away.'
set local role postgres;
set local request.jwt.claims = '{"sub":"dddddddd-7777-0000-0000-000000000004","role":"authenticated"}';
set local role authenticated;
select public.is_member() as a_member, public.is_active_member() as active,
       (select count(*) from public.chat_post_likes where post_id = :'p1') as likes_seen;
savepoint paused;
insert into public.chat_post_likes (post_id, member_id)
values (:'p1', 'dddddddd-7777-0000-0000-000000000004');
rollback to savepoint paused;

\echo ''
\echo '== 9. a removed post cannot be liked =='
\echo '   expect: ERROR, new row violates row-level security policy.'
set local role postgres;
set local request.jwt.claims = '{"sub":"aaaaaaaa-7777-0000-0000-000000000001","role":"authenticated"}';
set local role authenticated;
savepoint removed;
insert into public.chat_post_likes (post_id, member_id)
values (:'p4', 'aaaaaaaa-7777-0000-0000-000000000001');
rollback to savepoint removed;

\echo ''
\echo '== 10. a member cannot delete somebody else''s like, and can take back their own =='
\echo '   expect: as Reader, DELETE 0 and still 2 likes — RLS hides the row from'
\echo '   the delete rather than refusing it, so the count is the proof. Then as'
\echo '   Liker, DELETE 1 and 1 like, and Liker likes it again for step 11.'
set local role postgres;
set local request.jwt.claims = '{"sub":"cccccccc-7777-0000-0000-000000000003","role":"authenticated"}';
set local role authenticated;
delete from public.chat_post_likes
 where post_id = :'p1' and member_id = 'aaaaaaaa-7777-0000-0000-000000000001';
select count(*) as likes from public.chat_post_likes where post_id = :'p1';

set local role postgres;
set local request.jwt.claims = '{"sub":"aaaaaaaa-7777-0000-0000-000000000001","role":"authenticated"}';
set local role authenticated;
delete from public.chat_post_likes
 where post_id = :'p1' and member_id = 'aaaaaaaa-7777-0000-0000-000000000001';
select count(*) as likes from public.chat_post_likes where post_id = :'p1';
insert into public.chat_post_likes (post_id, member_id)
values (:'p1', 'aaaaaaaa-7777-0000-0000-000000000001');

\echo ''
\echo '== 11. removing a member takes their likes; deleting a topic takes its posts'' likes =='
\echo '   expect: as the administrator, a blank line from admin_delete_member,'
\echo '   then 1 like left on p1 (Reader''s) and 0 of Liker''s anywhere. Then'
\echo '   admin_delete_topic returns {} and p1 has 0 likes. Counted as the'
\echo '   superuser, so that RLS cannot be what hides them.'
set local role postgres;
set local request.jwt.claims = '{"sub":"eeeeeeee-7777-0000-0000-000000000005","role":"authenticated"}';
set local role authenticated;
select public.admin_delete_member('aaaaaaaa-7777-0000-0000-000000000001');
set local role postgres;
select (select count(*) from public.chat_post_likes where post_id = :'p1') as likes_on_p1,
       (select count(*) from public.chat_post_likes
         where member_id = 'aaaaaaaa-7777-0000-0000-000000000001') as likers_likes;
set local role authenticated;
select public.admin_delete_topic('70000000-0000-0000-0000-00000000000a');
set local role postgres;
select (select count(*) from public.chat_post_likes where post_id = :'p1') as likes_on_p1;

\echo ''
\echo '== 12. anon reads nothing =='
\echo '   expect: anon, then ERROR permission denied for table chat_post_likes.'
set local role postgres;
set local request.jwt.claims = '{"role":"anon"}';
set local role anon;
select current_user;
savepoint anon_reads;
select count(*) from public.chat_post_likes;
rollback to savepoint anon_reads;

rollback;
