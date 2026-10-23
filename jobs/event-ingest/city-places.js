/**
 * The middle of each city members live in, for "within so many miles" on
 * Events (20261022000000). Only cities and states are read and kept, never
 * who lives there. A city not found is kept as null and tried again in 30 days.
 * Also the cities of events nobody geocoded, such as those from a calendar
 * invitation (20261023010000).
 */

import { geocodeLocation, RateLimited } from './scrapers/geocode.js';

const RETRY_AFTER_DAYS = 30;
const MIN_REQUEST_INTERVAL_MS = 1100;

export const cityKey = (city) => (city ?? '').trim().toLowerCase();

/** The cities and states not placed yet, or not found a month ago. */
export function citiesToPlace(homes, placed, now = new Date()) {
  const known = new Map(placed.map((p) => [`${p.city_key}|${p.state}`, p]));
  const stale = now.getTime() - RETRY_AFTER_DAYS * 86400000;
  const wanted = new Map();
  for (const { city, state } of homes) {
    const key = cityKey(city);
    if (!key || !/^[A-Z]{2}$/.test(state ?? '')) continue;
    const id = `${key}|${state}`;
    const prior = known.get(id);
    if (prior && (prior.latitude != null || Date.parse(prior.placed_at) > stale)) continue;
    if (!wanted.has(id))
      wanted.set(id, { city_key: key, state, query: `${city.trim()}, ${state}` });
  }
  return [...wanted.values()];
}

export async function placeMemberCities(supabase, { dryRun }, lookup = geocodeLocation) {
  const { data: homes, error } = await supabase.from('members').select('city, state');
  if (error) throw new Error(`Could not read members' cities: ${error.message}`);
  const { data: events, error: eventsError } = await supabase
    .from('events')
    .select('city, state')
    .is('latitude', null)
    .not('city', 'is', null)
    .not('state', 'is', null)
    .gte('start_time', new Date(Date.now() - 365 * 86400000).toISOString());
  if (eventsError) throw new Error(`Could not read events' cities: ${eventsError.message}`);
  const { data: placed, error: placedError } = await supabase
    .from('city_places')
    .select('city_key, state, latitude, placed_at');
  if (placedError) throw new Error(`Could not read city_places: ${placedError.message}`);

  const todo = citiesToPlace([...homes, ...(events ?? [])], placed);
  console.log(`Members' cities: ${todo.length} to place`);
  let lastRequestAt = 0;
  for (const city of todo) {
    const wait = MIN_REQUEST_INTERVAL_MS - (Date.now() - lastRequestAt);
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    lastRequestAt = Date.now();
    let found;
    try {
      found = await lookup(city.query);
    } catch (e) {
      if (!(e instanceof RateLimited)) throw e;
      console.log(`  ! map lookups paused for this run: ${e.message}`);
      return;
    }
    // A match in another state is no match.
    const ok = found && found.state === city.state && Number.isFinite(found.latitude);
    const row = {
      city_key: city.city_key,
      state: city.state,
      latitude: ok ? found.latitude : null,
      longitude: ok ? found.longitude : null,
      placed_at: new Date().toISOString(),
    };
    if (dryRun) continue;
    const { error: writeError } = await supabase.from('city_places').upsert(row);
    if (writeError) throw new Error(`Could not place ${city.query}: ${writeError.message}`);
  }
}
