-- Undo for 20261118240000_home_sorts_by_views_replies_upvotes_and_engaged.sql:
-- home_topics_shown as 20261118230000 left it. Put back a website from before
-- it first: the four orders it adds then read as the default one.

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
