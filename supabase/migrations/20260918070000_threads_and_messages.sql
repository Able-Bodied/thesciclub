-- ============================================================================
-- Chat, migration 7: threads and messages
-- ============================================================================
-- The other half of Chat. A room is a forum — open to every member, with the
-- whole history from before you joined. A thread is the opposite: two people,
-- or a named few, and nobody else sees that it exists.
--
-- One table pair for both kinds. `kind` is 'direct' or 'group', and the shape
-- differences live in a check constraint rather than in two tables: a direct
-- thread and a group thread hold the same messages, are read by the same
-- screen, and appear in the same list. Two tables would mean two of everything
-- above them — two select policies, two message tables, two list queries — to
-- express a difference that is one column wide.
--
-- The group *writers* (`chat_create_group`, `chat_add_to_group`,
-- `chat_join_event_group`) arrive in Phase 5, so until then `kind = 'group'`
-- has no way in. That is deliberate and it is not the dead schema that moved
-- chat_room_members out of Phase 1: the constraint below cannot be written
-- without naming both kinds, and altering a check constraint later to admit a
-- second kind is a migration that has to restate the first one correctly.
--
-- ---------------------------------------------------------------------------
-- The recursion trap
-- ---------------------------------------------------------------------------
-- A select policy on chat_thread_members that reads chat_thread_members
-- recurses — Postgres applies the policy to the subquery, which applies the
-- policy to its subquery, and the statement fails with "infinite recursion
-- detected in policy". So the roster question is asked by
-- `public.is_thread_member(thread)`, which is `security definer` and therefore
-- runs with RLS off, and every policy on all three tables calls it.
--
-- Being definer makes it the twin of chat_room_is_readable: RLS is off inside
-- it, so it has to be the whole of the check and cannot lean on another table's
-- policy. It is, and it is the only membership test in this half of the
-- feature.
--
-- ---------------------------------------------------------------------------
-- direct_key, and why a direct thread cannot be opened twice
-- ---------------------------------------------------------------------------
-- `direct_key` is `least(a,b) || ':' || greatest(a,b)` over the two member ids,
-- and it is unique. Ordering the pair is what makes it one key rather than two:
-- without the sort, A→B and B→A are different strings and two taps from either
-- end produce two threads holding half a conversation each.
--
-- It is a column and not an index over chat_thread_members because the
-- uniqueness has to be enforced by the database at the moment of insert. The
-- alternative — read, see nothing, insert — is a race that two people tapping
-- Message at the same time will lose, and the loser's messages go somewhere the
-- other one is not looking. chat_open_direct (migration 8) inserts with
-- `on conflict do nothing` and then re-selects, which is correct precisely
-- because this constraint exists.
--
-- Nothing client-side derives the key. It is computed once, in the function
-- that creates the thread, so there is no second implementation to disagree
-- about the ordering.
--
-- ---------------------------------------------------------------------------
-- Nobody inserts a thread or a roster row directly
-- ---------------------------------------------------------------------------
-- There is no insert policy and no insert grant on chat_threads or
-- chat_thread_members, because every way of creating either writes a row for
-- somebody other than the caller: opening a direct thread adds the other
-- person, creating a group adds everybody in it. An insert policy can say
-- "this row is mine"; it cannot say "these two rows are one decision". So
-- creation is the definer functions in the migrations that follow, and this
-- migration grants nothing that would let a member around them.
--
-- Leaving is the exception, and only for a group. A member may delete their own
-- roster row in a `group` thread — that is the Leave control, whose screen
-- arrives with groups in Phase 5 — and may not in a `direct` one. Leaving a
-- direct thread would leave the pair's row in place with one half missing,
-- readable by the other person and no longer readable by the leaver, while
-- direct_key still says the thread exists: chat_open_direct would hand it back
-- and they would be looking at a conversation they cannot read. Blocking and
-- deleting a conversation are both real and are both out of this build.
--
-- ---------------------------------------------------------------------------
-- last_read_at lives on the roster row
-- ---------------------------------------------------------------------------
-- Alongside joined_at, rather than in a table of its own like
-- chat_topic_reads. A topic's read row carries a second fact — it is the view
-- count, one row per person who ever opened it — so it exists for people who
-- are not members of anything. A thread's does not: only its members can read
-- it, so the roster row is already the row that would hold it, and a separate
-- table would be the same primary key twice.
--
-- There is no update grant on the column and there will not be. See the header
-- of migration 9: PostgREST's upsert writes every column it was handed, so
-- granting update on one means granting it on the keys as well, and a client
-- that sends its own clock marks a thread read in the past on a slow device and
-- leaves everything in between unread forever. chat_mark_thread_read() does it
-- on the server's clock.
--
-- ---------------------------------------------------------------------------
-- The body check allows '' once the message is removed
-- ---------------------------------------------------------------------------
-- The same shape as chat_posts: removal blanks the body in place (migration 10)
-- and the original moves somewhere no session can read it. So the constraint
-- bounds the length always and demands non-blank only while `removed_at` is
-- null. There is no `chat_messages_visible` view and there must not be — see
-- 20260918060000's header, and the realtime note: every member who can read a
-- message can subscribe to the table and be handed the row.
-- ============================================================================

