-- ============================================================================
-- Home reads its posts in one request
-- ============================================================================
-- The owner, 2026-11-18, with debug mode's times for Home in hand: the
-- ranking answered after 420 ms, and only then were the posts asked for,
-- another 1,046 ms; the posts' text was on screen after both, and after the
-- travel there and back twice. "I would do all three", the first of which was
-- one request for the feed.
--
-- home_feed(p_show, p_sort, max_rows) is that request: which posts and in
-- what order (home_topics_ranked for the default, home_topics_shown for a
-- chosen Show or Sort, each as it stands), and with them everything a card
-- is drawn from, in the shape the website read from chat_topics until now:
--
--   the topic's own columns, 'ord' (its place) and 'previews' (the replies
--     the ranking chose; null for a chosen Show or Sort)
--   'author'   its author's row of chat_authors
--   'opening'  its earliest post, removed or not, in a list of one
--   'replies'  the replies to quote, standing ones only, each with 'author':
--              the ranking's, or for a chosen Show or Sort the first standing
--              answer made in the open or to the opening post (20261118210000)
--
-- SECURITY INVOKER, on purpose: the two functions it calls say which posts,
-- and every row it then reads (chat_topics, chat_posts, chat_authors) is read
-- as the member, under the same policies as the read it replaces. It can
-- show nothing that read could not.
--
-- Additive: nothing is changed or dropped, so a website or an iPhone app
-- from before it reads as it did, with the two requests.
--
-- Probe: supabase/tests/home-reads-its-posts-in-one-request.sql.
-- Undo: supabase/undo/20261118260000.sql.
-- ============================================================================

create or replace function public.home_feed(
  p_show text default 'all',
  p_sort text default 'ranking',
  max_rows integer default 40
)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with picked as materialized (
    -- One of the two, by what was asked for: the other is never run.
    select r.topic_id, (r.ord - 1)::integer as ord, r.previews
    from public.home_topics_ranked(max_rows)
         with ordinality as r(topic_id, rank, previews, ord)
    where coalesce(p_show, 'all') = 'all' and coalesce(p_sort, 'ranking') = 'ranking'
    union all
    select s.topic_id, s.ord, null::jsonb
    from public.home_topics_shown(p_show, p_sort, max_rows) s
    where not (coalesce(p_show, 'all') = 'all' and coalesce(p_sort, 'ranking') = 'ranking')
  )
  select coalesce(jsonb_agg(card.body order by card.ord), '[]'::jsonb)
  from (
    select k.ord,
      jsonb_build_object(
        'id', t.id,
        'room_id', t.room_id,
        'title', t.title,
        'author_id', t.author_id,
        'created_at', t.created_at,
        'last_post_at', t.last_post_at,
        'reply_count', t.reply_count,
        'is_question', t.is_question,
        'ord', k.ord,
        'previews', k.previews,
        'author', (select to_jsonb(a) from public.chat_authors a where a.id = t.author_id),
        'opening', case when opening.id is null then '[]'::jsonb
                        else jsonb_build_array(opening.body) end,
        'replies', coalesce((
          select jsonb_agg(
                   jsonb_build_object(
                     'id', p.id, 'topic_id', p.topic_id, 'author_id', p.author_id,
                     'body', p.body, 'attachments', p.attachments,
                     'created_at', p.created_at, 'removed_at', p.removed_at,
                     'removed_by_admin', p.removed_by_admin, 'edited_at', p.edited_at,
                     'reply_to', p.reply_to, 'link_preview', p.link_preview,
                     'author', (select to_jsonb(a) from public.chat_authors a
                                 where a.id = p.author_id))
                   order by p.created_at, p.id)
          from public.chat_posts p
          where p.topic_id = t.id
            and p.removed_at is null
            and case
              when k.previews is not null then
                p.id in (select (x ->> 'id')::uuid from jsonb_array_elements(k.previews) x)
              else
                p.id = (
                  select f.id from public.chat_posts f
                   where f.topic_id = t.id and f.removed_at is null
                     and f.id is distinct from opening.id
                     and (f.reply_to is null or f.reply_to = opening.id)
                   order by f.created_at, f.id limit 1)
            end
        ), '[]'::jsonb)
      ) as body
    from picked k
    join public.chat_topics t on t.id = k.topic_id
    join public.chat_rooms room on room.id = t.room_id
      and room.show_in_home and room.opened_at is not null
    left join lateral (
      select f.id,
        jsonb_build_object(
          'id', f.id, 'topic_id', f.topic_id, 'author_id', f.author_id,
          'body', f.body, 'attachments', f.attachments,
          'created_at', f.created_at, 'removed_at', f.removed_at,
          'removed_by_admin', f.removed_by_admin, 'edited_at', f.edited_at,
          'reply_to', f.reply_to, 'link_preview', f.link_preview) as body
      from public.chat_posts f
      where f.topic_id = t.id
      order by f.created_at, f.id
      limit 1
    ) opening on true
  ) card;
$$;

comment on function public.home_feed(text, text, integer) is
  'Home''s posts in one request: which and in what order (home_topics_ranked or home_topics_shown), each with its author, opening post and the replies to quote. Invoker: every row is read as the member. See 20261118260000.';

revoke all on function public.home_feed(text, text, integer) from public, anon;
grant execute on function public.home_feed(text, text, integer) to authenticated;
