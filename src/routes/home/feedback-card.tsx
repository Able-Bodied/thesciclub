import { MessageSquareHeart } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ChatRoom } from '@/lib/chat/types';

/**
 * Feedback on the app goes to the App Feedback room (the owner, 2026-10-28),
 * from Me and from a card in Home's feed. The room was started in the app, so
 * its id is not a fixed one: it is found by its name, and only while open.
 */
export function appFeedbackRoom(rooms: readonly ChatRoom[]): ChatRoom | null {
  return (
    rooms.find((room) => room.openedAt !== null && /^app feedback$/i.test(room.name.trim())) ?? null
  );
}

const HIDDEN_KEY = 'sciclub.feedbackCardHiddenUntil';
const HIDE_DAYS = 30;

function hiddenNow(): boolean {
  try {
    const until = Number(window.localStorage.getItem(HIDDEN_KEY));
    return Number.isFinite(until) && until > Date.now();
  } catch {
    return false;
  }
}

function hideForAWhile(): void {
  try {
    window.localStorage.setItem(HIDDEN_KEY, String(Date.now() + HIDE_DAYS * 86_400_000));
  } catch {
    // Shown again next time, which is the harmless way to fail.
  }
}

const SEEN_KEY = 'sciclub.feedbackCardSeenOn';

/** The member's own calendar day, as YYYY-MM-DD. */
function today(): string {
  const now = new Date();
  return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
}

/** On screen at an earlier visit today (the owner, 2026-11-18: once a day is enough). */
function seenEarlierToday(): boolean {
  try {
    return window.localStorage.getItem(SEEN_KEY) === today();
  } catch {
    return false;
  }
}

/**
 * Half the card on screen for a second counts as seen, as a post on Home does
 * (lib/chat/home-views.ts). It stays until Home is left, and is gone from then
 * until tomorrow.
 */
function useSeenToday(shown: boolean) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (!shown || !element || typeof IntersectionObserver === 'undefined') return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const observer = new IntersectionObserver(
      ([entry]) => {
        clearTimeout(timer);
        if (!entry?.isIntersecting) return;
        timer = setTimeout(() => {
          try {
            window.localStorage.setItem(SEEN_KEY, today());
          } catch {
            // Shown again next visit, which is the harmless way to fail.
          }
          observer.disconnect();
        }, 1000);
      },
      { threshold: 0.5 },
    );
    observer.observe(element);
    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  }, [shown]);
  return ref;
}

/**
 * A card below the first item in Home's feed: tell us what you think. Once a
 * day: seen, it is gone until tomorrow. Not now hides it on this device for a
 * month; Me keeps Send app feedback for always.
 */
export function FeedbackCard({
  rooms,
  linkState,
  className,
}: {
  rooms: readonly ChatRoom[];
  /** Home's own state, so the new topic's Back returns to this pill. */
  linkState: unknown;
  className?: string;
}) {
  const [hidden, setHidden] = useState(() => hiddenNow() || seenEarlierToday());
  const room = appFeedbackRoom(rooms);
  const seenRef = useSeenToday(!hidden && room !== null);
  if (hidden || !room) return null;

  return (
    // An item of the feed's list, drawn only when there is something to show.
    <li className={className}>
      <section
        ref={seenRef}
        aria-labelledby="home-feedback-title"
        className="rounded-[17px] border border-line bg-tint p-3.5"
      >
        <div className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className="grid h-10 w-10 flex-none place-items-center rounded-full bg-paper text-emphasis"
          >
            <MessageSquareHeart className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <h2
              id="home-feedback-title"
              className="font-extrabold font-head text-[1rem] text-ink leading-[1.3]"
            >
              How's the app working for you?
            </h2>
            <p className="mt-0.5 text-[0.84375rem] text-ink2 leading-[1.45]">
              Tell us what works, what doesn't, or what you'd like. It goes to the App Feedback
              room.
            </p>
          </span>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link
            to={`/chat/rooms/${room.id}/new`}
            state={linkState}
            className="flex min-h-11 items-center justify-center rounded-[13px] bg-action px-4 font-bold font-head text-[0.875rem] text-white hover:bg-action-hi"
          >
            Send feedback
          </Link>
          <button
            type="button"
            onClick={() => {
              hideForAWhile();
              setHidden(true);
            }}
            className="flex min-h-11 items-center justify-center rounded-[13px] px-3 font-bold font-head text-[0.875rem] text-emphasis hover:bg-paper"
          >
            Not now
          </button>
        </div>
      </section>
    </li>
  );
}
