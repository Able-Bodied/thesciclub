-- ============================================================================
-- One ranking for Home and a room's Top, Home's two replies, a boost capped at
-- 10 for 14 days, and the administrators told when a post falls to -3
-- ============================================================================
-- The owner, 2026-11-18: "freshness or posts you have not seen should be
-- boosted more ... if there is a new reply to a post, we should promote that
-- reply on the home preview and count that reply as the latest update date".
-- Then "We can cap boost stacking. Do we pull the highest ranked response to
-- the post preview on home?" and "negative scores are fine. notification
-- seems fine if a score is -3". The plan was checked by a second model first.
--
-- A boost: +10 while any boost on the post is under 14 days old, and never
-- more (private.chat_post_boost). admin_boost_post adds nothing at the cap and
-- "take back" takes back every boost still running. The shown score counts
-- only that +10, so a lapsed or stacked boost stops counting everywhere.
--
-- private.chat_topic_rank(topic, viewer): one number per topic per member, in
-- days, larger first. A day newer is one point. From 0, less days since the
-- topic's last activity (a reply is activity: last_post_at moves with each),
-- plus for a topic that is not the viewer's own:
--   +14 never opened and its opening post not seen on Home
--   +7  seen on Home, not opened
--   +8  opened, with a reply since by somebody else (+12 if the viewer has
--       posted in it: a conversation they are part of moved on)
--   +5  the author's first topic, still without an answer from anybody else
--   and a topic without any reply, under 14 days old, is never older than 2
--   days, so a question asked on a quiet weekend is still near the top Monday.
-- and for every topic:
--   +2 log2(1 + votes), votes being upvotes not the author's own less
--       downvotes; below 0 counts as 0, so a downvote never buries a post
--       (an administrator is told instead, below)
--   +10 for a boost still running.
-- The bonuses are all a member's own, so two members see different orders.
--
-- chat_topics_ranked (a room's Top) uses it; its columns are unchanged.
--
-- home_topics_ranked(max_rows): Home's topics in that order, from the 300 most
-- recently active in Home's rooms, each with the replies its card shows:
--   'top'    the reply with the highest score, if 1 or more
--   'unread' the first reply the viewer has not read, if they opened the topic
--   'latest' otherwise the newest reply
--   'reply'  the newest other one when the top reply is the newest, or with no
--            top reply, so a card still shows two
-- Never a reply with a score below 0, never the same reply twice, top first.
--
-- chat_reports.raised_by_votes: when a post's score reaches -3, a report is
-- made with no reporter, once per post, and the administrators are told as for
-- any report (20260927020000; a null reporter excludes nobody).
-- admin_chat_reports returns it, so the page can say who raised it.
--
-- Expand only: store apps still call chat_topics_page and admin_chat_reports
-- and get what they did, one column more.
--
-- Probe: supabase/tests/a-ranking-for-home-and-rooms.sql.
-- Undo: supabase/undo/20261118190000.sql.
-- ============================================================================

-- A boost, capped -------------------------------------------------------------

create function private.chat_post_boost(post uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case when exists (
    select 1 from public.chat_post_boosts b
     where b.post_id = post and b.boosted_at > now() - interval '14 days'
  ) then 10 else 0 end;
$$;

revoke all on function private.chat_post_boost(uuid) from public, anon, authenticated;

create or replace function private.chat_post_score(post uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case when post is null then 0 else (
      (select count(*) from public.chat_post_likes l where l.post_id = post)
    - (select count(*) from public.chat_post_downvotes d where d.post_id = post)
    + private.chat_post_boost(post)
  )::integer end;
$$;

create or replace function public.chat_post_scores(post_ids uuid[])
returns table(post_id uuid, score integer, my_vote smallint, boost integer)
language sql
stable
security definer
set search_path = ''
as $$
  select
    p.id,
    private.chat_post_score(p.id),
    case
      when exists (select 1 from public.chat_post_likes l where l.post_id = p.id and l.member_id = auth.uid()) then 1
      when exists (select 1 from public.chat_post_downvotes d where d.post_id = p.id and d.member_id = auth.uid()) then -1
      else 0
    end::smallint,
    case when public.is_admin() then private.chat_post_boost(p.id) end
  from public.chat_posts p
  join public.chat_topics t on t.id = p.topic_id
  where p.id = any (post_ids[1:1000])
    -- Definer: the only thing between a member and a closed room.
    and public.chat_room_is_readable(t.room_id);
$$;

create or replace function public.admin_boost_post(post uuid, more boolean default true)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Only the club''s administrators can boost a post.' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.chat_posts p
    join public.chat_topics t on t.id = p.topic_id
    where p.id = post and p.removed_at is null and public.chat_room_is_readable(t.room_id)
  ) then
    raise exception 'That post is not there to boost.' using errcode = 'P0002';
  end if;
  if more then
    -- At the cap already: nothing to add.
    if private.chat_post_boost(post) = 0 then
      insert into public.chat_post_boosts (post_id, admin_id) values (post, auth.uid());
    end if;
  else
    delete from public.chat_post_boosts b
     where b.post_id = post and b.boosted_at > now() - interval '14 days';
  end if;
  return private.chat_post_boost(post);
end;
$$;

comment on function public.admin_boost_post(uuid, boolean) is
  'A club administrator adds 10 to a post''s score for 14 days (never more than 10), or takes it back.';

-- The ranking -----------------------------------------------------------------

create function private.chat_topic_rank(topic uuid, viewer uuid)
returns double precision
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  t record;
  first_id uuid;
  opening_id uuid;
  own boolean;
  read_at timestamptz;
  viewed boolean;
  any_reply boolean;
  answered boolean;
  age double precision;
  bonus double precision := 0;
  votes integer;
begin
  select x.id, x.author_id, x.created_at, x.last_post_at into t
    from public.chat_topics x where x.id = topic;
  if not found then
    return null;
  end if;

  select p.id, case when p.removed_at is null then p.id end into first_id, opening_id
    from public.chat_posts p where p.topic_id = topic
   order by p.created_at, p.id limit 1;

  own := coalesce(t.author_id = viewer, false);
  any_reply := exists (
    select 1 from public.chat_posts p
     where p.topic_id = topic and p.id <> first_id and p.removed_at is null);

  age := extract(epoch from now() - t.last_post_at) / 86400;
  if not own and not any_reply and t.created_at > now() - interval '14 days' then
    age := least(age, 2);
  end if;

  if not own then
    select r.last_read_at into read_at
      from public.chat_topic_reads r where r.topic_id = topic and r.member_id = viewer;
    viewed := exists (
      select 1 from public.chat_post_views v where v.post_id = first_id and v.member_id = viewer);

    if read_at is null then
      bonus := bonus + case when viewed then 7 else 14 end;
    elsif exists (
      select 1 from public.chat_posts p
       where p.topic_id = topic and p.removed_at is null and p.created_at > read_at
         and p.author_id is distinct from viewer
    ) then
      bonus := bonus + case when exists (
        select 1 from public.chat_posts p where p.topic_id = topic and p.author_id = viewer
      ) then 12 else 8 end;
    end if;

    answered := exists (
      select 1 from public.chat_posts p
       where p.topic_id = topic and p.id <> first_id and p.removed_at is null
         and p.author_id is distinct from t.author_id);
    if not answered and t.author_id is not null and not exists (
      select 1 from public.chat_topics o
       where o.author_id = t.author_id and o.created_at < t.created_at
    ) then
      bonus := bonus + 5;
    end if;
  end if;

  if opening_id is not null then
    votes := (select count(*) from public.chat_post_likes l
               where l.post_id = opening_id and l.member_id is distinct from t.author_id)
           - (select count(*) from public.chat_post_downvotes d where d.post_id = opening_id);
    bonus := bonus + 2 * log(2, 1 + greatest(votes, 0)) + private.chat_post_boost(opening_id);
  end if;

  return bonus - age;
end;
$$;

revoke all on function private.chat_topic_rank(uuid, uuid) from public, anon, authenticated;

-- A room's Top: as 20261118180000, ranked by chat_topic_rank.
create or replace function public.chat_topics_ranked(room text, max_rows integer default 40, skip integer default 0)
returns table(id uuid, room_id text, title text, author_id uuid, created_at timestamptz, last_post_at timestamptz, reply_count integer, view_count bigint, unread boolean, participant_ids uuid[], score integer)
language sql
stable security definer
set search_path = ''
as $$
  with hidden as (select private.my_hidden_member_ids() as ids),
  topics as materialized (
    select t.*,
      (select case when p.removed_at is null then p.id end
         from public.chat_posts p where p.topic_id = t.id
        order by p.created_at, p.id limit 1) as opening_id,
      private.chat_topic_rank(t.id, auth.uid()) as rank
    from public.chat_topics t
    cross join hidden
    where t.room_id = room
      -- Definer: the only thing between a member and a closed room.
      and public.chat_room_is_readable(room)
      and not coalesce(t.author_id = any (hidden.ids), false)
  ),
  page as materialized (
    select s.*, private.chat_post_score(s.opening_id) as score
    from topics s
    order by s.rank desc, s.last_post_at desc, s.id desc
    offset greatest(coalesce(skip, 0), 0)
    limit least(greatest(coalesce(max_rows, 40), 1), 200)
  )
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
       select s.member_id from public.chat_post_views s
         join public.chat_posts p on p.id = s.post_id where p.topic_id = t.id
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
          and not (p.author_id = any (hidden.ids))
        group by p.author_id
        order by min(p.created_at)
        limit 4
      ) s
    ) as participant_ids,
    t.score
  from page t
  cross join hidden
  order by t.rank desc, t.last_post_at desc, t.id desc;
