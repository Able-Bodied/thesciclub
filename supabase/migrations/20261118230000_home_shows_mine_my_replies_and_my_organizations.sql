-- ============================================================================
-- Home shows my posts, my replies or my organizations', in a chosen order
-- ============================================================================
-- The owner, 2026-11-18: "On home filters under show, I think we should have
-- everything, my posts, my replies, from my orgs. Also lets add a sort
-- feature, sort by default ranking, most recent replies, most recent post".
--
-- home_topics_ranked (20261118190000) stays what Home reads as it opens:
-- everything, in the default order, with the replies each card quotes. For any
-- other choice Home asks this function which posts, and in what order, and
-- reads them as it reads the rest. The same gates as the ranking: rooms shown
-- on Home, open and readable by the reader, and nobody the reader has hidden.
--
--   p_show  'all'      every such post
--           'mine'     those the reader started
--           'replied'  those the reader has replied under (a standing post of
--                      theirs that is not the opening one)
--           'orgs'     those started by somebody else who belongs to an
--                      organization the reader belongs to (organization_follows,
--                      which the database keeps to active members,
--                      20261030000000)
--   p_sort  'ranking'  the default order (private.chat_topic_rank)
--           'replies'  the latest reply first (last_post_at)
--           'newest'   the newest post first (created_at)
--
-- Anything else in either argument reads as 'all' and 'ranking'.
--
-- Probe: supabase/tests/home-shows-mine-and-my-organizations.sql.
-- Undo: supabase/undo/20261118230000.sql.
-- ============================================================================

create function public.home_topics_shown(
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
    select t.id, t.last_post_at, t.created_at
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
        else private.chat_topic_rank(c.id, auth.uid())
      end as sort_key,
      c.last_post_at
    from candidates c
  )
  select k.id,
    (row_number() over (order by k.sort_key desc, k.last_post_at desc, k.id desc))::integer
  from keyed k
  order by k.sort_key desc, k.last_post_at desc, k.id desc
  limit least(greatest(coalesce(max_rows, 40), 1), 100);
$$;

comment on function public.home_topics_shown(text, text, integer) is
  'Home''s posts for a choice of Show (all, mine, replied, orgs) and Sort (ranking, replies, newest), in order. See 20261118230000.';

revoke all on function public.home_topics_shown(text, text, integer) from public, anon;
grant execute on function public.home_topics_shown(text, text, integer) to authenticated;
