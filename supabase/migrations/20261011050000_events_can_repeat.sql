-- ============================================================================
-- An event added by hand can repeat
-- ============================================================================
-- The owner, 2026-10-10, after Google Calendar: adding an event offers
-- "Repeats": Does not repeat (the default), Daily, Weekly on <its weekday>,
-- Monthly on the <nth weekday>, or Custom — every N days, weeks or months,
-- ending never, on a date, or after a number of dates. Daily, Weekly and
-- Monthly never end, as Google's do.
--
-- ---------------------------------------------------------------------------
-- Every date is a row, as the scraped calendars' are
-- ---------------------------------------------------------------------------
-- An occurrence is an ordinary `events` row: it has its own Going list, its
-- own reminder the day before, its own page and its own group chat, and the
-- Events list already folds a series into one card ("8 more dates") by
-- `series_id` (src/routes/events/series-groups.ts). So a repeating event is
-- an `event_series` row with a rule, and rows made from it.
--
-- A series that never ends cannot be made all at once. The dates up to three
-- months ahead are made when it is added, and `event-series-extend` (pg_cron,
-- nightly) makes each next one as it comes within three months. A member
-- therefore always sees about a season ahead, as on the scraped calendars.
--
-- ---------------------------------------------------------------------------
-- event_series, for a hand-made series
-- ---------------------------------------------------------------------------
-- The scraper's series are per feed (20260913090000) and a hand-made one has
-- no feed, so `feed_id` becomes nullable; the unique (feed_id, series_key)
-- index does not see two nulls as equal, and the ingest only ever reads and
-- writes `where feed_id = <its feed>`. A hand-made series has a rule and a
-- template — what each new date copies — and a scraped one has neither.
--
-- The template is what was saved for the first date. Changing one date later
-- changes that date only (save_event, unchanged); dates not yet made copy the
-- template, as Google's "this event" edit does.
--
-- `added_by` is kept out of the public grant, as it is on `events`
-- (20261005020000): events are public, and which member keyed one in is not.
--
-- ---------------------------------------------------------------------------
-- Dates are wall-clock dates in Pacific
-- ---------------------------------------------------------------------------
-- Stepped as local times and turned back into instants, so a 6:30 pm group
-- stays at 6:30 pm across the change to and from daylight saving. Monthly is
-- the same weekday of the same week ("the third Friday"); a month without a
-- fifth Friday is skipped for a fifth-Friday series, as Google does.
--
-- ---------------------------------------------------------------------------
-- Stopping
-- ---------------------------------------------------------------------------
-- delete_event_and_later: this date and every later date in its series, and
-- the series makes no more. delete_event (one date) is unchanged; a date
-- deleted on its own is not made again, because the series has moved past it.
-- ============================================================================

alter table public.event_series alter column feed_id drop not null;

alter table public.event_series
  add column if not exists repeat_unit text,
  add column if not exists repeat_every integer,
  add column if not exists ends_on date,
  add column if not exists ends_after integer,
  add column if not exists first_start timestamptz,
  add column if not exists duration interval,
  add column if not exists next_index integer not null default 1,
  add column if not exists made integer not null default 0,
  add column if not exists stopped boolean not null default false,
  add column if not exists template jsonb,
  add column if not exists added_by uuid references public.members (id) on delete set null;

alter table public.event_series drop constraint if exists event_series_repeat_check;
alter table public.event_series
  add constraint event_series_repeat_check check (
    (feed_id is not null and repeat_unit is null)
    or (
      feed_id is null
      and repeat_unit in ('day', 'week', 'month')
      and repeat_every between 1 and 30
      and first_start is not null
      and template is not null
      and (ends_after is null or ends_after between 2 and 100)
      and not (ends_on is not null and ends_after is not null)
    )
  );

comment on column public.event_series.repeat_unit is
  'A hand-made series: day, week or month. Null for a series the ingest grouped.';
comment on column public.event_series.template is
  'What each new date of a hand-made series copies: the first date as it was saved.';
comment on column public.event_series.next_index is
  'The next step of the rule to make (0 was the first date). Only ever moves forward.';

-- The public read stays what it was, plus the rule; not the template or who
-- added it.
revoke select on public.event_series from anon, authenticated;
grant select (
  id, feed_id, series_key, title, created_at, updated_at,
  repeat_unit, repeat_every, ends_on, ends_after, stopped
) on public.event_series to anon, authenticated;

-- ------------------------------------------------------------- one date

-- The start of step `k` of a hand-made series, or null when that step has no
-- date (a fifth weekday a month does not have). Pure arithmetic on the rule.
create or replace function public.event_series_step(
  unit text,
  every integer,
  first_start timestamptz,
  k integer
)
returns timestamptz
language plpgsql
stable
set search_path = ''
as $$
declare
  zone constant text := 'America/Los_Angeles';
  local_first timestamp := first_start at time zone zone;
  first_day date := local_first::date;
  week_of_month integer := ((extract(day from first_day)::integer - 1) / 7) + 1;
  month_start date;
  offset_days integer;
  day_in_month integer;
  local_step timestamp;
