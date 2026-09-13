-- ============================================================================
-- events — the club's public calendar, ingested from partner organizations
-- ============================================================================
-- Ported from ab-peers-prototype, where this schema accreted over a dozen
-- migrations. Consolidated here, with the decisions that differ set out below
-- rather than left to be inferred from the diff.
--
-- ---------------------------------------------------------------------------
-- Events are public. Everything about a member is not.
-- ---------------------------------------------------------------------------
-- CONTEXT.md, "What is public", puts the line between content and people,
-- and events sit firmly on the public side: they are already published on the
-- organizations' own calendars, they are useful to somebody who has no account
-- and may not know the club exists, and somebody searching "adaptive
-- handcycling near me" should be able to land on one. So `select` here is
-- granted to `anon` as well as `authenticated` — the only table in this schema
-- of which that is true.
--
-- Who is *going* to an event is a different question and is answered
-- elsewhere: see 20260911200000_event_rsvps.sql. A public event with a public
-- attendee list would republish exactly the thing `browse_members` exists to
-- keep behind a session.
--
-- ---------------------------------------------------------------------------
-- Writes are service_role only
-- ---------------------------------------------------------------------------
-- There is no insert/update/delete policy on any table here, which means the
-- anon key that ships in the Vite bundle cannot write to them. The ingest job
-- (jobs/event-ingest) is a trusted server-side process and authenticates with
-- the service_role key, which bypasses RLS entirely.
--
-- ---------------------------------------------------------------------------
-- What was deliberately left behind
-- ---------------------------------------------------------------------------
-- ab-peers carried four things this port does not:
--
--   `event_photos` / the storage bucket — no surface in docs/index.html shows
--     an event image. `evCard()` is a date tile and text; `evDetail()` is a
--     navy hero and text. Porting the table would mean porting the image
--     download and upload path too, for pixels nothing renders.
--
--   `event_series` — grouped recurring occurrences for no reader. Nothing in
--     the mock collapses a series, and each occurrence is independently a
--     thing somebody RSVPs to, so the list is *more* correct without it.
--
--   the AI enrichment columns (`needs_ai_verification`, `ai_verified_at`,
--     `description_clean`, `ai_extracted_start_time`, and the rest) — they are
--     the write targets of a verification pass that was never wired up in
--     ab-peers either (its `prompts/ai-verify-events.md` is a manual step).
--     Columns nothing writes and nothing reads describe a pipeline that does
--     not exist, which is the same failure CONTEXT.md calls out for
--     screens: it gets demoed, believed, and then explained.
--
--   auto-created organizations — see the note on `organization_id` below.
--
-- `needs_pii_review` is kept, because it is deterministic (a regex over the
-- scraped copy, run at ingest) and it records which rows a future tightening
-- of the contact-details policy would have to revisit. Without it, answering
-- that means re-scanning every description to find them again.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- data_feeds — one row per calendar we scrape
-- ---------------------------------------------------------------------------
create table if not exists public.data_feeds (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  feed_url text not null unique,
  -- The scraper module to run, not a generic content type: each value maps to
  -- exactly one file under jobs/event-ingest/scrapers/. A generic 'json' would
  -- not say which site's JSON shape to expect.
  feed_type text not null check (feed_type in ('norcalsci-events', 'adaptiverechub-events')),

  -- The organization that publishes the feed. For NorCal SCI this is also the
  -- host of every event in it; for an aggregator like Adaptive Rec Hub it is
  -- only the publisher, and each event names its own host.
  organization_id uuid references public.organizations(id) on delete set null,

  -- Events are timestamped in whatever zone their venue is in, and the feeds
  -- state wall-clock times without one. Every organization the club knows is
  -- in California, so the column default is right today and the column exists
  -- so that stops being an assumption baked into the scrapers.
  timezone text not null default 'America/Los_Angeles',

  is_active boolean not null default true,
  last_fetched_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists data_feeds_active_idx on public.data_feeds (is_active)
  where is_active;

-- ---------------------------------------------------------------------------
-- events
-- ---------------------------------------------------------------------------
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  feed_id uuid not null references public.data_feeds(id) on delete cascade,

  -- The feed's own id for this event. Together with feed_id this is the
  -- deduplication key: a re-scrape of the same event updates its row instead
  -- of adding a second one, so the job can run as often as it likes.
  external_id text not null,

  title text not null check (length(trim(title)) > 0),
  -- Plain text for cards and search; sanitized HTML with absolute links for
  -- the detail view. Both are the scraper's output and neither is edited in
  -- place, so a later run can still tell whether the source changed.
  description text not null default '',
  description_html text not null default '',

  -- NOT NULL, unlike ab-peers, which relaxed it so that an event whose time is
  -- stated only in prose could be stored for the AI pass to interpret later.
  -- With no AI pass, such a row is unsortable and unrenderable — the card is
  -- built around a date tile — so the ingest job skips it and says so, rather
  -- than filing something the list cannot show.
  start_time timestamptz not null,
  end_time timestamptz,

  -- Free text, exactly as the feed wrote it ("Lighthouse Point parking lot").
  -- The geocoded fields below are derived from it and never replace it.
  location text not null default '',

  url text,
  registration_url text,

  -- ------------------------------------------------------------ who hosts it
  -- Set only when the host is an organization the club already knows, matched
  -- by name at ingest. It is never *created* by the ingest job.
  --
  -- `organizations` here is a curated table, not a scrape target: six rows,
  -- each with a hand-written description, a `short_code` drawn in a badge, and
  -- a `can_invite` flag that decides whether that body can put a phone number
  -- on the club's list. ab-peers had none of that — its organizations table
  -- existed to badge a feed — so it could let the scraper insert rows freely.
  -- Here that would mean an aggregator's "Program" field silently deciding who
  -- appears in the Organizations tab, and inventing a short_code to satisfy a
  -- NOT NULL constraint on a column a human is supposed to choose.
  organization_id uuid references public.organizations(id) on delete set null,
  -- So an event from an org we have not adopted is still attributed honestly,
  -- by the name the feed gave, instead of appearing to be hosted by whoever
  -- publishes the feed it arrived in.
  host_name text,

  -- --------------------------------------------------------------- where/how
  -- Derived at ingest from deterministic rules over the venue and title (see
  -- jobs/event-ingest/classify.js), not inferred by a model. Nullable because
  -- "we could not tell" is a real answer and differs from all three others;
  -- the UI treats null as in person for display but never filters on it.
  event_format text check (event_format in ('in_person', 'online', 'hybrid')),

  -- Geocoded from `location` by the ingest job (Nominatim), so the feed can be
  -- filtered by city and by distance.
  city text,
  postal_code text,
  -- These two are unreadable by `anon` and `authenticated` — not by
  -- convention but by column privilege, granted at the bottom of this file.
  -- A venue's exact coordinates should not be one dev-tools panel away from
  -- somebody who opened a public page about a support group. Distance
  -- filtering happens inside Postgres instead, through nearby_events() in
  -- 20260911190000_event_geocoding.sql.
  latitude double precision,
  longitude double precision,
  -- Whether the coordinates found a building/address ('exact') or resolved
  -- only to a city or postcode ('approximate').
  location_precision text check (location_precision in ('exact', 'approximate')),

  -- ------------------------------------------------------------- bookkeeping
  -- True when the scraped copy carries an email or phone number the organizer
  -- put in their own public listing. Storing it is allowed — it is already
  -- public — but that is a policy call, and this records which rows it applies
  -- to. See the file header.
  needs_pii_review boolean not null default false,

  -- The <lastmod> the source advertised when we last read this event's own
  -- page, and when we last read it. Null means never fetched and always sorts
  -- as stale. Neither `updated_at` (when *we* last wrote the row, which every
  -- run touches) nor `data_feeds.last_fetched_at` (feed-level) can play this
  -- role: both would call a page we have never opened fresh.
  source_last_modified timestamptz,
  detail_fetched_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (feed_id, external_id)
);

