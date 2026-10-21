-- ============================================================================
-- Events from across the country
-- ============================================================================
-- The owner, 2026-10-20: national SCI organizations' calendars join the
-- nightly import. Three things the California feeds never needed:
--
--   events.timezone  An event's own zone, when its source states one. An
--                    event without one keeps its feed's, as before. A national
--                    feed's own zone stays California, so an online event
--                    with no stated place reads in the club's time.
--   events.all_day   A tournament published as dates with no hours. Its
--                    start is the first day's midnight and its end the last
--                    day's 23:59, in its zone; the app shows the days, not a
--                    made-up time.
--   data_feeds.options  Per feed settings for a scraper shared by several
--                    sites (a title to keep or drop, say). A scraper reads
--                    only the keys it knows.
-- ============================================================================

alter table public.events add column if not exists timezone text
  check (timezone is null or timezone ~ '^[A-Za-z_]+(/[A-Za-z0-9_+-]+)+$');
alter table public.events add column if not exists all_day boolean not null default false;

comment on column public.events.timezone is
  'The event''s own IANA zone when its source states one; otherwise its feed''s.';
comment on column public.events.all_day is
  'Dates without hours: start is the first day''s midnight, end the last day''s 23:59, in its zone.';

grant select (timezone, all_day) on public.events to anon, authenticated;

alter table public.data_feeds add column if not exists options jsonb not null default '{}'::jsonb
  check (jsonb_typeof(options) = 'object');

-- Each feed_type names one scraper file (20260911180000_events.sql).
alter table public.data_feeds drop constraint if exists data_feeds_feed_type_check;
alter table public.data_feeds add constraint data_feeds_feed_type_check check (feed_type in (
  'norcalsci-events', 'adaptiverechub-events', 'naturetrack-trax',
  'tribe-events', 'ics-events', 'usta-wheelchair', 'usahockey-sled',
  'uspsa-events', 'reeve-support-groups'
));
