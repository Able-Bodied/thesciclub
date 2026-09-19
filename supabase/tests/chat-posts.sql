-- ============================================================================
-- Topics and posts: who may read a room, who may write in it, who may remove.
-- Run as a member, under RLS.
-- ============================================================================
--   docker run --rm -i --network host -e PGPASSWORD=postgres postgres:17-alpine \
--     psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
--     -f - < supabase/tests/chat-posts.sql
--
-- It rolls back and is safe to re-run. Do not point it at the hosted project.
--
-- Three steps carry the feature and are marked in place:
--
--   4  — an un-joined member reads the whole history. That is the sentence
--         /chat prints, and it is the one thing a membership must not gate.
--   8  — a member cannot see that another member has joined a room or read a
--         topic. The member count is published; the names behind it are not.
--   12 — a closed room's topics are invisible to a member. chat_topics_for() is
--         security definer, so RLS is off inside it and its own first line is
--         the only thing between a member and a room nobody has opened.
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
  ('aaaaaaaa-3333-0000-0000-000000000001', 'peer',   'active',    'Joiner J',    '19990003001', '1980-01-01', 'T1–T6',  'CA', true, false),
  ('bbbbbbbb-3333-0000-0000-000000000002', 'mentor', 'active',    'Admin A',     '19990003002', '1981-01-01', 'C5–C8',  'CA', true, true),
  ('cccccccc-3333-0000-0000-000000000003', 'peer',   'active',    'Onlooker O',  '19990003003', '1982-01-01', 'T7–T12', 'CA', true, false),
  ('dddddddd-3333-0000-0000-000000000004', 'peer',   'suspended', 'Suspended S', '19990003004', '1983-01-01', 'L1–S5',  'CA', true, false);

-- bowel is the open room; bladder stays shut for steps 11 and 12.
update public.chat_rooms set opened_at = now() where id = 'bowel';

\set QUIET off
\echo ''
\echo '== 0. we are a signed-in ordinary member, not the superuser =='
\echo '   expect: authenticated | aaaaaaaa-3333-... | t | f'
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-3333-0000-0000-000000000001","role":"authenticated"}';
select current_user, auth.uid()::text as uid,
       public.is_member() as a_member, public.is_admin() as admin;

\echo ''
\echo '== 1. before joining, a member may not start a topic =='
\echo '   expect: f, then ERROR (new row violates row-level security policy).'
select public.chat_can_post_in('bowel') as may_post;
savepoint post_before_joining;
select public.chat_create_topic('bowel', 'Can I post yet', 'Apparently not.');
rollback to savepoint post_before_joining;

\echo ''
\echo '== 2. joining an open room, then starting a topic =='
\echo '   expect: INSERT 0 1, then t, then a uuid.'
insert into public.chat_room_members (room_id, member_id)
values ('bowel', 'aaaaaaaa-3333-0000-0000-000000000001');
select public.chat_can_post_in('bowel') as may_post;
select public.chat_create_topic(
  'bowel',
  'Travelling with a bowel programme',
  'Two weeks away and the timing has to move. What has worked for people?'
) as topic_id \gset

\echo ''
\echo '== 3. the topic carries its first post, and the counters start at zero =='
\echo '   expect: 1 post | 0 replies, and last_post_at equal to the post time.'
select t.reply_count,
       (select count(*) from public.chat_posts p where p.topic_id = t.id) as posts,
       t.last_post_at = (select max(p.created_at) from public.chat_posts p where p.topic_id = t.id)
         as activity_matches
  from public.chat_topics t where t.id = :'topic_id';

\echo ''
\echo '== 4. a member who never joined reads the whole thing =='
\echo '   THE STEP THAT MATTERS. /chat promises "the whole history from before'
\echo '   you joined". expect: 0 memberships | 1 topic | 1 post | f may_post.'
savepoint onlooker_reads;
set local role postgres;
set local request.jwt.claims = '{"sub":"cccccccc-3333-0000-0000-000000000003","role":"authenticated"}';
set local role authenticated;
select (select count(*) from public.chat_room_members) as my_memberships,
       (select count(*) from public.chat_topics where room_id = 'bowel') as topics,
       (select count(*) from public.chat_posts) as posts,
       public.chat_can_post_in('bowel') as may_post;

