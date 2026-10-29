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
 * The zip is kept on the member's own row since 20261029040000 (the owner,
 * 2026-10-28), so the map can count them at the middle of their zip code
 * rather than their city's. Nobody else reads it, and no coordinates of
 * theirs are ever kept: only each zip code's middle.
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
  /** Five digits, from Use my location (the owner, 2026-10-28); absent when unknown. */
  zip?: string;
}

interface NominatimAddress {
  city?: string;
  town?: string;
  village?: string;
  hamlet?: string;
  suburb?: string;
  county?: string;
  state?: string;
  postcode?: string;
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
  const zip = /^([0-9]{5})(-[0-9]{4})?$/.exec(address.postcode?.trim() ?? '')?.[1];
  return zip ? { city, state, zip } : { city, state };
}

/** A browser position to a city and state. Returns null rather than throwing. */
export async function reverseGeocode(
  latitude: number,
  longitude: number,
): Promise<ResolvedPlace | null> {
  try {
    const res = await fetch(
      // Zoom 16 rather than 10, so the answer carries the ZIP code too; the
      // same position is sent either way.
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=16&lat=${latitude}&lon=${longitude}`,
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
