-- ============================================================================
-- One order for every member: latest activity, a little newer for votes
-- ============================================================================
-- The owner, 2026-11-18, of 20261118190000's ranking for each member: "Adding
-- in ranking really complicates things as every user sees something
-- different", "we want people to see what was the latest comment". Asked for
-- the simplest order that keeps freshness, as before, but still counts votes.
--
-- private.chat_topic_rank(topic, viewer) keeps its arguments, so
-- chat_topics_ranked (a room's Top) and home_topics_ranked call it as they
-- did, but the viewer no longer counts. In hours, larger first:
--   the topic's last activity (a reply is activity, as before 20261118180000)
--   + 2 hours a vote on its opening post, at most 24: upvotes not the
--     author's own, less downvotes; below 0 counts as 0
--   + 24 hours while an administrator's boost is under 14 days old.
-- Nothing about what the reader has opened or seen.
--
-- home_topics_ranked: 20261118210000's, but every member is quoted the same
-- replies, the top one (score 1 or more) and the latest; no first unread.
--
-- Probe: supabase/tests/a-ranking-for-home-and-rooms.sql.
-- Undo: supabase/undo/20261118220000.sql.
-- ============================================================================

create or replace function private.chat_topic_rank(topic uuid, viewer uuid)
returns double precision
language sql
stable
security definer
set search_path = ''
as $$
  with t as (
    select x.id, x.author_id, x.last_post_at,
      (select case when p.removed_at is null then p.id end
         from public.chat_posts p where p.topic_id = x.id
        order by p.created_at, p.id limit 1) as opening_id
    from public.chat_topics x
    where x.id = topic
  )
  select extract(epoch from t.last_post_at) / 3600
    + 2 * least(greatest(coalesce(
        (select count(*) from public.chat_post_likes l
          where l.post_id = t.opening_id and l.member_id is distinct from t.author_id)
      - (select count(*) from public.chat_post_downvotes d where d.post_id = t.opening_id),
      0), 0), 12)
    + case when t.opening_id is not null
           then 24 * private.chat_post_boost(t.opening_id) / 10 else 0 end
  from t;
$$;

comment on function private.chat_topic_rank(uuid, uuid) is
  'A topic''s place, the same for every member: last activity in hours, plus 2 a vote (at most 24) and 24 for a running boost. viewer is unused (20261118220000).';

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
    -- What a card may quote: standing answers to the topic, made in the open
    -- or with Reply on the opening post itself (20261118210000); not a reply
    -- to a reply, not from somebody the reader has hidden, and not voted
    -- below 0.
    select r.id as topic_id, p.id, p.created_at, p.author_id,
      private.chat_post_score(p.id) as score,
      -- No "first unread" any more (20261118220000): every member is shown
      -- the same replies, the top one and the latest.
      false as unread
    from ranked r
    cross join hidden
    join public.chat_posts p on p.topic_id = r.id
    cross join lateral (
      select f.id from public.chat_posts f where f.topic_id = r.id
       order by f.created_at, f.id limit 1
    ) opening
    where p.removed_at is null
      and (p.reply_to is null or p.reply_to = opening.id)
      and p.id <> opening.id
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
