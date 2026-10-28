/**
 * Forward geocoding for the free-text `location` string a scraper produces
 * ("Gino's Pizza 1761 Monterey Street San Luis Obispo, CA, 93401 United
 * States", or something as loose as "Sacramento Rehabilitation Hospital,
 * Natomas"). Nominatim (OpenStreetMap) — the same provider
 * src/lib/geocode.ts already uses for reverse geocoding
 * — resolves free-text place names, not just structured addresses, so it
 * handles both cases with one endpoint.
 *
 * Usage policy (https://operations.osmfoundation.org/policies/nominatim/):
 * max 1 request/second, and a real identifying User-Agent. `geocodeLocations`
 * enforces the delay between calls; callers doing one-off lookups don't need
 * to.
 */

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
// Nominatim's usage policy asks for a User-Agent that identifies the
// application, so a misbehaving client can be recognised and contacted rather
// than simply blocked. The string this was ported with claimed to be a
// hackathon prototype sending no production traffic, which stopped being true
// the moment this started running on a schedule.
//
// TODO(owner): add a real contact address once one exists — the policy prefers
// one, and an address nobody reads is worse than none. The domain identifies
// the application in the meantime.
const USER_AGENT = 'thesciclub-event-ingest/1.0 (+https://www.thesciclub.com)';
const MIN_REQUEST_INTERVAL_MS = 1100;

/**
 * Nominatim's `category`/`type` on the winning result says roughly how
 * precise the match was (`category` — not `class`, which is the field name
 * only in the legacy `format=json` response; `jsonv2`, used here, renamed it
 * — verified against the live API rather than assumed). Building/address/POI-
 * level matches are `exact`; anything resolved only to an area (city,
 * postcode, suburb, administrative boundary, and so on) is `approximate`.
 * Unrecognized combinations default to `approximate` — an overclaimed
 * `exact` is the worse failure mode here (docs/PII.md limits *invented*
 * event locations to city centers for the same reason: don't pretend more
 * precision than is actually known).
 */
const EXACT_TYPES = new Set([
  'house',
  'building',
  'residential',
  'amenity',
  'healthcare',
  'shop',
  'tourism',
  'leisure',
  'office',
]);

function precisionOf(result) {
  return EXACT_TYPES.has(result.type) || EXACT_TYPES.has(result.category) ? 'exact' : 'approximate';
}

function cityOf(address) {
  return address.city || address.town || address.village || address.hamlet || null;
}

/**
 * A single scraper concatenates venue name, street address, city, state and
 * zip with plain spaces (see formatLocation() in norcalsci-events-json.js) —
 * a shape Nominatim's free-text parser regularly can't make sense of as one
 * string ("Gino's Pizza 1761 Monterey Street San Luis Obispo, CA, 93401
 * United States" -> 0 results), even though the address alone works fine.
 * These are progressively looser rewrites to retry with, cheapest/most
 * confident first, derived from checking real scraped location strings
 * against the live API rather than guessed:
 *   1. as given
 *   2. text from the first digit onward (drops a venue name jammed against a
 *      street number: "Gino's Pizza 1761 Monterey..." -> "1761 Monterey...")
 *   3. everything after the first comma (drops a leading venue/sub-location
 *      name before a comma: "Yerba Buena Picnic Area, Hellyer Park San Jose,
 *      CA US" -> "Hellyer Park San Jose, CA US")
 *   4. everything before the last comma (drops a trailing qualifier
 *      Nominatim can't reconcile with an inexact venue name: "Sacramento
 *      Rehabilitation Hospital, Natomas" -> "Sacramento Rehabilitation Hospital")
 * Stops at the first candidate that returns a hit.
 */
function fallbackQueries(trimmed) {
  const candidates = [];

  const digitIndex = trimmed.search(/[0-9]/);
  if (digitIndex > 0)
    candidates.push({ query: trimmed.slice(digitIndex).trim(), venueDropped: true });

  const firstComma = trimmed.indexOf(',');
  if (firstComma > 0) candidates.push({ query: trimmed.slice(firstComma + 1).trim() });

  const lastComma = trimmed.lastIndexOf(',');
  if (lastComma > 0) candidates.push({ query: trimmed.slice(0, lastComma).trim() });

  return candidates;
}

/**
 * A venue's name dropped from before a whole street address ("Pacific Pipe,
 * 2140 Mandela Pkwy, Oakland, CA 94607") still finds that address exactly
 * when the building found has the same house number and ZIP code.
 */
