-- ============================================================================
-- Seed: the two calendars the club ingests
-- ============================================================================
-- These rows have to exist before jobs/event-ingest can run at all — it reads
-- data_feeds to decide what to scrape and which scraper to use, and writes
-- every event with a feed_id. Seeding them in a migration rather than by hand
-- means a fresh database (or a `supabase db reset`) is immediately ingestable.
--
-- NorCal SCI's feed belongs to an organization the club already has: it is the
-- body most members here came in through, and it is seeded in
-- 20260910120050_seed_organizations.sql with the short code NCS. The feed is
-- linked to it, and since one organization publishes every event in that
-- calendar, the ingest job attributes all of them to it.
--
-- Adaptive Rec Hub is deliberately NOT an organization row, and its feed's
-- organization_id is null. It is an aggregator: it republishes the calendars
-- of a few dozen adaptive sport programmes across California, so it hosts
-- nothing itself, and recording it as the host of every event in its feed
-- would be wrong on every one of them. Each event instead carries the host the
-- hub names, in events.host_name — and where that name matches an organization
-- the club already has (Wheel with Me and High Fives are both in the seed and
-- both publish there), the ingest job links organization_id to it.
--
-- That is also why neither feed is allowed to create organizations. See the
-- note on events.organization_id in 20260911180000_events.sql: this table is
-- curated, and can_invite decides who can put a phone number on the club's
-- list. It is not a scrape target.
-- ============================================================================

insert into public.data_feeds (name, feed_url, feed_type, organization_id, is_active)
select
  'NorCal SCI calendar',
  'https://norcalsci.org/events',
  'norcalsci-events',
  (select id from public.organizations where short_code = 'NCS'),
  true
on conflict (feed_url) do nothing;

insert into public.data_feeds (name, feed_url, feed_type, organization_id, is_active)
values (
  'Adaptive Rec Hub',
  'https://adaptiverechub.org/events/',
  'adaptiverechub-events',
  -- An aggregator, not a host. See the header.
  null,
  true
)
on conflict (feed_url) do nothing;
