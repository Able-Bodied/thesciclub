-- ============================================================================
-- A member who liked or reacted to a post has seen it
-- ============================================================================
-- The owner, 2026-10-19: a post with a like and a heart said "0 views". Home
-- shows a post whole and takes Like and React on the card, so a member can
-- answer it without opening the topic, which is the only thing that wrote a
-- view (chat_topic_reads). Now a like or a reaction counts too, once per
-- member however many of the three they have. The author never counts
-- (20261016020000), self-likes included.
--
-- chat_topic_viewed_by_me lets the topic page know whether opening it adds the
-- reader, so a member who liked from Home is not counted twice on arrival.
-- ============================================================================

create or replace function public.chat_post_view_counts(post_ids uuid[])
returns table (post_id uuid, view_count bigint)
language sql stable security definer set search_path = '' as $$
  select p.id,
    (select count(distinct v.member_id) from (
       select r.member_id from public.chat_topic_reads r
         where r.topic_id = p.topic_id and r.last_read_at >= p.created_at
       union all
       select l.member_id from public.chat_post_likes l where l.post_id = p.id
       union all
       select x.member_id from public.chat_post_reactions x where x.target_id = p.id
     ) v
     where v.member_id is distinct from p.author_id)
  from public.chat_posts p
  join public.chat_topics t on t.id = p.topic_id
  where p.id = any(post_ids)
    and p.removed_at is null
    and public.chat_room_is_readable(t.room_id);
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
    (select count(distinct v.member_id) from (
       select tr.member_id from public.chat_topic_reads tr where tr.topic_id = t.id
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

-- Invoker: only the caller's own rows, through the tables' own policies.
create or replace function public.chat_topic_viewed_by_me(topic uuid)
returns boolean
language sql stable security invoker set search_path = '' as $$
  select exists (select 1 from public.chat_topic_reads r
                  where r.topic_id = topic and r.member_id = auth.uid())
      or exists (select 1 from public.chat_post_likes l
                  join public.chat_posts p on p.id = l.post_id
                  where p.topic_id = topic and l.member_id = auth.uid())
      or exists (select 1 from public.chat_post_reactions x
                  join public.chat_posts p on p.id = x.target_id
                  where p.topic_id = topic and x.member_id = auth.uid());
$$;
revoke all on function public.chat_topic_viewed_by_me(uuid) from public, anon;
grant execute on function public.chat_topic_viewed_by_me(uuid) to authenticated;