export function sameStreetAddress(query, result) {
  const number = /^(\d[\w-]*)\s/.exec(query)?.[1];
  const zip = /\b(\d{5})(?:-\d{4})?\s*$/.exec(query)?.[1];
  if (!number || !zip || !result.houseNumber || !result.postalCode) return false;
  return (
    result.houseNumber.toLowerCase() === number.toLowerCase() &&
    result.postalCode.slice(0, 5) === zip
  );
}

/** Nominatim said "too many requests": asking again only makes it longer. */
export class RateLimited extends Error {}

/** No attempt got an answer: not the same as "nowhere" (20261025030000). */
export class Unreachable extends Error {}

async function searchNominatim(query) {
  const url = new URL(NOMINATIM_URL);
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('limit', '1');
  url.searchParams.set('countrycodes', 'us');

  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    signal: AbortSignal.timeout(10000),
  });
  if (res.status === 429 || res.status === 403)
    throw new RateLimited(`Nominatim answered ${res.status}`);
  if (!res.ok) throw new Unreachable(`Nominatim answered ${res.status}`);

  const results = await res.json();
  const top = results?.[0];
  if (!top) return null;

  const address = top.address || {};
  return {
    city: cityOf(address),
    // "US-CA" → "CA".
    state: /^US-([A-Z]{2})$/.exec(address['ISO3166-2-lvl4'] ?? '')?.[1] ?? null,
    postalCode: address.postcode || null,
    houseNumber: address.house_number || null,
    latitude: Number(top.lat),
    longitude: Number(top.lon),
    precision: precisionOf(top),
  };
}

/**
 * What a city's middle may be: a city, town or village, or a named part of
 * one (Van Nuys and Tarzana come back as suburbs of Los Angeles). Never a
 * building, a street, a block or a lone dwelling (20261025020000).
 */
const SETTLEMENTS = new Set([
  'city',
  'town',
  'village',
  'hamlet',
  'municipality',
  'borough',
  'city_district',
  'district',
  'suburb',
  'quarter',
  'neighbourhood',
]);

/**
 * The middle of a city, town or village: Nominatim's settlement search, and
 * only a settlement-level answer. Anything else is null, so a "city" typed as
 * a hospital or an address is never kept as one. Throws as searchNominatim.
 */
export async function lookUpSettlement(query) {
  const trimmed = (query || '').trim();
  if (!trimmed) return null;
  const url = new URL(NOMINATIM_URL);
  url.searchParams.set('q', trimmed);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('limit', '1');
  url.searchParams.set('countrycodes', 'us');
  url.searchParams.set('featuretype', 'settlement');
  let res;
  let results;
  try {
    res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: AbortSignal.timeout(10000),
    });
    if (res.ok) results = await res.json();
  } catch (error) {
    // A dropped connection or the ten-second timeout: asked again next run.
    throw new Unreachable(
      `No answer for ${trimmed}: ${error instanceof Error ? error.message : error}`,
    );
  }
  if (res.status === 429 || res.status === 403)
    throw new RateLimited(`Nominatim answered ${res.status}`);
  if (!res.ok) throw new Unreachable(`Nominatim answered ${res.status}`);
  const top = results?.[0];
  if (!top || !SETTLEMENTS.has(top.addresstype)) return null;
  return {
    state: /^US-([A-Z]{2})$/.exec(top.address?.['ISO3166-2-lvl4'] ?? '')?.[1] ?? null,
    latitude: Number(top.lat),
    longitude: Number(top.lon),
    settlement: top.addresstype,
  };
}

/**
 * Looks up one location string, retrying with the rewrites above when the
 * literal text has no match. Returns null (never throws) when the string is
 * empty, every attempt fails, or Nominatim has nothing for any of them — a
 * failed geocode should not fail the ingest, an event just goes ungeocoded.
 * Each attempt is a real request, so a caller geocoding many events should
 * still only call this at MIN_REQUEST_INTERVAL_MS cadence overall (see
 * geocodeEvents), not per-attempt.
 */
export async function geocodeLocation(query) {
  try {
    return await lookUpPlace(query);
  } catch (error) {
    if (error instanceof Unreachable) return null;
    throw error;
  }
}

