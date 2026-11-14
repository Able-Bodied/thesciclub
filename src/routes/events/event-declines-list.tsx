import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { type EventDecline, fetchEventDeclines } from '@/lib/event-declines';

/**
 * On an event's guest list, the members who said Can't go on its page
 * (20261114080000; the owner, 2026-11-14), so whoever asked them has their
 * answer. Organizers only, as the guest list is; nothing shows while nobody
 * has said it.
 */
export function EventDeclinesList({ eventId }: { eventId: string }) {
  const [declines, setDeclines] = useState<EventDecline[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void fetchEventDeclines(eventId).then((result) => {
      if (!live) return;
      if (result.ok) {
        setDeclines(result.value);
        setError(null);
      } else setError(result.error);
    });
    return () => {
      live = false;
    };
  }, [eventId]);

  if (error) {
    return (
      <p role="alert" className="mt-4 text-[0.8125rem] text-destructive">
        {error}
      </p>
    );
  }
  if (!declines || declines.length === 0) return null;

  return (
    <section aria-labelledby="cant-go" className="mt-5">
      <h2
        id="cant-go"
        className="font-extrabold font-head text-[0.75rem] text-grey uppercase tracking-[0.13em]"
      >
        {`Can’t go (${String(declines.length)})`}
      </h2>
      <p className="mt-1 mb-2 text-[0.75rem] text-grey leading-[1.45]">
        Members who said they can’t come. Only the event’s organizers see this.
      </p>
      <ul className="rounded-[14px] border border-line bg-paper px-3.5">
        {declines.map((decline) => (
          <li key={decline.memberId} className="border-line border-b py-3 last:border-b-0">
            <Link
              to={`/peers/${decline.memberId}`}
              className="font-bold text-[0.9375rem] text-ink underline-offset-2 hover:underline"
            >
              {decline.name}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
