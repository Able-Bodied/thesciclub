import { useEffect, useState } from 'react';
import { useAccount } from '@/lib/account';
import { type FilterPlace, useFilterPlace } from '@/lib/filter-place';
import { onCalendarChanged, onForgetSharedReads } from '@/lib/shared-reads';
import { getSupabase } from '@/lib/supabase';

/**
 * Which events are within so many miles of the member's home city
 * (20261022000000). The database answers only which ids are in range, never
 * where an event is.
 *
 *   any       no distance asked, or nobody signed in: nothing is narrowed
 *   loading   the first answer is on its way
 *   unplaced  no city, or the city is not on the map yet: nothing is narrowed
 *   ready     `ids` are the events in range
 *   error     could not ask: nothing is narrowed
 *
 * While a new distance is asked, the last answer stands, so the list does not
 * blink back to every event as a slider moves.
 *
 * From a place the member chose instead of home (filter-place.ts, the owner,
 * 2026-11-03), it asks events_within_miles_of with that place's point.
 */
export type NearHomeStatus = 'any' | 'loading' | 'unplaced' | 'ready' | 'error';

export interface NearHome {
  status: NearHomeStatus;
  ids: ReadonlySet<string> | null;
}

const ASK_AFTER_MS = 250;
/**
 * An answer lasts a minute, and goes at once when this device changes the
 * calendar. Kept any longer, an event added since, here or from a calendar
 * invitation, is filtered out as if it were far away (the owner, 2026-11-01).
 */
const FRESH_FOR_MS = 60_000;
const answers = new Map<string, { ids: ReadonlySet<string> | null; at: number }>();

function keyOf(miles: number, place: FilterPlace | null): string {
  return place ? `${miles}@${place.latitude},${place.longitude}` : String(miles);
}
onForgetSharedReads(() => {
  answers.clear();
});
onCalendarChanged(() => {
  answers.clear();
});

function fresh(key: string): { ids: ReadonlySet<string> | null } | undefined {
  const known = answers.get(key);
  return known && Date.now() - known.at < FRESH_FOR_MS ? known : undefined;
}

async function ask(miles: number, place: FilterPlace | null): Promise<ReadonlySet<string> | null> {
  const key = keyOf(miles, place);
  const known = fresh(key);
  if (known) return known.ids;
  const answer = await (place
    ? getSupabase().rpc('events_within_miles_of', {
        miles,
        p_latitude: place.latitude,
        p_longitude: place.longitude,
        p_state: place.state,
      })
    : getSupabase().rpc('events_within_miles', { miles }));
  if (answer.error) throw new Error(answer.error.message);
  const data: unknown = answer.data;
  const ids = Array.isArray(data)
    ? new Set(data.filter((id): id is string => typeof id === 'string'))
    : null;
  answers.set(key, { ids, at: Date.now() });
  return ids;
}

export function useNearHome(miles: number | null): NearHome {
  const account = useAccount();
  const member = account.status === 'member';
  const asking = member && miles !== null;
  const place = useFilterPlace();
  const key = miles === null ? '' : keyOf(miles, place);
  const [answer, setAnswer] = useState<NearHome>(() => {
    if (!asking) return { status: 'any', ids: null };
    // An old answer stands while a new one is asked, as for a slider.
    const known = answers.get(key);
    if (known === undefined) return { status: 'loading', ids: null };
    return known.ids ? { status: 'ready', ids: known.ids } : { status: 'unplaced', ids: null };
  });

  useEffect(() => {
    if (!asking) {
      setAnswer({ status: 'any', ids: null });
      return;
    }
    let cancelled = false;
    const settle = (ids: ReadonlySet<string> | null) => {
      if (!cancelled) setAnswer(ids ? { status: 'ready', ids } : { status: 'unplaced', ids: null });
    };
    const known = fresh(key);
    if (known) {
      settle(known.ids);
      return;
    }
    // The first answer at once; a slider's later ones once it rests.
    const timer = setTimeout(
      () => {
        ask(miles, place).then(settle, () => {
          if (!cancelled) setAnswer({ status: 'error', ids: null });
        });
      },
      answers.size === 0 ? 0 : ASK_AFTER_MS,
    );
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [asking, miles, key, place]);

  return answer;
}
