import { useEffect, useState } from 'react';
import { getSupabase } from '@/lib/supabase';

/**
 * Whether somebody is signed in.
 *
 * Everything behind the club's door needs this — `browse_members` is granted to
 * `authenticated` only — and the distinction that matters to the UI is not
 * "did the query fail" but "is there a session at all". Those produce very
 * different screens: one is an error, the other is a door.
 */

export type SessionState =
  | { status: 'loading' }
  | { status: 'signed-out' }
  | { status: 'signed-in'; userId: string };

export function useSession(): SessionState {
  const [state, setState] = useState<SessionState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    const supabase = getSupabase();

    void supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setState(
        data.session
          ? { status: 'signed-in', userId: data.session.user.id }
          : { status: 'signed-out' },
      );
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (cancelled) return;
      setState(
        session ? { status: 'signed-in', userId: session.user.id } : { status: 'signed-out' },
      );
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  return state;
}
