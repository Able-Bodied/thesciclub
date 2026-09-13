/**
 * Grouping the occurrences of a repeating event.
 *
 * NorCal SCI's calendar is roughly 120 rows made of roughly 35 distinct
 * events repeating weekly: three titles alone account for half of it, and a
 * member scrolling Events meets the same wheelchair fitness class 29 times.
 * Listing each occurrence is right for a calendar — you want to know when
 * *this* Friday's happy hour is — so the problem is scanning, not
 * correctness, and the fix is not decided here. This module only supplies the
 * missing primitive: which rows are the same thing.
 *
 * ---------------------------------------------------------------------------
 * Why the title, of all things
 * ---------------------------------------------------------------------------
 * There is nothing better. The feeds give each occurrence its own URL, so
 * `external_id` is unique per occurrence and groups nothing. Start times
 * repeat weekly but also move for holidays. The title is what is left.
 *
 * It drifts, though — "NorCal SCI's Friday Happy Hour" and "NorCal SCI Friday
 * Happy Hour" are the same group — so exact matching alone loses occurrences,
 * and the join has to tolerate small edits without merging events that are
 * genuinely different.
 */

/**
 * The comparable form of a title: lowercase, accents stripped, everything
 * that is not a letter or a digit collapsed to single spaces.
 *
 * This is also the stored `series_key`, which is why it is worth being dull:
 * it has to be stable across ingests, so nothing here may depend on locale,
 * the other titles in the feed, or the order they arrived in.
 */
export function normalizeTitle(title) {
  return (
    String(title ?? '')
      .normalize('NFKD')
      // Combining marks, left behind by NFKD once the base letter is separated.
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
  );
}

/**
 * Levenshtein distance, two rows at a time.
 *
 * Hand-rolled rather than pulled in: this job runs in CI against a service
 * key, and a dependency added for twenty lines of arithmetic is a supply
 * chain added for twenty lines of arithmetic. Titles are short, so the
 * quadratic cost is irrelevant.
 */
export function editDistance(a, b) {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  let current = new Array(b.length + 1);

  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const substitution = previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1);
      current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, substitution);
    }
    [previous, current] = [current, previous];
  }
  return previous[b.length];
}

/** 1 for identical, 0 for nothing in common. Normalised by the longer string. */
export function similarity(a, b) {
  if (a === b) return 1;
  const longest = Math.max(a.length, b.length);
  if (longest === 0) return 1;
  return 1 - editDistance(a, b) / longest;
}

/**
 * How close two normalised titles must be to count as the same series.
 *
 * Tuned against this data rather than picked: the apostrophe-s variant of the
 * happy hour scores about 0.95 and has to join, while "Wheelchair Rugby
 * Practice" and "Wheelchair Rugby Tournament" score about 0.79 and must not.
 * The gap either side of 0.82 is wide, which is the only reason a single
 * threshold is defensible here.
 */
export const SERIES_THRESHOLD = 0.82;

/**
 * A word long enough to be the point of a title rather than grammar.
 *
 * Four, so that "s", "of", "the", "off" and "up" are noise while "davis" and
 * "bombers" are not. "sci" falls on the noise side and that is fine: it
 * appears in both halves of every pair it is in.
 */
const SUBSTANTIVE_MIN = 4;

/**
 * Whether two normalised titles are made of the same substantive words.
 *
 * Levenshtein alone is not enough, and this is not hypothetical — it was
 * found by running the matcher over the live calendar:
 *
 *   "Bombers Weekly Power Soccer Practice"
 *   "Shockers Weekly Power Soccer Practice"     similarity 0.892
 *
 * Two different teams, comfortably above a threshold tuned on NorCal SCI's
 * titles, because one distinct word inside a long shared phrase is a small
 * fraction of the string. Raising the threshold until that pair separates
 * would be fitting a number to two examples and would start losing real
 * drift instead.
 *
 * The shape of the difference is what distinguishes the cases. Drift adds
 * and removes grammar — a possessive, a hyphen, a capital. A different event
 * *substitutes* a word that carries the meaning. So a title that contains a
 * substantive word the other has no near-match for is a different series,
 * whatever the overall edit distance says.
 */