-- The list's default read is "upcoming, soonest first", optionally narrowed by
-- city or format; start_time leads every one of those.
create index if not exists events_start_time_idx on public.events (start_time);
create index if not exists events_feed_id_idx on public.events (feed_id);
create index if not exists events_organization_id_idx on public.events (organization_id)
  where organization_id is not null;
create index if not exists events_city_idx on public.events (city) where city is not null;
create index if not exists events_format_idx on public.events (event_format)
  where event_format is not null;
-- The ingest job's staleness check reads these two together, once per run.
create index if not exists events_detail_freshness_idx
  on public.events (feed_id, source_last_modified);

drop trigger if exists data_feeds_touch_updated_at on public.data_feeds;
create trigger data_feeds_touch_updated_at
  before update on public.data_feeds
  for each row execute function public.touch_updated_at();

-- Deliberately not on `events`: the ingest job writes `updated_at` itself as
-- part of its upsert payload, and a trigger would overwrite that with now() on
-- every run, erasing the distinction between "the source changed this" and
-- "we looked at this".
-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.data_feeds enable row level security;
alter table public.events enable row level security;

-- Feed rows hold public calendar URLs and nothing else. Readable so that an
-- event can be attributed to its source without a service-role round trip.
drop policy if exists "data feeds are public" on public.data_feeds;
create policy "data feeds are public"
  on public.data_feeds for select
  using (true);

drop policy if exists "events are public" on public.events;
create policy "events are public"
  on public.events for select
  using (true);

-- ---------------------------------------------------------------------------
-- Column privileges: everything except the coordinates
-- ---------------------------------------------------------------------------
-- RLS chooses rows; it cannot withhold a column. ab-peers kept latitude and
-- longitude out of the browser by asking callers not to select them, which is
-- a convention, and a convention is not a boundary — `select
-- latitude,longitude from events` over the public anon key would have answered
-- it.
--
-- So the privilege is revoked at the column level and re-granted to everything
-- else. Supabase grants `select` on new public tables to both roles by
-- default, which is why this revokes first rather than merely not granting.
--
-- The cost is that `select *` on this table now fails for both roles: a
-- caller has to name its columns. src/lib/events.ts does, and has to anyway
-- to map snake_case to camelCase. nearby_events() is security definer for the
-- same reason — it is the one controlled path to a distance.
revoke select on public.events from anon, authenticated;

grant select (
  id, feed_id, external_id, title, description, description_html,
  start_time, end_time, location, url, registration_url,
  organization_id, host_name, event_format,
  city, postal_code, location_precision,
  needs_pii_review, source_last_modified, detail_fetched_at,
  created_at, updated_at
) on public.events to anon, authenticated;
