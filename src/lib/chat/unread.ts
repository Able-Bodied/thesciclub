import { useCallback, useEffect, useState } from 'react';
import { useAccount } from '@/lib/account';
import { getSupabase } from '@/lib/supabase';

/**
 * How many conversations have something new in them.
 *
 * One number, for the dot on the Chat tab. It is a separate call from
 * `useMyThreads` rather than a count derived from it, because the two live in
 * different places: the list is on /chat and the dot is in the shell, mounted
 * on every screen. Deriving one from the other would mean the shell holding a
 * list it never draws.
 *
 * `chat_unread_count()` is built on `chat_my_threads()` in the database, so
 * there is still only one definition of "new" — somebody else's words, newer
 * than you last looked. Two definitions is how a nav dot ends up pointing at a
 * list with nothing bold in it.
 *
 * ---------------------------------------------------------------------------
 * It refetches on focus, and that is the whole of its liveness for now
 * ---------------------------------------------------------------------------
 * Realtime lands in the next phase and will drive this from the wire. Until
 * then the honest behaviour is to re-ask when the window comes back — somebody
 * returning to the tab is the moment a stale dot is most visible — and to
 * re-ask when the route changes, which the caller does by remounting.
 *
 * A failure leaves the count at zero and says nothing. The dot is a hint; an
 * error message in the tab bar is not.
 */

export interface UnreadState {
  /** Conversations with something new. Zero is drawn as no dot at all. */
  count: number;
  reload: () => void;
}

export function useUnreadThreads(): UnreadState {
  const account = useAccount();
  // Suspended members read their conversations, so they get the dot too. Only a
  // session with no member row behind it has nothing to count.
  const signedIn = account.status === 'member' || account.status === 'suspended';

  const [count, setCount] = useState(0);

  const load = useCallback(async () => {
    if (!signedIn) {
      setCount(0);
      return;
    }
    try {
      const { data, error } = (await getSupabase().rpc('chat_unread_count')) as {
        data: number | null;
        error: { message: string } | null;
      };
      if (error) {
        setCount(0);
        return;
      }
      setCount(data ?? 0);
    } catch {
      setCount(0);
    }
  }, [signedIn]);

  useEffect(() => {
    void load();

    // Not an interval. Polling a database every thirty seconds for a dot is a
    // cost paid by every member on a phone for something they notice once; the
    // moment that matters is coming back to the window, and realtime takes the
    // rest in the next phase.
    const onFocus = () => {
      void load();
    };
    window.addEventListener('focus', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
    };
  }, [load]);

  const reload = useCallback(() => {
    void load();
  }, [load]);

  return { count, reload };
}
