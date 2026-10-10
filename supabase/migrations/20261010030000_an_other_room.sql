-- ============================================================================
-- Other: a category of its own, with a room in it
-- ============================================================================
-- The owner, 2026-10-10: an "Other" room for whatever fits no room at all,
-- under a heading of its own (drawn last) rather than inside General. Opened
-- now, started by nobody, like the seeded rooms; a topic asked here can be
-- moved to the right room later (chat_move_topic). Members may start rooms
-- in Other too, so chat_create_room is restated from 20261010010000 with it
-- allowed; nothing else in it changes.
--
-- `on conflict do nothing` covers an id or a name already taken: a member's
-- own room called "Other" (lower(name) is unique) is left as it is, and this
-- one is then not made.
-- ============================================================================

alter table public.chat_rooms drop constraint if exists chat_rooms_category_check;
alter table public.chat_rooms
  add constraint chat_rooms_category_check
  check (category in ('General', 'Body', 'Mind', 'Life', 'Family', 'Kit', 'Places', 'Other'));

comment on column public.chat_rooms.category is
  'One of General, Body, Mind, Life, Family, Kit, Places or Other. Chosen by whoever starts the room; nobody changes it afterwards.';

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

  -- The same six as the constraint above. Said here in words so the refusal
  -- names the choices rather than quoting a check constraint at somebody.
  if room_category not in ('General', 'Body', 'Mind', 'Life', 'Family', 'Kit', 'Places', 'Other') then
    raise exception 'A room is in General, Body, Mind, Life, Family, Kit, Places or Other.'
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

revoke all on function public.chat_create_room(text, text, text, text, text) from public, anon;
grant execute on function public.chat_create_room(text, text, text, text, text) to authenticated;

insert into public.chat_rooms (id, name, description, category, icon, sort_order, opened_at)
values (
  'other',
  'Other',
  'Anything that does not fit another room. It can be moved to the right one later.',
  'Other',
  -- No glyph: every seeded one was checked in a screenshot, and the plain
  -- letter tile member rooms get is the safe choice.
  null,
  13,
  now()
)
on conflict do nothing;
