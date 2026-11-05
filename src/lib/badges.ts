import { useEffect, useSyncExternalStore } from 'react';
import { useAccount } from '@/lib/account';
import { useRealtimeRows } from '@/lib/chat/realtime';
import { coalesce, RECOUNT_MS } from '@/lib/coalesce';
import { onReadElsewhere } from '@/lib/read-elsewhere';
import { getSupabase } from '@/lib/supabase';

/**
 * The Chat dot, the bell, Me's dot and the app icon, from one request
 * (`my_badge_counts`, 20261104211000) with one 1.5 s limit for all of them.
 * Each used to ask on its own, and the bell up to three times on Me.
 *
 * Module-level, like `unreadChanged`: what changes a number (opening a
 * conversation, the notifications list) and what draws it are far apart.
 */
export interface BadgeCounts {
  /** Conversations with something new. */
  chatUnread: number;
  /** The bell: unseen among what the list would show. */
  unseen: number;
  /** Me's dot: the bell less what the Chat dot already says. */
  unseenOutsideChat: number;
  /** The app icon: kinds the bell has not shown. */
  iconKinds: number;
  /** False until the first answer for this member, so a bell knows a rise is news. */
  loaded: boolean;
}

const NONE: BadgeCounts = {
  chatUnread: 0,
  unseen: 0,
  unseenOutsideChat: 0,
  iconKinds: 0,
  loaded: false,
};

/**
 * Said by the list after it marks things seen or read, so every badge reads
 * its number again.
 */
export const NOTIFICATIONS_CHANGED = 'club:notifications-changed';

interface Reader {
  /** Whose numbers; null is nobody to count for. */
  key: string | null;
  /** False for a suspended member: the Chat dot only (theirs is 0, 20261104205000). */
  notifications: boolean;
}

let counts: BadgeCounts = NONE;
let reader: Reader = { key: null, notifications: false };
// Bumped on every new reader, so an answer for the last one is dropped.
let generation = 0;
let mounted = 0;
const subscribers = new Set<() => void>();

function publish(next: BadgeCounts) {
  counts = next;
  for (const notify of subscribers) notify();
}

interface BadgeRow {
  chat_unread: number;
  unseen: number;
  unseen_outside_chat: number;
  icon_kinds: number;
}

async function load() {
  const asked = generation;
  const { key, notifications } = reader;
  if (!key) return;
  try {
    const { data, error } = (await getSupabase().rpc('my_badge_counts')) as {
      data: BadgeRow[] | null;
      error: { message: string } | null;
    };
    if (asked !== generation) return;
    const row = data?.[0];
    if (error || !row) {
      // The dot is a hint: zero, quietly. The rest keep what they had.
      publish({ ...counts, chatUnread: 0 });
      return;
    }
    publish({
      chatUnread: row.chat_unread,
      unseen: notifications ? row.unseen : 0,
      unseenOutsideChat: notifications ? row.unseen_outside_chat : 0,
      iconKinds: notifications ? row.icon_kinds : 0,
      loaded: true,
    });
  } catch {
    if (asked === generation) publish({ ...counts, chatUnread: 0 });
  }
}

let again = coalesce(() => void load(), RECOUNT_MS);

/** Recount every badge, within the shared limit. */
export function badgesChanged(): void {
  again();
}

const onVisible = () => {
  if (document.visibilityState === 'visible') again();
};

let stopHearing: (() => void) | null = null;

function start() {
  window.addEventListener('focus', again);
  // A read in another tab (src/lib/read-elsewhere.ts).
  stopHearing = onReadElsewhere(again);
  window.addEventListener(NOTIFICATIONS_CHANGED, again);
  document.addEventListener('visibilitychange', onVisible);
  // Outside the limit, as each badge's own first count was: a change right
  // after opening still counts at once.
  void load();
}

function stop() {
  window.removeEventListener('focus', again);
  window.removeEventListener(NOTIFICATIONS_CHANGED, again);
  document.removeEventListener('visibilitychange', onVisible);
  stopHearing?.();
  stopHearing = null;
  again.cancel();
}

function setReader(next: Reader) {
  if (next.key === reader.key && next.notifications === reader.notifications) return;
  reader = next;
  generation += 1;
  publish(NONE);
  // A different member is asked at once; the first one is start()'s.
  if (mounted === 0) return;
  again.cancel();
  void load();
}

function subscribe(notify: () => void) {
  subscribers.add(notify);
  return () => {
    subscribers.delete(notify);
  };
}

/** Every badge's number. The first reader on screen starts the counting. */
export function useBadgeCounts(): BadgeCounts {
  const account = useAccount();
  const member = account.status === 'member';
  const key = member || account.status === 'suspended' ? (account.userId ?? account.status) : null;

  useEffect(() => {
    setReader({ key, notifications: member });
  }, [key, member]);

  useEffect(() => {
    mounted += 1;
    if (mounted === 1) start();
    return () => {
      mounted -= 1;
      if (mounted === 0) stop();
    };
  }, []);

  return useSyncExternalStore(subscribe, () => counts);
}

/**
 * The tab bar's realtime for every badge: this member's notifications, and
 * their own read positions moving on another device.
 */
export function useBadgeRealtime(): void {
  const account = useAccount();
  const memberId = account.status === 'member' ? account.userId : null;
  // A suspended member's count is 0 (20261104205000); watching is harmless.
  const readerId =
    account.status === 'member' || account.status === 'suspended' ? account.userId : null;

  useRealtimeRows({
    table: 'notifications',
    filter: memberId ? `member_id=eq.${memberId}` : undefined,
    onChange: badgesChanged,
    enabled: Boolean(memberId),
  });
  useRealtimeRows({
    table: 'chat_thread_members',
    filter: readerId ? `member_id=eq.${readerId}` : undefined,
    onChange: badgesChanged,
    enabled: Boolean(readerId),
  });
}

/** For tests: forget everything between them. */
export function resetBadgesForTest(): void {
  again.cancel();
  again = coalesce(() => void load(), RECOUNT_MS);
  counts = NONE;
  reader = { key: null, notifications: false };
  generation += 1;
  subscribers.clear();
  stopHearing?.();
  stopHearing = null;
  mounted = 0;
}
