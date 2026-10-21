import { useEffect, useState } from 'react';
import { useAccount } from '@/lib/account';
import { onForgetSharedReads } from '@/lib/shared-reads';
import { getSupabase } from '@/lib/supabase';

/**
 * The signed-in member's city and state, read once and shared, so every event
 * card can say when an event is in another state (20261021040000) and Filters
 * can say "within 20 miles of" where. Null until read, for nobody signed in,
 * or when it could not be read: then nothing is marked.
 */

export interface Home {
  city: string | null;
  state: string | null;
}

let shared: { userId: string; home: Home | null } | null = null;
let inFlight: { userId: string; read: Promise<Home | null> } | null = null;

onForgetSharedReads(() => {
  shared = null;
  inFlight = null;
});

const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value : null);

function readHome(userId: string): Promise<Home | null> {
  if (inFlight?.userId === userId) return inFlight.read;
  const read = (async () => {
    try {
      const { data } = await getSupabase()
        .from('members')
        .select('city, state')
        .eq('id', userId)
        .maybeSingle();
      const home = data ? { city: text(data.city), state: text(data.state) } : null;
      shared = { userId, home };
      return home;
    } catch {
      return null;
    }
  })();
  inFlight = { userId, read };
  return read;
}

export function useHome(): Home | null {
  const account = useAccount();
  const userId = account.status === 'member' ? account.userId : null;
  const [home, setHome] = useState<Home | null>(shared?.userId === userId ? shared.home : null);

  useEffect(() => {
    if (!userId) {
      setHome(null);
      return;
    }
    let cancelled = false;
    void readHome(userId).then((read) => {
      if (!cancelled) setHome(read);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return home;
}

export function useHomeState(): string | null {
  return useHome()?.state ?? null;
}
