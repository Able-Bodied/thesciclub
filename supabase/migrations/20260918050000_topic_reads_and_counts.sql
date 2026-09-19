-- ============================================================================
-- Chat, migration 5: who has read what, and the numbers on a card
-- ============================================================================
-- One table and three read paths. The table records that a member opened a
-- topic; from it come both of the numbers a forum lives on — "views", and
-- whether there is anything new since you last looked.
--
-- ---------------------------------------------------------------------------
-- One row per member per topic, so views cannot be inflated
-- ---------------------------------------------------------------------------
-- The mock prints a view count. A counter column incremented on every open is
-- a number anybody can run up by holding a key down, and in a club of five
-- members a view count that can be manufactured is worse than no view count.
-- The primary key is (topic, member), so "views" is the number of *people* who
-- have opened the topic and the same table that gives it is the one that drives
-- unread. There is only one fact here, recorded once.
--
-- ---------------------------------------------------------------------------
-- Marking read is a function, not an upsert — and this departs from the plan
-- ---------------------------------------------------------------------------
-- CHAT-PLAN.md said "topic_reads: own rows, select/insert/update". It is
-- select-only for members here, and chat_mark_topic_read() does the write. Two
-- reasons, both found while writing it:
--
--  - `last_read_at` must be the server's clock. A client that sends its own
--    now() and is a few minutes slow marks a topic read *in the past*, and
--    every post in between stays bold forever. Unread is derived by comparing
--    it against last_post_at, which is also the server's; comparing two clocks
--    is a bug that only shows up on somebody else's laptop.
--  - PostgREST's upsert writes every column it was handed, including the two
--    key columns, so an `on conflict do update` needs update privileges on all
--    three. Granting update on member_id to get update on last_read_at is the
--    wrong shape, and the column-level grant that would be right does not
--    survive the way the client builds the statement.
--
-- The select policy stays, own-rows-only, because it is what the probe reads to
-- show that one member cannot see whether another has read a topic.
--
-- ---------------------------------------------------------------------------
-- chat_topics_for() is definer, and that is why the gate is spelled out
-- ---------------------------------------------------------------------------
-- It counts other members' rows in chat_topic_reads, which no member may read,
-- so it has to be definer. Which means RLS is off inside it and the room's
-- visibility is not checked by anything unless this function checks it: hence
-- the chat_room_is_readable() call on the first line, and hence that helper
-- being definer and explicit rather than a lean on the chat_rooms policy. See
-- 20260918030000's header.
--
-- ---------------------------------------------------------------------------
-- chat_room_stats publishes counts and never names
-- ---------------------------------------------------------------------------
-- A view owned by the migration, so it runs with RLS off and can count the
-- member rows it is not allowed to list. Its own `where` is the whole of its
-- access control — chat_room_is_readable(), again — and it returns three
-- integers per room. Who joined a room is in chat_room_members and stays there.
-- ============================================================================

create table if not exists public.chat_topic_reads (
  topic_id uuid not null references public.chat_topics (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (topic_id, member_id)
);

comment on table public.chat_topic_reads is
  'That a member has opened a topic, and when. Drives both the view count and unread.';

alter table public.chat_topic_reads enable row level security;

drop policy if exists "a member sees their own reads" on public.chat_topic_reads;
create policy "a member sees their own reads"
  on public.chat_topic_reads for select
  using (member_id = auth.uid());

-- Select only. The write is chat_mark_topic_read() — see the header.
revoke all on public.chat_topic_reads from anon, authenticated, public;
grant select on public.chat_topic_reads to authenticated;

create or replace function public.chat_mark_topic_read(topic uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Reading is not a privilege suspension takes away, so is_member() and not
  -- is_active_member(). But it must still be a topic they can read: otherwise
  -- this is a way to add yourself to the view count of a room you cannot see.
  if not exists (
    select 1 from public.chat_topics t
    where t.id = topic and public.chat_room_is_readable(t.room_id)
  ) then
    raise exception 'There is no such topic.' using errcode = 'P0002';
  end if;

  insert into public.chat_topic_reads (topic_id, member_id, last_read_at)
  values (topic, auth.uid(), now())
  on conflict (topic_id, member_id) do update set last_read_at = now();
end;
$$;

comment on function public.chat_mark_topic_read(uuid) is
  'Record that the caller has just read this topic, on the server clock.';

revoke all on function public.chat_mark_topic_read(uuid) from public, anon;
grant execute on function public.chat_mark_topic_read(uuid) to authenticated;

-- ------------------------------------------------------------- the topic list
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
    -- A topic nobody has opened is unread, including one you started. Starting
    -- one lands you on it and the topic screen marks it read, so it is not bold
    -- by the time you are back at the list.
    t.last_post_at > coalesce(
      (select r.last_read_at from public.chat_topic_reads r
        where r.topic_id = t.id and r.member_id = auth.uid()),
      '-infinity'::timestamptz
    ) as unread,
    -- The faces on the row: the first four people to post, in the order they
    -- first did. A removed member drops out of the stack rather than appearing
    -- as an unnamed tile among named ones.
    (
      select coalesce(array_agg(s.author_id order by s.first_at), '{}'::uuid[])
      from (
        select p.author_id, min(p.created_at) as first_at
        from public.chat_posts p
        where p.topic_id = t.id and p.author_id is not null
        group by p.author_id
        order by min(p.created_at)
        limit 4
      ) s
    ) as participant_ids
  from public.chat_topics t
  where t.room_id = room
    -- Definer, so RLS is off in here and this is the only thing standing
    -- between a member and a closed room. See the header.
    and public.chat_room_is_readable(room)
  order by t.last_post_at desc;
$$;

comment on function public.chat_topics_for(text) is
  'Every topic in a room the caller may read, with its replies, views, unread flag and first four posters.';

revoke all on function public.chat_topics_for(text) from public, anon;
grant execute on function public.chat_topics_for(text) to authenticated;

-- ----------------------------------------------------------------- room counts
drop view if exists public.chat_room_stats;

create view public.chat_room_stats as
select
  r.id as room_id,
  (select count(*) from public.chat_topics t where t.room_id = r.id) as topic_count,
  (
    select count(*)
    from public.chat_posts p
    join public.chat_topics t on t.id = p.topic_id
    where t.room_id = r.id
  ) as post_count,
  (select count(*) from public.chat_room_members m where m.room_id = r.id) as member_count
from public.chat_rooms r
-- The view's own gate. It runs with RLS off — that is what lets it count rows
-- in chat_room_members that the caller may not list — so without this line it
-- would hand every member the shape of all twelve rooms, closed ones included.
where public.chat_room_is_readable(r.id);

comment on view public.chat_room_stats is
  'Per room the caller may read: how many topics, posts and members. Counts only, never who.';

revoke all on public.chat_room_stats from anon, authenticated, public;
grant select on public.chat_room_stats to authenticated;
