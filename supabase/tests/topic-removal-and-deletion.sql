-- ============================================================================
-- Removed replies stop counting (20260927030000), and an administrator can
-- delete a topic (20260927040000).
-- ============================================================================
-- Run as signed-in roles — the member removing their post, the member who
-- must not delete a topic, the administrator who may — with current_user
-- printed. Expected refusals each sit in their own savepoint.
--
-- Step 6 matters most: a deleted topic takes its posts with it, and a report
-- on one of them keeps its words.
--
--   docker run --rm -i --network host -e PGPASSWORD=postgres postgres:17-alpine \
--     psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
--     -f - < supabase/tests/topic-removal-and-deletion.sql
--
-- Rolls back. Do not point it at the hosted project.
-- ============================================================================

\set ON_ERROR_STOP off
\pset pager off

begin;

insert into public.members (id, type, status, display_name, phone, birth_date, level_range, state, is_admin)
values
  ('aaaaaaaa-7777-0000-0000-00000000000a', 'peer',   'active', 'Starter', '19990000080', '1980-01-01', 'T1–T6', 'CA', false),
  ('bbbbbbbb-7777-0000-0000-00000000000b', 'peer',   'active', 'Replier', '19990000081', '1981-01-01', 'T1–T6', 'CA', false),
  ('eeeeeeee-7777-0000-0000-00000000000e', 'mentor', 'active', 'Admin',   '19990000084', '1984-01-01', 'C5–C8', 'CA', true);

insert into public.chat_rooms (id, name, description, category, sort_order, opened_at)
values ('probe-room-3', 'Probe room 3', 'For the probe.', 'Life', 996, now());
-- Nobody joins it: writing needs no membership since 20260930000000.

-- chat_create_topic as the starter, so the topic is born the real way.
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-7777-0000-0000-00000000000a","role":"authenticated"}', true) is not null as ok;
set local role authenticated;
select public.chat_create_topic('probe-room-3', 'A question', 'The opening post') as topic_id \gset
set local role postgres;

-- Three replies, the last carrying a photograph.
insert into public.chat_posts (id, topic_id, author_id, body, attachments, created_at) values
  ('44444444-7777-0000-0000-000000000001', :'topic_id', 'bbbbbbbb-7777-0000-0000-00000000000b', 'Reply one', '{}', now() + interval '1 second'),
  ('44444444-7777-0000-0000-000000000002', :'topic_id', 'aaaaaaaa-7777-0000-0000-00000000000a', 'Reply two', '{}', now() + interval '2 seconds'),
  ('44444444-7777-0000-0000-000000000003', :'topic_id', 'bbbbbbbb-7777-0000-0000-00000000000b', 'Reply three', '{rooms/probe-room-3/three.webp}', now() + interval '3 seconds');

\echo ''
\echo '== 1. three replies count three (expect 3) =='
select reply_count from public.chat_topics where id = :'topic_id';

\echo ''
\echo '== 2. the replier removes their first reply: it stops counting (expect 2, and 3 posts in the room) =='
select set_config('request.jwt.claims',
  '{"sub":"bbbbbbbb-7777-0000-0000-00000000000b","role":"authenticated"}', true) is not null as ok;
set local role authenticated;
select current_user;
select public.chat_remove_post('44444444-7777-0000-0000-000000000001');
select reply_count from public.chat_topics where id = :'topic_id';
select post_count as posts_in_room from public.chat_room_stats where room_id = 'probe-room-3';

\echo ''
\echo '== 3. the starter removes the opening post: the replies are still replies (expect 2) =='
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-7777-0000-0000-00000000000a","role":"authenticated"}', true) is not null as ok;
select public.chat_remove_post(p.id) from public.chat_posts p
 where p.topic_id = :'topic_id' and p.body = 'The opening post';
select reply_count from public.chat_topics where id = :'topic_id';

\echo ''
\echo '== 4. faces on the row are people with a post still standing (expect Replier, Starter — both still have one) =='
-- Names read as postgres: members' RLS hides other members' rows from a
-- member, which would blank the names and look like the faces were missing.
-- chat_topics_for still runs with the starter's claims.
set local role postgres;
select (select string_agg(m.display_name, ', ' order by array_position(t.participant_ids, m.id))
          from public.members m where m.id = any (t.participant_ids)) as faces
  from public.chat_topics_for('probe-room-3') t where t.id = :'topic_id';

\echo ''
\echo '== 4b. once the starter''s last standing post goes too, only the replier is left (expect Replier) =='
set local role authenticated;
select public.chat_remove_post('44444444-7777-0000-0000-000000000002');
set local role postgres;
select (select string_agg(m.display_name, ', ') from public.members m where m.id = any (t.participant_ids)) as faces,
       t.reply_count
  from public.chat_topics_for('probe-room-3') t where t.id = :'topic_id';

\echo ''
\echo '== 5. a member cannot delete a topic, even their own (expect ERROR) =='
set local role authenticated;
select current_user;
savepoint member_delete;
select public.admin_delete_topic(:'topic_id');
rollback to savepoint member_delete;

-- A report on the photographed reply, and a mute and a read, so the delete
-- has something to take and something to leave.
set local role postgres;
insert into public.chat_reports (id, kind, post_id, reporter_id, reported_author_id, body_snapshot, written_at, place, context_kind, topic_id, room_id, attachments)
values ('55555555-7777-0000-0000-000000000001', 'post', '44444444-7777-0000-0000-000000000003',
        'aaaaaaaa-7777-0000-0000-00000000000a', 'bbbbbbbb-7777-0000-0000-00000000000b',
        'Reply three', now(), 'Probe room 3', 'room', :'topic_id', 'probe-room-3', '{rooms/probe-room-3/three.webp}');
insert into public.chat_topic_mutes (topic_id, member_id) values (:'topic_id', 'aaaaaaaa-7777-0000-0000-00000000000a');

\echo ''
\echo '== 6. THE ONE THAT MATTERS: an administrator deletes it; the posts go, the report stays with its words (expect the photograph path; 0 topics, 0 posts, 0 mutes; report 1 with post_id null and its snapshot) =='
select set_config('request.jwt.claims',
  '{"sub":"eeeeeeee-7777-0000-0000-00000000000e","role":"authenticated"}', true) is not null as ok;
set local role authenticated;
select current_user, public.admin_delete_topic(:'topic_id') as photographs_to_remove;
set local role postgres;
select (select count(*) from public.chat_topics where id = :'topic_id') as topics,
       (select count(*) from public.chat_posts where topic_id = :'topic_id') as posts,
       (select count(*) from public.chat_topic_mutes where topic_id = :'topic_id') as mutes;
select count(*) as reports, bool_and(post_id is null) as post_gone, min(body_snapshot) as snapshot
  from public.chat_reports where id = '55555555-7777-0000-0000-000000000001';

\echo ''
\echo '== 7. deleting it again says it is gone (expect ERROR, not there any more) =='
set local role authenticated;
savepoint again;
select public.admin_delete_topic(:'topic_id');
rollback to savepoint again;

rollback;
