-- ============================================================================
-- An event added by hand can have a cover picture
-- ============================================================================
-- The owner, 2026-10-10: one picture per event — a flyer, or the venue —
-- shown large at the top of the event's page and small on its card. Only on
-- an event added by hand: a scraped event is its organization's calendar's,
-- and is changed there.
--
-- 20260911180000 left event pictures out because no screen drew one. Now one
-- does, and the shape is the organization logo's (20261009040000), the
-- nearest thing the club already has: a file in the private photos bucket,
-- a column naming it, and a function that sets the column only to a file the
-- caller may write and actually uploaded.
--
-- ---------------------------------------------------------------------------
-- Where the files go, and who may put them there
-- ---------------------------------------------------------------------------
-- events/<event id>/<random>.<ext>, written by whoever may change that event:
-- an administrator, or a member who speaks for its organization
-- (may_post_events_for, as save_event decides). Read as every photograph in
-- the bucket is read: by a member (20261001000000). The random name makes a
-- new picture a new URL, so a cached signed URL cannot show the old one.
--
-- `photo_alt` is the words a screen reader says for it: optional, because a
-- flyer's words are usually the event's own, and an empty alt on a
-- decorative picture is correct.
--
-- ---------------------------------------------------------------------------
-- A repeating event
-- ---------------------------------------------------------------------------
-- Every date is its own row (20261011050000). A picture set on one date is
-- set on that date and every later date of its series, and on the template
-- the nightly job copies, so dates not yet made get it too — the cover is
-- the series'. Earlier dates keep theirs. The previous file is returned to
-- the client to delete only when no event still names it.
--
-- Deleting an event leaves its file. A few hundred kilobytes a picture is
-- cheaper than a delete that could take a file a later date still shows.
-- ============================================================================

alter table public.events
  add column if not exists photo_path text,
  add column if not exists photo_alt text;

alter table public.events drop constraint if exists events_photo_path_check;
alter table public.events
  add constraint events_photo_path_check check (
    photo_path is null or photo_path ~ '^events/[0-9a-f-]{36}/[A-Za-z0-9_-]{1,80}\.[a-z0-9]{1,5}$'
  );
alter table public.events drop constraint if exists events_photo_alt_length;
alter table public.events
  add constraint events_photo_alt_length check (char_length(photo_alt) <= 200);

comment on column public.events.photo_path is
  'The cover picture, events/<event id>/<file> in the photos bucket. Hand-added events only.';
comment on column public.events.photo_alt is
  'What a screen reader says for the cover picture. Optional.';

grant select (photo_path, photo_alt) on public.events to anon, authenticated;

-- ------------------------------------------------------------- who may

create or replace function public.may_change_event(event uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.events e
     where e.id = event
       and e.feed_id is null
       and public.may_post_events_for(e.organization_id)
  );
$$;

comment on function public.may_change_event(uuid) is
  'An event added by hand that the caller may change: save_event''s rule, for storage and set_event_photo.';

revoke all on function public.may_change_event(uuid) from public, anon;
grant execute on function public.may_change_event(uuid) to authenticated;

-- Parsed by hand rather than cast in the policy: a folder that is not a uuid
-- would make the cast raise, and a policy that raises refuses with an error
-- nobody can read instead of a plain no (as organization_logo_is_writable).
create or replace function public.event_photo_is_writable(object_name text)
returns boolean
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  parts text[] := storage.foldername(object_name);
begin
  if coalesce(cardinality(parts), 0) <> 2
    or parts[1] <> 'events'
    or parts[2] !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  return public.may_change_event(parts[2]::uuid);
end;
$$;

comment on function public.event_photo_is_writable(text) is
  'Whether the caller may write this object: events/<id>/<file> for an event they may change.';

revoke all on function public.event_photo_is_writable(text) from public, anon;
grant execute on function public.event_photo_is_writable(text) to authenticated;

drop policy if exists "an event's editor uploads its cover" on storage.objects;
create policy "an event's editor uploads its cover"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'photos' and public.event_photo_is_writable(name));

drop policy if exists "an event's editor deletes its cover" on storage.objects;
create policy "an event's editor deletes its cover"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'photos' and public.event_photo_is_writable(name));

-- ------------------------------------------------------------- setting