$$;

comment on function public.chat_topics_ranked(text, integer, integer) is
  'A room''s topics as chat_topics_page returns them, best first for the reader (private.chat_topic_rank).';

-- Home ------------------------------------------------------------------------

create function public.home_topics_ranked(max_rows integer default 40)
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

comment on function public.home_topics_ranked(integer) is
  'Home''s topics best first for the reader (private.chat_topic_rank), each with the replies its card quotes: top, then unread or latest.';

revoke all on function public.home_topics_ranked(integer) from public, anon;
grant execute on function public.home_topics_ranked(integer) to authenticated, service_role;

-- Voted down to -3 ------------------------------------------------------------

alter table public.chat_reports
  add column raised_by_votes boolean not null default false;

comment on column public.chat_reports.raised_by_votes is
  'Made when members voted the post down to -3, not by a member. reporter_id is null.';

create function private.chat_report_voted_down()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.chat_posts%rowtype;
  topic public.chat_topics%rowtype;
  room public.chat_rooms%rowtype;
begin
  if private.chat_post_score(new.post_id) > -3 then
    return null;
  end if;
  if exists (select 1 from public.chat_reports r where r.post_id = new.post_id and r.raised_by_votes) then
    return null;
  end if;
  select * into target from public.chat_posts p where p.id = new.post_id and p.removed_at is null;
  if not found then
    return null;
  end if;
  select * into topic from public.chat_topics t where t.id = target.topic_id;
  select * into room from public.chat_rooms r where r.id = topic.room_id;

  insert into public.chat_reports
    (kind, context_kind, post_id, reporter_id, reported_author_id,
     body_snapshot, attachments, written_at, place, topic_id, room_id, note, raised_by_votes)
  values
    ('post', 'room', target.id, null, target.author_id,
     target.body, target.attachments, target.created_at,
     room.name || ' › ' || topic.title, topic.id, room.id,
     'Members voted this post down to −3.', true);
  return null;
