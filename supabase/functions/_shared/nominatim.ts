/**
 * Forward geocoding with Nominatim, ported from
 * jobs/event-ingest/scrapers/geocode.js (lookUpPlace) with the same User-Agent,
 * rewrites and precision. nominatim.test.ts holds the two together.
 */

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const USER_AGENT = 'thesciclub-event-ingest/1.0 (+https://www.thesciclub.com)';
export const MIN_REQUEST_INTERVAL_MS = 1100;

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

export interface Place {
  city: string | null;
  state: string | null;
  postalCode: string | null;
  latitude: number;
  longitude: number;
  precision: 'exact' | 'approximate';
}

interface Result {
  type?: string;
  category?: string;
  lat?: string;
  lon?: string;
  address?: Record<string, string | undefined>;
}

function precisionOf(result: Result): Place['precision'] {
  return EXACT_TYPES.has(result.type ?? '') || EXACT_TYPES.has(result.category ?? '')
    ? 'exact'
    : 'approximate';
}

function cityOf(address: Record<string, string | undefined>): string | null {
  return [address.city, address.town, address.village, address.hamlet].find(Boolean) ?? null;
}

function fallbackQueries(trimmed: string): string[] {
  const candidates: string[] = [];

  const digitIndex = trimmed.search(/[0-9]/);
  if (digitIndex > 0) candidates.push(trimmed.slice(digitIndex).trim());

  const firstComma = trimmed.indexOf(',');
  if (firstComma > 0) candidates.push(trimmed.slice(firstComma + 1).trim());

  const lastComma = trimmed.lastIndexOf(',');
  if (lastComma > 0) candidates.push(trimmed.slice(0, lastComma).trim());

  return candidates;
}

/** Nominatim said "too many requests": asking again only makes it longer. */
export class RateLimited extends Error {}

/** No attempt got an answer: not the same as "nowhere". */
export class Unreachable extends Error {}

type Fetch = (url: URL, init: RequestInit) => Promise<Response>;

async function searchNominatim(query: string, fetcher: Fetch): Promise<Place | null> {
  const url = new URL(NOMINATIM_URL);
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('limit', '1');
  url.searchParams.set('countrycodes', 'us');

  const res = await fetcher(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    signal: AbortSignal.timeout(10000),
  });
  if (res.status === 429 || res.status === 403)
    throw new RateLimited(`Nominatim answered ${res.status}`);
  if (!res.ok) throw new Unreachable(`Nominatim answered ${res.status}`);

  const results = (await res.json()) as Result[] | null;
  const top = results?.[0];
  if (!top) return null;

  const address = top.address ?? {};
  return {
    city: cityOf(address),
    // "US-CA" → "CA".
    state: /^US-([A-Z]{2})$/.exec(address['ISO3166-2-lvl4'] ?? '')?.[1] ?? null,
    postalCode: address.postcode === undefined || address.postcode === '' ? null : address.postcode,
    latitude: Number(top.lat),
    longitude: Number(top.lon),
    precision: precisionOf(top),
  };
}

/** The place, or null for nowhere; throws RateLimited, or Unreachable when nothing answered. */
export async function lookUpPlace(
  query: string,
  fetcher: Fetch = fetch,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
): Promise<Place | null> {
  const trimmed = (query || '').trim();
  if (!trimmed) return null;

  const attempts = [trimmed, ...fallbackQueries(trimmed)];
  let answered = false;
  for (let i = 0; i < attempts.length; i++) {
    if (i > 0) await sleep(MIN_REQUEST_INTERVAL_MS);
    try {
      const result = await searchNominatim(attempts[i] ?? '', fetcher);
      answered = true;
      if (result) return result;
    } catch (error) {
      if (error instanceof RateLimited) throw error;
      // Try the next rewrite rather than giving up on the first network hiccup.
    }
  }
  if (!answered) throw new Unreachable(`No answer for ${trimmed}`);
  return null;
}

/** A match in another state than the place's is no match; with no state, none is. */
export function placeInState(found: Place | null, state: string | null): Place | null {
  if (!found || !Number.isFinite(found.latitude) || !Number.isFinite(found.longitude)) return null;
  return state && found.state === state ? found : null;
}
