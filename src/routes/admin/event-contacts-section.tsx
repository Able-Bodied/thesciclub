import { useEffect, useState } from 'react';
import { useAnnounce } from '@/lib/announce';
import { useEvents } from '@/lib/events';
import { SmallButton } from '@/routes/admin/controls';
import { contactsAsText, fetchHostContacts, type HostContact } from '@/routes/admin/event-contacts';
import { longWhen } from '@/routes/events/format';

/**
 * The Going list for an event, with one button to copy it.
 *
 * Upcoming events only, from yesterday on, so the list stays the length of
 * what an administrator is about to send rather than the club's history.
 */
export function EventContactsSection() {
  const [from] = useState(() => new Date(Date.now() - 24 * 3_600_000).toISOString());
  const { events, loading, error } = useEvents({ from });
  const [eventId, setEventId] = useState('');
  const [contacts, setContacts] = useState<HostContact[] | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const announce = useAnnounce();

  useEffect(() => {
    if (!eventId) {
      setContacts(null);
      return;
    }
    let current = true;
    setContacts(null);
    setFailure(null);
    void fetchHostContacts(eventId).then((result) => {
      if (!current) return;
      if (result.ok) setContacts(result.contacts);
      else setFailure(result.error);
    });
    return () => {
      current = false;
    };
  }, [eventId]);

  function copy() {
    if (!contacts) return;
    navigator.clipboard.writeText(contactsAsText(contacts)).then(
      () => {
        announce('Copied.');
      },
      () => {
        announce('Could not copy. Select the list and copy it by hand.');
      },
    );
  }

  const going = events.filter((e) => e.goingCount > 0);

  return (
    <section className="rounded-[14px] border border-line bg-paper p-3.5">
      <h2 className="font-bold font-head text-[0.875rem] text-ink">Who is going</h2>
      <p className="mt-1 text-[0.78125rem] text-grey leading-[1.45]">
        Each member who chose Going shares their email, and their phone number if they added one,
        with the host of that event. Copy the list and pass it on.
      </p>

      {error ? (
        <p role="alert" className="mt-2.5 text-[0.8125rem] text-destructive">
          {error}
        </p>
      ) : null}

      <label htmlFor="admin-going-event" className="mt-3 block font-bold text-[0.75rem] text-ink">
        Event
      </label>
      <select
        id="admin-going-event"
        value={eventId}
        disabled={loading}
        onChange={(e) => {
          setEventId(e.target.value);
        }}
        className="mt-1.5 w-full rounded-[11px] border-[1.6px] border-line bg-paper px-3 py-2 text-[0.9375rem] outline-none focus:border-emphasis"
      >
        <option value="">{loading ? 'Loading events…' : 'Choose an event'}</option>
        {going.map((e) => (
          <option key={e.id} value={e.id}>
            {e.title} — {longWhen(e.startTime, e.timezone)} ({e.goingCount})
          </option>
        ))}
      </select>
      {!loading && going.length === 0 ? (
        <p className="mt-2.5 text-[0.8125rem] text-grey">Nobody has chosen Going yet.</p>
      ) : null}

      {failure ? (
        <p role="alert" className="mt-2.5 text-[0.8125rem] text-destructive">
          {failure}
        </p>
      ) : null}

      {contacts ? (
        <div className="mt-3">
          {contacts.length === 0 ? (
            <p className="text-[0.8125rem] text-grey">Nobody is going to this one yet.</p>
          ) : (
            <>
              <ul className="overflow-hidden rounded-[11px] border border-line">
                {contacts.map((c) => (
                  <li
                    key={c.memberId}
                    className="border-line border-b px-3 py-2.5 text-[0.84375rem] last:border-b-0"
                  >
                    <span className="block font-bold text-ink">{c.displayName}</span>
                    <span className="block break-words text-grey">
                      {c.email ?? 'no email yet'}
                      {c.phone ? ` · ${c.phone}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="mt-2.5">
                <SmallButton onClick={copy}>Copy the list</SmallButton>
              </div>
            </>
          )}
        </div>
      ) : null}
    </section>
  );
}
