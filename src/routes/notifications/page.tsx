import {
  AtSign,
  CalendarDays,
  Flag,
  Heart,
  type LucideIcon,
  MessageCircle,
  UserPlus,
  Users,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MemberAvatar } from '@/components/member-avatar';
import { chatTime } from '@/lib/chat/time';
import {
  type AppNotification,
  announceNotificationsChanged,
  loadNotifications,
  markNotificationsRead,
  markNotificationsSeen,
  NOTIFICATIONS_PAGE,
  type NotificationKind,
  notificationSentence,
} from '@/lib/notifications';
import { cn } from '@/lib/utils';

/**
 * Everything the club notified a member about in the last thirty days
 * (20261010000000), newest first.
 *
 * Opening the list clears the bell: what is here has been seen. Each row stays
 * marked as new until it is pressed, or until the conversation or topic it is
 * about is read some other way. Pressing one opens what it is about: the
 * message, the post, the event.
 *
 * Rows say what happened in the words the lock screen uses, with the start of
 * the message or post under it while that still stands.
 */
const KIND_ICON: Record<NotificationKind, LucideIcon> = {
  direct: MessageCircle,
  group: Users,
  reply: MessageCircle,
  reply_participant: MessageCircle,
  like: Heart,
  group_add: UserPlus,
  report: Flag,
  invite_joined: AtSign,
  event_reminder: CalendarDays,
  org_events: CalendarDays,
};

export default function NotificationsPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const load = useCallback(async () => {
    const result = await loadNotifications();
    if (!result.ok) {
      setError(result.error);
      setLoading(false);
      return;
    }
    setItems(result.notifications);
    setMore(result.notifications.length === NOTIFICATIONS_PAGE);
    setError(null);
    setLoading(false);
    // After they are on screen, so "seen" means seen.
    if (result.notifications.some((n) => !n.seen)) {
      await markNotificationsSeen().catch(() => undefined);
      announceNotificationsChanged();
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function loadEarlier() {
    const last = items.at(-1);
    if (!last) return;
    setLoadingMore(true);
    const result = await loadNotifications(last.createdAt);
    setLoadingMore(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setItems((current) => [...current, ...result.notifications]);
    setMore(result.notifications.length === NOTIFICATIONS_PAGE);
  }

  function open(item: AppNotification) {
    if (!item.read) {
      setItems((current) => current.map((n) => (n.id === item.id ? { ...n, read: true } : n)));
      void markNotificationsRead(item.id).then(announceNotificationsChanged);
    }
    void navigate(item.url);
  }

  async function readAll() {
    const result = await markNotificationsRead();
    if (!result.ok) {
      setError(result.error ?? 'Could not mark them read.');
      return;
    }
    setItems((current) => current.map((n) => ({ ...n, read: true, seen: true })));
    announceNotificationsChanged();
  }

  const unread = items.filter((n) => !n.read).length;

  return (
    <div className="flex flex-1 flex-col overflow-y-auto">
      <header className="flex-none border-line border-b bg-paper px-[18px] pt-[18px] pb-3">
        <div className="mx-auto flex w-full max-w-[var(--events-measure)] flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="font-extrabold font-display text-[1.5625rem] text-ink tracking-[-0.01em]">
              Notifications
            </h1>
            <p className="mt-0.5 text-[0.78125rem] text-grey">The last 30 days.</p>
          </div>
          {unread > 0 ? (
            <button
              type="button"
              onClick={() => {
                void readAll();
              }}
              className="min-h-[44px] rounded-full bg-tint px-4 font-semibold text-[0.84375rem] text-emphasis hover:bg-line"
            >
              Mark all as read
            </button>
          ) : null}
        </div>
      </header>

      <div className="mx-auto w-full max-w-[var(--events-measure)] px-4 py-4">
        {error ? (
          <p
            role="alert"
            className="mb-3 rounded-[11px] border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-[0.8125rem] text-destructive leading-[1.45]"
          >
            {error}
          </p>
        ) : null}
        {loading ? (
          <p role="status" className="py-10 text-center text-[0.875rem] text-grey">
            Loading…
          </p>
        ) : items.length === 0 && !error ? (
          <div className="rounded-[14px] border border-line bg-paper px-4 py-6 text-center">
            <p className="font-bold font-head text-[0.9375rem] text-ink">Nothing yet</p>
            <p className="mt-1 text-[0.8125rem] text-ink2 leading-[1.5]">
              Messages, replies, likes and event reminders show here for 30 days.
            </p>
          </div>
        ) : (
          <ul className="overflow-hidden rounded-[14px] border border-line bg-paper">
            {items.map((item) => (
              <li key={item.id} className="border-line border-b last:border-b-0">
                <NotificationRow
                  item={item}
                  onOpen={() => {
                    open(item);
                  }}
                />
              </li>
            ))}
          </ul>
        )}
        {more ? (
          <button
            type="button"
            disabled={loadingMore}
            onClick={() => {
              void loadEarlier();
            }}
            className="mt-3 flex min-h-[48px] w-full items-center justify-center rounded-[13px] border border-line bg-paper font-bold font-head text-[0.875rem] text-emphasis disabled:opacity-50"
          >
            {loadingMore ? 'Loading…' : 'Show earlier'}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function NotificationRow({ item, onOpen }: { item: AppNotification; onOpen: () => void }) {
  const Icon = KIND_ICON[item.kind];
  const sentence = notificationSentence(item);
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        'flex w-full items-start gap-3 px-3.5 py-3 text-left transition-colors hover:bg-tint',
        !item.read && 'bg-tint/60',
      )}
    >
      <span aria-hidden="true" className="relative flex-none">
        {item.actorId && item.actorName ? (
          <MemberAvatar
            id={item.actorId}
            displayName={item.actorName}
            photoPath={item.actorPhoto}
            className="h-[2.75em] w-[2.75em] rounded-[12px] text-[0.8125rem]"
          />
        ) : (
          <span className="grid h-[2.75em] w-[2.75em] place-items-center rounded-[12px] bg-tint text-[0.8125rem] text-emphasis">
            <Icon className="h-[1.4em] w-[1.4em]" />
          </span>
        )}
        {item.actorId && item.actorName ? (
          <span className="-right-1 -bottom-1 absolute grid h-[1.6em] w-[1.6em] place-items-center rounded-full bg-paper text-[0.75rem] text-emphasis ring-1 ring-line">
            <Icon className="h-[0.95em] w-[0.95em]" />
          </span>
        ) : null}
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            'block text-[0.9375rem] text-ink leading-[1.4]',
            item.read ? 'font-medium' : 'font-bold',
          )}
        >
          {item.read ? null : <span className="sr-only">New: </span>}
          {sentence}
        </span>
        {item.excerpt ? (
          <span className="mt-0.5 line-clamp-2 block whitespace-pre-line text-[0.84375rem] text-ink2 leading-[1.45]">
            {item.excerpt}
          </span>
        ) : null}
        <span className="mt-1 block text-[0.75rem] text-grey">{chatTime(item.createdAt)}</span>
      </span>
      {item.read ? null : (
        <span aria-hidden="true" className="mt-2 h-2.5 w-2.5 flex-none rounded-full bg-emphasis" />
      )}
    </button>
  );
}
