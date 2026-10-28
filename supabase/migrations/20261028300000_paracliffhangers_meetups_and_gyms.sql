-- ============================================================================
-- ParaCliffHangers' meetups, and its gyms on the map
-- ============================================================================
-- The owner, 2026-10-27. ParaCliffHangers' Indoor page lists each chapter's
-- gym and schedule; a reader of its own makes the dates nightly, 92 days
-- ahead, in each chapter's zone, and removes ones the page stops giving
-- (jobs/event-ingest/scrapers/paracliffhangers-meetups.js).
--
-- Adaptive Rec Hub carries three of the same meetups, so it now leaves
-- ParaCliffHangers out (options.exclude_host), and its copies still to come
-- go: the chapter's own page says what is on.
--
-- One place per gym, as the page shows it to a visitor: the gym's name as
-- its street line (the map looks it up by name, as Shepherd Center's), its
-- city and state, labelled with the city. Mesa Rim Mission Valley hosts the
-- adult and youth meetups: one place. Off the map: Gravity Vault Brick and
-- Gravity Vault Flemington, whose chapters say "Currently paused". The
-- directory's own city ("Bay Area") and state (none) stay as they are.
--
-- Fixed here rather than written by the reader: places are curated, an
-- administrator edits them, and each new address asks for a lookup.
-- Source of every row: https://www.paracliffhangers.org/indoor, read 2026-10-27.
-- ============================================================================

alter table public.data_feeds drop constraint if exists data_feeds_feed_type_check;
alter table public.data_feeds add constraint data_feeds_feed_type_check check (feed_type in (
  'norcalsci-events', 'adaptiverechub-events', 'naturetrack-trax',
  'tribe-events', 'ics-events', 'usta-wheelchair', 'usahockey-sled',
  'uspsa-events', 'reeve-support-groups',
  'triumph-events', 'squarespace-events', 'activenet-events', 'unrecables-trips',
  'mycalendar-events', 'paracliffhangers-meetups'
));

insert into public.data_feeds (name, feed_url, feed_type, organization_id, options)
select 'ParaCliffHangers indoor meetups', 'https://www.paracliffhangers.org/indoor',
       'paracliffhangers-meetups', o.id, '{"days": 92}'::jsonb
  from public.organizations o
 where o.short_code = 'PCH'
on conflict (feed_url) do nothing;

update public.data_feeds
   set options = options || '{"exclude_host": "^paracliffhangers"}'::jsonb
 where feed_type = 'adaptiverechub-events';

delete from public.events e
 using public.data_feeds f
 where f.id = e.feed_id
   and f.feed_type = 'adaptiverechub-events'
   and e.host_name ~* '^paracliffhangers'
   and e.start_time > now();

-- Each row: the page's "City, ST" line, then "Location: <gym>".
insert into public.organization_places (organization_id, position, label, address, city, state)
select o.id, v.position, v.city, v.address, v.city, v.state
  from (values
  -- "Berkeley, CA" / "Location: Berkeley Ironworks"
  (0, 'Berkeley Ironworks', 'Berkeley', 'CA'),
  -- "Concord, CA" / "Location: Diablo Rock Gym"
  (1, 'Diablo Rock Gym', 'Concord', 'CA'),
  -- "Oakland, CA" / "Location: Pacific Pipe"
  (2, 'Pacific Pipe', 'Oakland', 'CA'),
  -- "San Francisco, CA" / "Location: Movement San Francisco"
  (3, 'Movement San Francisco', 'San Francisco', 'CA'),
  -- "Sunnyvale, CA" / "Location: Movement Sunnyvale"
  (4, 'Movement Sunnyvale', 'Sunnyvale', 'CA'),
  -- "Pasadena, CA" / "Location: The Post"
  (5, 'The Post', 'Pasadena', 'CA'),
  -- "San Diego, CA - Adult Meetup" and "- Youth Meetup" / "Location: Mesa Rim Mission Valley"
  (6, 'Mesa Rim Mission Valley', 'San Diego', 'CA'),
  -- "San Marcos, CA" / "Location: Mesa Rim North City"
  (7, 'Mesa Rim North City', 'San Marcos', 'CA'),
  -- "Tampa, FL - Bouldering Only Meetup" / "Location: Central Rock Gym Tampa"
  (8, 'Central Rock Gym Tampa', 'Tampa', 'FL'),
  -- "St. Petersburg, FL - Meetup" / "Location: Vertical Ventures"
  (9, 'Vertical Ventures', 'St. Petersburg', 'FL'),
  -- "DeLand, FL - Meetup" / "Location: DynoClimb"
  (10, 'DynoClimb', 'DeLand', 'FL'),
  -- "Fairfield, NJ" / "Location: NJ Rock Gym"
  (11, 'NJ Rock Gym', 'Fairfield', 'NJ'),
  -- "Brooklyn, NY" / "Location: Movement Gowanus"
  (12, 'Movement Gowanus', 'Brooklyn', 'NY'),
  -- "Long Island City, NY" / "Location: Movement LIC"
  (13, 'Movement LIC', 'Long Island City', 'NY'),
  -- "Manhattan, NY" / "Location: Central Rock Gym Manhattan"
  (14, 'Central Rock Gym Manhattan', 'Manhattan', 'NY'),
  -- "Buffalo, NY" / "Location: Central Rock Gym - Buffalo"
  (15, 'Central Rock Gym - Buffalo', 'Buffalo', 'NY'),
  -- "Durham, NC" / "Location: Triangle Rock Club Durham"
  (16, 'Triangle Rock Club Durham', 'Durham', 'NC'),
  -- "Pittsburgh, PA" / "Location: Ascend"
  (17, 'Ascend', 'Pittsburgh', 'PA'),
  -- "Arlington, TX" / "Location: Dyno Gym" (its dates "TBD")
  (18, 'Dyno Gym', 'Arlington', 'TX')
  ) as v(position, address, city, state)
  join public.organizations o on o.short_code = 'PCH'
 where not exists (
   select 1 from public.organization_places op where op.organization_id = o.id
 );