-- Give an event a cover, or none (photo_path null). On a date of a repeating
-- event, that date and every later one, and the template. Returns the path it
-- replaced if nothing names it any more, so the client can delete the file;
-- null otherwise.
create or replace function public.set_event_photo(event uuid, photo_path text, photo_alt text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing public.events%rowtype;
  previous text;
  clean_alt text := nullif(trim(coalesce(photo_alt, '')), '');
begin
  if auth.uid() is null then
    raise exception 'You are not signed in.' using errcode = '42501';
  end if;
  select * into existing from public.events e where e.id = event for update;
  if not found then
    raise exception 'That event is not on the calendar any more.' using errcode = 'P0002';
  end if;
  if not public.may_change_event(event) then
    raise exception 'You cannot change this event.' using errcode = '42501';
  end if;
  if length(coalesce(clean_alt, '')) > 200 then
    raise exception 'The description of the picture can be 200 characters at most.' using errcode = '22023';
  end if;
  -- The picture it already has is always allowed, so its description can be
  -- changed on a later date of a series, whose file is in the first date's
  -- folder.
  if set_event_photo.photo_path is not null
     and set_event_photo.photo_path is distinct from existing.photo_path then
    if set_event_photo.photo_path !~ ('^events/' || event::text || '/[A-Za-z0-9_-]{1,80}\.[a-z0-9]{1,5}$') then
      raise exception 'That picture is not in this event''s folder.' using errcode = '22023';
    end if;
    if not exists (
      select 1 from storage.objects o
       where o.bucket_id = 'photos' and o.name = set_event_photo.photo_path
    ) then
      raise exception 'That picture was not uploaded.' using errcode = 'P0002';
    end if;
  end if;

  previous := existing.photo_path;

  update public.events e
     set photo_path = set_event_photo.photo_path,
         photo_alt = case when set_event_photo.photo_path is null then null else clean_alt end,
         updated_at = now()
   where e.id = event
      or (
        existing.series_id is not null
        and e.series_id = existing.series_id
        and e.feed_id is null
        and e.start_time > existing.start_time
        and public.may_post_events_for(e.organization_id)
      );

  if existing.series_id is not null then
    update public.event_series s
       set template = s.template
             || jsonb_build_object(
                  'photo_path', set_event_photo.photo_path,
                  'photo_alt', case when set_event_photo.photo_path is null then null else clean_alt end
                ),
           updated_at = now()
     where s.id = existing.series_id and s.feed_id is null;
  end if;

  if previous is null
     or previous = set_event_photo.photo_path
     or exists (select 1 from public.events e where e.photo_path = previous)
     or exists (select 1 from public.event_series s where s.template ->> 'photo_path' = previous) then
    return null;
  end if;
  return previous;
end;
$$;

revoke all on function public.set_event_photo(uuid, text, text) from public, anon;
grant execute on function public.set_event_photo(uuid, text, text) to authenticated;

-- ------------------------------------------- the nightly job copies it

-- extend_event_series from 20261011050000, restated so a new date copies the
-- template's cover. Nothing else in it changes.
create or replace function public.extend_event_series(series uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.event_series%rowtype;
  zone constant text := 'America/Los_Angeles';
  horizon timestamptz := now() + interval '92 days';
  k integer;
  starts timestamptz;
  made_now integer := 0;
  finished boolean := false;
  guard integer := 0;
begin
  select * into s from public.event_series e where e.id = series for update;
  if not found or s.feed_id is not null or s.stopped then
    return 0;
  end if;

  k := s.next_index;
  loop
    guard := guard + 1;
    exit when guard > 500;

    if s.ends_after is not null and s.made + made_now >= s.ends_after then
      finished := true;
      exit;
    end if;

    starts := public.event_series_step(s.repeat_unit, s.repeat_every, s.first_start, k);
    if starts is null then
      k := k + 1;
      continue;
    end if;
    if s.ends_on is not null and (starts at time zone zone)::date > s.ends_on then
      finished := true;
      exit;
    end if;
    exit when starts > horizon;

    insert into public.events (
      title, description, description_html, start_time, end_time, location, city,
      url, registration_url, organization_id, host_name, event_format, added_by, series_id,
      photo_path, photo_alt
    )
    values (
      s.template ->> 'title',
      coalesce(s.template ->> 'description', ''),
      '',
      starts,
      case when s.duration is null then null else starts + s.duration end,
      coalesce(s.template ->> 'location', ''),
      s.template ->> 'city',
      s.template ->> 'url',
      s.template ->> 'registration_url',
      (s.template ->> 'organization_id')::uuid,
      s.template ->> 'host_name',
      s.template ->> 'event_format',
      s.added_by,
      s.id,
      s.template ->> 'photo_path',
      s.template ->> 'photo_alt'
    );
    made_now := made_now + 1;
    k := k + 1;
  end loop;

  update public.event_series e
     set next_index = k,
         made = s.made + made_now,
         stopped = finished,
         updated_at = now()
   where e.id = s.id;

  return made_now;
end;
$$;

revoke all on function public.extend_event_series(uuid) from public, anon, authenticated;