begin
  if unit = 'day' then
    local_step := local_first + make_interval(days => every * k);
  elsif unit = 'week' then
    local_step := local_first + make_interval(days => 7 * every * k);
  else
    month_start := (date_trunc('month', first_day) + make_interval(months => every * k))::date;
    offset_days := (extract(dow from first_day)::integer - extract(dow from month_start)::integer + 7) % 7;
    day_in_month := 1 + offset_days + 7 * (week_of_month - 1);
    if day_in_month > extract(day from (month_start + interval '1 month' - interval '1 day'))::integer then
      return null;
    end if;
    local_step := (month_start + (day_in_month - 1)) + local_first::time;
  end if;
  return local_step at time zone zone;
end;
$$;

revoke all on function public.event_series_step(text, integer, timestamptz, integer)
  from public, anon, authenticated;

-- ------------------------------------------------------- making dates

-- Make the series' dates up to three months ahead, from where it left off.
-- Returns how many it made. Not callable by a member: save_event_series and
-- the nightly job call it.
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
      url, registration_url, organization_id, host_name, event_format, added_by, series_id
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
      s.id
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

-- Every open hand-made series, for the nightly job.
create or replace function public.extend_all_event_series()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  total integer := 0;
  s record;
begin
  for s in
    select e.id from public.event_series e
     where e.feed_id is null and not e.stopped
  loop
    total := total + public.extend_event_series(s.id);
  end loop;
  return total;
end;
$$;

revoke all on function public.extend_all_event_series() from public, anon, authenticated;

-- --------------------------------------------------------------- adding

-- Add a repeating event. The first date goes through save_event, so every
-- check it makes — who may post for which organization, the lengths, the
-- links, the place — is made once and in one place; the rest copy it.
-- Returns the first date's id.
create or replace function public.save_event_series(
  organization uuid,
  host text,
  title text,
  description text,
  starts timestamptz,
  ends timestamptz,
  format text,
  place text,
  city text,
  link text,
  registration text,
  repeat_unit text,
  repeat_every integer,
  ends_on date,
  ends_after integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  first_id uuid;
  opener public.events%rowtype;
  new_series uuid;
  zone constant text := 'America/Los_Angeles';
begin
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
  if ends_on is not null and starts is not null and ends_on <= (starts at time zone zone)::date then
    raise exception 'It has to end after the first date.' using errcode = '22023';
  end if;

  first_id := public.save_event(
    null, organization, host, title, description, starts, ends, format, place, city, link,
    registration
  );
  select * into opener from public.events e where e.id = first_id;

  insert into public.event_series (
    feed_id, series_key, title, repeat_unit, repeat_every, ends_on, ends_after,
    first_start, duration, next_index, made, template, added_by
  )
  values (
    null,
    'hand:' || first_id::text,
    opener.title,
    repeat_unit,
    repeat_every,
    ends_on,
    ends_after,
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
      'event_format', opener.event_format
    ),
    opener.added_by
  )
  returning id into new_series;

  update public.events e set series_id = new_series where e.id = first_id;
  perform public.extend_event_series(new_series);

  return first_id;
end;
$$;

revoke all on function public.save_event_series(
  uuid, text, text, text, timestamptz, timestamptz, text, text, text, text, text, text, integer,
  date, integer
) from public, anon;
grant execute on function public.save_event_series(
  uuid, text, text, text, timestamptz, timestamptz, text, text, text, text, text, text, integer,
  date, integer
) to authenticated;

-- ------------------------------------------------------------- stopping

-- This date and every later one in its series, and the series makes no more.
-- For a date not in a hand-made series it is delete_event. Only dates the
-- caller may change go: a date moved to another organization's name stays.
-- Returns how many dates were deleted.
create or replace function public.delete_event_and_later(event uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing public.events%rowtype;
  gone integer;
begin
  if auth.uid() is null then
    raise exception 'You are not signed in.' using errcode = '42501';
  end if;
  select * into existing from public.events e where e.id = event for update;
  if not found then
    raise exception 'That event is not on the calendar any more.' using errcode = 'P0002';
  end if;
  if existing.feed_id is not null then
    raise exception 'This event comes from the organization''s own calendar, so it is changed there.'
      using errcode = '42501';
  end if;
  if not public.may_post_events_for(existing.organization_id) then
    raise exception 'You cannot delete this event.' using errcode = '42501';
  end if;

  if existing.series_id is null then
    delete from public.events e where e.id = event;
    return 1;
  end if;

  update public.event_series s
     set stopped = true, updated_at = now()
   where s.id = existing.series_id and s.feed_id is null;

  delete from public.events e
   where e.series_id = existing.series_id
     and e.feed_id is null
     and e.start_time >= existing.start_time
     and public.may_post_events_for(e.organization_id);
  get diagnostics gone = row_count;
  return gone;
end;
$$;

revoke all on function public.delete_event_and_later(uuid) from public, anon;
grant execute on function public.delete_event_and_later(uuid) to authenticated;

-- ----------------------------------------------------------- nightly

do $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'event-series-extend';
  perform cron.schedule('event-series-extend', '40 11 * * *', 'select public.extend_all_event_series()');
end;
$$;
