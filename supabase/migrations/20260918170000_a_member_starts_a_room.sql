-- ============================================================================
-- Chat, migration 17: a member starts a room, and it is never born empty
-- ============================================================================
-- The twelve seeded rooms are starters, not the limit. The owner's decision on
-- 2026-09-20: any member can open a room. The argument is the one the club is
-- built on — everybody inside is a vetted member, so a member with a problem
-- nobody anticipated does not have to wait for an administrator to have
-- thought of it first.
--
-- This alters chat_rooms rather than replacing it. The seeded twelve keep
-- working exactly as they do: closed until an administrator opens them, one at
-- a time, with the same switch.
--
-- ---------------------------------------------------------------------------
-- A room cannot be born empty
-- ---------------------------------------------------------------------------
-- CONTEXT.md's objection to topic rooms is still true and is not answered by a
-- rule: a room of two dozen members is empty by construction, and a room with
-- nothing in it reads as abandoned rather than as new. It is answered by the
-- shape of the flow instead. chat_create_room takes the first topic's title
-- and body as arguments and writes the room, the membership and the topic in
-- one transaction. There is no way to make a room and fill it later, because
-- that is the failure.
--
-- Which is also why a member room is open from birth — `opened_at =
-- clock_timestamp()`. The seeded twelve are closed because there is nobody to
-- fill them yet; a room somebody has just written a topic into has somebody to
-- fill it, and there is no administrator standing by to open it.
--
-- ---------------------------------------------------------------------------
-- Fill your last room before starting another
-- ---------------------------------------------------------------------------
-- The rate limit is not a number, because a number is arbitrary and has to be
-- explained. It is the invariant above, checked on the way in: every room the
-- caller has already started has at least one topic in it. On the screen that
-- is "Fill your last room before starting another", which is a sentence
-- somebody can act on.
--
-- **Today nothing can make it fire.** A room is born with a topic and nothing
-- in this build deletes a topic — chat_remove_post blanks a body in place,
-- there is no delete policy or delete grant on chat_topics, and removing a
-- member nulls an author rather than dropping a row. So the check is a latch
-- for the day something does, not a limit anybody will meet. It is written
-- anyway, and the probe has to delete a topic as the superuser to exercise it,
-- which says the same thing from the other side. What it is *not* is a limit on
-- how fast rooms can be started: somebody who writes a real topic each time can
-- start as many as they like. If that ever needs a cap it is a separate
-- decision with a number in it, and this is not it.
--
-- An administrator is exempt from this one rule and no other, so that seeding
-- is not blocked by a room they opened for somebody else.
--
-- ---------------------------------------------------------------------------
-- One name, and nobody renames or deletes a room
-- ---------------------------------------------------------------------------
-- `unique (lower(name))`: two rooms called "Shoulder pain" is the split
-- conversation the twelve exist to prevent, and the second one is always the
-- one that looks dead. The function checks for the clash itself and raises a
-- sentence with the existing room's name in it, rather than letting the index
-- raise 23505 — "duplicate key value violates unique constraint" is not
-- something to show a member, and the name is what they need to find it.
--
-- The name is stored with its runs of whitespace collapsed to single spaces,
-- which is what makes the index mean what it says. Lowercasing alone let
-- "SHOULDER   pain" through beside "Shoulder pain" — found by running the
-- probe rather than by reading it. Two spaces are not a different subject, and
-- a uniqueness rule anybody can step over by leaning on the space bar is
-- decoration.
--
-- There is still no update policy and no delete policy on chat_rooms, not even
-- for the member who started one. The topics in a room belong to whoever wrote
-- them, and a starter who could rename or delete the room could take those with
-- it. The moderation lever is the one that already exists: an administrator
-- closes it, and everything in it stops being visible while staying written.
--
-- ---------------------------------------------------------------------------
-- No icon, and no icon picker
-- ---------------------------------------------------------------------------
-- `icon` becomes nullable and a member room has none. The seeded glyphs each
-- needed checking in a screenshot — ⛭ drew as a tofu box and had to be
-- replaced — so a menu of twelve of them is a font problem handed to somebody
-- who came here to ask about their shoulder. A null icon draws the same letter
-- tile a null author does.
--
-- ---------------------------------------------------------------------------
-- sort_order 1000 and up
-- ---------------------------------------------------------------------------
-- Member rooms sort after the seeded ones inside their category, newest last,
-- which is what 1000 + the number of member rooms so far gives. The category
-- order is still the lowest sort_order in each, so Body · Life · Kit holds for
-- as long as any seeded room is open.
--
-- ---------------------------------------------------------------------------
-- chat_rooms joins the realtime publication
-- ---------------------------------------------------------------------------
-- It carries nothing private — the select policy is the same as it was, and a
-- closed room still does not reach a member — and a room appearing on
-- everybody's list the moment it is started is the point of letting members
-- start them.
-- ============================================================================

alter table public.chat_rooms
  add column if not exists created_by uuid references public.members (id) on delete set null;

comment on column public.chat_rooms.created_by is
  'The member who started the room, or null for the seeded twelve. Null after they leave the club: the room stays, the name goes.';

-- Null for a member room. The seeded twelve keep theirs.
alter table public.chat_rooms alter column icon drop not null;

create unique index if not exists chat_rooms_one_name
  on public.chat_rooms (lower(name));

