-- ============================================================================
-- Home sorts by views, replies, upvotes and the members engaged
-- ============================================================================
-- The owner, 2026-11-18, of Home's Sort by (20261118230000): "Add most views,
-- most replies, most upvotes, and most engaged users".
--
-- home_topics_shown is 20261118230000's, with four more values of p_sort,
-- each the largest first and, where equal, the latest reply first:
--
--   'views'         the members who saw the post, as its row in a room counts
--   'most_replies'  its replies (chat_topics.reply_count)
--   'upvotes'       upvotes on the post itself
--   'engaged'       the members, other than its author, who replied, voted or
--                   reacted under it
--
-- 'replies' is still the most recent reply first. As before, each is worked
-- out among the three hundred posts last active (for 'newest', last started).
--
-- Probe: supabase/tests/home-shows-mine-and-my-organizations.sql, step 4.
-- Undo: supabase/undo/20261118240000.sql.
-- ============================================================================

create or replace function public.home_topics_shown(
  p_show text default 'all',
  p_sort text default 'ranking',
  max_rows integer default 40
)
returns table(topic_id uuid, ord integer)
language sql
stable security definer
set search_path = ''
as $$
  with hidden as (select private.my_hidden_member_ids() as ids),
  candidates as materialized (
    select t.id, t.last_post_at, t.created_at, t.author_id, t.reply_count
    from public.chat_topics t
    join public.chat_rooms room on room.id = t.room_id
    cross join hidden
    where room.show_in_home and room.opened_at is not null
      -- Definer: the only thing between a member and a closed room.
      and public.chat_room_is_readable(t.room_id)
      and not coalesce(t.author_id = any (hidden.ids), false)
      and case p_show
        when 'mine' then t.author_id = auth.uid()
        when 'replied' then exists (
          select 1 from public.chat_posts p
           where p.topic_id = t.id and p.author_id = auth.uid() and p.removed_at is null
             and p.id <> (select f.id from public.chat_posts f where f.topic_id = t.id
                           order by f.created_at, f.id limit 1)
        )
        when 'orgs' then t.author_id is distinct from auth.uid() and exists (
          select 1 from public.organization_follows mine
            join public.organization_follows theirs
              on theirs.organization_id = mine.organization_id
           where mine.member_id = auth.uid() and theirs.member_id = t.author_id
        )
        else true
      end
    -- The newest three hundred by the order asked for; the default order is
    -- worked out among the three hundred last active, as the ranking does.
    order by case when p_sort = 'newest' then t.created_at else t.last_post_at end desc, t.id desc
    limit 300
  ),
  keyed as (
    select c.id,
      case p_sort
        when 'newest' then extract(epoch from c.created_at)
        when 'replies' then extract(epoch from c.last_post_at)
        when 'most_replies' then c.reply_count
        -- As a room's list counts a post's views (20261019000000): the
        -- members who read it, saw it, liked it or reacted, but its author.
        when 'views' then (
          select count(distinct v.member_id) from (
            select tr.member_id from public.chat_topic_reads tr where tr.topic_id = c.id
            union all
            select s.member_id from public.chat_post_views s
              join public.chat_posts p on p.id = s.post_id where p.topic_id = c.id
            union all
            select l.member_id from public.chat_post_likes l
              join public.chat_posts p on p.id = l.post_id where p.topic_id = c.id
            union all
            select x.member_id from public.chat_post_reactions x
              join public.chat_posts p on p.id = x.target_id where p.topic_id = c.id
          ) v
          where v.member_id is distinct from c.author_id
        )
        -- Upvotes on the post itself, not on the replies under it.
        when 'upvotes' then (
          select count(*) from public.chat_post_likes l
           where l.post_id = (select f.id from public.chat_posts f where f.topic_id = c.id
                               order by f.created_at, f.id limit 1)
        )
        -- The members who did something under it, each once: replied, voted
        -- either way or reacted, on the post or a reply. Not its author.
        when 'engaged' then (
          select count(distinct e.member_id) from (
            select p.author_id as member_id from public.chat_posts p
             where p.topic_id = c.id and p.removed_at is null
            union all
            select l.member_id from public.chat_post_likes l
              join public.chat_posts p on p.id = l.post_id where p.topic_id = c.id
            union all
            select d.member_id from public.chat_post_downvotes d
              join public.chat_posts p on p.id = d.post_id where p.topic_id = c.id
            union all
            select x.member_id from public.chat_post_reactions x
              join public.chat_posts p on p.id = x.target_id where p.topic_id = c.id
          ) e
          where e.member_id is not null and e.member_id is distinct from c.author_id
        )
        else private.chat_topic_rank(c.id, auth.uid())
      end::double precision as sort_key,
      c.last_post_at
    from candidates c
  )
  select k.id,
    (row_number() over (order by k.sort_key desc, k.last_post_at desc, k.id desc))::integer
  from keyed k
  order by k.sort_key desc, k.last_post_at desc, k.id desc
  limit least(greatest(coalesce(max_rows, 40), 1), 100);
$$;
