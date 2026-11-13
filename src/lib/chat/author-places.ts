import { useEffect, useState } from 'react';
import { getSupabase } from '@/lib/supabase';

/**
 * Where the people posting in Classifieds are (the owner, 2026-11-12): the
 * club knows, so a listing says "San Jose, CA" by itself rather than asking
 * every seller to type it.
 *
 * Read from `browse_members`, the directory, and nowhere else: chat_authors
 * deliberately has no city. A member off the directory, paused, or on either
 * side of a block is simply not found there, so no city is shown for them.
 * Nothing is shown here that /peers/:id does not already show the reader.
 */

/** "San Jose, CA", or whichever half there is; null with neither. */
export function placeLine(city: string | null, state: string | null): string | null {
  const c = city?.trim() ? city.trim() : null;
  const s = state?.trim() ? state.trim() : null;
  return c && s ? `${c}, ${s}` : (c ?? s);
}

const NONE = new Map<string, string>();

/** Each author's place, by id. Empty unless `enabled`, and while it loads. */
export function useAuthorPlaces(
  ids: readonly (string | null | undefined)[],
  enabled: boolean,
): Map<string, string> {
  const key = enabled
    ? [...new Set(ids.filter((id): id is string => Boolean(id)))].sort().join(',')
    : '';
  const [read, setRead] = useState<{ key: string; places: Map<string, string> }>({
    key: '',
    places: NONE,
  });

  useEffect(() => {
    if (!key) return;
    let live = true;
    void getSupabase()
      .from('browse_members')
      .select('id, city, state')
      .in('id', key.split(','))
      .then(({ data, error }) => {
        if (!live || error) return;
        const places = new Map<string, string>();
        for (const row of data as { id: string; city: string | null; state: string | null }[]) {
          const line = placeLine(row.city, row.state);
          if (line) places.set(row.id, line);
        }
        setRead({ key, places });
      });
    return () => {
      live = false;
    };
  }, [key]);

  // Kept from the last read while a new id loads, so known places stay put.
  return key ? read.places : NONE;
}
