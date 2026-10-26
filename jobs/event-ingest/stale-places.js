/**
 * The nightly backstop for geocode-event (20261025030000): every upcoming
 * event and organization place whose pin is for an older address than its
 * own, or that was never placed, is queued, then looked up through the same
 * claim as the function, so the spacing and the day's caps hold for both.
 * geocode_done writes only while the address is still the one asked about.
 */

import { lookUpPlace, RateLimited, Unreachable } from './scrapers/geocode.js';

const MIN_REQUEST_INTERVAL_MS = 1100;

/** A match in another state is no match, as in city-places; with no state, none is. */
export function placeInState(found, state) {
  if (!found || !Number.isFinite(found.latitude) || !Number.isFinite(found.longitude)) return null;
  return state && found.state === state ? found : null;
}

export async function placeStaleEvents(
  supabase,
  { dryRun },
  lookup = lookUpPlace,
  pauseMs = MIN_REQUEST_INTERVAL_MS,
) {
  if (dryRun) {
    console.log('Stale places: not queued on a dry run');
    return;
  }
  const { data: queued, error } = await supabase.rpc('geocodes_enqueue_stale');
  if (error) throw new Error(`Could not queue stale places: ${error.message}`);
  console.log(`Stale places: ${queued} queued`);

  const pause = () => new Promise((resolve) => setTimeout(resolve, pauseMs));
  const done = async (row, place, failure) => {
    const { error: writeError } = await supabase.rpc('geocode_done', {
      p_kind: row.kind,
      p_target: row.target_id,
      p_query: row.query,
      p_latitude: place?.latitude ?? null,
      p_longitude: place?.longitude ?? null,
      p_precision: place?.precision ?? null,
      p_error: failure,
    });
    if (writeError)
      throw new Error(`Could not place ${row.kind} ${row.target_id}: ${writeError.message}`);
  };

  const found = new Map();
  let asked = false;
  for (;;) {
    // The claim hands out nothing within 1.1s of the last lookup.
    if (asked) await pause();
    const { data: rows, error: claimError } = await supabase.rpc('geocodes_claim_for_import');
    if (claimError) throw new Error(`Could not claim stale places: ${claimError.message}`);
    // Nothing due, the function is working, or every cap is reached.
    if (!rows || rows.length === 0) return;
    for (const row of rows) {
      let place = found.get(row.query);
      if (place === undefined) {
        if (asked) await pause();
        asked = true;
        try {
          place = await lookup(row.query);
        } catch (e) {
          if (!(e instanceof RateLimited) && !(e instanceof Unreachable)) throw e;
          // The rest stay claimed until it lapses, and wait for the next run.
          console.log(`  ! map lookups paused for this run: ${e.message}`);
          await done(row, null, e.message);
          return;
        }
        found.set(row.query, place);
      }
      await done(row, placeInState(place, row.state), null);
    }
  }
}