\echo ''
\echo '== 5. ...and cannot post into it =='
\echo '   expect: ERROR, new row violates row-level security policy.'
savepoint onlooker_posts;
insert into public.chat_posts (topic_id, author_id, body)
values (:'topic_id', 'cccccccc-3333-0000-0000-000000000003', 'Chiming in uninvited.');
rollback to savepoint onlooker_posts;

\echo ''
\echo '== 5b. ...nor pass somebody else off as the author =='
\echo '   expect: ERROR. author_id = auth.uid() is half of the insert check.'
savepoint onlooker_forges;
insert into public.chat_room_members (room_id, member_id)
values ('bowel', 'cccccccc-3333-0000-0000-000000000003');
insert into public.chat_posts (topic_id, author_id, body)
values (:'topic_id', 'aaaaaaaa-3333-0000-0000-000000000001', 'Not my words.');
rollback to savepoint onlooker_forges;
rollback to savepoint onlooker_reads;

\echo ''
\echo '== 6. a suspended member reads and does not write =='
\echo '   expect: t a_member | f active | 1 topic, then ERROR on the join and'
\echo '   ERROR on the post. Reading is not what suspension takes away.'
savepoint suspended;
set local role postgres;
set local request.jwt.claims = '{"sub":"dddddddd-3333-0000-0000-000000000004","role":"authenticated"}';
set local role authenticated;
select public.is_member() as a_member, public.is_active_member() as active,
       (select count(*) from public.chat_topics where room_id = 'bowel') as topics;
savepoint suspended_joins;
insert into public.chat_room_members (room_id, member_id)
values ('bowel', 'dddddddd-3333-0000-0000-000000000004');
rollback to savepoint suspended_joins;
savepoint suspended_posts;
insert into public.chat_posts (topic_id, author_id, body)
values (:'topic_id', 'dddddddd-3333-0000-0000-000000000004', 'Still here.');
rollback to savepoint suspended_posts;
rollback to savepoint suspended;

\echo ''
\echo '== 7. a second post moves the activity date and the reply count =='
\echo '   expect: 1 reply, and unread true for the author of the first post'
\echo '   because they have not opened it since.'
savepoint admin_replies;
set local role postgres;
set local request.jwt.claims = '{"sub":"bbbbbbbb-3333-0000-0000-000000000002","role":"authenticated"}';
set local role authenticated;
insert into public.chat_posts (topic_id, author_id, body)
values (:'topic_id', 'bbbbbbbb-3333-0000-0000-000000000002',
        'Shift the whole programme by an hour a day for the three days before you fly.');
select reply_count from public.chat_topics where id = :'topic_id';

set local role postgres;
set local request.jwt.claims = '{"sub":"aaaaaaaa-3333-0000-0000-000000000001","role":"authenticated"}';
set local role authenticated;
select reply_count, view_count, unread, array_length(participant_ids, 1) as faces
  from public.chat_topics_for('bowel');

\echo ''
\echo '== 7b. opening the topic clears unread and counts one view =='
\echo '   expect: f unread | 1 view. The view count is people, not opens, so'
\echo '   marking it read twice leaves it at one.'
select public.chat_mark_topic_read(:'topic_id');
select public.chat_mark_topic_read(:'topic_id');
select unread, view_count from public.chat_topics_for('bowel');

\echo ''
\echo '== 8. nobody sees anybody elseʼs memberships or reads =='
\echo '   THE STEP THAT MATTERS. Which rooms somebody joined — "Sex, dating &'
\echo '   fertility" is one of the twelve — is a statement about them they did'
\echo '   not make to the room. expect: 0 | 0 from the onlooker, who has joined'
\echo '   nothing and read nothing, against a table holding rows for two others.'
savepoint privacy;
set local role postgres;
select count(*) as memberships_in_table from public.chat_room_members;
select count(*) as reads_in_table from public.chat_topic_reads;
set local request.jwt.claims = '{"sub":"cccccccc-3333-0000-0000-000000000003","role":"authenticated"}';
set local role authenticated;
select count(*) as memberships_i_can_see from public.chat_room_members;
select count(*) as reads_i_can_see from public.chat_topic_reads;

