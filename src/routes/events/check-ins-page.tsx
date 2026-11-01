import { Printer } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { MemberAvatar } from '@/components/member-avatar';
import { QrCode } from '@/components/qr-code';
import { type CheckedInMember, checkInUrl, fetchCheckIns } from '@/lib/check-ins';
import { useEvents } from '@/lib/events';

/**
 * For an event's organizers (the owner, 2026-10-30; 20261030000000): a QR code
 * to print and put by the door, and who has checked in. The code is only the
 * check-in page's address, so it works from any print of it. The database
 * gives anybody but organizers an empty list.
 */
export default function CheckInsPage() {
  const { id = '' } = useParams<{ id: string }>();
  const { events } = useEvents({ id });
  const event = events.find((e) => e.id === id) ?? null;
  const [people, setPeople] = useState<CheckedInMember[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void fetchCheckIns(id).then((result) => {
      if (!live) return;
      if (result.ok) setPeople(result.value);
      else setError(result.error);
    });
    return () => {
      live = false;
    };
  }, [id]);

  const url = checkInUrl(id);
  const title = event?.title ?? 'The event';

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-[var(--events-measure)] px-4 pt-4 pb-10">
        <Link to={`/events/${id}`} className="font-bold text-[0.875rem] text-emphasis">
          ← {title}
        </Link>
        <h1 className="mt-2 font-extrabold font-display text-[1.5rem] text-ink">Check-ins</h1>
        <p className="mt-1 text-[0.8125rem] text-ink2 leading-[1.45]">
          Print this and put it by the door. Members scan it and tap once. It works from an hour
          before the event to an hour after, and they can check in from the event's page too.
        </p>

        <div className="mx-auto mt-4 w-full max-w-[240px] rounded-[14px] border border-line bg-white p-3">
          <QrCode text={url} label={`QR code to check in to ${title}`} />
        </div>
        <button
          type="button"
          onClick={() => {
            window.print();
          }}
          className="mt-3 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-[13px] border-[1.6px] border-emphasis font-bold font-head text-[0.9375rem] text-emphasis"
        >
          <Printer className="h-[17px] w-[17px]" aria-hidden="true" />
          Print the QR code
        </button>

        <h2 className="mt-6 mb-2.5 font-extrabold font-head text-[0.75rem] text-grey uppercase tracking-[0.13em]">
          Checked in{people ? ` (${String(people.length)})` : ''}
        </h2>
        {error ? (
          <p role="alert" className="text-[0.875rem] text-destructive">
            {error}
          </p>
        ) : null}
        {people?.length === 0 ? <p className="text-[0.875rem] text-ink2">Nobody yet.</p> : null}
        {people && people.length > 0 ? (
          <ul className="rounded-[14px] border border-line bg-paper px-3.5">
            {people.map((person) => (
              <li key={person.id} className="border-line border-b last:border-b-0">
                <Link to={`/peers/${person.id}`} className="flex items-center gap-2.5 py-2.5">
                  <MemberAvatar
                    id={person.id}
                    displayName={person.displayName}
                    photoPath={person.photoPath}
                    photoAlt={person.photoAlt}
                  />
                  <span className="min-w-0 font-bold text-[0.9375rem] text-ink">
                    {person.displayName}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {/* What prints: nothing else on the page (index.css, [data-print-card]). */}
      <div data-print-card="check-in" aria-hidden="true" className="hidden">
        <div className="mx-auto max-w-[6.5in] text-center text-black">
          <p className="font-bold text-[20pt]">Check in</p>
          <p className="mt-2 font-extrabold text-[28pt] leading-tight">{title}</p>
          <div className="mx-auto mt-8 w-[4.5in]">
            <QrCode text={url} label="" />
          </div>
          <p className="mt-8 text-[16pt]">Scan with your phone's camera, then tap I'm here.</p>
          <p className="mt-2 text-[12pt]">The SCI Club</p>
        </div>
      </div>
    </div>
  );
}
