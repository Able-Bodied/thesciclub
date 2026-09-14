/**
 * Event ingest — partner organizations' public calendars into `public.events`.
 *
 * Run it:
 *
 *   node --env-file=../../.env.local ingest.js
 *   node --env-file=../../.env.local ingest.js --dry-run   # scrape, print, write nothing
 *   node --env-file=../../.env.local ingest.js --feed=norcalsci-events
 *
 * `--env-file` is Node's own, so this job has no dotenv dependency.
 *
 * ---------------------------------------------------------------------------
 * What it needs, and why it must stay server-side
 * ---------------------------------------------------------------------------
 * SUPABASE_SERVICE_ROLE_KEY. Every table it writes is public-read with no
 * insert or update policy at all, so the anon key cannot write a single row —
 * that is the design, not an obstacle (see 20260911180000_events.sql). The
 * service role bypasses RLS entirely, which is also why this key must never
 * reach a browser, a bundle, or a log line.
 *
 * ---------------------------------------------------------------------------
 * What it will not do
 * ---------------------------------------------------------------------------
 * Create organizations. ab-peers' version inserted an org row whenever a feed
 * named a host it had not seen. Here `organizations` is curated: six rows, each
 * with a written description, a short code drawn in a badge, and a `can_invite`
 * flag that decides whether that body can put a phone number on the club's
 * list. A scraper is not allowed to add to that. It matches by name, and where
 * there is no match the event keeps the feed's own attribution in `host_name`.
 *
 * It also makes no AI calls and needs no paid API key. Where ab-peers deferred
 * the event's format and tags to a verification pass that was never wired up,
 * this derives both with rules (./classify.js).
 */

import { createClient } from '@supabase/supabase-js';
import { classifyFormat, classifyTags, containsContactDetails } from './classify.js';
import { AdaptiveRecHubEventsScraper } from './scrapers/adaptiverechub-events.js';
import { geocodeEvents } from './scrapers/geocode.js';
import { NorCalSCIEventsJsonScraper } from './scrapers/norcalsci-events-json.js';
import { seriesAssignments, syncSeries } from './series.js';

const SCRAPERS = {
  'norcalsci-events': () => new NorCalSCIEventsJsonScraper(),
  'adaptiverechub-events': () => new AdaptiveRecHubEventsScraper(),
};

/** Columns read back for the diff. Never `*`: the browser roles cannot select the coordinates,
 *  and naming them here keeps this query honest about what it actually uses. */
const PRIOR_COLUMNS =
  'id, external_id, title, description, description_html, start_time, end_time, location, url, ' +
  'registration_url, city, postal_code, latitude, longitude, location_precision, ' +
  'source_last_modified, detail_fetched_at';

function log(message) {
  console.log(message);
}

function requireEnv() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error('Set SUPABASE_URL (or VITE_SUPABASE_URL).');
  if (!key) {
    throw new Error(
      'Set SUPABASE_SERVICE_ROLE_KEY. The anon key cannot write here — the events tables have ' +
        'no insert policy, by design.',
    );
  }
  return { url, key };
}

/**
 * Match a feed's host name to one of the club's organizations.
 *
 * Case- and punctuation-insensitive, because a stray comma or a capital should
 * not decide whether an event is attributed. Deliberately not fuzzy beyond
 * that: a near-match that is wrong credits an event to an organization that is
 * not running it, in a product where an organization's name is a vouching
 * signal.
 *
 * `aliases` is how a feed gets to call one organization several things without
 * fuzzy matching. Adaptive Rec Hub names ParaCliffHangers once per gym —
 * "ParaCliffHangers – Berkeley Ironworks" and two more — so without the list
 * they would be three organizations or none. Every alias is a curated string
 * somebody read; the venue belongs in the event's location, not in the host's
 * name.
 */
