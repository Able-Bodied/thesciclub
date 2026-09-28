-- A removed post disappears, and stops being counted.
--
-- The owner, 2026-09-27: "if someone deletes a reply to a topic remove the
-- message, because it doesn't look good when it says removed by author." Until
-- now a removed post kept its place and its number with "Removed by its
-- author." in it (20260918060000), and reply_count kept counting it.
--
-- The row still stays. Soft delete is unchanged underneath — `removed_at` is
-- set, the words move to chat_removed_bodies, a report's snapshot survives —
-- because the reasons for it are about moderation, not display. What changes
-- is that nothing a member sees counts or shows a removed post:
--
--   - the topic screen draws only posts that are not removed, numbered among
--     themselves (client, topic-page.tsx);
--   - reply_count is the posts that are not removed, less the opening post;
--   - chat_room_stats.post_count counts only posts that are not removed;
--   - the faces on a topic row are people with a post still standing.
--
-- "The opening post" is the topic's earliest post, removed or not. If its
-- author removes it, the replies do not move up to become the question — the
-- count is of replies, and they are still replies.
--
-- Direct and group conversations are not changed: the owner asked about
-- topics, and a gap in a two-person conversation reads differently from a gap
-- in a forum thread.

-- ------------------------------------------------------------ the count
create or replace function public.chat_topic_reply_count(topic uuid)
returns integer
language sql
security definer
stable
set search_path = ''
as $$
  select count(*)::int
    from public.chat_posts p
   where p.topic_id = topic
     and p.removed_at is null
     and p.id <> (
       select o.id from public.chat_posts o
        where o.topic_id = topic
        order by o.created_at, o.id
        limit 1
     );
$$;

comment on function public.chat_topic_reply_count(uuid) is
  'Replies still standing: posts not removed, less the opening post.';

revoke all on function public.chat_topic_reply_count(uuid) from public, anon, authenticated;

create or replace function public.chat_bump_topic()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.chat_topics t
     set last_post_at = greatest(t.last_post_at, new.created_at),
         -- Recomputed, never incremented; and now of posts still standing.
         reply_count = public.chat_topic_reply_count(new.topic_id)
   where t.id = new.topic_id;
  return null;
end;
$$;

-- ------------------------------------------------------------ removal
-- As 20260918200000, plus the recount at the end.
create or replace function public.chat_remove_post(post uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.chat_posts;
begin
  select * into target from public.chat_posts p where p.id = post;
  if not found then
    raise exception 'There is no such post.' using errcode = 'P0002';
  end if;

  if not exists (
    select 1 from public.chat_topics t
    where t.id = target.topic_id and public.chat_room_is_readable(t.room_id)
  ) then
    raise exception 'There is no such post.' using errcode = 'P0002';
  end if;

  if target.author_id is distinct from auth.uid() and not public.is_admin() then
    raise exception 'Only the person who wrote a post, or an administrator, can remove it.'
      using errcode = '42501';
  end if;

  if target.removed_at is not null then
    return;
  end if;

  insert into public.chat_removed_bodies (post_id, body, attachments, removed_by)
  values (target.id, target.body, target.attachments, auth.uid())
  on conflict (post_id) do nothing;

  update public.chat_posts
     set body = '',
         attachments = '{}',
         removed_at = now(),
         removed_by_admin = (target.author_id is distinct from auth.uid())
   where id = target.id;

  update public.chat_topics t
     set reply_count = public.chat_topic_reply_count(target.topic_id)
   where t.id = target.topic_id;
end;
$$;

-- ------------------------------------------------------------ the faces
-- As 20260918050000, with removed posts left out of the stack of faces.
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
    (select count(*) from public.chat_topic_reads tr where tr.topic_id = t.id) as view_count,
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

-- ------------------------------------------------------------ room counts
create or replace view public.chat_room_stats as
select
  r.id as room_id,
  (select count(*) from public.chat_topics t where t.room_id = r.id) as topic_count,
  (
    select count(*)
    from public.chat_posts p
    join public.chat_topics t on t.id = p.topic_id
    where t.room_id = r.id and p.removed_at is null
  ) as post_count,
  (select count(*) from public.chat_room_members m where m.room_id = r.id) as member_count
from public.chat_rooms r
-- The view's own gate; see 20260918050000.
where public.chat_room_is_readable(r.id);

-- ------------------------------------------------------------ backfill
update public.chat_topics t
   set reply_count = public.chat_topic_reply_count(t.id)
 where t.reply_count is distinct from public.chat_topic_reply_count(t.id);