create table if not exists public.chat_threads (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('direct', 'group')),
  -- Groups only, and the one thing a group has that a pair does not: a name
  -- somebody chose. A direct thread is named by whoever you are talking to.
  name text check (char_length(btrim(name)) between 1 and 60),
  -- least(a,b) || ':' || greatest(a,b) over the pair. See the header.
  direct_key text unique,
  -- An event has at most one group chat, and the group knows which event it is
  -- for so that the event page can find it. Unique for the same reason
  -- direct_key is: the join is lazy, and two people RSVP'd and tapping at once
  -- must not make two groups. Phase 5 writes these.
  event_id uuid unique references public.events (id) on delete set null,
  created_by uuid references public.members (id) on delete set null,
  created_at timestamptz not null default now(),
  -- Seeded to created_at and moved by the trigger below, so "most recent first"
  -- never has to coalesce and a thread with nothing in it still sorts.
  last_message_at timestamptz not null default now(),
  constraint chat_threads_shape check (
    case kind
      when 'direct' then direct_key is not null and name is null and event_id is null
      else direct_key is null and name is not null
    end
  )
);

comment on table public.chat_threads is
  'A direct conversation or a group. Invisible to anybody not on its roster.';

create index if not exists chat_threads_activity_idx
  on public.chat_threads (last_message_at desc);

create table if not exists public.chat_thread_members (
  thread_id uuid not null references public.chat_threads (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  joined_at timestamptz not null default now(),
  -- Written only by chat_mark_thread_read(), on the server's clock.
  -- '-infinity' rather than now(): a thread you were just added to has messages
  -- in it from before you arrived, and they are new to you.
  last_read_at timestamptz not null default '-infinity',
  primary key (thread_id, member_id)
);

comment on table public.chat_thread_members is
  'Who is in a thread, and how far they have read. A thread''s roster is visible to its members only.';

-- The primary key covers (thread_id, member_id); this is the other direction,
-- for "every thread I am in" — which is the conversation list.
create index if not exists chat_thread_members_member_idx
  on public.chat_thread_members (member_id);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.chat_threads (id) on delete cascade,
  -- Set null, not cascade: a removed member's words stay, anonymised, and the
  -- client renders a null author as "Former member". The owner's decision, and
  -- the same one chat_posts makes. A cascade would take the other half of the
  -- conversation apart around the person still in it.
  author_id uuid references public.members (id) on delete set null,
  body text not null check (
    char_length(body) <= 4000
    and (removed_at is not null or char_length(btrim(body)) > 0)
  ),
  -- clock_timestamp(), not now(). now() is the *transaction's* start, so two
  -- messages written in one transaction share a timestamp to the microsecond
  -- and "the last message in this thread" becomes whichever row the planner
  -- happens to return first. That is not hypothetical: it is what the probe
  -- does, it is what a seed would do, and it is what any later function that
  -- writes more than one message would do. A thread is a sequence, and the
  -- column that orders it has to move between two inserts.
  created_at timestamptz not null default clock_timestamp(),
  removed_at timestamptz,
  removed_by_admin boolean not null default false
);

comment on table public.chat_messages is
  'One message in a thread. Removal blanks the body here and keeps the row.';

create index if not exists chat_messages_thread_time_idx
  on public.chat_messages (thread_id, created_at);

alter table public.chat_threads enable row level security;
alter table public.chat_thread_members enable row level security;
alter table public.chat_messages enable row level security;

