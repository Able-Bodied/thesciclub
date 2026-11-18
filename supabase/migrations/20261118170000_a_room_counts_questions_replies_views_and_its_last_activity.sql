-- ============================================================================
-- A room counts its questions, replies and views, and says when it was last
-- active
-- ============================================================================
-- The owner, 2026-11-18: "At the top level can we count the number of
-- questions, number of posts, number of replies, number of views, and how long
-- ago or date was the last activity."
--
-- In the club's words from the same day, what a member starts in a room is a
-- post (chat_topics; a question is a post asked as one, is_question) and what
-- is written under it is a reply (chat_posts but the opening one).
--
-- chat_room_stats gains four columns, after the three it has. Nothing is
-- renamed or removed: a store build still reads topic_count and post_count.
--
--   question_count    posts asked as a question
--   reply_count       the sum of chat_topics.reply_count, which already leaves
--                     out removed replies and the opening post (20260927030000)
--   view_count        the sum of each post's view count as a room lists it:
--                     the members who read, saw, liked or reacted to it, but
--                     its author (20261019000000)
--   last_activity_at  the newest last_post_at, null for a room with no posts
--
-- Counts and never names, as before, and the view's own gate is unchanged.
-- security_barrier is said again: "create or replace view" drops an option it
-- is not given (20261003030000).
--
-- Probe: supabase/tests/room-counts.sql. Undo: supabase/undo/20261118170000.sql.
-- ============================================================================

create or replace view public.chat_room_stats with (security_barrier = true) as
select
  r.id as room_id,
  (select count(*) from public.chat_topics t where t.room_id = r.id) as topic_count,
  (
    select count(*)
    from public.chat_posts p
    join public.chat_topics t on t.id = p.topic_id
    where t.room_id = r.id and p.removed_at is null
  ) as post_count,
  (select count(*) from public.chat_room_members m where m.room_id = r.id) as member_count,
  (select count(*) from public.chat_topics t where t.room_id = r.id and t.is_question) as question_count,
  (select coalesce(sum(t.reply_count), 0)::bigint from public.chat_topics t where t.room_id = r.id) as reply_count,
  (
    -- One row for each post and member who saw it, however they did.
    select count(*)
    from (
      select t.id, tr.member_id
        from public.chat_topics t
        join public.chat_topic_reads tr on tr.topic_id = t.id
       where t.room_id = r.id and tr.member_id is distinct from t.author_id
      union
      select t.id, s.member_id
        from public.chat_topics t
        join public.chat_posts p on p.topic_id = t.id
        join public.chat_post_views s on s.post_id = p.id
       where t.room_id = r.id and s.member_id is distinct from t.author_id
      union
      select t.id, l.member_id
        from public.chat_topics t
        join public.chat_posts p on p.topic_id = t.id
        join public.chat_post_likes l on l.post_id = p.id
       where t.room_id = r.id and l.member_id is distinct from t.author_id
      union
      select t.id, x.member_id
        from public.chat_topics t
        join public.chat_posts p on p.topic_id = t.id
        join public.chat_post_reactions x on x.target_id = p.id
       where t.room_id = r.id and x.member_id is distinct from t.author_id
    ) seen
  ) as view_count,
  (select max(t.last_post_at) from public.chat_topics t where t.room_id = r.id) as last_activity_at
from public.chat_rooms r
-- The view's own gate; see 20260918050000.
where public.chat_room_is_readable(r.id);

comment on view public.chat_room_stats is
  'Counts for each room its reader may see: posts (topic_count), questions, replies, views and the last activity. Never names. See 20261118170000.';
