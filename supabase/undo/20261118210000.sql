-- Undo for 20261118210000_a_reply_under_the_post_is_quoted_on_home.sql:
-- home_topics_ranked as 20261118190000 left it.

create or replace function public.home_topics_ranked(max_rows integer default 40)
returns table(topic_id uuid, rank double precision, previews jsonb)
language sql
stable security definer
set search_path = ''
as $$
  with hidden as (select private.my_hidden_member_ids() as ids),
  candidates as materialized (
    select t.id, t.last_post_at
    from public.chat_topics t
    join public.chat_rooms room on room.id = t.room_id
    cross join hidden
    where room.show_in_home and room.opened_at is not null
      -- Definer: the only thing between a member and a closed room.
      and public.chat_room_is_readable(t.room_id)
      and not coalesce(t.author_id = any (hidden.ids), false)
    order by t.last_post_at desc, t.id desc
    limit 300
  ),
  ranked as materialized (
    select c.id, c.last_post_at, private.chat_topic_rank(c.id, auth.uid()) as rank
    from candidates c
    order by rank desc, c.last_post_at desc, c.id desc
    limit least(greatest(coalesce(max_rows, 40), 1), 100)
  ),
  replies as materialized (
    -- What a card may quote: standing answers to the topic, not to a reply,
    -- not from somebody the reader has hidden, and not voted below 0.
    select r.id as topic_id, p.id, p.created_at, p.author_id,
      private.chat_post_score(p.id) as score,
      p.created_at > (select x.last_read_at from public.chat_topic_reads x
                       where x.topic_id = r.id and x.member_id = auth.uid())
        and p.author_id is distinct from auth.uid() as unread
    from ranked r
    cross join hidden
    join public.chat_posts p on p.topic_id = r.id
    where p.removed_at is null and p.reply_to is null
      and p.id <> (select f.id from public.chat_posts f where f.topic_id = r.id
                    order by f.created_at, f.id limit 1)
      and not coalesce(p.author_id = any (hidden.ids), false)
  ),
  scored as (
    select r.*
    from replies r
    where r.score >= 0
  ),
  picks as (
    select r.id as topic_id, r.rank, r.last_post_at,
      (select s.id from scored s where s.topic_id = r.id and s.score >= 1
        order by s.score desc, s.created_at desc, s.id desc limit 1) as top_id,
      (select s.id from scored s where s.topic_id = r.id and s.unread
        order by s.created_at, s.id limit 1) as unread_id,
      (select s.id from scored s where s.topic_id = r.id
        order by s.created_at desc, s.id desc limit 1) as newest_id
    from ranked r
  ),
  picks2 as (
    select p.*,
      coalesce(
        case when p.unread_id is distinct from p.top_id then p.unread_id end,
        (select s.id from scored s where s.topic_id = p.topic_id
           and s.id is distinct from p.top_id
         order by s.created_at desc, s.id desc limit 1)
      ) as second_id
    from picks p
  ),
  picks3 as (
    select p.*,
      case
        when p.top_id is not null then null
        else (select s.id from scored s where s.topic_id = p.topic_id
                and s.id is distinct from p.second_id
              order by s.created_at desc, s.id desc limit 1)
      end as third_id
    from picks2 p
  )
  select p.topic_id, p.rank,
    coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'kind', x.kind) order by x.ord)
               filter (where x.id is not null), '[]'::jsonb)
  from picks3 p
  cross join lateral (values
    (1, p.top_id, 'top'),
    (2, p.second_id, case when p.second_id = p.unread_id then 'unread'
                          when p.second_id = p.newest_id then 'latest' else 'reply' end),
    (3, p.third_id, 'reply')
  ) as x(ord, id, kind)
  group by p.topic_id, p.rank, p.last_post_at
  order by p.rank desc, p.last_post_at desc, p.topic_id desc;
$$;