-- ------------------------------------------------------------- the one gate
-- Definer, and therefore RLS-free inside, which is what breaks the recursion
-- described in the header. is_member() is named as well as the roster row: a
-- roster row cannot outlive its member (the foreign key cascades), so it adds
-- nothing today, and it is here for the reason chat_room_is_readable spells its
-- rule out — a gate that is right only because of another table's constraint is
-- right by accident.
create or replace function public.is_thread_member(thread uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select public.is_member()
     and exists (
       select 1 from public.chat_thread_members m
       where m.thread_id = thread and m.member_id = auth.uid()
     );
$$;

comment on function public.is_thread_member(uuid) is
  'Is the caller on this thread''s roster. Definer, because a policy on chat_thread_members that reads it recurses.';

revoke all on function public.is_thread_member(uuid) from public, anon;
grant execute on function public.is_thread_member(uuid) to authenticated;

-- -------------------------------------------------------------------- reading
drop policy if exists "a member reads the threads they are in" on public.chat_threads;
create policy "a member reads the threads they are in"
  on public.chat_threads for select
  using (public.is_thread_member(id));

drop policy if exists "a member reads the roster of a thread they are in" on public.chat_thread_members;
create policy "a member reads the roster of a thread they are in"
  on public.chat_thread_members for select
  using (public.is_thread_member(thread_id));

drop policy if exists "a member reads the messages in a thread they are in" on public.chat_messages;
create policy "a member reads the messages in a thread they are in"
  on public.chat_messages for select
  using (public.is_thread_member(thread_id));

-- -------------------------------------------------------------------- writing
-- The only insert policy in this migration. Threads and rosters are written by
-- the definer functions — see the header.
drop policy if exists "an active member writes in a thread they are in" on public.chat_messages;
create policy "an active member writes in a thread they are in"
  on public.chat_messages for insert
  with check (
    author_id = auth.uid()
    and public.is_active_member()
    and public.is_thread_member(thread_id)
  );

-- Leaving a group. Not is_active_member(), for the reason chat_room_members
-- gives: a door that opens and does not close is worse than no door, and a
-- suspended member who wants out of a group should get out. Not a direct
-- thread, either way — see the header.
drop policy if exists "a member leaves a group" on public.chat_thread_members;
create policy "a member leaves a group"
  on public.chat_thread_members for delete
  using (
    member_id = auth.uid()
    and exists (
      select 1 from public.chat_threads t
      where t.id = thread_id and t.kind = 'group'
    )
  );

-- `authenticated` is named deliberately — see 20260918020000's header. Supabase
-- grants every privilege on a new table by default, and an ungranted verb that
-- RLS merely fails to match reports UPDATE 0 and reads like a pass.
revoke all on public.chat_threads from anon, authenticated, public;
revoke all on public.chat_thread_members from anon, authenticated, public;
revoke all on public.chat_messages from anon, authenticated, public;
grant select on public.chat_threads to authenticated;
grant select, delete on public.chat_thread_members to authenticated;
-- Insert is granted on three columns and not on the table.
--
-- A whole-table insert grant lets the client choose `created_at`, and a message
-- dated next year sits at the top of both people's lists forever while one
-- dated before the reader's last_read_at is never unread. RLS cannot say that:
-- a policy is a predicate over the row and both of those rows pass it. The
-- privilege is the only place the rule fits.
--
-- It also keeps `removed_at` and `removed_by_admin` out of a member's hands, so
-- the only way a message becomes removed is chat_remove_message(), which is
-- where the sentence about who did it is derived.
--
-- Naming a column that is not granted fails with `permission denied for column`
-- — a refusal, not a zero-row no-op, which is the whole reason this feature
-- revokes from `authenticated` by name.
grant select on public.chat_messages to authenticated;
grant insert (thread_id, author_id, body) on public.chat_messages to authenticated;

-- ---------------------------------------------------------- thread activity
-- Definer because members have no update grant on chat_threads at all. They
-- insert a message; when the thread was last spoken in is the database's
-- arithmetic, not theirs — and it is what orders the conversation list and what
-- `unread` is compared against, so a client that could set it could mark
-- somebody else's thread read.
create or replace function public.chat_bump_thread()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.chat_threads t
     set last_message_at = greatest(t.last_message_at, new.created_at)
   where t.id = new.thread_id;
  return null;
end;
$$;

comment on function public.chat_bump_thread() is
  'After a message lands: move the thread''s activity date.';

drop trigger if exists chat_messages_bump_thread on public.chat_messages;
create trigger chat_messages_bump_thread
  after insert on public.chat_messages
  for each row execute function public.chat_bump_thread();
