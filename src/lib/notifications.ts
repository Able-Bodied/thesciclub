import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAccount } from '@/lib/account';
import { useRealtimeRows } from '@/lib/chat/realtime';
import { coalesce, RECOUNT_MS } from '@/lib/coalesce';
import { describeError, describeThrown, type Failure } from '@/lib/describe-error';
import { californiaToday, grantDay } from '@/lib/grants';
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
  | 'event_starting'
  | 'invite_request'
  | 'org_events'
  | 'grant_open'
  | 'profile_reminder'
  | 'blocks_weekly'
  | 'reaction'
  | 'mention'
  | 'introduction';

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

/**
 * A pressed push: its tag came back in the address as `n`
 * (20261028900000), and clears that one thing only.
 */
export async function markNotificationsReadByTag(tag: string): Promise<void> {
  try {
    await getSupabase().rpc('notifications_mark_read_by_tag', { notification_tag: tag });
  } catch {
    // The next open of what it is about, or of the bell, clears it.
  }
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
export function useUnseenNotifications(): {
  count: number;
  /** False until the first count is back, so a bell knows a rise is news. */
  loaded: boolean;
  refresh: () => void;
} {
  const account = useAccount();
  const memberId = account.status === 'member' ? account.userId : null;
  const [count, setCount] = useState<number | null>(null);

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

  // A burst of notifications or focus changes is one recount.
  const soon = useMemo(() => coalesce(refresh, RECOUNT_MS), [refresh]);

  useEffect(() => {
    refresh();
    const onVisible = () => {
      if (document.visibilityState === 'visible') soon();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener(NOTIFICATIONS_CHANGED, soon);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener(NOTIFICATIONS_CHANGED, soon);
      soon.cancel();
    };
  }, [refresh, soon]);

  useRealtimeRows({
    table: 'notifications',
    filter: memberId ? `member_id=eq.${memberId}` : undefined,
    onChange: soon,
    enabled: memberId !== null,
  });

  return { count: memberId ? (count ?? 0) : 0, loaded: count !== null, refresh };
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
    // detail is 'message:👍' or 'post:👍' (20261028000000).
    case 'reaction': {
      const [target, ...rest] = (n.detail ?? '').split(':');
      const emoji = rest.join(':').trim();
      const what =
        target === 'message'
          ? `your message${n.place ? ` in ${n.place}` : ''}`
          : `your post in ${quoted(n.place)}`;
      if (more > 0)
        return `${name} and ${more} ${more === 1 ? 'other' : 'others'} reacted to ${what}`;
      return emoji ? `${name} reacted ${emoji} to ${what}` : `${name} reacted to ${what}`;
    }
    // An @username in a post (20261029070000): once a post.
    case 'mention':
      return `${name} mentioned you in ${quoted(n.place)}`;
    // By a trusted partner (20261029100000): detail 'asked', or 'opened' once
    // both said yes, when place is the group.
    case 'introduction':
      return n.detail === 'opened'
        ? `${name} said yes: ${n.place ?? 'your introduction'} is open`
        : `${name} would like to introduce you to ${n.place ?? 'another member'}`;
    case 'group_add':
      return `${name} added you to ${n.place ?? 'a group'}`;
    case 'report':
      return n.count > 1 ? `${n.count} new reports to look at` : 'A member reported something';
    case 'invite_joined': {
      // From an administrator's QR code, detail is 'qr:' and the event, if
      // any (20261014020000).
      if (n.detail?.startsWith('qr:')) {
        const event = n.detail.slice('qr:'.length);
        const who = n.place ?? 'Somebody';
        return event
          ? `${who} joined from your QR code at ${event}`
          : `${who} joined from your QR code`;
      }
      return `${n.place ?? 'Somebody you invited'} joined the club on your invite`;
    }
    case 'event_reminder':
      return n.detail
        ? `Tomorrow at ${n.detail}: ${n.place ?? 'an event you are going to'}`
        : `Tomorrow: ${n.place ?? 'an event you are going to'}`;
    // Ten minutes before (20261028980000).
    case 'event_starting':
      return n.detail
        ? `Starting at ${n.detail}: ${n.place ?? 'an event you are going to'}`
        : `Starting soon: ${n.place ?? 'an event you are going to'}`;
    // place is the organization, detail who asked (20261029030000).
    case 'invite_request':
      return n.count > 1
        ? `${n.count} people asked for an invite${n.place ? ` through ${n.place}` : ''}`
        : `${n.detail ?? 'Somebody'} asked you for an invite${n.place ? ` through ${n.place}` : ''}`;
    case 'org_events': {
      const added = Number(n.detail);
      const what = Number.isInteger(added) && added > 1 ? `${added} new events` : 'a new event';
      return `${n.place ?? 'An organization you follow'} added ${what}`;
    }
    // detail is the day applications close, as YYYY-MM-DD.
    case 'grant_open': {
      const grant = n.excerpt ?? 'A grant';
      const who = n.place ? ` from ${n.place}` : '';
      return n.detail
        ? `${grant}${who} is open for applications until ${grantDay(n.detail, californiaToday())}`
        : `${grant}${who} is open for applications`;
    }
    // detail is the step (20261022040000).
    case 'profile_reminder':
      return n.detail === 'details'
        ? 'Finish Your details, so other members can find you'
        : 'Finish your profile, so members can find what you have in common';
    // An administrator's weekly count (20261022090000): nobody named.
    case 'blocks_weekly': {
      const blocked = Number(n.detail);
      if (!Number.isInteger(blocked) || blocked < 1) return 'Members were blocked this week';
      return blocked === 1
        ? '1 member was blocked this week'
        : `${blocked} members were blocked this week`;
    }
    default:
      return 'Something new in the club';
  }
}
