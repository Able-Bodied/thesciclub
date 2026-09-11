# Event ingest

Reads partner organizations' public calendars and writes them into
`public.events`. It is the only thing that creates an event — there is no
"create an event" screen in the app and no plan for one.

Ported from `ab-peers-prototype/jobs/event-ingest`. The scrapers are close to
unchanged; what happens to their output is not. See the header of
[`ingest.js`](ingest.js) for the differences and why.

## Running it

```bash
cd jobs/event-ingest
node --env-file=../../.env.local ingest.js
```

`--env-file` is Node's own, so there is no `dotenv` dependency.

| Flag | What it does |
| --- | --- |
| `--dry-run` | Scrapes, prints a sample, writes nothing. Safe against production. |
| `--feed=norcalsci-events` | One feed only. Useful because the other one is slow. |

It needs `SUPABASE_URL` (or `VITE_SUPABASE_URL`) and
**`SUPABASE_SERVICE_ROLE_KEY`**. Not the anon key: every table here is
public-read with no insert or update policy at all, so the anon key cannot write
a single row. That is the design — see the header of
`supabase/migrations/20260911180000_events.sql`. The service role bypasses RLS,
which is why it must stay server-side and must never be given a `VITE_` prefix,
since anything so prefixed is compiled into the browser bundle.

Against a local Supabase, point `SUPABASE_URL` at `http://127.0.0.1:54321` and
use the service role key that `supabase status` prints.

## On a schedule

[`.github/workflows/event-ingest.yml`](../../.github/workflows/event-ingest.yml)
runs it daily. It needs `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` as
repository secrets before its first run, and the feed rows must exist — they are
seeded by `supabase/migrations/20260911220000_seed_event_feeds.sql`, so a
migrated database is ready.

## The feeds

| Feed | Source | Shape | Speed |
| --- | --- | --- | --- |
| `norcalsci-events` | norcalsci.org | Squarespace collection JSON | One request |
| `adaptiverechub-events` | adaptiverechub.org | HTML list + per-event pages | Slow, see below |

**NorCal SCI** publishes one organization's calendar, so every event in it is
theirs. Roughly 100 events at any time, but only about 15 distinct ones — most
are weekly groups repeating. Only about one in eight carries a location; the
rest are Zoom groups that say so only in the description, which is why
`classify.js` reads prose as well as the venue field.

**Adaptive Rec Hub** is an aggregator: one feed carrying many organizations'
events, each naming its host in a "Program" field. Its `robots.txt` asks for a
10 second crawl delay, so a first pass over the local events takes several
minutes. The site's sitemap carries a `<lastmod>` per event page, so subsequent
runs re-fetch only pages the source actually changed — a steady-state refresh
does zero detail fetches.

## What it does to what it scrapes

1. **Drops events with no start time**, loudly. The card is built around a date
   tile and the list sorts by date, so an event without one cannot be shown.
2. **Geocodes** the free-text location through Nominatim — city, postal code,
   coordinates, and whether the match was a building or just an area. One
   request per second, per their usage policy, and skipped entirely when the
   location has not changed since last time.
3. **Classifies** format and tags with rules ([`classify.js`](classify.js)).
   ab-peers left both to an AI verification pass that was never wired up; there
   are no AI calls and no paid keys here.
4. **Attributes** the host: matches the feed's name for it against the club's
   organizations, and otherwise leaves it in `events.host_name`. It never
   creates an organization — `organizations` is a curated table whose
   `can_invite` flag decides who may put a phone number on the club's list.
5. **Upserts** on `(feed_id, external_id)`, so running it twice is a no-op
   rather than a duplicate.
6. **Reconciles tags**, leaving any a person set (`source = 'human'`) alone.

## When a scraper breaks

It will. These are other people's websites and they get redesigned.

The list parsers throw rather than returning zero events, because "the markup
changed" and "there are no events this month" look identical from the outside
and only one of them is an emergency. One feed failing does not stop the other,
and the job exits non-zero so the scheduled run goes red.

To see what a scraper currently reads without touching the database:

```bash
node --env-file=../../.env.local ingest.js --dry-run --feed=norcalsci-events
```

Both scrapers also run standalone for debugging:

```bash
node scrapers/adaptiverechub-events.js --no-detail
```

## Tests

`pnpm exec vitest run jobs/event-ingest` from the repo root. They cover the
parsers, the classifier rules and the organization matching against fixed
strings — no network and no database. Several of the classifier tests exist
because of what a real pass actually produced; those cases are named in the
test descriptions.
