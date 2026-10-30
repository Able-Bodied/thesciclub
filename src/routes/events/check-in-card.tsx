import { Check } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useMyCheckIn } from '@/lib/check-ins';

/**
 * "Check in" (the owner, 2026-10-30; 20261030000000), on the event's page
 * while check-in is open and on the page a printed QR code opens. Saying so
 * when it makes somebody an organization's member, with the way to leave.
 */
export function CheckInCard({
  eventId,
  memberId,
  organizationId,
}: {
  eventId: string;
  memberId: string | null;
  organizationId: string | null;
}) {
  const { checkedIn, joined, busy, error, checkIn } = useMyCheckIn(eventId, memberId);

  if (checkedIn) {
    return (
      <div role="status" className="mt-5 rounded-[14px] border border-line bg-paper p-3.5">
        <p className="flex items-center gap-2 font-bold text-[0.9375rem] text-ink">
          <Check className="h-[18px] w-[18px] flex-none text-emphasis" aria-hidden="true" />
          You're checked in
        </p>
        {joined && organizationId ? (
          <p className="mt-1 text-[0.8125rem] text-ink2 leading-[1.45]">
            You're now a member of {joined}, and in its members' group chat.{' '}
            <Link
              to={`/events/organizations/${organizationId}`}
              className="font-bold text-emphasis underline"
            >
              See {joined}
            </Link>
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="mt-5">
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          void checkIn();
        }}
        className="flex min-h-12 w-full items-center justify-center gap-2 rounded-[13px] bg-gold font-bold font-head text-[0.9375rem] text-on-gold disabled:opacity-50"
      >
        {busy ? 'Checking in…' : "I'm here: check in"}
      </button>
      {error ? (
        <p role="alert" className="mt-2 text-[0.8125rem] text-destructive leading-[1.45]">
          {error}
        </p>
      ) : null}
    </div>
  );
}
