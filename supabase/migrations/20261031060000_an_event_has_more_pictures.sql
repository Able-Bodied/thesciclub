-- ============================================================================
-- An event can have more pictures
--
-- The owner, 2026-10-31: "add multiple pictures to events ... one main image
-- and then other images that users could select below". The cover stays the
-- main one, on photo_path, so cards and everything else that draws it are as
-- they were. events.more_photos is up to six others, each {path, alt}, in
-- the order shown under it on the event's page.
--
-- As the cover (20261011070000): the files go in events/<event id>/, written
-- by whoever may change the event (may_change_event and the storage policies
-- already cover that folder). On a date of a repeating event they apply to that
-- date, every later one and the template. A file is handed back to delete only
-- when nothing names it any more.
--
-- The public page shows them as it does the cover, so event_cover_is_public
-- reads them too, only ever for a file in the events folder: this column has no
-- check on its paths as photo_path does, and it must never open another file.
--
-- public_event is as 20261029110000, with the pictures; it is dropped because
-- what it returns changes. extend_event_series is as 20261011070000.
-- ============================================================================

alter table public.events
  add column more_photos jsonb not null default '[]'::jsonb;

alter table public.events
  add constraint events_more_photos_shape check (
    jsonb_typeof(more_photos) = 'array' and jsonb_array_length(more_photos) <= 6
  );

comment on column public.events.more_photos is
  'Up to six pictures besides the cover, each {path, alt}. Written by set_event_more_photos. See 20261031060000.';

grant select (more_photos) on public.events to anon, authenticated;

-- ------------------------------------------------------------------ setting --
-- Returns the files nothing names any more, for the client to delete.
create function public.set_event_more_photos(event uuid, photos jsonb)
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing public.events%rowtype;
  wanted jsonb := '[]'::jsonb;
  item jsonb;
  item_path text;
  item_alt text;
  gone text[];
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
  if photos is null or jsonb_typeof(photos) <> 'array' then
    raise exception 'That is not a list of pictures.' using errcode = '22023';
  end if;
  if jsonb_array_length(photos) > 6 then
    raise exception 'An event can have up to 6 more pictures.' using errcode = '22023';
  end if;

  for item in select value from jsonb_array_elements(photos) loop
    item_path := item ->> 'path';
    item_alt := nullif(btrim(coalesce(item ->> 'alt', '')), '');
    if item_path is null then
      raise exception 'That is not a list of pictures.' using errcode = '22023';
    end if;
    if char_length(coalesce(item_alt, '')) > 200 then
      raise exception 'The description of a picture can be 200 characters at most.' using errcode = '22023';
    end if;
    -- One it already has is always allowed: on a later date of a series the
    -- file is in the first date's folder.
    if not existing.more_photos @> jsonb_build_array(jsonb_build_object('path', item_path)) then
      if item_path !~ ('^events/' || event::text || '/[A-Za-z0-9_-]{1,80}\.[a-z0-9]{1,5}$') then
        raise exception 'That picture is not in this event''s folder.' using errcode = '22023';
      end if;
      if not exists (
        select 1 from storage.objects o
         where o.bucket_id = 'photos' and o.name = item_path
      ) then
        raise exception 'That picture was not uploaded.' using errcode = 'P0002';
      end if;
    end if;
    if not wanted @> jsonb_build_array(jsonb_build_object('path', item_path)) then
      wanted := wanted || jsonb_build_array(
        jsonb_build_object('path', item_path, 'alt', coalesce(item_alt, ''))
      );
    end if;
  end loop;

  update public.events e
     set more_photos = wanted,
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
       set template = s.template || jsonb_build_object('more_photos', wanted),
           updated_at = now()
     where s.id = existing.series_id and s.feed_id is null;
  end if;

  select coalesce(array_agg(was.path), '{}') into gone
    from (
      select distinct old_item ->> 'path' as path
        from jsonb_array_elements(existing.more_photos) as old_item
    ) was
   where not exists (
           select 1 from public.events e
            where e.photo_path = was.path
               or e.more_photos @> jsonb_build_array(jsonb_build_object('path', was.path))
         )
     and not exists (
           select 1 from public.event_series s
            where s.template ->> 'photo_path' = was.path
               or s.template -> 'more_photos' @> jsonb_build_array(jsonb_build_object('path', was.path))
         );
  return gone;
end;
$$;

revoke all on function public.set_event_more_photos(uuid, jsonb) from public, anon;
grant execute on function public.set_event_more_photos(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------- the public page --
create or replace function public.event_cover_is_public(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select object_name like 'events/%' and exists (
    select 1 from public.events e
     where e.photo_path = object_name
        or e.more_photos @> jsonb_build_array(jsonb_build_object('path', object_name))
  );
$$;

drop function public.public_event(uuid);

create function public.public_event(event uuid)
returns table (
  id uuid,
  title text,
  description text,
  description_html text,
  start_time timestamptz,
  end_time timestamptz,
  all_day boolean,
  timezone text,
  location text,
  city text,
  state text,
  event_format text,
  url text,
  registration_url text,
  photo_path text,
  photo_alt text,
  more_photos jsonb,
  organization_id uuid,
  organization_name text,
  organization_short_code text,
  organization_logo_path text
)
language sql
stable
security definer
set search_path = ''
as $$
  select e.id, e.title, e.description, e.description_html, e.start_time, e.end_time,
         e.all_day, e.timezone, e.location, e.city, e.state, e.event_format, e.url,
         e.registration_url, e.photo_path, e.photo_alt, e.more_photos,
         o.id, o.name, o.short_code, o.logo_path
    from public.events e
    left join public.organizations o on o.id = e.organization_id and o.removed_at is null
   where e.id = event;
$$;

revoke all on function public.public_event(uuid) from public;
grant execute on function public.public_event(uuid) to anon, authenticated;

-- ------------------------------------------- the nightly job copies them --
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
      photo_path, photo_alt, more_photos
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
      s.template ->> 'photo_alt',
      coalesce(s.template -> 'more_photos', '[]'::jsonb)
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
