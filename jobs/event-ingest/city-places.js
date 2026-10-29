/**
 * The middle of each city members live in, for "within so many miles" on
 * Events (20261022000000). Only cities and states are read and kept, never
 * who lives there. A city not found is kept as null and tried again in 30 days.
 * Also the cities of events, shown at their middle unless exactly placed
 * (20261023010000, 20261025020000), and for one with a state but no city,
 * its organization's city in that state (20261023020000); and each
 * organization place's city and state (20261025015000). Only a settlement
 * counts as a middle.
 */

import { lookUpSettlement, lookUpZip, RateLimited, Unreachable } from './scrapers/geocode.js';

const RETRY_AFTER_DAYS = 30;
const MIN_REQUEST_INTERVAL_MS = 1100;

export const cityKey = (city) => (city ?? '').trim().toLowerCase();

/**
 * The cities and states not placed yet, not found a month ago, or placed but
 * not yet confirmed a settlement (rechecked monthly). `placed` says a place
 * is already known, which a refusal must keep.
 */
export function citiesToPlace(homes, placed, now = new Date()) {
  const known = new Map(placed.map((p) => [`${p.city_key}|${p.state}`, p]));
  const stale = now.getTime() - RETRY_AFTER_DAYS * 86400000;
  const wanted = new Map();
  for (const { city, state } of homes) {
    const key = cityKey(city);
    if (!key || !/^[A-Z]{2}$/.test(state ?? '')) continue;
    const id = `${key}|${state}`;
    const prior = known.get(id);
    if (prior?.latitude != null) {
      if (prior.settlement === true) continue;
      // Checked lately and kept where it was (20261025020000).
      if (prior.settlement_checked_at && Date.parse(prior.settlement_checked_at) > stale) continue;
    } else if (prior && Date.parse(prior.placed_at) > stale) continue;
    if (!wanted.has(id))
      wanted.set(id, {
        city_key: key,
        state,
        query: `${city.trim()}, ${state}`,
        placed: prior?.latitude != null,
      });
  }
  return [...wanted.values()];
}

/**
 * Each event's own city, or with none, its organization's main place
 * (position 0) when in the event's state; never the directory's text.
 */
export function eventCities(events, places) {
  const main = new Map(places.filter((p) => p.position === 0).map((p) => [p.organization_id, p]));
  return events.flatMap(({ city, state, organization_id, event_format }) => {
    if (cityKey(city)) return [{ city, state }];
    const place = event_format === 'online' ? null : main.get(organization_id);
    if (!place?.state || place.state !== state) return [];
    return cityKey(place.city) ? [{ city: place.city, state }] : [];
  });
}

/** Each organization place's city in its state; one with no state is not placed. */
export function organizationCities(organizations) {
  return organizations.flatMap(({ city, state }) => (state ? [{ city, state }] : []));
}

export async function placeMemberCities(supabase, { dryRun }, lookup = lookUpSettlement) {
  const { data: homes, error } = await supabase.from('members').select('city, state');
  if (error) throw new Error(`Could not read members' cities: ${error.message}`);
  const { data: events, error: eventsError } = await supabase
    .from('events')
    .select('city, state, organization_id, event_format')
    .not('state', 'is', null)
    .gte('start_time', new Date(Date.now() - 365 * 86400000).toISOString());
  if (eventsError) throw new Error(`Could not read events' cities: ${eventsError.message}`);
  const { data: places, error: placesError } = await supabase
    .from('organization_places')
    .select('organization_id, position, city, state');
  if (placesError) throw new Error(`Could not read organization places: ${placesError.message}`);
  const { data: placed, error: placedError } = await supabase
    .from('city_places')
    .select('city_key, state, latitude, placed_at, settlement, settlement_checked_at');
  if (placedError) throw new Error(`Could not read city_places: ${placedError.message}`);

  const todo = citiesToPlace(
    [...homes, ...eventCities(events ?? [], places ?? []), ...organizationCities(places ?? [])],
    placed,
  );
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
      // Not answered: asked again next run.
      if (e instanceof Unreachable) continue;
      if (!(e instanceof RateLimited)) throw e;
      console.log(`  ! map lookups paused for this run: ${e.message}`);
      return;
    }
    // A match in another state is no match.
    const ok = found && found.state === city.state && Number.isFinite(found.latitude);
    const checked = new Date().toISOString();
    const row = ok
      ? {
          city_key: city.city_key,
          state: city.state,
          latitude: found.latitude,
          longitude: found.longitude,
          settlement: true,
          settlement_checked_at: checked,
          placed_at: checked,
        }
      : city.placed
        ? // Never a known place wiped: it stays, unconfirmed, for distance only.
          {
            city_key: city.city_key,
            state: city.state,
            settlement: null,
            settlement_checked_at: checked,
          }
        : {
            city_key: city.city_key,
            state: city.state,
            latitude: null,
            longitude: null,
            settlement: false,
            settlement_checked_at: checked,
            placed_at: checked,
          };
    if (dryRun) continue;
    const { error: writeError } = await supabase.from('city_places').upsert(row);
    if (writeError) throw new Error(`Could not place ${city.query}: ${writeError.message}`);
  }
}

/**
 * The zip codes members live in not placed yet, or not found a month ago
 * (20261029040000). Only the zips are read and kept, never who has them.
 */
export function zipsToPlace(zips, placed, now = new Date()) {
  const known = new Map(placed.map((p) => [p.zip, p]));
  const stale = now.getTime() - RETRY_AFTER_DAYS * 86400000;
  const wanted = new Set();
  for (const zip of zips) {
    if (!/^[0-9]{5}$/.test(zip ?? '')) continue;
    const prior = known.get(zip);
    if (prior?.latitude != null) continue;
    if (prior && Date.parse(prior.placed_at) > stale) continue;
    wanted.add(zip);
  }
  return [...wanted];
}

export async function placeMemberZips(supabase, { dryRun }, lookup = lookUpZip) {
  const { data: homes, error } = await supabase
    .from('members')
    .select('zip')
    .not('zip', 'is', null);
  if (error) throw new Error(`Could not read members' zips: ${error.message}`);
  const { data: placed, error: placedError } = await supabase
    .from('zip_places')
    .select('zip, latitude, placed_at');
  if (placedError) throw new Error(`Could not read zip_places: ${placedError.message}`);

  const todo = zipsToPlace(
    (homes ?? []).map((h) => h.zip),
    placed ?? [],
  );
  console.log(`Members' zips: ${todo.length} to place`);
  let lastRequestAt = 0;
  for (const zip of todo) {
    const wait = MIN_REQUEST_INTERVAL_MS - (Date.now() - lastRequestAt);
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    lastRequestAt = Date.now();
    let found;
    try {
      found = await lookup(zip);
    } catch (e) {
      if (e instanceof Unreachable) continue;
      if (!(e instanceof RateLimited)) throw e;
      console.log(`  ! zip lookups paused for this run: ${e.message}`);
      return;
    }
    const ok = found && found.state && Number.isFinite(found.latitude);
    const row = ok
      ? {
          zip,
          state: found.state,
          latitude: found.latitude,
          longitude: found.longitude,
          placed_at: new Date().toISOString(),
        }
      : { zip, state: null, latitude: null, longitude: null, placed_at: new Date().toISOString() };
    if (dryRun) continue;
    const { error: writeError } = await supabase.from('zip_places').upsert(row);
    if (writeError) throw new Error(`Could not place ${zip}: ${writeError.message}`);
  }
}