function normalizeName(name) {
  return (name ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function matchOrganization(hostName, organizations) {
  const normalized = normalizeName(hostName);
  if (!normalized) return null;
  const hit = organizations.find(
    (org) =>
      normalizeName(org.name) === normalized ||
      (org.aliases ?? []).some((alias) => normalizeName(alias) === normalized),
  );
  return hit?.id ?? null;
}

/**
 * Whether the scraped copy differs from what is on file.
 *
 * Only the fields a source can actually change. `updated_at` is excluded
 * because we write it every run, which would make every event look changed.
 */
const DIFF_FIELDS = [
  'title',
  'description',
  'description_html',
  'start_time',
  'end_time',
  'location',
  'url',
  'registration_url',
];

/**
 * The two fields that are instants rather than text, and cannot be compared
 * as text.
 *
 * The database hands these back through PostgREST as
 * "2026-09-12T21:00:00+00:00" and the scrapers build
 * "2026-09-12T21:00:00.000Z" — the same moment, spelled two ways. Compared
 * as strings they never matched, so every event reported as changed on every
 * run: the ingest rewrote all 124 rows nightly and the "N new or changed"
 * line in the log carried no information at all. The run of 2026-09-13
 * announced 98 new or changed and created nothing.
 *
 * The test suite missed it for the obvious reason — it compared a scraped
 * payload against a copy of itself, so both sides were always in the
 * scraper's format and the database's never appeared.
 */
const INSTANT_FIELDS = new Set(['start_time', 'end_time']);

const absent = (value) => value === null || value === undefined || value === '';

/** Same moment, however either side chose to write it. */
function sameInstant(a, b) {
  if (absent(a) || absent(b)) return absent(a) && absent(b);
  const left = Date.parse(a);
  const right = Date.parse(b);
  // Unparseable on either side: fall back to text rather than call two NaNs
  // equal or unequal. A malformed time should still read as a change.
  if (Number.isNaN(left) || Number.isNaN(right)) return String(a) === String(b);
  return left === right;
}

export function eventChanged(prior, scraped) {
  if (!prior) return true;
  return DIFF_FIELDS.some((field) =>
    INSTANT_FIELDS.has(field)
      ? !sameInstant(prior[field], scraped[field])
      : (prior[field] ?? '') !== (scraped[field] ?? ''),
  );
}

async function loadFeeds(supabase, only) {
  const query = supabase
    .from('data_feeds')
    .select('id, name, feed_url, feed_type, organization_id, timezone, is_active')
    .eq('is_active', true);
  const { data, error } = await query;
  if (error) throw new Error(`Could not read data_feeds: ${error.message}`);
  const feeds = only ? data.filter((feed) => feed.feed_type === only) : data;
  if (feeds.length === 0) {
    throw new Error(
      only
        ? `No active feed with feed_type "${only}".`
        : 'No active feeds. Seed them first — supabase/migrations/20260911220000_seed_event_feeds.sql.',
    );
  }
  return feeds;
}

async function loadOrganizations(supabase) {
  const { data, error } = await supabase
    .from('organizations')
    .select('id, name, short_code, aliases');
  if (error) throw new Error(`Could not read organizations: ${error.message}`);
  return data;
}

/**
 * Reconcile one event's tags.
 *
 * Rows whose `source` is 'human' are never touched: a person corrected the
 * rules, and a re-run must not undo that. Everything else is replaced by what
 * the rules say now, so improving a rule actually takes effect instead of only
 * ever adding.
 */
async function syncTags(supabase, eventId, slugs, tagIdsBySlug) {
  const wanted = new Set(
    slugs.map((slug) => tagIdsBySlug.get(slug)).filter((id) => id !== undefined),
  );

  const { data: existing, error } = await supabase
    .from('event_tags')
    .select('tag_id, source')
    .eq('event_id', eventId);
  if (error) throw new Error(`Could not read event_tags: ${error.message}`);

  const humanHeld = new Set(existing.filter((row) => row.source === 'human').map((r) => r.tag_id));
  const scraperHeld = new Set(
    existing.filter((row) => row.source !== 'human').map((r) => r.tag_id),
  );

  const toAdd = [...wanted].filter((id) => !scraperHeld.has(id) && !humanHeld.has(id));
  const toRemove = [...scraperHeld].filter((id) => !wanted.has(id));

  if (toAdd.length > 0) {
    const { error: addError } = await supabase
      .from('event_tags')
      .insert(toAdd.map((tagId) => ({ event_id: eventId, tag_id: tagId, source: 'scraper' })));
    if (addError) throw new Error(`Could not add event_tags: ${addError.message}`);
  }
  if (toRemove.length > 0) {
    const { error: removeError } = await supabase
      .from('event_tags')
      .delete()
      .eq('event_id', eventId)
      .eq('source', 'scraper')
      .in('tag_id', toRemove);
    if (removeError) throw new Error(`Could not remove event_tags: ${removeError.message}`);
  }
}

async function ingestFeed(supabase, feed, organizations, tagIdsBySlug, { dryRun }) {
  log(`\n${feed.name} (${feed.feed_type})`);

  const makeScraper = SCRAPERS[feed.feed_type];
  if (!makeScraper) throw new Error(`No scraper for feed_type "${feed.feed_type}".`);

  const { data: priorRows, error: priorError } = await supabase
    .from('events')
    .select(PRIOR_COLUMNS)
    .eq('feed_id', feed.id);
  if (priorError) throw new Error(`Could not read existing events: ${priorError.message}`);
  const priorByExternalId = new Map(priorRows.map((row) => [row.external_id, row]));

  const scraper = makeScraper();
  const scraped = await scraper.scrape(feed.id, { priorByExternalId });
  log(`  scraped ${scraped.length} events`);

  // An event with no start time cannot be sorted, cannot be placed on the date
  // tile the card is built around, and cannot be told from a past one. ab-peers
  // stored it anyway so an AI pass could read a time out of the prose later;
  // with no such pass, storing it would mean filing something the list cannot
  // show. Dropped loudly, so a scraper that starts losing times is visible.
  const usable = [];
  for (const event of scraped) {
    if (!event.start_time) {
      log(`  ! no start time, skipped: ${event.title}`);
      continue;
    }
    if (!event.external_id || !event.title) {
      log(`  ! missing external_id or title, skipped`);
      continue;
    }
    usable.push(event);
  }

  await geocodeEvents(usable, priorByExternalId);

  const payloads = usable.map((event) => ({
    feed_id: feed.id,
    external_id: event.external_id,
    title: event.title,
    description: event.description || '',
    description_html: event.description_html || '',
    start_time: event.start_time,
    end_time: event.end_time || null,
    location: event.location || '',
    url: event.url || null,
    registration_url: event.registration_url || null,
    // The feed's own name for the host, then a club organization if that name
    // matches one. Both are kept: the name is what the source said, and the id
    // is our interpretation of it.
    host_name: event.host_name ?? null,
    organization_id:
      matchOrganization(event.host_name, organizations) ?? feed.organization_id ?? null,
    event_format: classifyFormat(event),
    city: event.city ?? null,
    postal_code: event.postal_code ?? null,
    latitude: event.latitude ?? null,
    longitude: event.longitude ?? null,
    location_precision: event.location_precision ?? null,
    needs_pii_review: containsContactDetails(event.description, event.description_html),
    ...(event.source_last_modified === undefined
      ? {}
      : { source_last_modified: event.source_last_modified }),
    ...(event.detail_fetched_at === undefined
      ? {}
      : { detail_fetched_at: event.detail_fetched_at }),
    updated_at: new Date().toISOString(),
  }));

  const changed = payloads.filter((payload) =>
    eventChanged(priorByExternalId.get(payload.external_id), payload),
  ).length;
  log(`  ${payloads.length} usable, ${changed} new or changed`);

  if (dryRun) {
    for (const payload of payloads.slice(0, 5)) {
      log(
        `    ${payload.start_time}  ${payload.title}  [${payload.city ?? '?'}]  ` +
          `${payload.event_format ?? 'format?'}  {${classifyTags(payload).join(', ')}}`,
      );
    }
    if (payloads.length > 5) log(`    … and ${payloads.length - 5} more`);
    return { scraped: scraped.length, written: 0, changed };
  }

  if (payloads.length === 0) {
    log('  nothing to write');
    return { scraped: scraped.length, written: 0, changed };
  }

  const { data: written, error: upsertError } = await supabase
    .from('events')
    .upsert(payloads, { onConflict: 'feed_id,external_id' })
    .select('id, external_id');
  if (upsertError) throw new Error(`Upsert failed: ${upsertError.message}`);

  // Grouped after the write and over the feed's whole calendar, not only the
  // rows this run touched: a weekly event whose title drifts once would
  // otherwise start a second series, because this run has seen a single
  // occurrence of it and nothing to match that against. See series.js.
  try {
    const { data: allForFeed, error: readError } = await supabase
      .from('events')
      .select('external_id, title, start_time')
      .eq('feed_id', feed.id);
    if (readError) throw new Error(readError.message);

    const idByKey = await syncSeries(supabase, feed.id, allForFeed, log);
    for (const { external_id, series_id } of seriesAssignments(allForFeed, idByKey)) {
      const { error: assignError } = await supabase
        .from('events')
        .update({ series_id })
        .eq('feed_id', feed.id)
        .eq('external_id', external_id);
      if (assignError) throw new Error(assignError.message);
    }
  } catch (e) {
    // Grouping is a convenience over a calendar that is already correct
    // without it. A feed that refreshed successfully must not be reported as
    // a failed run — and a red run is how a broken scraper is noticed — so
    // this is logged and carried past rather than thrown.
    log(`  ! could not group into series: ${e instanceof Error ? e.message : String(e)}`);
  }

  const idByExternalId = new Map(written.map((row) => [row.external_id, row.id]));
  for (const event of usable) {
    const eventId = idByExternalId.get(event.external_id);
    if (!eventId) continue;
    await syncTags(supabase, eventId, classifyTags(event), tagIdsBySlug);
  }

  const { error: touchError } = await supabase
    .from('data_feeds')
    .update({ last_fetched_at: new Date().toISOString() })
    .eq('id', feed.id);
  if (touchError) log(`  ! could not update last_fetched_at: ${touchError.message}`);

  log(`  wrote ${written.length} events`);
  return { scraped: scraped.length, written: written.length, changed };
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const feedArg = process.argv.find((arg) => arg.startsWith('--feed='));
  const only = feedArg ? feedArg.slice('--feed='.length) : null;

  const { url, key } = requireEnv();
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const feeds = await loadFeeds(supabase, only);
  const organizations = await loadOrganizations(supabase);

  const { data: tags, error: tagError } = await supabase.from('tags').select('id, slug');
  if (tagError) throw new Error(`Could not read tags: ${tagError.message}`);
  const tagIdsBySlug = new Map(tags.map((tag) => [tag.slug, tag.id]));

  if (dryRun) log('Dry run — nothing will be written.\n');

  let failed = 0;
  for (const feed of feeds) {
    try {
      await ingestFeed(supabase, feed, organizations, tagIdsBySlug, { dryRun });
    } catch (error) {
      failed++;
      // One broken feed must not stop the other. A site that changed its markup
      // is a normal Tuesday, and the club should still get the calendar that
      // still works.
      console.error(`  FAILED: ${error.message}`);
    }
  }

  if (failed > 0) {
    console.error(`\n${failed} of ${feeds.length} feeds failed.`);
    process.exitCode = 1;
  } else {
    log('\nDone.');
  }
}

// Only when run directly, so the exported helpers can be imported by a test.
if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