-- --------------------------------------------------------- starting one
create or replace function public.chat_create_room(
  room_name text,
  room_description text,
  room_category text,
  topic_title text,
  topic_body text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- Every parameter is prefixed rather than named for its column. Inside
  -- plpgsql a parameter called `name` is ambiguous against chat_rooms.name in
  -- any statement that touches the table, and this function writes both. Third
  -- time this has bitten: admin_set_room_open(is_open), chat_create_group
  -- (group_name), chat_report_post(report_note).
  -- Whitespace collapsed as well as trimmed: see the header. lower(name) is
  -- unique, so "Shoulder  pain" and "Shoulder pain" have to be the same name
  -- by the time the index sees them.
  clean_name text := pg_catalog.btrim(pg_catalog.regexp_replace(room_name, '\s+', ' ', 'g'));
  clean_description text := btrim(room_description);
  caller uuid := auth.uid();
  clash text;
  unfilled text;
  base text;
  new_id text;
  attempt int := 0;
begin
  -- RLS is off inside a definer function, so every gate below is stated here
  -- explicitly. None of it is protected by the policies on chat_rooms.
  if not public.is_active_member() then
    raise exception 'Only an active member can start a room.'
      using errcode = '42501';
  end if;

  if room_category not in ('Body', 'Life', 'Kit') then
    raise exception 'A room is in Body, Life or Kit.'
      using errcode = '22023';
  end if;

  if char_length(clean_name) < 3 or char_length(clean_name) > 40 then
    raise exception 'A room''s name is between 3 and 40 characters.'
      using errcode = '22023';
  end if;

  if char_length(clean_description) < 10 or char_length(clean_description) > 200 then
    raise exception 'Say what the room is for, in between 10 and 200 characters.'
      using errcode = '22023';
  end if;

  -- The topic's own two fields are checked by chat_topics' and chat_posts'
  -- constraints at the bottom of this function. They are not re-checked here,
  -- because a second copy of "1 to 140 characters" is a second thing to keep
  -- in step with the first.

  select r.name into clash
    from public.chat_rooms r
   where lower(r.name) = lower(clean_name);
  if found then
    raise exception 'There is already a room called %.', clash
      using errcode = '23505';
  end if;

  if not public.is_admin() then
    select r.name into unfilled
      from public.chat_rooms r
     where r.created_by = caller
       and not exists (select 1 from public.chat_topics t where t.room_id = r.id)
     order by r.sort_order
     limit 1;
    if found then
      raise exception 'Fill your last room before starting another. % has nothing in it yet.', unfilled
        using errcode = '42501';
    end if;
  end if;

  -- The id is in the URL forever, so it is a slug of the name the room was
  -- started under plus four random characters. The suffix is what lets two
  -- rooms be named out of the same words in different categories, and what
  -- keeps the URL working if the name is ever allowed to change — the slug is
  -- a convenience for whoever reads the address bar, not the identity.
  base := pg_catalog.btrim(
    pg_catalog.regexp_replace(pg_catalog.lower(clean_name), '[^a-z0-9]+', '-', 'g'),
    '-'
  );
  base := pg_catalog.btrim(pg_catalog.left(base, 24), '-');
  if base = '' then
    -- A name with no ASCII letters or digits in it at all. Rare, and not a
    -- reason to refuse somebody a room.
    base := 'room';
  end if;

  loop
    attempt := attempt + 1;
    new_id := base || '-' ||
      pg_catalog.substr(pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', ''), 1, 4);
    exit when not exists (select 1 from public.chat_rooms r where r.id = new_id);
    if attempt >= 8 then
      raise exception 'Could not find a free address for that room. Try a different name.'
        using errcode = '23505';
    end if;
  end loop;

  insert into public.chat_rooms (
    id, name, description, category, icon, sort_order, opened_at, created_by
  )
  values (
    new_id,
    clean_name,
    clean_description,
    room_category,
    null,
    -- 1000 and up, so member rooms follow the seeded twelve inside a category.
    (select greatest(1000, coalesce(max(r.sort_order), 0) + 1)
       from public.chat_rooms r
      where r.created_by is not null),
    pg_catalog.clock_timestamp(),
    caller
  );

  -- The starter is in it. Joining is what puts the composer on the screen, and
  -- somebody who has just written the first topic is in the room by any
  -- reading.
  insert into public.chat_room_members (room_id, member_id)
  values (new_id, caller)
  on conflict do nothing;

  -- The same path an ordinary new topic takes, so that "a topic is a topic and
  -- its first post" is written once. chat_create_topic is security invoker and
  -- is being called from inside a definer function, so it runs with this
  -- function's privileges — the checks above are what decided this, not the
  -- insert policies it would otherwise have met.
  perform public.chat_create_topic(new_id, topic_title, topic_body);

  return new_id;
end;
$$;

comment on function public.chat_create_room(text, text, text, text, text) is
  'Start a room and its first topic in one transaction. Active members; the room is open from birth.';

revoke all on function public.chat_create_room(text, text, text, text, text) from public, anon;
grant execute on function public.chat_create_room(text, text, text, text, text) to authenticated;

-- ------------------------------------------------------------ on the wire
-- Guarded, because adding a table that is already in the publication is an
-- error and this migration must be re-runnable.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'chat_rooms'
  ) then
    alter publication supabase_realtime add table public.chat_rooms;
  end if;
end $$;
