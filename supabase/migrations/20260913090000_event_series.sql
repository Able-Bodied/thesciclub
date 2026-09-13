-- ============================================================================
-- event_series — which occurrences are the same thing
-- ============================================================================
-- The events table holds every occurrence of every event as its own row, and
-- against the live calendar that is 124 rows made of 36 distinct events.
-- Three titles account for half of it: a member scrolling Events meets the
-- same wheelchair fitness class 29 times.
--
-- Listing each occurrence is correct for a calendar — you want to know when
-- *this* Friday's happy hour is — so this migration deliberately changes
-- nothing about what Events shows. The problem is scanning, not correctness,
-- and collapsing the list, a "weekly" badge, a filter and series-level
-- dismissal are four different answers to it. None of them can be judged
-- without first being able to say which rows are the same thing, and that is
-- all this adds.
--
-- The ✕ on an event card was removed for the want of exactly this: hiding one
-- Friday does nothing about next Friday, so a dismissal has to mean the
-- series or it means nothing. See src/routes/events/event-card.tsx.
--
-- ---------------------------------------------------------------------------
-- Keyed on the title, because nothing better exists
-- ---------------------------------------------------------------------------
-- The feeds give every occurrence its own URL, so `external_id` is unique per
-- occurrence and groups nothing at all. Start times repeat weekly and then
-- move for holidays. The title is what is left — and it drifts between
-- occurrences ("NorCal SCI's Friday Happy Hour" against "NorCal SCI Friday
-- Happy Hour"), so the matching tolerates small edits. It lives in
-- jobs/event-ingest/series.js, in JavaScript rather than here, because it is
-- the ingest that knows a feed's whole set of titles at once.
--
-- ---------------------------------------------------------------------------
-- What the two text columns are for, and it is not the same thing
-- ---------------------------------------------------------------------------
-- `series_key` is identity: the normalised title, unique per feed, and the
-- thing every future occurrence is matched against. It must not move, or
-- rows would regroup on re-ingestion.
--
-- `title` is display: the most recently ingested member's own title, which is
-- what the club's calendar most recently called this. It is refreshed freely
-- and is never an input to matching, so a drifting title cannot walk a series
-- away from its own key over time.
--
-- Per feed, not globally. Two organizations may both run something called
-- "Peer Support Group" and they are not the same series.
-- ============================================================================

create table if not exists public.event_series (
  id uuid primary key default gen_random_uuid(),
  feed_id uuid not null references public.data_feeds (id) on delete cascade,

  -- Identity. Normalised by normalizeTitle() in jobs/event-ingest/series.js.
  series_key text not null,

  -- Display only. Never matched against.
  title text not null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists event_series_feed_key_idx
  on public.event_series (feed_id, series_key);

comment on column public.event_series.series_key is
  'Normalised title, unique per feed. Identity — never change it, or occurrences regroup.';
comment on column public.event_series.title is
  'The most recent occurrence''s own title. Display only; never an input to matching.';

alter table public.events
  add column if not exists series_id uuid references public.event_series (id) on delete set null;

create index if not exists events_series_idx on public.events (series_id);

comment on column public.events.series_id is
  'The repeating event this occurrence belongs to. Null until the ingest has grouped it.';

-- ---------------------------------------------------------------------- RLS
-- Public, matching `events`: CONTEXT.md draws the line at events are public,
-- people are not, and a series is a fact about the calendar rather than about
-- anybody. Making it members-only would be stricter than the rows it groups,
-- which would read as a decision and is only an inconsistency — the anonymous
-- reader who can already see 29 fitness classes gains nothing by being unable
-- to tell that they are one class.
--
-- Writes come from the ingest, which uses the service role and bypasses this.
alter table public.event_series enable row level security;

drop policy if exists "event series are public" on public.event_series;
create policy "event series are public"
  on public.event_series for select
  using (true);

grant select on public.event_series to anon, authenticated;