\echo ''
\echo '== 8b. ...but the count of them is published =='
\echo '   expect: 1 topic | 2 posts | 1 member. Counts, never names.'
select topic_count, post_count, member_count
  from public.chat_room_stats where room_id = 'bowel';
rollback to savepoint privacy;

\echo ''
\echo '== 9. a member cannot reach the tables around the functions =='
\echo '   expect: permission denied, four times — not four zero-row no-ops.'
\echo '   This is why every chat migration revokes from `authenticated` as well'
\echo '   as anon and public: Supabase grants every privilege on a new table by'
\echo '   default, and an ungranted verb that RLS merely fails to match reports'
\echo '   UPDATE 0 and looks like a pass.'
savepoint no_update_topic;
update public.chat_topics set title = 'Mine now' where id = :'topic_id';
rollback to savepoint no_update_topic;
savepoint no_delete_post;
delete from public.chat_posts where topic_id = :'topic_id';
rollback to savepoint no_delete_post;
savepoint no_read_bodies;
select count(*) from public.chat_removed_bodies;
rollback to savepoint no_read_bodies;
savepoint no_write_reads;
insert into public.chat_topic_reads (topic_id, member_id)
values (:'topic_id', 'cccccccc-3333-0000-0000-000000000003');
rollback to savepoint no_write_reads;

\echo ''
\echo '== 10. removal: a third member cannot, the author can =='
\echo '   expect: ERROR from the onlooker; then the author removes their own'
\echo '   post and the body is gone but the row and the reply count are not.'
savepoint removal;
savepoint third_party_removal;
set local role postgres;
set local request.jwt.claims = '{"sub":"cccccccc-3333-0000-0000-000000000003","role":"authenticated"}';
set local role authenticated;
select public.chat_remove_post(
  (select id from public.chat_posts where topic_id = :'topic_id' order by created_at limit 1));
rollback to savepoint third_party_removal;

select public.chat_remove_post(
  (select id from public.chat_posts where topic_id = :'topic_id' order by created_at limit 1));
select body = '' as body_blanked, removed_at is not null as removed, removed_by_admin
  from public.chat_posts where topic_id = :'topic_id' order by created_at limit 1;
select reply_count,
       (select count(*) from public.chat_posts p where p.topic_id = t.id) as rows_kept
  from public.chat_topics t where t.id = :'topic_id';

\echo ''
\echo '== 10b. the words are kept where no session can read them =='
\echo '   expect: one row as the superuser, holding what the post said. Step 9'
\echo '   is the half of this that shows a member cannot reach it.'
savepoint kept;
set local role postgres;
select count(*) as stored, left(body, 24) as starts_with from public.chat_removed_bodies group by body;
rollback to savepoint kept;

\echo ''
\echo '== 10c. removing is idempotent =='
\echo '   expect: no error and removed_by_admin still f. Two taps on a slow'
\echo '   connection must not rewrite who removed it.'
select public.chat_remove_post(
  (select id from public.chat_posts where topic_id = :'topic_id' order by created_at limit 1));
select removed_by_admin from public.chat_posts where topic_id = :'topic_id' order by created_at limit 1;
rollback to savepoint removal;

\echo ''
\echo '== 10d. an administrator removes somebody elseʼs, and it says so =='
\echo '   expect: ERROR when the author of post 1 reaches for post 2, then'
\echo '   removed_by_admin = t when the administrator removes post 1. An author'
\echo '   removing their own post is an author even when they are an'
\echo '   administrator, which is the f in step 10.'
savepoint author_reaches_across;
select public.chat_remove_post(
  (select id from public.chat_posts where topic_id = :'topic_id' order by created_at desc limit 1));
