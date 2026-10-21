import { useEffect, useState } from 'react';
import { useAccount } from '@/lib/account';
import { onForgetSharedReads } from '@/lib/shared-reads';
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
 */
export type NearHomeStatus = 'any' | 'loading' | 'unplaced' | 'ready' | 'error';

export interface NearHome {
  status: NearHomeStatus;
  ids: ReadonlySet<string> | null;
}

const ASK_AFTER_MS = 250;
const answers = new Map<number, ReadonlySet<string> | null>();
onForgetSharedReads(() => {
  answers.clear();
});

async function ask(miles: number): Promise<ReadonlySet<string> | null> {
  const known = answers.get(miles);
  if (known !== undefined) return known;
  const answer = await getSupabase().rpc('events_within_miles', { miles });
  if (answer.error) throw new Error(answer.error.message);
  const data: unknown = answer.data;
  const ids = Array.isArray(data)
    ? new Set(data.filter((id): id is string => typeof id === 'string'))
    : null;
  answers.set(miles, ids);
  return ids;
}

export function useNearHome(miles: number | null): NearHome {
  const account = useAccount();
  const member = account.status === 'member';
  const asking = member && miles !== null;
  const [answer, setAnswer] = useState<NearHome>(() => {
    if (!asking) return { status: 'any', ids: null };
    const known = answers.get(miles);
    if (known === undefined) return { status: 'loading', ids: null };
    return known ? { status: 'ready', ids: known } : { status: 'unplaced', ids: null };
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
    const known = answers.get(miles);
    if (known !== undefined) {
      settle(known);
      return;
    }
    // The first answer at once; a slider's later ones once it rests.
    const timer = setTimeout(
      () => {
        ask(miles).then(settle, () => {
          if (!cancelled) setAnswer({ status: 'error', ids: null });
        });
      },
      answers.size === 0 ? 0 : ASK_AFTER_MS,
    );
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [asking, miles]);

  return answer;
}
