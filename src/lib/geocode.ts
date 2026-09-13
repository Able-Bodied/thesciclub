import { stateCodeForName } from '@/types/domain';

/**
 * Nominatim (OpenStreetMap) geocoding — free, no key, and the same provider the
 * events ingest job uses server-side. Keeping both on one provider means "city"
 * means the same thing on both sides of the app.
 *
 * Two directions, for the two ways somebody answers "where do you live":
 * reverse, from a browser position when they tap Use my location; and forward,
 * from a zip code they type, which is faster than scrolling a state list.
 *
 * **The zip is never stored.** It resolves to a city and a state and is then
 * discarded — CONTEXT.md says a city, never a location, and a postcode is
 * a good deal narrower than a city. Neither is a set of coordinates ever kept.
 *
 * Nominatim's usage policy asks for at most one request per second and a real
 * identifying User-Agent. A browser will not let us set User-Agent, so these
 * calls carry Referer instead, which is what the policy accepts from web apps,
 * and they only ever fire on a deliberate tap or a completed zip.
 */

export interface ResolvedPlace {
  city: string;
  /** Two-letter code, matching what the `state` column stores. */
  state: string;
}

interface NominatimAddress {
  city?: string;
  town?: string;
  village?: string;
  hamlet?: string;
  suburb?: string;
  county?: string;
  state?: string;
  country_code?: string;
}

function cityOf(address: NominatimAddress): string {
  return (
    address.city ??
    address.town ??
    address.village ??
    address.hamlet ??
    address.suburb ??
    address.county ??
    ''
  );
}

function toPlace(address: NominatimAddress | undefined): ResolvedPlace | null {
  if (!address) return null;
  if (address.country_code && address.country_code !== 'us') return null;
  const city = cityOf(address);
  const state = address.state ? stateCodeForName(address.state) : null;
  if (!city || !state) return null;
  return { city, state };
}

/** A browser position to a city and state. Returns null rather than throwing. */
export async function reverseGeocode(
  latitude: number,
  longitude: number,
): Promise<ResolvedPlace | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=10&lat=${latitude}&lon=${longitude}`,
      { headers: { Accept: 'application/json' } },
    );
    if (!res.ok) return null;
    const body = (await res.json()) as { address?: NominatimAddress };
    return toPlace(body.address);
  } catch {
    return null;
  }
}

/** A US zip code to a city and state. Returns null rather than throwing. */
export async function geocodeZip(zip: string): Promise<ResolvedPlace | null> {
  const clean = zip.replace(/\D/g, '').slice(0, 5);
  if (clean.length !== 5) return null;
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=us&addressdetails=1&limit=1&postalcode=${clean}`,
      { headers: { Accept: 'application/json' } },
    );
    if (!res.ok) return null;
    const body = (await res.json()) as { address?: NominatimAddress }[];
    return toPlace(body[0]?.address);
  } catch {
    return null;
  }
}
