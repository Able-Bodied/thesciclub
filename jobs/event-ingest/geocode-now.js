/**
 * Places what was just saved, from GitHub Actions (.github/workflows/
 * geocode.yml), which the database asks to run when an address changes
 * (20261026000000): Nominatim refuses Supabase's servers. The same queue,
 * caps and spacing as the nightly import, for at most five minutes.
 *
 *   node --env-file=../../.env.local geocode-now.js
 */

import { createClient } from '@supabase/supabase-js';
import { placeStaleEvents } from './stale-places.js';

export const RUN_FOR_MS = 5 * 60_000;

export async function geocodeNow(supabase, { lookup, pauseMs, now = () => Date.now() } = {}) {
  await placeStaleEvents(
    supabase,
    { dryRun: false, stopAt: now() + RUN_FOR_MS },
    lookup,
    pauseMs,
    now,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  await geocodeNow(createClient(url, key, { auth: { persistSession: false } }));
}
