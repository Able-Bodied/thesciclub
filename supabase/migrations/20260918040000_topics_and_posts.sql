-- ============================================================================
-- Chat, migration 4: topics and posts
-- ============================================================================
-- The forum itself. A room holds topics, a topic holds posts, and the first
-- post of a topic is the question — there is no separate "body" column on the
-- topic, because a topic whose opening words live somewhere other than the
-- posts is a topic whose first post cannot be removed or numbered like the
-- rest.
--
-- ---------------------------------------------------------------------------
-- Nothing is seeded
-- ---------------------------------------------------------------------------
-- The mock's threads are fiction and CONTEXT.md forbids invented content. The
-- twelve rooms ship empty and an administrator seeds one before it is opened.
--
-- ---------------------------------------------------------------------------
-- The author survives their membership
-- ---------------------------------------------------------------------------
-- `author_id ... on delete set null`, so removing a member leaves every post
-- they wrote in place with the text intact and no name on it. The owner's
-- decision: a removed member's words stay, anonymised, and the client renders a
-- null author as "Former member". A cascade here would take a conversation
-- apart around the people still in it — replies to a question that no longer
-- exists.
--
-- ---------------------------------------------------------------------------
-- reply_count is recomputed, not incremented
-- ---------------------------------------------------------------------------
-- The trigger sets `reply_count = (count of posts) - 1` rather than adding one.
-- A counter that is incremented drifts the first time anything writes a post by
-- another route, and it cannot be repaired without knowing it is wrong. Counting
-- is O(posts in one topic), which is a number in the tens.
--
-- Removed posts keep counting. The row stays so that numbering ("3/11") and
-- replies hold either side of a removal — a post that vanished from the count
-- would renumber every post after it for everybody reading.
--
-- The trigger function is `security definer` because members have no update
-- grant on chat_topics at all. They insert a post; the topic's activity date
-- and reply count are the database's arithmetic, not theirs.
--
-- ---------------------------------------------------------------------------
-- chat_create_topic is security *invoker*
-- ---------------------------------------------------------------------------
-- It exists to make the topic and its first post one transaction — a topic with
-- no post in it is a row nothing can render — and for no other reason. It must
-- not be the thing that decides who may write, so it runs as the caller and the
-- two insert policies below are what refuse. Every other function in this
-- feature that is definer is definer because it touches a row belonging to
-- somebody else; this one does not.
--
-- ---------------------------------------------------------------------------
-- The body check allows '' once the post is removed
-- ---------------------------------------------------------------------------
-- Removal blanks the body in place (migration 6). The constraint therefore
-- bounds the length always and demands non-blank only while `removed_at` is
-- null, rather than being a flat 1..4000 that removal would have to violate.
-- ============================================================================

create table if not exists public.chat_topics (
  id uuid primary key default gen_random_uuid(),
  room_id text not null references public.chat_rooms (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 140),
  author_id uuid references public.members (id) on delete set null,
  created_at timestamptz not null default now(),
  -- Seeded to created_at by the trigger's first run; kept separate from it so
  -- "sort by activity" never has to coalesce.
  last_post_at timestamptz not null default now(),
  reply_count int not null default 0
);

comment on table public.chat_topics is
  'One question in a discussion room. Its opening words are its first chat_posts row.';

create index if not exists chat_topics_room_activity_idx
  on public.chat_topics (room_id, last_post_at desc);

create table if not exists public.chat_posts (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid not null references public.chat_topics (id) on delete cascade,
  author_id uuid references public.members (id) on delete set null,
  body text not null check (
    char_length(body) <= 4000
    and (removed_at is not null or char_length(btrim(body)) > 0)
  ),
  created_at timestamptz not null default now(),
  removed_at timestamptz,
  -- Which of the two sentences the reader gets: "Removed by its author" or
  -- "Removed by an administrator".
  removed_by_admin boolean not null default false
);

comment on table public.chat_posts is
  'A post in a topic. Removal blanks the body here and keeps the row, so numbering and replies hold.';

create index if not exists chat_posts_topic_time_idx
  on public.chat_posts (topic_id, created_at);

alter table public.chat_topics enable row level security;
alter table public.chat_posts enable row level security;

-- -------------------------------------------------------------------- reading
-- Reading never asks about chat_room_members: an open room is open to every
-- member with its whole history, which is the sentence /chat prints.
drop policy if exists "a member reads a readable room's topics" on public.chat_topics;
create policy "a member reads a readable room's topics"
  on public.chat_topics for select
  using (public.chat_room_is_readable(room_id));

-- The subquery has RLS applied to chat_topics as well, which on its own would
-- already scope this correctly. The helper is named anyway: a select policy
-- that is right only because of another table's policy is right by accident.
drop policy if exists "a member reads a readable topic's posts" on public.chat_posts;
create policy "a member reads a readable topic's posts"
  on public.chat_posts for select
  using (
    exists (
      select 1 from public.chat_topics t
      where t.id = topic_id and public.chat_room_is_readable(t.room_id)
    )
  );

-- -------------------------------------------------------------------- writing
drop policy if exists "an active member starts a topic where they may post" on public.chat_topics;
create policy "an active member starts a topic where they may post"
  on public.chat_topics for insert
  with check (author_id = auth.uid() and public.chat_can_post_in(room_id));

drop policy if exists "an active member posts where they may post" on public.chat_posts;
create policy "an active member posts where they may post"
  on public.chat_posts for insert
  with check (
    author_id = auth.uid()
    and exists (
      select 1 from public.chat_topics t
      where t.id = topic_id and public.chat_can_post_in(t.room_id)
    )
  );

-- No update and no delete policy on either table, and no grant for either verb.
-- Removal goes through chat_remove_post() in migration 6, which refuses in a
-- sentence; an RLS update that matches no rows reports success, and a silent
-- no-op is the shape of half this project's bugs.
revoke all on public.chat_topics from anon, authenticated, public;
revoke all on public.chat_posts from anon, authenticated, public;
grant select, insert on public.chat_topics to authenticated;
grant select, insert on public.chat_posts to authenticated;

-- ------------------------------------------------------- the topic's arithmetic
create or replace function public.chat_bump_topic()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.chat_topics t
     set last_post_at = greatest(t.last_post_at, new.created_at),
         -- Recomputed, never incremented. See the header.
         reply_count = (
           select count(*) - 1 from public.chat_posts p where p.topic_id = new.topic_id
         )
   where t.id = new.topic_id;
  return null;
end;
$$;

comment on function public.chat_bump_topic() is
  'After a post lands: move the topic activity date and recount its replies.';

drop trigger if exists chat_posts_bump_topic on public.chat_posts;
create trigger chat_posts_bump_topic
  after insert on public.chat_posts
  for each row execute function public.chat_bump_topic();

-- -------------------------------------------------------------- starting a topic
create or replace function public.chat_create_topic(room text, title text, body text)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  new_topic uuid;
begin
  insert into public.chat_topics (room_id, title, author_id)
  values (room, btrim(title), auth.uid())
  returning id into new_topic;

  insert into public.chat_posts (topic_id, author_id, body)
  values (new_topic, auth.uid(), btrim(body));

  return new_topic;
end;
$$;

comment on function public.chat_create_topic(text, text, text) is
  'Start a topic and its first post in one transaction. Invoker: the insert policies decide.';

revoke all on function public.chat_create_topic(text, text, text) from public, anon;
grant execute on function public.chat_create_topic(text, text, text) to authenticated;
