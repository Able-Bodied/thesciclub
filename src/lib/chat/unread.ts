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
 * What makes it re-ask
 * ---------------------------------------------------------------------------
 * Two things, and neither is a timer. Polling a database every thirty seconds
 * for a dot is a cost every member on a phone pays for something they notice
 * once.
 *
 *  - The window regaining focus. Coming back to the tab is when a stale dot is
 *    most visible.
 *  - `unreadChanged()`, which Chat calls when it has just done something that
 *    changes the answer — reading a conversation is the one that matters, and
 *    it happens on a screen that is not this one. A notifier rather than a
 *    refetch on every navigation: the dot then moves exactly when the fact
 *    moves, instead of on every tap anywhere in the app.
 *
 * Realtime lands in the next phase and will add the third: somebody else
 * writing to you while you are looking at something else.
 *
 * A failure leaves the count at zero and says nothing. The dot is a hint; an
 * error message in the tab bar is not.
 */

/**
 * Everything currently drawing the dot.
 *
 * Module-level, because the thing that changes the answer (opening a
 * conversation) and the thing that draws it (the tab bar) are on opposite sides
 * of the tree, and threading a callback between them would mean the shell
 * holding a conversation's state.
 */
const listeners = new Set<() => void>();

/** Tell the dot that the answer has changed. Called by threads.ts. */
export function unreadChanged(): void {
  for (const listener of listeners) listener();
}

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

    const again = () => {
      void load();
    };
    listeners.add(again);
    window.addEventListener('focus', again);
    return () => {
      listeners.delete(again);
      window.removeEventListener('focus', again);
    };
  }, [load]);

  const reload = useCallback(() => {
    void load();
  }, [load]);

  return { count, reload };
}
