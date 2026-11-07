import { badgesChanged, useBadgeCounts } from '@/lib/badges';
import { tellOtherTabs } from '@/lib/read-elsewhere';

/**
 * How many conversations have something new: the Chat tab's dot, in the shell on every screen,
 * so it is its own call rather than derived from `useMyThreads` on /chat.
 *
 * `chat_unread_count()`, via `my_badge_counts()` (src/lib/badges.ts), follows
 * `chat_my_threads()`, so "new" has one definition and the dot never points at a list with
 * nothing bold. Except: a muted conversation is bold but adds no dot (20261104204000).
 *
 * No timer polling. It re-asks on window focus, on `unreadChanged()` after Chat reads something,
 * on a new message (useBadgeRealtime), and on a read in another tab (src/lib/read-elsewhere.ts)
 * or device. A failure leaves zero, silently: the dot is a hint.
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