export function sameSubstantiveWords(a, b) {
  const wordsOf = (text) => text.split(' ').filter((w) => w.length >= SUBSTANTIVE_MIN);
  const unmatched = (from, against) =>
    from.some((word) => !against.some((other) => similarity(word, other) >= 0.8));

  const left = wordsOf(a);
  const right = wordsOf(b);
  // Checked both ways: a title is also different when it drops a word the
  // other depends on, not only when it swaps one in.
  return !unmatched(left, right) && !unmatched(right, left);
}

/**
 * The series key for a title, given the keys already known for that feed.
 *
 * Exact matches score 1 and therefore beat every fuzzy candidate without
 * needing a special case. Ties go to the lowest key, so a title equidistant
 * from two existing series lands in the same one on every run rather than
 * flip-flopping between ingests.
 *
 * Returns the key to use — an existing one when something is close enough,
 * otherwise this title's own normalised form, which becomes a new series.
 */
export function seriesKeyFor(title, knownKeys = []) {
  const key = normalizeTitle(title);
  if (!key) return '';
  if (knownKeys.includes(key)) return key;

  let best = null;
  let bestScore = 0;
  for (const candidate of knownKeys) {
    if (!sameSubstantiveWords(key, candidate)) continue;
    const score = similarity(key, candidate);
    if (score > bestScore || (score === bestScore && best !== null && candidate < best)) {
      best = candidate;
      bestScore = score;
    }
  }
  return bestScore >= SERIES_THRESHOLD && best !== null ? best : key;
}

/**
 * Group a feed's events into series, in one pass.
 *
 * Sorted by title first so the result does not depend on the order the
 * scraper happened to emit rows in — otherwise the same calendar could
 * produce different groupings on two runs, and `series_key` is a stored
 * identity that has to survive re-ingestion.
 *
 * The representative title is the most recently starting occurrence, which is
 * display only: it is what the club's own calendar most recently called this
 * thing. It is never fed back into matching, so a drifting title cannot walk
 * a series away from its key over time.
 */
export function groupIntoSeries(events) {
  const byKey = new Map();
  const ordered = [...events].sort((a, b) =>
    normalizeTitle(a.title).localeCompare(normalizeTitle(b.title)),
  );

  for (const event of ordered) {
    const key = seriesKeyFor(event.title, [...byKey.keys()]);
    if (!key) continue;
    const existing = byKey.get(key);
    if (existing) {
      existing.events.push(event);
      if (String(event.start_time ?? '') > String(existing.latest ?? '')) {
        existing.latest = event.start_time;
        existing.title = event.title;
      }
    } else {
      byKey.set(key, { key, title: event.title, latest: event.start_time, events: [event] });
    }
  }
  return [...byKey.values()];
}

/**
 * Write a feed's series rows and hand back the id for each series key.
 *
 * Grouping runs over the feed's *whole* set of events rather than only the
 * ones this run changed. A weekly event whose title drifts once would
 * otherwise start a second series, because the run that saw the drift saw
 * only that occurrence and had nothing to match it against.
 *
 * `series_key` is left alone on conflict and only the display title and
 * timestamp move, which is the whole point of keeping the two apart.
 */
export async function syncSeries(supabase, feedId, events, log = () => {}) {
  const series = groupIntoSeries(events);
  if (series.length === 0) return new Map();

  const { data: written, error } = await supabase
    .from('event_series')
    .upsert(
      series.map((s) => ({
        feed_id: feedId,
        series_key: s.key,
        title: s.title,
        updated_at: new Date().toISOString(),
      })),
      { onConflict: 'feed_id,series_key' },
    )
    .select('id, series_key');
  if (error) throw new Error(`Series upsert failed: ${error.message}`);

  const idByKey = new Map(written.map((row) => [row.series_key, row.id]));
  log(`  ${series.length} series across ${events.length} events`);
  return idByKey;
}

/**
 * Which series each event belongs to, as `{ external_id, series_id }`.
 *
 * Separate from the write above so the caller can apply it however it
 * already writes events — the ingest folds it into its own upsert payload,
 * and the backfill updates rows in place.
 */
export function seriesAssignments(events, idByKey) {
  const assignments = [];
  for (const series of groupIntoSeries(events)) {
    const seriesId = idByKey.get(series.key);
    if (!seriesId) continue;
    for (const event of series.events) {
      assignments.push({ external_id: event.external_id, series_id: seriesId });
    }
  }
  return assignments;
}