/** As geocodeLocation, but throws Unreachable when no attempt was answered. */
export async function lookUpPlace(query) {
  const trimmed = (query || '').trim();
  if (!trimmed) return null;

  // The full address twice: Nominatim now and then answers nothing for one it
  // knows, and a rewrite's hit is never exact.
  const attempts = [
    { query: trimmed },
    { query: trimmed, again: true },
    ...fallbackQueries(trimmed),
  ];
  let answered = false;
  for (let i = 0; i < attempts.length; i++) {
    if (i > 0) await new Promise((resolve) => setTimeout(resolve, MIN_REQUEST_INTERVAL_MS));
    const attempt = attempts[i];
    try {
      const result = await searchNominatim(attempt.query);
      answered = true;
      if (!result) continue;
      if (i === 0 || attempt.again) return result;
      // A rewrite's hit ("Unit A, Pomona, CA") may be any building: exact only
      // when it is the very street address the venue's name stood before.
      const same = attempt.venueDropped && sameStreetAddress(attempt.query, result);
      return same ? result : { ...result, precision: 'approximate' };
    } catch (error) {
      if (error instanceof RateLimited) throw error;
      // Try the next rewrite rather than giving up on the first network hiccup.
    }
  }
  if (!answered) throw new Unreachable(`No answer for ${trimmed}`);
  return null;
}

/**
 * What latitude and longitude were found for: the place, with its city and
 * state when it does not already name them. Mirrors public.geocode_key
 * (20261025030000).
 */
const EDGES = /^[ \t\r\n]+|[ \t\r\n]+$/g;
export function geocodeKey(location, city, state) {
  const place = (location ?? '').replace(EDGES, '');
  if (!place) return null;
  const town = (city ?? '').replace(EDGES, '');
  const st = (state ?? '').replace(EDGES, '');
  let key = place;
  if (town && !place.toLowerCase().includes(town.toLowerCase())) key += `, ${town}`;
  if (st && !place.includes(st)) key += `, ${st}`;
  return key;
}

/**
 * Geocodes several events' `location` strings in sequence (never in
 * parallel — that would blow past Nominatim's 1 req/s policy), skipping any
 * event that already has a geocoding result on file for the same `location`
 * text, so an unchanged re-scrape does not re-hit the API for hundreds of
 * events it already has an answer for. An event with no prior result (never
 * geocoded, or the last attempt found nothing) is always retried even if its
 * `location` text is unchanged — otherwise a first-ever run with nothing
 * cached yet would "skip" every event straight to null and never actually
 * geocode anything.
 *
 * `events` are mutated in place with `city`/`postal_code`/`latitude`/
 * `longitude`/`location_precision`, matching the events table's column names
 * so callers can spread the result straight into an upsert payload.
 */
export async function geocodeEvents(events, existingByExternalId, lookup = geocodeLocation) {
  let lastRequestAt = 0;
  // One lookup per place a run: a weekly program is many events at one venue.
  const found = new Map();
  let limited = false;

  for (const event of events) {
    const existing = existingByExternalId?.get(event.external_id);
    const locationUnchanged =
      existing &&
      existing.latitude != null &&
      (existing.location || '').trim() === (event.location || '').trim();

    if (locationUnchanged) {
      event.city = existing.city ?? null;
      event.postal_code = existing.postal_code ?? null;
      event.latitude = existing.latitude ?? null;
      event.longitude = existing.longitude ?? null;
      event.location_precision = existing.location_precision ?? null;
      event.geocoded_state = existing.state ?? null;
      event.geocode_tried = true;
      continue;
    }

    if (!event.location) {
      event.city = null;
      event.postal_code = null;
      event.latitude = null;
      event.longitude = null;
      event.location_precision = null;
      event.geocode_tried = false;
      continue;
    }

    const place = event.location.trim();
    let result = found.get(place);
    if (result === undefined && !limited) {
      const wait = MIN_REQUEST_INTERVAL_MS - (Date.now() - lastRequestAt);
      if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
      lastRequestAt = Date.now();
      try {
        result = await lookup(place);
        found.set(place, result);
      } catch (error) {
        if (!(error instanceof RateLimited)) throw error;
        // The rest wait for the next run, which tries anything unplaced again.
        limited = true;
        console.log(`  ! map lookups paused for this run: ${error.message}`);
      }
    }
    event.city = result?.city ?? null;
    event.postal_code = result?.postalCode ?? null;
    event.latitude = result?.latitude ?? null;
    event.longitude = result?.longitude ?? null;
    event.location_precision = result?.precision ?? null;
    event.geocoded_state = result?.state ?? null;
    // Not asked (paused): left stale for the next run.
    event.geocode_tried = result !== undefined;
  }

  return events;
}
