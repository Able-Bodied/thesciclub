-- ============================================================================
-- Chat, migration 13: making a group, and adding somebody to one
-- ============================================================================
-- `chat_threads` has carried `kind = 'group'` since migration 7 with no way to
-- write one. This is the way in: two functions, and between them they are the
-- only thing that can put a group in the table.
--
-- Both are `security definer` for the reason chat_open_direct is — they write
-- roster rows for other people, and no insert policy can say "these rows are
-- one decision" — which means RLS is off inside them and every rule they lean
-- on is a rule they state. That is the Phase 2 lesson, and it is why the checks
-- below are long and explicit rather than a subquery against another table's
-- policy.
--
-- ---------------------------------------------------------------------------
-- One definition of "can be added", not three
-- ---------------------------------------------------------------------------
-- chat_open_direct spelled the rule inline: a member is findable when they are
-- `status = 'active' and show_in_browse`. Somebody who turned themselves off
-- the deck cannot be *found* to be messaged, and their name still shows on
-- everything they wrote. Creating a group and adding to one ask the same
-- question, and three copies of a privacy rule is how one of them drifts — so
-- it is `chat_is_findable()` now, and chat_open_direct is replaced below to
-- call it. The rule does not change; where it is written does.
--
-- ---------------------------------------------------------------------------
-- A group needs somebody else in it
-- ---------------------------------------------------------------------------
-- A "group" of one is a notepad, and it would sit in the conversation list
-- looking exactly like a group whose other members failed to load. The caller
-- is added alongside whoever they named, duplicates and their own id are
-- dropped rather than refused — a picker that sends you twice is a client bug
-- and not something to make somebody re-do — and what is left has to be at
-- least one person.
--
-- The cap is 50, roster included. It is not a scaling limit: a flat thread with
-- eighty people in it is a room without a room's reading rules, and the club
-- has rooms.
--
-- ---------------------------------------------------------------------------
-- The parameters are group_name and member_ids
-- ---------------------------------------------------------------------------
-- CHAT-PLAN.md wrote `chat_create_group(name text, members uuid[])`. Inside
-- plpgsql a parameter called `name` is ambiguous against `chat_threads.name`
-- wherever the two could both be meant, and the error arrives at the first
-- caller rather than at the migration. The same trap that made
-- admin_set_room_open take `is_open` instead of `open`. PostgREST sends
-- arguments by name, so the client names these.
--
-- ---------------------------------------------------------------------------
-- An event group does not take members this way
-- ---------------------------------------------------------------------------
-- chat_add_to_group refuses a thread with an `event_id`. Its roster is the
-- people who said they are going, and each of them joins it themselves
-- (migration 14). Letting somebody be added to it would put a member in a
-- conversation attached to an event they never said anything about, and there
-- would be two answers to "who is in this group".
-- ============================================================================

-- ------------------------------------------------------------- findable
-- Definer and stable. It reads `members`, whose own RLS is own-row-only, so an
-- invoker version of this would answer "no" about everybody but the caller.
create or replace function public.chat_is_findable(candidate uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.members m
    where m.id = candidate and m.status = 'active' and m.show_in_browse
  );
$$;

comment on function public.chat_is_findable(uuid) is
  'Can this member be found to be messaged or added to a group: active, and in the directory.';

revoke all on function public.chat_is_findable(uuid) from public, anon;
grant execute on function public.chat_is_findable(uuid) to authenticated;

