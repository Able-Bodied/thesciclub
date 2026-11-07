-- ============================================================================
-- An event already on the calendar can be made to repeat
-- ============================================================================
-- The owner, 2026-11-06: changing an event, its organizer can make it repeat,
-- as when adding one (20261011050000). make_event_repeat makes the series
-- save_event_series would have made, with this date as its first, and
-- extend_event_series makes the dates up to three months ahead. Its picture,
-- more pictures and video call link go into the template, so every date has
-- them; who can see it comes from the date before, as for any new date
-- (20261106030000).
--
-- Only an event added by hand (an imported one repeats as its calendar says),
-- not already repeating, and not yet started: a series made from a past date
-- would fill the weeks since with dates that already happened.
--
-- save_event and save_event_series are unchanged, so the store builds (1.0.5,
-- 1.2.0) work as before; they show the new dates as any others.
--
-- Undo: supabase/undo/20261106090000.sql.
-- ============================================================================

create function public.make_event_repeat(
  event uuid,
  repeat_unit text,
  repeat_every integer,
  ends_on date default null,
  ends_after integer default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  opener public.events%rowtype;
  new_series uuid;
  zone constant text := 'America/Los_Angeles';
begin
  if auth.uid() is null then
    raise exception 'You are not signed in.' using errcode = '42501';
  end if;
  select * into opener from public.events e where e.id = event for update;
  if not found then
    raise exception 'That event is not on the calendar any more.' using errcode = 'P0002';
  end if;
  if not public.may_change_event(event) then
    raise exception 'You cannot change this event.' using errcode = '42501';
  end if;
  if opener.feed_id is not null then
    raise exception 'An event from an organization''s calendar repeats as that calendar says.'
      using errcode = '22023';
  end if;
  if opener.series_id is not null then
    raise exception 'This event already repeats.' using errcode = '22023';
  end if;
  if opener.start_time <= now() then
    raise exception 'Only an event that has not started yet can be made to repeat.'
      using errcode = '22023';
  end if;
  if repeat_unit is null or repeat_unit not in ('day', 'week', 'month') then
    raise exception 'Say how often it repeats.' using errcode = '22023';
  end if;
  if repeat_every is null or repeat_every < 1 or repeat_every > 30 then
    raise exception 'It can repeat every 1 to 30 days, weeks or months.' using errcode = '22023';
  end if;
  if ends_on is not null and ends_after is not null then
    raise exception 'Say when it ends one way, not both.' using errcode = '22023';
  end if;
  if ends_after is not null and (ends_after < 2 or ends_after > 100) then
    raise exception 'It can repeat 2 to 100 times.' using errcode = '22023';
  end if;
  if ends_on is not null and ends_on <= (opener.start_time at time zone zone)::date then
    raise exception 'It has to end after the first date.' using errcode = '22023';
  end if;

  insert into public.event_series (
    feed_id, series_key, title, repeat_unit, repeat_every, ends_on, ends_after,
    first_start, duration, next_index, made, template, added_by
  )
  values (
    null,
    'hand:' || opener.id::text,
    opener.title,
    make_event_repeat.repeat_unit,
    make_event_repeat.repeat_every,
    make_event_repeat.ends_on,
    make_event_repeat.ends_after,
    opener.start_time,
    case when opener.end_time is null then null else opener.end_time - opener.start_time end,
    1,
    1,
    jsonb_build_object(
      'title', opener.title,
      'description', opener.description,
      'location', opener.location,
      'city', opener.city,
      'url', opener.url,
      'registration_url', opener.registration_url,
      'organization_id', opener.organization_id,
      'host_name', opener.host_name,
      'event_format', opener.event_format,
      'photo_path', opener.photo_path,
      'photo_alt', opener.photo_alt,
      'more_photos', opener.more_photos,
      'meeting_url', opener.meeting_url
    ),
    coalesce(opener.added_by, auth.uid())
  )
  returning id into new_series;

  update public.events e set series_id = new_series, updated_at = now() where e.id = opener.id;
  return public.extend_event_series(new_series);
end;
$$;
revoke all on function public.make_event_repeat(uuid, text, integer, date, integer) from public, anon;
grant execute on function public.make_event_repeat(uuid, text, integer, date, integer) to authenticated;
