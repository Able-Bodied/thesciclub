-- ============================================================================
-- A topic reads alone, and a room lists forty at a time
-- ============================================================================
-- Speed report, 2026-11-03: chat_topics_for(room) was 8% of database time on
-- Pro. It counts every topic's views across four tables, for the whole room,
-- and the topic page read it just to show one topic.
--
-- chat_topic_for(topic): that one topic's row, the same columns and rules.
-- chat_topics_page(room, max_rows, before_at, before_id): the room's list in
-- the same order (newest activity first, id breaking a tie), max_rows at a
-- time (40 by default, at most 200), after the last row of the page before.
-- The page is chosen first and only its rows are counted. Rooms have no pinned
-- topics, so there is nothing to keep at the top.
--
-- chat_topics_for(room) is unchanged, for store apps that still call it.
--
-- Probe: topic-list-pages.sql. Undo: supabase/undo/20261104212000.sql.
-- ============================================================================

create function public.chat_topic_for(topic uuid)
returns table(id uuid, room_id text, title text, author_id uuid, created_at timestamptz, last_post_at timestamptz, reply_count integer, view_count bigint, unread boolean, participant_ids uuid[])
language sql
stable security definer
set search_path = ''
as $$
  with hidden as (select private.my_hidden_member_ids() as ids)
  select
    t.id,
    t.room_id,
    t.title,
    t.author_id,
    t.created_at,
    t.last_post_at,
    t.reply_count,
    (select count(distinct v.member_id) from (
       select tr.member_id from public.chat_topic_reads tr where tr.topic_id = t.id
       union all
       select s.member_id from public.chat_post_views s
         join public.chat_posts p on p.id = s.post_id where p.topic_id = t.id
       union all
       select l.member_id from public.chat_post_likes l
         join public.chat_posts p on p.id = l.post_id where p.topic_id = t.id
       union all
       select x.member_id from public.chat_post_reactions x
         join public.chat_posts p on p.id = x.target_id where p.topic_id = t.id
     ) v
     where v.member_id is distinct from t.author_id) as view_count,
    t.last_post_at > coalesce(
      (select r.last_read_at from public.chat_topic_reads r
        where r.topic_id = t.id and r.member_id = auth.uid()),
      '-infinity'::timestamptz
    ) as unread,
    (
      select coalesce(array_agg(s.author_id order by s.first_at), '{}'::uuid[])
      from (
        select p.author_id, min(p.created_at) as first_at
        from public.chat_posts p
        where p.topic_id = t.id and p.author_id is not null and p.removed_at is null
          and not (p.author_id = any (hidden.ids))
        group by p.author_id
        order by min(p.created_at)
        limit 4
      ) s
    ) as participant_ids
  from public.chat_topics t
  cross join hidden
  where t.id = topic
    -- Definer: the only thing between a member and a closed room.
    and public.chat_room_is_readable(t.room_id)
    and not coalesce(t.author_id = any (hidden.ids), false);
$$;

comment on function public.chat_topic_for(uuid) is
  'One topic as chat_topics_for(room) returns it, under the same rules.';

revoke all on function public.chat_topic_for(uuid) from public, anon;
grant execute on function public.chat_topic_for(uuid) to authenticated, service_role;

-- before_at must be the last row's last_post_at exactly as returned (to the
-- microsecond), with its id.
create function public.chat_topics_page(room text, max_rows integer default 40, before_at timestamptz default null, before_id uuid default null)
returns table(id uuid, room_id text, title text, author_id uuid, created_at timestamptz, last_post_at timestamptz, reply_count integer, view_count bigint, unread boolean, participant_ids uuid[])
language sql
stable security definer
set search_path = ''
as $$
  with hidden as (select private.my_hidden_member_ids() as ids),
  page as materialized (
    select t.*
    from public.chat_topics t
    cross join hidden
    where t.room_id = room
      -- Definer: the only thing between a member and a closed room.
      and public.chat_room_is_readable(room)
      and not coalesce(t.author_id = any (hidden.ids), false)
      and (before_at is null
           or t.last_post_at < before_at
           or (t.last_post_at = before_at and t.id < before_id))
    order by t.last_post_at desc, t.id desc
    limit least(greatest(coalesce(max_rows, 40), 1), 200)
  )
  select
    t.id,
    t.room_id,
    t.title,
    t.author_id,
    t.created_at,
    t.last_post_at,
    t.reply_count,
    (select count(distinct v.member_id) from (
       select tr.member_id from public.chat_topic_reads tr where tr.topic_id = t.id
       union all
       select s.member_id from public.chat_post_views s
         join public.chat_posts p on p.id = s.post_id where p.topic_id = t.id
       union all
       select l.member_id from public.chat_post_likes l
         join public.chat_posts p on p.id = l.post_id where p.topic_id = t.id
       union all
       select x.member_id from public.chat_post_reactions x
         join public.chat_posts p on p.id = x.target_id where p.topic_id = t.id
     ) v
     where v.member_id is distinct from t.author_id) as view_count,
    t.last_post_at > coalesce(
      (select r.last_read_at from public.chat_topic_reads r
        where r.topic_id = t.id and r.member_id = auth.uid()),
      '-infinity'::timestamptz
    ) as unread,
    (
      select coalesce(array_agg(s.author_id order by s.first_at), '{}'::uuid[])
      from (
        select p.author_id, min(p.created_at) as first_at
        from public.chat_posts p
        where p.topic_id = t.id and p.author_id is not null and p.removed_at is null
          and not (p.author_id = any (hidden.ids))
        group by p.author_id
        order by min(p.created_at)
        limit 4
      ) s
    ) as participant_ids
  from page t
  cross join hidden
  order by t.last_post_at desc, t.id desc;
$$;

comment on function public.chat_topics_page(text, integer, timestamptz, uuid) is
  'A room''s topics as chat_topics_for(room) returns them, a page at a time, newest activity first.';

revoke all on function public.chat_topics_page(text, integer, timestamptz, uuid) from public, anon;
grant execute on function public.chat_topics_page(text, integer, timestamptz, uuid) to authenticated, service_role;
