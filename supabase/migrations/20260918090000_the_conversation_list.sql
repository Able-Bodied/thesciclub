-- ============================================================================
-- Chat, migration 9: the conversation list, and how far you have read
-- ============================================================================
-- Three reads and one write. `chat_my_threads()` is the list on /chat,
-- `chat_unread_count()` is the dot on the Chat tab, and
-- `chat_mark_thread_read()` is what moves the line the other two are measured
-- against.
--
-- ---------------------------------------------------------------------------
-- chat_my_threads is security *invoker*, deliberately
-- ---------------------------------------------------------------------------
-- Unlike chat_topics_for(), which had to be definer because it counts read rows
-- belonging to other members. Everything this returns is something the caller
-- may already select: their threads, the rosters of those threads, the messages
-- in them. So it runs as the caller, RLS is what scopes it, and there is no
-- gate in here that could be forgotten — the failure mode of the definer
-- functions in this feature, and the one 20260918030000's header is about.
--
-- It exists for round trips, not for privileges. The list needs, per thread:
-- the other member for a direct one, the size of a group, the last message, and
-- whether there is anything new. Four queries per row against a client that is
-- often on a phone on hospital wifi; one function call instead.
--
-- ---------------------------------------------------------------------------
-- What "unread" means here
-- ---------------------------------------------------------------------------
-- Not `last_message_at > last_read_at`, which is what CHAT-PLAN.md proposed. A
-- thread whose last message is your own would be unread by that rule, so the
-- list would go bold the moment you spoke and stay bold until you reopened a
-- conversation you had just been looking at. Marking read on send would paper
-- over it at the cost of a second round trip on every message.
--
-- So: unread means there is a message in the thread, newer than you last
-- looked, that somebody else wrote. That is the question the bold row and the
-- nav dot are both actually asking, and it makes `author_id is distinct from`
-- do the work rather than a timestamp comparison that cannot tell who spoke.
--
-- A removed message still counts. Whether it was worth reading is not something
-- this can know, and a dot that clears itself because the thing it was pointing
-- at was taken down leaves the reader wondering what they missed.
--
-- ---------------------------------------------------------------------------
-- last_read_at is written by a function and never by the client
-- ---------------------------------------------------------------------------
-- Same as chat_topic_reads in migration 5, and the same two reasons:
--
--  - the clock must be the server's. A client that sends its own now() and is a
--    few minutes slow marks the thread read in the past, and every message in
--    between stays bold forever. Unread is derived by comparing this against
--    message timestamps, which are the server's; comparing two clocks is a bug
--    that only appears on somebody else's device.
--
--    And it is the *same* server clock: clock_timestamp(), which is what
--    chat_messages.created_at defaults to, and not now(), which is the
--    transaction's start. Mixing them puts the read line before every message
--    written in the transaction that moved it — so marking a thread read and
--    then asking whether it is unread, in one transaction, says yes. Found by
--    running chat-direct.sql rather than by reading it.
--  - `grant update (last_read_at)` does not work. PostgREST's upsert writes
--    every column it was handed, the key columns included, so an on-conflict
--    update needs update privileges on all of them — and granting update on
--    member_id to get at last_read_at is the wrong shape by a mile.
--
-- Hence definer, own row only, now() on the server.
-- ============================================================================

create or replace function public.chat_my_threads()
returns table (
  id uuid,
  kind text,
  name text,
  event_id uuid,
  created_at timestamptz,
  last_message_at timestamptz,
  member_count bigint,
  -- Direct threads only. Null for a group, and null for a direct thread whose
  -- other half has left the club — the roster row cascades with the member, so
  -- the absence is the fact, and the client draws "Former member".
  other_member_id uuid,
  last_body text,
  last_author_id uuid,
  last_at timestamptz,
  last_removed boolean,
  unread boolean
)
language sql
security invoker
stable
set search_path = ''
as $$
  select
    t.id,
    t.kind,
    t.name,
    t.event_id,
    t.created_at,
    t.last_message_at,
    (select count(*) from public.chat_thread_members c where c.thread_id = t.id) as member_count,
    (
      select o.member_id
      from public.chat_thread_members o
      where o.thread_id = t.id and o.member_id <> auth.uid() and t.kind = 'direct'
      limit 1
    ) as other_member_id,
    newest.body as last_body,
    newest.author_id as last_author_id,
    newest.created_at as last_at,
    newest.removed_at is not null as last_removed,
    -- See the header: somebody else's words, newer than you last looked.
    exists (
      select 1
      from public.chat_messages n
      where n.thread_id = t.id
        and n.created_at > mine.last_read_at
        and n.author_id is distinct from auth.uid()
    ) as unread
  from public.chat_threads t
  -- Not a where clause on the roster: the join is what supplies last_read_at,
  -- and it is the caller's own row because of the second condition.
  join public.chat_thread_members mine
    on mine.thread_id = t.id and mine.member_id = auth.uid()
  -- Left, not inner. A thread that has been opened and not yet spoken in is a
  -- real thread and must appear — otherwise tapping Message and then navigating
  -- away loses the conversation.
  left join lateral (
    select g.body, g.author_id, g.created_at, g.removed_at
    from public.chat_messages g
    where g.thread_id = t.id
    -- The id breaks a tie. created_at is clock_timestamp() so two messages a
    -- microsecond apart is already unlikely, and "already unlikely" is how a
    -- list ends up showing a different last message on every read.
    order by g.created_at desc, g.id desc
    limit 1
  ) newest on true
  order by t.last_message_at desc;
$$;

comment on function public.chat_my_threads() is
  'Every conversation the caller is in, with its last message, its size and whether there is anything new. One round trip.';

revoke all on function public.chat_my_threads() from public, anon;
grant execute on function public.chat_my_threads() to authenticated;

-- ------------------------------------------------------------------ the dot
-- Built on chat_my_threads rather than on a second copy of the unread rule.
-- Two definitions of "new" is how a nav dot ends up pointing at a list that has
-- nothing bold in it.
create or replace function public.chat_unread_count()
returns integer
language sql
security invoker
stable
set search_path = ''
as $$
  select count(*)::int from public.chat_my_threads() where unread;
$$;

comment on function public.chat_unread_count() is
  'How many conversations have something new in them. The Chat tab''s dot.';

revoke all on function public.chat_unread_count() from public, anon;
grant execute on function public.chat_unread_count() to authenticated;

-- --------------------------------------------------------------- marking read
create or replace function public.chat_mark_thread_read(thread uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Definer, so nothing above has checked anything. Reading is not a privilege
  -- suspension takes away, so this is is_thread_member() and not
  -- is_active_member() — a suspended member reads their conversations and their
  -- unread marks should still clear.
  if not public.is_thread_member(thread) then
    raise exception 'There is no such conversation.' using errcode = 'P0002';
  end if;

  -- clock_timestamp(), to match chat_messages.created_at. See the header.
  update public.chat_thread_members
     set last_read_at = clock_timestamp()
   where thread_id = thread and member_id = auth.uid();
end;
$$;

comment on function public.chat_mark_thread_read(uuid) is
  'Record that the caller has just read this conversation, on the server clock.';

revoke all on function public.chat_mark_thread_read(uuid) from public, anon;
grant execute on function public.chat_mark_thread_read(uuid) to authenticated;
