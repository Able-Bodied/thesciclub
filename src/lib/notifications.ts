import { useCallback, useEffect, useState } from 'react';
import { useAccount } from '@/lib/account';
import { useRealtimeRows } from '@/lib/chat/realtime';
import { describeError, describeThrown, type Failure } from '@/lib/describe-error';
import { getSupabase } from '@/lib/supabase';

/**
 * The notifications list (20261010000000): what each member was notified
 * about in the last thirty days, as it is now.
 *
 * Rows hold references and the database reads the words, names and
 * addresses when listed (my_notifications), so a post taken back shows no
 * words and a topic moved to another room opens there.
 */
export interface AppNotification {
  id: string;
  kind: NotificationKind;
  /** How many arrived under this one while it was unread: messages, replies, likes. */
  count: number;
  createdAt: string;
  seen: boolean;
  read: boolean;
  actorId: string | null;
  actorName: string | null;
  actorPhoto: string | null;
  /** The conversation, topic, event, organization or member it is about. */
  place: string | null;
  /** The start of the message or post, while it stands. */
  excerpt: string | null;
  /** An event's start time, or how many new events. */
  detail: string | null;
  url: string;
}

export type NotificationKind =
  | 'direct'
  | 'group'
  | 'reply'
  | 'reply_participant'
  | 'like'
  | 'group_add'
  | 'report'
  | 'invite_joined'
  | 'event_reminder'
  | 'org_events';

interface Row {
  id: string;
  kind: NotificationKind;
  count: number;
  created_at: string;
  seen: boolean;
  read: boolean;
  actor_id: string | null;
  actor_name: string | null;
  actor_photo: string | null;
  place: string | null;
  excerpt: string | null;
  detail: string | null;
  url: string | null;
}

/** How many a page asks for. */
export const NOTIFICATIONS_PAGE = 40;

function toNotification(row: Row): AppNotification {
  return {
    id: row.id,
    kind: row.kind,
    count: row.count,
    createdAt: row.created_at,
    seen: row.seen,
    read: row.read,
    actorId: row.actor_id,
    actorName: row.actor_name,
    actorPhoto: row.actor_photo,
    place: row.place,
    excerpt: row.excerpt,
    detail: row.detail,
    url: row.url ?? '/home',
  };
}

export async function loadNotifications(
  before: string | null = null,
): Promise<{ ok: true; notifications: AppNotification[] } | { ok: false; error: string }> {
  try {
    const { data, error } = (await getSupabase().rpc('my_notifications', {
      before,
      max_rows: NOTIFICATIONS_PAGE,
    })) as { data: Row[] | null; error: Failure | null };
    if (error) return { ok: false, error: describeError(error, 'Could not load notifications.') };
    return { ok: true, notifications: (data ?? []).map(toNotification) };
  } catch (e) {
    return { ok: false, error: describeThrown(e, 'Could not load notifications.') };
  }
}

/** The bell stops counting what is already listed. */
export async function markNotificationsSeen(): Promise<void> {
  await getSupabase().rpc('notifications_mark_seen');
}

/** One notification, or every one (no id). */
export async function markNotificationsRead(id?: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const { error } = await getSupabase().rpc('notifications_mark_read', {
      notification: id ?? null,
    });
    return error
      ? { ok: false, error: describeError(error, 'Could not mark that read.') }
      : { ok: true };
  } catch (e) {
    return { ok: false, error: describeThrown(e, 'Could not mark that read.') };
  }
}

/**
 * The number on the bell: arrived since the list was last opened. Live, so
 * a reply landing while somebody is on Home shows without a reload, and read
 * again whenever the app comes back to the front.
 */
export function useUnseenNotifications(): { count: number; refresh: () => void } {
  const account = useAccount();
  const memberId = account.status === 'member' ? account.userId : null;
  const [count, setCount] = useState(0);

  const refresh = useCallback(() => {
    if (!memberId) return;
    void (
      getSupabase().rpc('my_unseen_notification_count') as unknown as Promise<{
        data: number | null;
        error: Failure | null;
      }>
    )
      .then(({ data, error }) => {
        if (!error) setCount(data ?? 0);
      })
      .catch(() => undefined);
  }, [memberId]);

  useEffect(() => {
    refresh();
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener(NOTIFICATIONS_CHANGED, refresh);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener(NOTIFICATIONS_CHANGED, refresh);
    };
  }, [refresh]);

  useRealtimeRows({
    table: 'notifications',
    filter: memberId ? `member_id=eq.${memberId}` : undefined,
    onChange: refresh,
    enabled: memberId !== null,
  });

  return { count: memberId ? count : 0, refresh };
}

/**
 * Said by the list after it marks things seen or read, so every bell on the
 * screen (Home's and the desktop bar's) reads its number again at once.
 */
export const NOTIFICATIONS_CHANGED = 'club:notifications-changed';

export function announceNotificationsChanged(): void {
  window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED));
}

/** In quotes, and short: a topic's title or an event's, inside a sentence. */
function quoted(place: string | null): string {
  if (!place) return 'a topic';
  return `“${place.length > 60 ? `${place.slice(0, 59).trimEnd()}…` : place}”`;
}

/**
 * What a notification says, in the words a lock screen uses (compose.ts in
 * push-notify), with the count it gathered while unread.
 */
export function notificationSentence(n: AppNotification): string {
  const given = n.actorName?.trim() ?? '';
  const name = given === '' ? 'A member' : given;
  const more = n.count - 1;
  switch (n.kind) {
    case 'direct':
      return n.count > 1 ? `${n.count} messages from ${name}` : `Message from ${name}`;
    case 'group':
      return n.count > 1
        ? `${n.count} new messages in ${n.place ?? 'a group'}`
        : `${name} wrote in ${n.place ?? 'a group'}`;
    case 'reply':
      return n.count > 1
        ? `${n.count} new replies to your topic ${quoted(n.place)}`
        : `${name} replied to your topic ${quoted(n.place)}`;
    case 'reply_participant':
      return n.count > 1
        ? `${n.count} new replies in ${quoted(n.place)}`
        : `${name} replied in ${quoted(n.place)}`;
    case 'like':
      return more > 0
        ? `${name} and ${more} ${more === 1 ? 'other' : 'others'} liked your post in ${quoted(n.place)}`
        : `${name} liked your post in ${quoted(n.place)}`;
    case 'group_add':
      return `${name} added you to ${n.place ?? 'a group'}`;
    case 'report':
      return n.count > 1 ? `${n.count} new reports to look at` : 'A member reported something';
    case 'invite_joined':
      return `${n.place ?? 'Somebody you invited'} joined the club on your invite`;
    case 'event_reminder':
      return n.detail
        ? `Tomorrow at ${n.detail}: ${n.place ?? 'an event you are going to'}`
        : `Tomorrow: ${n.place ?? 'an event you are going to'}`;
    case 'org_events': {
      const added = Number(n.detail);
      const what = Number.isInteger(added) && added > 1 ? `${added} new events` : 'a new event';
      return `${n.place ?? 'An organization you follow'} added ${what}`;
    }
    default:
      return 'Something new in the club';
  }
}