end;
$$;

revoke all on function private.chat_report_voted_down() from public, anon, authenticated;

-- After chat_post_downvotes_one_way by name, so a flipped upvote is gone first.
create trigger chat_post_downvotes_report_at_minus_three
  after insert on public.chat_post_downvotes
  for each row execute function private.chat_report_voted_down();

-- As 20261022130000, with raised_by_votes. Its columns change, so drop first.
drop function if exists public.admin_chat_reports();

create function public.admin_chat_reports()
returns table (
  id uuid,
  kind text,
  context_kind text,
  post_id uuid,
  message_id uuid,
  body_snapshot text,
  attachments text[],
  profile_snapshot jsonb,
  profile_photo_path text,
  written_at timestamptz,
  place text,
  topic_id uuid,
  room_id text,
  note text,
  created_at timestamptz,
  reporter_id uuid,
  reporter_name text,
  reported_author_id uuid,
  reported_author_name text,
  report_count bigint,
  already_removed boolean,
  resolved_at timestamptz,
  resolved_by uuid,
  resolved_by_name text,
  resolution text,
  raised_by_votes boolean
)
language plpgsql
security definer
stable
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Only an administrator can read the reports.' using errcode = '42501';
  end if;

  return query
  select
    r.id,
    r.kind,
    r.context_kind,
    r.post_id,
    r.message_id,
    r.body_snapshot,
    r.attachments,
    r.profile_snapshot,
    r.profile_photo_path,
    r.written_at,
    r.place,
    r.topic_id,
    r.room_id,
    r.note,
    r.created_at,
    r.reporter_id,
    reporter.display_name,
    r.reported_author_id,
    author.display_name,
    (
      select greatest(count(*), 1)
      from public.chat_reports peer
      where (r.post_id is not null and peer.post_id = r.post_id)
         or (r.message_id is not null and peer.message_id = r.message_id)
         or (r.profile_id is not null and peer.profile_id = r.profile_id)
    ) as report_count,
    r.kind <> 'profile' and coalesce(
      (select p.removed_at is not null from public.chat_posts p where p.id = r.post_id),
      (select m.removed_at is not null from public.chat_messages m where m.id = r.message_id),
      true
    ) as already_removed,
    r.resolved_at,
    r.resolved_by,
    resolver.display_name,
    r.resolution,
    r.raised_by_votes
  from public.chat_reports r
  left join public.members reporter on reporter.id = r.reporter_id
  left join public.members author on author.id = r.reported_author_id
  left join public.members resolver on resolver.id = r.resolved_by
  order by (r.resolved_at is not null), r.created_at desc;
end;
$$;

comment on function public.admin_chat_reports() is
  'Every report, open ones first. No thread id and no neighbouring messages: one post, one message or one profile is all that was disclosed.';

revoke all on function public.admin_chat_reports() from public, anon;
grant execute on function public.admin_chat_reports() to authenticated;
