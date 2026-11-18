-- ============================================================================
-- Votes up and down, an administrator's boost, and rooms ranked by them
-- ============================================================================
-- The owner, 2026-11-18: "mimic the reddit upvote/downvote system instead of
-- the like ... a score between the down arrow and up arrow", and for the
-- club's administrators a long press (or right click) on the up arrow adds 10
-- votes "to help raise certain content to the top". Then: "factor in if the
-- user has seen the question ... promote content they have not seen before".
--
-- An upvote is a like. chat_post_likes keeps its rows, rules, names list and
-- notification, so every like already given is an upvote and store apps that
-- still like keep working. Nothing is renamed or dropped.
--
-- chat_post_downvotes: a row per member per post, as likes, but nobody reads
-- anybody else's: a downvote is anonymous and notifies no one. Upvote and
-- downvote are one way or the other: casting one takes the other back
-- (private.chat_vote_one_way), so a store app's like clears a downvote too.
--
-- chat_post_boosts: a row per +10 from an administrator. Only
-- admin_boost_post writes it, and only an administrator reads how much of a
-- score is boost; to members the boost is just part of the score.
--
-- chat_post_scores(post_ids): each readable post's score (upvotes, less
-- downvotes, plus 10 a boost), the reader's own vote, and the boost for an
-- administrator.
--
-- chat_topics_ranked(room, max_rows, skip): a room's topics best first, a
-- page at a time, counted in days since the club moves in days, not hours:
--   days since the topic's last activity, less its score, less 7 if unseen
-- so each point of score is a day newer (an administrator's +10 ten days),
-- and a topic the reader has never opened (not theirs, not read, its opening
-- post not seen on Home) a week newer. Reddit's "hot" order counts a tenfold in
-- score as 12.5 hours; tried on the test site, a +20 boost could not lift a
-- topic over one a week newer, so it is not used. Last activity, not start,
-- since a reply brings a conversation back today. A topic's score is its
-- opening post's. Everything a new member sees is unseen alike, so for them it
-- is score and time alone.
-- chat_topics_page is unchanged, for store apps that still call it.
--
-- Probe: votes-and-boosts.sql. Undo: supabase/undo/20261118180000.sql.
-- ============================================================================

-- Downvotes ------------------------------------------------------------------

create table public.chat_post_downvotes (
  post_id uuid not null references public.chat_posts (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  downvoted_at timestamptz not null default now(),
  primary key (post_id, member_id)
);
create index chat_post_downvotes_member_idx on public.chat_post_downvotes (member_id);

comment on table public.chat_post_downvotes is
  'A member''s downvote on a room post. Anonymous: a member reads only their own.';

alter table public.chat_post_downvotes enable row level security;

create policy "a member reads only their own downvotes"
  on public.chat_post_downvotes for select to authenticated
  using (member_id = (select auth.uid()));

create policy "a member takes back their own downvote"
  on public.chat_post_downvotes for delete to authenticated
  using (member_id = (select auth.uid()));

-- As "an active member likes a standing post" (20261011010000).
create policy "an active member downvotes a standing post"
  on public.chat_post_downvotes for insert to authenticated
  with check (
    member_id = (select auth.uid())
    and public.is_active_member()
    and exists (
      select 1 from public.chat_posts p
      join public.chat_topics t on t.id = p.topic_id
      where p.id = chat_post_downvotes.post_id
        and p.removed_at is null
        and public.chat_room_is_readable(t.room_id)
    )
  );

revoke all on public.chat_post_downvotes from public, anon, authenticated;
grant select, delete on public.chat_post_downvotes to authenticated;
grant insert (post_id, member_id) on public.chat_post_downvotes to authenticated;
grant all on public.chat_post_downvotes to service_role;

-- One way or the other -------------------------------------------------------

create function private.chat_vote_one_way()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name = 'chat_post_likes' then
    delete from public.chat_post_downvotes d
     where d.post_id = new.post_id and d.member_id = new.member_id;
  else
    delete from public.chat_post_likes l
     where l.post_id = new.post_id and l.member_id = new.member_id;
  end if;
  return null;
end;
$$;

revoke all on function private.chat_vote_one_way() from public, anon, authenticated;

create trigger chat_post_likes_one_way
  after insert on public.chat_post_likes
  for each row execute function private.chat_vote_one_way();

create trigger chat_post_downvotes_one_way
  after insert on public.chat_post_downvotes
  for each row execute function private.chat_vote_one_way();

-- Boosts ---------------------------------------------------------------------

create table public.chat_post_boosts (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.chat_posts (id) on delete cascade,
  admin_id uuid references public.members (id) on delete set null,
  boosted_at timestamptz not null default now()
);
create index chat_post_boosts_post_idx on public.chat_post_boosts (post_id);

comment on table public.chat_post_boosts is
  '+10 on a room post from a club administrator, a row each. Written by admin_boost_post only.';

alter table public.chat_post_boosts enable row level security;
revoke all on public.chat_post_boosts from public, anon, authenticated;
grant all on public.chat_post_boosts to service_role;

-- Scores ---------------------------------------------------------------------

-- Upvotes, less downvotes, plus 10 a boost. A removed or missing post is 0.
create function private.chat_post_score(post uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case when post is null then 0 else (
      (select count(*) from public.chat_post_likes l where l.post_id = post)
    - (select count(*) from public.chat_post_downvotes d where d.post_id = post)
    + 10 * (select count(*) from public.chat_post_boosts b where b.post_id = post)
  )::integer end;
$$;

revoke all on function private.chat_post_score(uuid) from public, anon, authenticated;

create function public.chat_post_scores(post_ids uuid[])
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
    case when public.is_admin()
      then 10 * (select count(*) from public.chat_post_boosts b where b.post_id = p.id)::integer
    end
  from public.chat_posts p
  join public.chat_topics t on t.id = p.topic_id
  where p.id = any (post_ids[1:1000])
    -- Definer: the only thing between a member and a closed room.
    and public.chat_room_is_readable(t.room_id);
$$;

comment on function public.chat_post_scores(uuid[]) is
  'Each readable post''s score, the reader''s vote (1, -1 or 0), and to an administrator the boost in it.';

revoke all on function public.chat_post_scores(uuid[]) from public, anon;
grant execute on function public.chat_post_scores(uuid[]) to authenticated, service_role;

-- +10, or take the latest +10 back. Returns the post's boost after.
create function public.admin_boost_post(post uuid, more boolean default true)
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
    insert into public.chat_post_boosts (post_id, admin_id) values (post, auth.uid());
  else
    delete from public.chat_post_boosts b
     where b.id = (select x.id from public.chat_post_boosts x
                    where x.post_id = post order by x.boosted_at desc, x.id desc limit 1);
  end if;
  return 10 * (select count(*) from public.chat_post_boosts b where b.post_id = post)::integer;
end;
$$;

comment on function public.admin_boost_post(uuid, boolean) is
  'A club administrator adds 10 to a post''s score, or takes the latest 10 back.';

revoke all on function public.admin_boost_post(uuid, boolean) from public, anon;
grant execute on function public.admin_boost_post(uuid, boolean) to authenticated, service_role;

-- A room, best first ---------------------------------------------------------

create function public.chat_topics_ranked(room text, max_rows integer default 40, skip integer default 0)
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
        order by p.created_at, p.id limit 1) as opening_id
    from public.chat_topics t
    cross join hidden
    where t.room_id = room
      -- Definer: the only thing between a member and a closed room.
      and public.chat_room_is_readable(room)
      and not coalesce(t.author_id = any (hidden.ids), false)
  ),
  scored as materialized (
    select t.*,
      private.chat_post_score(t.opening_id) as score,
      (t.author_id is distinct from auth.uid()
        and not exists (select 1 from public.chat_topic_reads r
                         where r.topic_id = t.id and r.member_id = auth.uid())
        and not exists (select 1 from public.chat_post_views v
                         where v.post_id = t.opening_id and v.member_id = auth.uid())
      ) as unseen
    from topics t
  ),
  page as materialized (
    select s.*,
      extract(epoch from s.last_post_at) / 86400
        + s.score
        + case when s.unseen then 7 else 0 end as rank
    from scored s
    order by rank desc, s.last_post_at desc, s.id desc
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
  'A room''s topics as chat_topics_page returns them, best first: score, last activity, and not yet seen by the reader.';

revoke all on function public.chat_topics_ranked(text, integer, integer) from public, anon;
grant execute on function public.chat_topics_ranked(text, integer, integer) to authenticated, service_role;
