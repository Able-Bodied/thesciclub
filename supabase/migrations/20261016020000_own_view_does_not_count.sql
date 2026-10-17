-- ============================================================================
-- Your own view of your own post does not count
-- ============================================================================
-- The owner, 2026-10-16: a post's author opened it, which counted, so every
-- post started at "1 view" and the author could not tell when somebody else
-- first saw it. chat_post_view_counts (20261011010000) as it was, but the
-- author's own read-through marker is left out: a new post reads "0 views"
-- until another member is delivered it.
--
-- A topic's own count, in chat_topics_for (20260927030000, as it was), leaves
-- out the member who started it the same way, so a room's list and the topic
-- page say "0 views" too until somebody else opens it.
--
-- A deleted member's post or topic has no author; everybody who read it still
-- counts. Likes are unchanged: a member may still like their own post.
-- ============================================================================

create or replace function public.chat_post_view_counts(post_ids uuid[])
returns table (post_id uuid, view_count bigint)
language sql stable security definer set search_path = '' as $$
  select p.id, count(r.member_id)
  from public.chat_posts p
  join public.chat_topics t on t.id = p.topic_id
  left join public.chat_topic_reads r
    on r.topic_id = p.topic_id
   and r.last_read_at >= p.created_at
   and r.member_id is distinct from p.author_id
  where p.id = any(post_ids)
    and p.removed_at is null
    and public.chat_room_is_readable(t.room_id)
  group by p.id;
$$;
revoke all on function public.chat_post_view_counts(uuid[]) from public, anon;
grant execute on function public.chat_post_view_counts(uuid[]) to authenticated;

create or replace function public.chat_topics_for(room text)
returns table (
  id uuid,
  room_id text,
  title text,
  author_id uuid,
  created_at timestamptz,
  last_post_at timestamptz,
  reply_count int,
  view_count bigint,
  unread boolean,
  participant_ids uuid[]
)
language sql
security definer
stable
set search_path = ''
as $$
  select
    t.id,
    t.room_id,
    t.title,
    t.author_id,
    t.created_at,
    t.last_post_at,
    t.reply_count,
    (select count(*) from public.chat_topic_reads tr
      where tr.topic_id = t.id and tr.member_id is distinct from t.author_id) as view_count,
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
        group by p.author_id
        order by min(p.created_at)
        limit 4
      ) s
    ) as participant_ids
  from public.chat_topics t
  where t.room_id = room
    -- Definer: this is the only thing between a member and a closed room.
    and public.chat_room_is_readable(room)
  order by t.last_post_at desc;
$$;
