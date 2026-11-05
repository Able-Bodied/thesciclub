import { badgesChanged, useBadgeCounts } from '@/lib/badges';
import { tellOtherTabs } from '@/lib/read-elsewhere';

/**
 * How many conversations have something new in them.
 *
 * One number, for the dot on the Chat tab. It is a separate call from
 * `useMyThreads` rather than a count derived from it, because the two live in
 * different places: the list is on /chat and the dot is in the shell, mounted
 * on every screen. Deriving one from the other would mean the shell holding a
 * list it never draws.
 *
 * The number is `chat_unread_count()`'s, asked through `my_badge_counts()`
 * with the other badges (src/lib/badges.ts). It follows `chat_my_threads()`,
 * so there is still only one definition of "new" — somebody else's words, newer
 * than you last looked. Two definitions is how a nav dot ends up pointing at a
 * list with nothing bold in it. One difference, the other way: a muted
 * conversation is bold in the list but leaves the dot (20261104204000).
 *
 * ---------------------------------------------------------------------------
 * What makes it re-ask
 * ---------------------------------------------------------------------------
 * None of it is a timer. Polling a database every thirty seconds
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
 * Also: a new message (the tab bar's realtime), a read in another tab
 * (src/lib/read-elsewhere.ts) and a read on another device (useBadgeRealtime).
 *
 * A failure leaves the count at zero and says nothing. The dot is a hint; an
 * error message in the tab bar is not.
 */

/** Tell the dot that the answer has changed. Called by threads.ts. */
export function unreadChanged(): void {
  badgesChanged();
  tellOtherTabs();
}

export interface UnreadState {
  /** Conversations with something new. Zero is drawn as no dot at all. */
  count: number;
  reload: () => void;
}

// Counted with the other badges in one request (src/lib/badges.ts).
export function useUnreadThreads(): UnreadState {
  return { count: useBadgeCounts().chatUnread, reload: badgesChanged };
}