rollback to savepoint author_reaches_across;

set local role postgres;
set local request.jwt.claims = '{"sub":"bbbbbbbb-3333-0000-0000-000000000002","role":"authenticated"}';
set local role authenticated;
select public.chat_remove_post(
  (select id from public.chat_posts where topic_id = :'topic_id' order by created_at limit 1));
select removed_by_admin from public.chat_posts where topic_id = :'topic_id' order by created_at limit 1;

\echo ''
\echo '== 11. an administrator seeds a closed room; a member cannot =='
\echo '   expect: t may_post for the administrator in bladder, which nobody has'
\echo '   opened, then a uuid. Seeding a room before it is shown to anybody is'
\echo '   the whole reason an administrator can see a closed one.'
select public.chat_can_post_in('bladder') as admin_may_post_in_a_closed_room;
select public.chat_create_topic(
  'bladder', 'Supplies when you travel', 'Starting this one off before the room opens.'
) as seeded_topic \gset

\echo ''
\echo '== 12. a member sees nothing of a closed room =='
\echo '   THE STEP THAT MATTERS. chat_topics_for() is security definer, so RLS'
\echo '   is off inside it; its first line is the only thing between a member'
\echo '   and a room nobody has opened. expect: f readable | 0 topics | 0 rows'
\echo '   from chat_topics_for | 0 rows from chat_room_stats | ERROR on marking'
\echo '   its topic read.'
savepoint closed_room;
set local role postgres;
set local request.jwt.claims = '{"sub":"aaaaaaaa-3333-0000-0000-000000000001","role":"authenticated"}';
set local role authenticated;
select public.chat_room_is_readable('bladder') as readable,
       (select count(*) from public.chat_topics where room_id = 'bladder') as topics_via_table,
       (select count(*) from public.chat_topics_for('bladder')) as topics_via_function,
       (select count(*) from public.chat_room_stats where room_id = 'bladder') as stats_rows;
savepoint mark_closed;
select public.chat_mark_topic_read(:'seeded_topic');
rollback to savepoint mark_closed;
savepoint join_closed;
insert into public.chat_room_members (room_id, member_id)
values ('bladder', 'aaaaaaaa-3333-0000-0000-000000000001');
rollback to savepoint join_closed;
rollback to savepoint closed_room;

\echo ''
\echo '== 13. a session that was never invited reads nothing and writes nothing =='
\echo '   expect: f | 0 | 0, then ERROR. Somebody who got through phone'
\echo '   verification and no further has no members row.'
savepoint uninvited;
set local role postgres;
set local request.jwt.claims = '{"sub":"ffffffff-3333-0000-0000-00000000000f","role":"authenticated"}';
set local role authenticated;
select public.is_member() as a_member,
       (select count(*) from public.chat_topics) as topics,
       (select count(*) from public.chat_posts) as posts;
select public.chat_create_topic('bowel', 'Hello', 'Anybody there?');
rollback to savepoint uninvited;

\echo ''
\echo '== 14. a signed-out visitor is refused outright =='
\echo '   expect: permission denied for table chat_topics.'
savepoint anon;
set local role postgres;
set local request.jwt.claims = '';
set local role anon;
select count(*) from public.chat_topics;
rollback to savepoint anon;

\echo ''
\echo '== 15. the title and the body are bounded =='
\echo '   expect: two ERRORs (violates check constraint). A blank title is a'
\echo '   topic nothing can render; 4000 characters is the composer limit.'
set local role postgres;
set local request.jwt.claims = '{"sub":"aaaaaaaa-3333-0000-0000-000000000001","role":"authenticated"}';
set local role authenticated;
savepoint blank_title;
select public.chat_create_topic('bowel', '   ', 'A body with no question on it.');
rollback to savepoint blank_title;
savepoint long_body;
select public.chat_create_topic('bowel', 'Long one', repeat('x', 4001));
rollback to savepoint long_body;

set local role postgres;
rollback;
