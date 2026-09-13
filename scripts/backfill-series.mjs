/**
 * Group the events already in the database into series.
 *
 * The ingest does this on every run, but a run takes up to 45 minutes
 * because Adaptive Rec Hub's robots.txt asks for a ten second crawl delay,
 * and re-scraping two calendars to compute something from titles already
 * stored is work for nothing. This reads the rows, runs the same matcher the
 * ingest uses — imported, not reimplemented — and writes the grouping.
 *
 *   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/backfill-series.mjs
 *   …                                                                  --dry-run
 *
 * Safe to re-run: series are upserted on (feed_id, series_key) and events are
 * updated in place, so a second run writes the same answer.
 *
 * It needs the service role key, like the ingest, because `event_series` is
 * written by nothing else. Use --dry-run first; it prints the grouping and
 * touches nothing.
 */

import { createClient } from '@supabase/supabase-js';
import { groupIntoSeries } from '../jobs/event-ingest/series.js';

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const dryRun = process.argv.includes('--dry-run');

if (!URL || !KEY) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const supabase = createClient(URL, KEY, { auth: { persistSession: false } });

const { data: feeds, error: feedError } = await supabase.from('data_feeds').select('id, name');
if (feedError) throw new Error(feedError.message);

let totalSeries = 0;
let totalEvents = 0;

for (const feed of feeds) {
  const { data: events, error } = await supabase
    .from('events')
    .select('external_id, title, start_time')
    .eq('feed_id', feed.id);
  if (error) throw new Error(error.message);
  if (events.length === 0) continue;

  const series = groupIntoSeries(events);
  totalSeries += series.length;
  totalEvents += events.length;

  console.log(`\n${feed.name}: ${events.length} events in ${series.length} series`);
  for (const s of [...series].sort((a, b) => b.events.length - a.events.length)) {
    if (s.events.length > 1) console.log(`  ${String(s.events.length).padStart(3)}x  ${s.title}`);
  }

  if (dryRun) continue;

  const { data: written, error: upsertError } = await supabase
    .from('event_series')
    .upsert(
      series.map((s) => ({ feed_id: feed.id, series_key: s.key, title: s.title })),
      { onConflict: 'feed_id,series_key' },
    )
    .select('id, series_key');
  if (upsertError) throw new Error(upsertError.message);

  const idByKey = new Map(written.map((row) => [row.series_key, row.id]));
  for (const s of series) {
    const seriesId = idByKey.get(s.key);
    if (!seriesId) continue;
    const { error: assignError } = await supabase
      .from('events')
      .update({ series_id: seriesId })
      .eq('feed_id', feed.id)
      .in(
        'external_id',
        s.events.map((e) => e.external_id),
      );
    if (assignError) throw new Error(assignError.message);
  }
}

console.log(
  `\n${dryRun ? 'Would group' : 'Grouped'} ${totalEvents} events into ${totalSeries} series.`,
);
