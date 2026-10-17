import { useContext, useEffect, useState } from 'react';
import { AccountContext } from '@/lib/account-context';
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
  // Inside the club the guard has already read the session, so a screen
  // starts signed in with the member's id rather than reading once without
  // it and again with it (2026-10-14: a topic read its posts twice).
  const known = useContext(AccountContext);
  const [state, setState] = useState<SessionState>(() =>
    known?.userId ? { status: 'signed-in', userId: known.userId } : { status: 'loading' },
  );

  useEffect(() => {
    let cancelled = false;
    const supabase = getSupabase();

    void supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setState((current) => next(current, data.session?.user.id ?? null));
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (cancelled) return;
      setState((current) => next(current, session?.user.id ?? null));
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  return state;
}

/** The same answer twice keeps the same object, so nothing reads again. */
function next(current: SessionState, userId: string | null): SessionState {
  if (!userId) return current.status === 'signed-out' ? current : { status: 'signed-out' };
  return current.status === 'signed-in' && current.userId === userId
    ? current
    : { status: 'signed-in', userId };
}
