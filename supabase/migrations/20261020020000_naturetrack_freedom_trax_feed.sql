-- ============================================================================
-- NatureTrack's Freedom Trax days join the nightly ingest
-- ============================================================================
-- The owner, 2026-10-20: only the Freedom Trax schedule, not NatureTrack's
-- field trips or film festival. The scraper reads just that block
-- (jobs/event-ingest/scrapers/naturetrack-trax.js).
--
-- NatureTrack hosts every event in the feed, so it becomes an organization and
-- the feed is linked to it. It cannot vouch for members (can_invite false), and
-- has no logo until an administrator adds one; the short code shows meanwhile.
-- ============================================================================

insert into public.organizations
  (short_code, name, city, description, tags, can_invite, aliases)
values (
  'NT', 'NatureTrack', 'Los Olivos',
  'Lends Freedom Trax all-terrain wheelchair attachments for free, and runs beach and trail days with them from San Luis Obispo to Ventura.',
  array['Outdoors', 'Adaptive sport']::text[], false, '{}'::text[]
)
on conflict (short_code) do nothing;

-- Each feed_type names one scraper file (20260911180000_events.sql).
alter table public.data_feeds drop constraint data_feeds_feed_type_check;
alter table public.data_feeds add constraint data_feeds_feed_type_check
  check (feed_type in ('norcalsci-events', 'adaptiverechub-events', 'naturetrack-trax'));

insert into public.data_feeds (name, feed_url, feed_type, organization_id, is_active)
select
  'NatureTrack Freedom Trax',
  'https://naturetrack.org/naturetrack-freedom-trax/',
  'naturetrack-trax',
  (select id from public.organizations where short_code = 'NT'),
  true
on conflict (feed_url) do nothing;
