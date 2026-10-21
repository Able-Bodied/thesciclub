import { useEffect, useState } from 'react';
import { useAccount } from '@/lib/account';
import { onForgetSharedReads } from '@/lib/shared-reads';
import { getSupabase } from '@/lib/supabase';

/**
 * The signed-in member's state, read once and shared, so every event card can
 * say when an event is in another state (20261021040000). Null until read, for
 * nobody signed in, or when it could not be read: then nothing is marked.
 */

let shared: { userId: string; state: string | null } | null = null;
let inFlight: { userId: string; read: Promise<string | null> } | null = null;

onForgetSharedReads(() => {
  shared = null;
  inFlight = null;
});

function readHomeState(userId: string): Promise<string | null> {
  if (inFlight?.userId === userId) return inFlight.read;
  const read = (async () => {
    try {
      const { data } = await getSupabase()
        .from('members')
        .select('state')
        .eq('id', userId)
        .maybeSingle();
      const value: unknown = data?.state;
      const state = typeof value === 'string' ? value : null;
      shared = { userId, state };
      return state;
    } catch {
      return null;
    }
  })();
  inFlight = { userId, read };
  return read;
}

export function useHomeState(): string | null {
  const account = useAccount();
  const userId = account.status === 'member' ? account.userId : null;
  const [state, setState] = useState<string | null>(
    shared?.userId === userId ? shared.state : null,
  );

  useEffect(() => {
    if (!userId) {
      setState(null);
      return;
    }
    let cancelled = false;
    void readHomeState(userId).then((read) => {
      if (!cancelled) setState(read);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return state;
}
