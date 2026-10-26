/**
 * Places events and organization places at their addresses through the
 * queue of 20261025030000: everything stale is queued once, then claimed
 * in batches, so the spacing and the day's caps hold for every runner. Run
 * nightly by the import, and on demand by geocode-now.js when an address is
 * saved (20261026000000). geocode_done writes only while the address is
 * still the one asked about.
 */

import { lookUpPlace, RateLimited, Unreachable } from './scrapers/geocode.js';

const MIN_REQUEST_INTERVAL_MS = 1100;
/** Four tries of ten seconds, a second apart. */
const MAX_LOOKUP_MS = 45_000;
/** How long a claim holds (geocode_claim), less a margin. */
const CLAIM_MS = 4 * 60_000 - 10_000;

/** A match in another state is no match, as in city-places; with no state, none is. */
export function placeInState(found, state) {
  if (!found || !Number.isFinite(found.latitude) || !Number.isFinite(found.longitude)) return null;
  return state && found.state === state ? found : null;
}

/** `stopAt`: no lookup starts unless its slowest run ends before it. */
export async function placeStaleEvents(
  supabase,
  { dryRun, stopAt = Number.POSITIVE_INFINITY },
  lookup = lookUpPlace,
  pauseMs = MIN_REQUEST_INTERVAL_MS,
  now = () => Date.now(),
) {
  if (dryRun) {
    console.log('Stale places: not queued on a dry run');
    return;
  }
  const { data: queued, error } = await supabase.rpc('geocodes_enqueue_stale');
  if (error) throw new Error(`Could not queue stale places: ${error.message}`);
  console.log(`Stale places: ${queued} queued`);

  const pause = () => new Promise((resolve) => setTimeout(resolve, pauseMs));
  const call = async (name, args) => {
    const { error: callError } = await supabase.rpc(name, args);
    if (callError) throw new Error(`${name} failed for ${args.p_target}: ${callError.message}`);
  };
  const done = (row, place, failure) =>
    call('geocode_done', {
      p_kind: row.kind,
      p_target: row.target_id,
      p_query: row.query,
      p_latitude: place?.latitude ?? null,
      p_longitude: place?.longitude ?? null,
      p_precision: place?.precision ?? null,
      p_error: failure,
    });
  const release = (rows) =>
    Promise.all(
      rows.map((row) => call('geocode_release', { p_kind: row.kind, p_target: row.target_id })),
    );

  const found = new Map();
  let asked = false;
  for (;;) {
    if (now() + MAX_LOOKUP_MS > stopAt) return;
    // The claim hands out nothing within 1.1s of the last lookup.
    if (asked) await pause();
    const claimedAt = now();
    const { data: rows, error: claimError } = await supabase.rpc('geocodes_claim_for_import');
    if (claimError) throw new Error(`Could not claim stale places: ${claimError.message}`);
    // Nothing due, another runner is working, or every cap is reached.
    if (!rows || rows.length === 0) return;
    const until = Math.min(stopAt, claimedAt + CLAIM_MS);
    for (const [i, row] of rows.entries()) {
      let place = found.get(row.query);
      if (place === undefined) {
        if (now() + MAX_LOOKUP_MS + pauseMs > until) {
          await release(rows.slice(i));
          break;
        }
        if (asked) await pause();
        asked = true;
        try {
          place = await lookup(row.query);
        } catch (e) {
          if (!(e instanceof RateLimited) && !(e instanceof Unreachable)) throw e;
          console.log(`  ! map lookups paused for this run: ${e.message}`);
          await done(row, null, e.message);
          await release(rows.slice(i + 1));
          return;
        }
        found.set(row.query, place);
      }
      // Its answer reaches every target with this address (geocode_done).
      await done(row, placeInState(place, row.state), null);
    }
  }
}
