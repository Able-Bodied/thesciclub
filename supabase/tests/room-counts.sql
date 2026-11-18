-- ============================================================================
-- A room counts its questions, replies and views, and says when it was last
-- active (20261118170000)
-- ============================================================================
-- The owner, 2026-11-18: the rooms list counts each room's questions, posts,
-- replies and views and says when it was last active.
--
-- Step 1 is the one that matters: the views are the sum of what each post's
-- row says (a member counts once for a post however they saw it, its author
-- never), and a closed room is in nobody's list but an administrator's.
--
--   docker run --rm -i --network host -e PGPASSWORD=postgres postgres:17-alpine \
--     psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
--     -f - < supabase/tests/room-counts.sql
--
-- Rolls back. Do not point it at the hosted project.
-- ============================================================================

\set ON_ERROR_STOP off
\pset pager off

begin;

insert into auth.users (id, instance_id, aud, role, email) values
  ('aaaaaaaa-1118-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'asks@probe.example'),
  ('bbbbbbbb-1118-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'reads@probe.example'),
  ('cccccccc-1118-0000-0000-00000000000c', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'likes@probe.example');
insert into public.members (id, type, status, display_name, phone, birth_date, level_range, state, city, is_admin) values
  ('aaaaaaaa-1118-0000-0000-00000000000a', 'peer', 'active', 'Asks', '19990001181', '1980-01-01', 'T1–T6', 'CA', 'Sacramento', false),
  ('bbbbbbbb-1118-0000-0000-00000000000b', 'peer', 'active', 'Reads', '19990001182', '1980-01-01', 'T1–T6', 'CA', 'Sacramento', false),
  ('cccccccc-1118-0000-0000-00000000000c', 'peer', 'active', 'Likes', '19990001183', '1980-01-01', 'T1–T6', 'CA', 'Sacramento', false);
insert into public.chat_rooms (id, name, description, category, sort_order, opened_at) values
  ('probe-1118-open',   'Probe 1118 open',   'For the probe.', 'Life', 9951, now()),
  ('probe-1118-closed', 'Probe 1118 closed', 'For the probe.', 'Life', 9952, null);

-- Two posts by Asks in the open room, one of them a question; one in the closed.
insert into public.chat_topics (id, room_id, title, author_id, is_question, created_at, last_post_at) values
  ('11180000-0000-0000-0000-000000000001', 'probe-1118-open', 'A question', 'aaaaaaaa-1118-0000-0000-00000000000a', true,  now() - interval '3 days', now() - interval '3 days'),
  ('11180000-0000-0000-0000-000000000002', 'probe-1118-open', 'A post',     'aaaaaaaa-1118-0000-0000-00000000000a', false, now() - interval '2 days', now() - interval '2 days'),
  ('11180000-0000-0000-0000-000000000003', 'probe-1118-closed', 'Closed',   'aaaaaaaa-1118-0000-0000-00000000000a', false, now() - interval '1 day',  now() - interval '1 day');
insert into public.chat_posts (id, topic_id, author_id, body, created_at) values
  ('11180000-0000-0000-0001-000000000001', '11180000-0000-0000-0000-000000000001', 'aaaaaaaa-1118-0000-0000-00000000000a', 'Opening 1', now() - interval '3 days'),
  ('11180000-0000-0000-0001-000000000002', '11180000-0000-0000-0000-000000000002', 'aaaaaaaa-1118-0000-0000-00000000000a', 'Opening 2', now() - interval '2 days'),
  ('11180000-0000-0000-0001-000000000003', '11180000-0000-0000-0000-000000000003', 'aaaaaaaa-1118-0000-0000-00000000000a', 'Opening 3', now() - interval '1 day');
-- Reads replies to the question.
insert into public.chat_posts (id, topic_id, author_id, body) values
  ('11180000-0000-0000-0002-000000000001', '11180000-0000-0000-0000-000000000001', 'bbbbbbbb-1118-0000-0000-00000000000b', 'A reply');
-- The question: read by its author (never counted) and by Reads; Likes saw
-- its opening post and liked it (one member, one view). The other post: a
-- reaction from Reads.
insert into public.chat_topic_reads (topic_id, member_id, last_read_at) values
  ('11180000-0000-0000-0000-000000000001', 'aaaaaaaa-1118-0000-0000-00000000000a', now()),
  ('11180000-0000-0000-0000-000000000001', 'bbbbbbbb-1118-0000-0000-00000000000b', now());
insert into public.chat_post_views (post_id, member_id) values
  ('11180000-0000-0000-0001-000000000001', 'cccccccc-1118-0000-0000-00000000000c');
insert into public.chat_post_likes (post_id, member_id) values
  ('11180000-0000-0000-0001-000000000001', 'cccccccc-1118-0000-0000-00000000000c');
insert into public.chat_post_reactions (target_id, member_id, emoji) values
  ('11180000-0000-0000-0001-000000000002', 'bbbbbbbb-1118-0000-0000-00000000000b', '🎉');

\echo ''
\echo '== 1. THE ONE THAT MATTERS: a member reads the counts (expect posts 2, questions 1, replies 1, views 3 and the same as the rows; active just now; closed rooms listed 0) =='
select private.act_as('cccccccc-1118-0000-0000-00000000000c') is not null as ok;
set local role authenticated;
select s.topic_count as posts, s.question_count as questions, s.reply_count as replies, s.view_count as views,
       (select sum(t.view_count) from public.chat_topics_for('probe-1118-open') t) as views_on_the_rows,
       s.last_activity_at > now() - interval '1 minute' as active_just_now
  from public.chat_room_stats s where s.room_id = 'probe-1118-open';
select count(*) as closed_rooms_listed
  from public.chat_room_stats s where s.room_id = 'probe-1118-closed';
reset role;

\echo ''
\echo '== 2. every room this member sees agrees with its rows, and a build from before still reads its three columns (expect 0 rooms that differ; old columns t) =='
select private.act_as('cccccccc-1118-0000-0000-00000000000c') is not null as ok;
set local role authenticated;
select count(*) filter (where s.view_count is distinct from coalesce(r.views, 0)
                           or s.reply_count is distinct from coalesce(r.replies, 0)
                           or s.last_activity_at is distinct from r.latest) as rooms_that_differ,
       count(*) > 0 as some_rooms
  from public.chat_room_stats s
  left join lateral (
    select sum(t.view_count) as views, sum(t.reply_count) as replies, max(t.last_post_at) as latest
      from public.chat_topics_for(s.room_id) t) r on true;
select count(*) > 0 as old_columns
  from (select room_id, topic_count, post_count, member_count from public.chat_room_stats) s;
reset role;

rollback;
