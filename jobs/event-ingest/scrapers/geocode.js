/**
 * Forward geocoding for the free-text `location` string a scraper produces
 * ("Gino's Pizza 1761 Monterey Street San Luis Obispo, CA, 93401 United
 * States", or something as loose as "Sacramento Rehabilitation Hospital,
 * Natomas"). Nominatim (OpenStreetMap) — the same provider
 * src/routes/onboarding/location-step.tsx already uses for reverse geocoding
 * — resolves free-text place names, not just structured addresses, so it
 * handles both cases with one endpoint.
 *
 * Usage policy (https://operations.osmfoundation.org/policies/nominatim/):
 * max 1 request/second, and a real identifying User-Agent. `geocodeLocations`
 * enforces the delay between calls; callers doing one-off lookups don't need
 * to.
 */

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const USER_AGENT =
  'ab-peers-prototype-event-ingest/1.0 (hackathon prototype; no production traffic)';
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
  if (digitIndex > 0) candidates.push(trimmed.slice(digitIndex).trim());

  const firstComma = trimmed.indexOf(',');
  if (firstComma > 0) candidates.push(trimmed.slice(firstComma + 1).trim());

  const lastComma = trimmed.lastIndexOf(',');
  if (lastComma > 0) candidates.push(trimmed.slice(0, lastComma).trim());

  return candidates;
}

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
  if (!res.ok) return null;

  const results = await res.json();
  const top = results?.[0];
  if (!top) return null;

  const address = top.address || {};
  return {
    city: cityOf(address),
    postalCode: address.postcode || null,
    latitude: Number(top.lat),
    longitude: Number(top.lon),
    precision: precisionOf(top),
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
  const trimmed = (query || '').trim();
  if (!trimmed) return null;

  const attempts = [trimmed, ...fallbackQueries(trimmed)];
  for (let i = 0; i < attempts.length; i++) {
    if (i > 0) await new Promise((resolve) => setTimeout(resolve, MIN_REQUEST_INTERVAL_MS));
    try {
      const result = await searchNominatim(attempts[i]);
      if (result) return result;
    } catch {
      // Try the next rewrite rather than giving up on the first network hiccup.
    }
  }
  return null;
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
export async function geocodeEvents(events, existingByExternalId) {
  let lastRequestAt = 0;

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
      continue;
    }

    if (!event.location) {
      event.city = null;
      event.postal_code = null;
      event.latitude = null;
      event.longitude = null;
      event.location_precision = null;
      continue;
    }

    const wait = MIN_REQUEST_INTERVAL_MS - (Date.now() - lastRequestAt);
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    lastRequestAt = Date.now();

    const result = await geocodeLocation(event.location);
    event.city = result?.city ?? null;
    event.postal_code = result?.postalCode ?? null;
    event.latitude = result?.latitude ?? null;
    event.longitude = result?.longitude ?? null;
    event.location_precision = result?.precision ?? null;
  }

  return events;
}
