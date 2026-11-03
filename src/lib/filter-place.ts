import { useSyncExternalStore } from 'react';
import { stateCodeForName, stateNameFor } from '@/types/domain';

/**
 * Where distances are measured from, when it is not home (the owner,
 * 2026-11-03): a city, state or ZIP code typed beside "Within 50 miles of San
 * Jose". One place for Events, Peers and Organizations, kept on this device
 * only, until "Back to" home. Never sent to the club except as the point an
 * event distance is measured from (events_within_miles_of, 20261103080000),
 * which keeps nothing.
 *
 * What was typed is looked up with Nominatim, as a ZIP code is while joining
 * (geocode.ts), on a deliberate tap only.
 */

export interface FilterPlace {
  /** "Portland, OR", "Oregon" or "Portland, OR 97201". */
  label: string;
  latitude: number;
  longitude: number;
  /** Two letters, for online events with no place of their own. */
  state: string | null;
}

const KEY = 'club:distance-from';
const listeners = new Set<() => void>();
let current: FilterPlace | null = read();

function read(): FilterPlace | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<FilterPlace>;
    return typeof value.label === 'string' &&
      typeof value.latitude === 'number' &&
      typeof value.longitude === 'number'
      ? {
          label: value.label,
          latitude: value.latitude,
          longitude: value.longitude,
          state: typeof value.state === 'string' ? value.state : null,
        }
      : null;
  } catch {
    return null;
  }
}

export function setFilterPlace(place: FilterPlace | null) {
  current = place;
  try {
    if (place) window.localStorage.setItem(KEY, JSON.stringify(place));
    else window.localStorage.removeItem(KEY);
  } catch {
    // Kept for this visit only.
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useFilterPlace(): FilterPlace | null {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => null,
  );
}

interface Found {
  lat?: string;
  lon?: string;
  addresstype?: string;
  address?: {
    city?: string;
    town?: string;
    village?: string;
    hamlet?: string;
    county?: string;
    state?: string;
    postcode?: string;
    country_code?: string;
  };
}

/** What was typed, to a place to measure from. Null when nothing in the US matched. */
export async function findFilterPlace(typed: string): Promise<FilterPlace | null> {
  const text = typed.trim();
  if (!text) return null;
  const zip = /^\d{5}$/.test(text) ? text : null;
  const query = zip
    ? `postalcode=${zip}`
    : `q=${encodeURIComponent(stateNameFor(text.toUpperCase()) ?? text)}`;
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=us&addressdetails=1&limit=1&${query}`,
      { headers: { Accept: 'application/json' } },
    );
    if (!res.ok) return null;
    const [first] = (await res.json()) as Found[];
    const latitude = Number(first?.lat);
    const longitude = Number(first?.lon);
    if (!first || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
    const address = first.address ?? {};
    if (address.country_code && address.country_code !== 'us') return null;
    const state = address.state ? stateCodeForName(address.state) : null;
    const town = address.city ?? address.town ?? address.village ?? address.hamlet ?? null;
    const label =
      first.addresstype === 'state' || !town
        ? (address.state ?? text)
        : `${town}${state ? `, ${state}` : ''}${zip ? ` ${zip}` : ''}`;
    return { label, latitude, longitude, state };
  } catch {
    return null;
  }
}
