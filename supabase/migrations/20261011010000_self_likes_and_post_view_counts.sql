-- The owner wants Like and both counts on every post, including their own.
-- Keep identity, suspension, removal and room visibility checks; only the
-- author exclusion changes. Self-likes already do not notify their author
-- (push_owed's like branch excludes the liker).
drop policy "an active member likes somebody else's standing post" on public.chat_post_likes;
create policy "an active member likes a standing post"
  on public.chat_post_likes for insert to authenticated
  with check (
    member_id = (select auth.uid())
    and public.is_active_member()
    and exists (
      select 1 from public.chat_posts p
      join public.chat_topics t on t.id = p.topic_id
      where p.id = chat_post_likes.post_id
        and p.removed_at is null
        and public.chat_room_is_readable(t.room_id)
    )
  );

-- A view means a distinct member was delivered this post. The existing
-- topic read-through marker counts earlier posts, never replies arriving
-- after the reader left. Return counts only, never the private reader ids.
create function public.chat_post_view_counts(post_ids uuid[])
returns table (post_id uuid, view_count bigint)
language sql stable security definer set search_path = '' as $$
  select p.id, count(r.member_id)
  from public.chat_posts p
  join public.chat_topics t on t.id = p.topic_id
  left join public.chat_topic_reads r
    on r.topic_id = p.topic_id and r.last_read_at >= p.created_at
  where p.id = any(post_ids)
    and p.removed_at is null
    and public.chat_room_is_readable(t.room_id)
  group by p.id;
$$;
revoke all on function public.chat_post_view_counts(uuid[]) from public, anon;
grant execute on function public.chat_post_view_counts(uuid[]) to authenticated;

-- Room topic rows like the same opening post as Home. Keep a removed opener
-- null instead of promoting somebody else's reply. Invoker RLS gates both
-- tables, so this returns nothing from a room the member cannot read.
create function public.chat_topic_opening_posts(topic_ids uuid[])
returns table (topic_id uuid, post_id uuid)
language sql stable security invoker set search_path = '' as $$
  select distinct on (p.topic_id) p.topic_id,
    case when p.removed_at is null then p.id else null end
  from public.chat_posts p
  where p.topic_id = any(topic_ids)
  order by p.topic_id, p.created_at, p.id;
$$;
revoke all on function public.chat_topic_opening_posts(uuid[]) from public, anon;
grant execute on function public.chat_topic_opening_posts(uuid[]) to authenticated;