-- Replaced only to move the inline test into the function above. The four rules
-- in 20260918080000's header are unchanged, the order they are applied in is
-- unchanged, and rule 4 — a conversation that already exists reopens whatever
-- has become of the other person — is still why the lookup comes first.
create or replace function public.chat_open_direct(other uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  key text;
  found_thread uuid;
begin
  if not public.is_active_member() then
    raise exception 'Only an active member can start a conversation.' using errcode = '42501';
  end if;

  if other is null or other = me then
    raise exception 'A conversation needs somebody else in it.' using errcode = '22023';
  end if;

  key := least(me, other)::text || ':' || greatest(me, other)::text;

  select t.id into found_thread from public.chat_threads t where t.direct_key = key;
  if found_thread is not null then
    return found_thread;
  end if;

  if not public.chat_is_findable(other) then
    raise exception 'That member cannot be messaged.' using errcode = 'P0002';
  end if;

  insert into public.chat_threads (kind, direct_key, created_by)
  values ('direct', key, me)
  on conflict (direct_key) do nothing
  returning id into found_thread;

  if found_thread is null then
    select t.id into found_thread from public.chat_threads t where t.direct_key = key;
  end if;

  insert into public.chat_thread_members (thread_id, member_id)
  values (found_thread, me), (found_thread, other)
  on conflict (thread_id, member_id) do nothing;

  return found_thread;
end;
$$;

-- --------------------------------------------------------------- the cap
-- One number, named once. Both functions below enforce it and the probe reads
-- it, so there is no second opinion about where a group stops.
create or replace function public.chat_group_cap()
returns integer
language sql
immutable
set search_path = ''
as $$ select 50; $$;

comment on function public.chat_group_cap() is
  'How many members a group holds, roster included. A flat thread larger than this is a room without a room''s reading rules.';

revoke all on function public.chat_group_cap() from public, anon;
grant execute on function public.chat_group_cap() to authenticated;

-- ------------------------------------------------------------ making one
create or replace function public.chat_create_group(group_name text, member_ids uuid[])
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  clean_name text := btrim(coalesce(group_name, ''));
  others uuid[];
  stranger uuid;
  new_thread uuid;
begin
  if not public.is_active_member() then
    raise exception 'Only an active member can start a group.' using errcode = '42501';
  end if;

  -- Checked here as well as by the table's constraint, because a constraint
  -- violation reaches the client as a sentence about a check name and this
  -- reaches it as a sentence about a group.
  if char_length(clean_name) < 1 or char_length(clean_name) > 60 then
    raise exception 'A group needs a name, of 60 characters or fewer.' using errcode = '22023';
  end if;

  -- Duplicates and the caller's own id are dropped rather than refused: a
  -- picker that sends somebody twice is a client bug, and making a member redo
  -- their list over it helps nobody.
  select array_agg(distinct candidate)
    into others
    from unnest(coalesce(member_ids, '{}'::uuid[])) as candidate
   where candidate is not null and candidate <> me;

  if coalesce(array_length(others, 1), 0) < 1 then
    raise exception 'A group needs somebody else in it.' using errcode = '22023';
  end if;

  if 1 + array_length(others, 1) > public.chat_group_cap() then
    raise exception 'A group holds % members. That is more.', public.chat_group_cap()
      using errcode = '22023';
  end if;

  -- Named, not counted: "that member cannot be added" about an unnamed
  -- somebody in a list of twelve is a refusal nobody can act on.
  select candidate into stranger
    from unnest(others) as candidate
   where not public.chat_is_findable(candidate)
   limit 1;
  if stranger is not null then
    raise exception 'One of those members cannot be added to a group.' using errcode = 'P0002';
  end if;

  insert into public.chat_threads (kind, name, created_by)
  values ('group', clean_name, me)
  returning id into new_thread;

  -- The caller first, then everybody they named, and `joined_at` written per
  -- row rather than left to default.
  --
  -- The default is now(), which is the *transaction's* start, so every roster
  -- row of a new group would carry the same timestamp to the microsecond and
  -- "oldest membership first" would be no order at all — two reads of the same
  -- group could list its members differently. The same trap, and the same fix,
  -- as chat_messages.created_at in 20260918070000.
  --
  -- `others` is distinct and excludes the caller, so prepending them cannot
  -- collide with the primary key.
  insert into public.chat_thread_members (thread_id, member_id, joined_at)
  select new_thread, member, clock_timestamp()
    from unnest(array_prepend(me, others)) with ordinality as t(member, n)
   order by t.n;

  return new_thread;
end;
$$;

comment on function public.chat_create_group(text, uuid[]) is
  'Start a group: the caller plus the members they named. The only way a group thread is created.';

revoke all on function public.chat_create_group(text, uuid[]) from public, anon;
grant execute on function public.chat_create_group(text, uuid[]) to authenticated;

-- --------------------------------------------------------- adding to one
create or replace function public.chat_add_to_group(thread uuid, new_member uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  thread_kind text;
  attached_event uuid;
  roster_size integer;
begin
  if not public.is_active_member() then
    raise exception 'Only an active member can add somebody to a group.' using errcode = '42501';
  end if;

  -- Being in it is the whole permission. There is no owner of a group and no
  -- invite to accept: anybody in the conversation can bring somebody into it,
  -- which is what "a named few" means, and anybody can leave.
  if not public.is_thread_member(thread) then
    raise exception 'There is no such group.' using errcode = 'P0002';
  end if;

  select t.kind, t.event_id into thread_kind, attached_event
    from public.chat_threads t where t.id = thread;

  if thread_kind <> 'group' then
    raise exception 'A conversation between two people does not take a third.'
      using errcode = '22023';
  end if;

  if attached_event is not null then
    raise exception 'Everybody going to the event is already welcome in its group chat, and joins it themselves.'
      using errcode = '22023';
  end if;

  if new_member is null then
    raise exception 'There is nobody to add.' using errcode = '22023';
  end if;

  -- Before the cap, so that adding somebody who is already in a full group is
  -- the no-op it looks like rather than a refusal.
  if exists (
    select 1 from public.chat_thread_members m
    where m.thread_id = thread and m.member_id = new_member
  ) then
    return;
  end if;

  select count(*) into roster_size
    from public.chat_thread_members m where m.thread_id = thread;
  if roster_size >= public.chat_group_cap() then
    raise exception 'This group holds % members and is full.', public.chat_group_cap()
      using errcode = '22023';
  end if;

  if not public.chat_is_findable(new_member) then
    raise exception 'That member cannot be added to a group.' using errcode = 'P0002';
  end if;

  insert into public.chat_thread_members (thread_id, member_id)
  values (thread, new_member)
  on conflict (thread_id, member_id) do nothing;
end;
$$;

comment on function public.chat_add_to_group(uuid, uuid) is
  'Bring one more member into a group the caller is in. Not a direct conversation, and not an event''s group.';

revoke all on function public.chat_add_to_group(uuid, uuid) from public, anon;
grant execute on function public.chat_add_to_group(uuid, uuid) to authenticated;
