import { Check } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { readDraft, writeDraft } from '@/lib/chat/drafts';
import { messageAboutMissedCheckIn, useMyCheckIn } from '@/lib/check-ins';

/**
 * "Check in" (the owner, 2026-10-30; 20261030000000), on the event's page
 * around the event and on the page a printed QR code opens. Saying so
 * when it makes somebody an organization's member, with the way to leave.
 */
/** The same button, unlit, until an hour before the event (the owner, 2026-10-31). */
export function CheckInNotYet() {
  return (
    <div className="mt-5">
      <button
        type="button"
        disabled
        className="flex min-h-12 w-full items-center justify-center gap-2 rounded-[13px] bg-line font-bold font-head text-[0.9375rem] text-ink2"
      >
        I'm here: check in
      </button>
      <p className="mt-2 text-center text-[0.8125rem] text-ink2 leading-[1.45]">
        Check-in opens an hour before the event.
      </p>
    </div>
  );
}

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

/**
 * Once check-in has closed (the owner, 2026-11-13): "If it is closed add an
 * option to message an admin about it." For the week after it closes
 * (`offerHelp`), a button opens a conversation with the event's organizer or
 * else an administrator (check_in_missed), with a first line in the box to
 * send or change. Somebody who did check in is told so instead.
 */
export function CheckInClosed({
  eventId,
  eventTitle,
  memberId,
  offerHelp,
}: {
  eventId: string;
  eventTitle: string;
  memberId: string | null;
  offerHelp: boolean;
}) {
  const { checkedIn } = useMyCheckIn(eventId, memberId);
  const navigate = useNavigate();
  const [opening, setOpening] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  if (checkedIn) {
    return (
      <p className="mt-5 flex items-center gap-2 rounded-[14px] border border-line bg-paper p-3.5 font-bold text-[0.875rem] text-ink">
        <Check className="h-[18px] w-[18px] flex-none text-emphasis" aria-hidden="true" />
        You checked in to this event
      </p>
    );
  }

  const canAsk = offerHelp && memberId !== null;
  return (
    <div className="mt-5 rounded-[14px] border border-line bg-paper p-3.5">
      <p className="text-[0.875rem] text-ink2 leading-[1.5]">
        Check-in for this event has closed.
        {canAsk ? ' Were you there and missed it? Let an admin know.' : null}
      </p>
      {canAsk ? (
        <>
          <button
            type="button"
            disabled={opening}
            onClick={() => {
              setOpening(true);
              setFailure(null);
              void messageAboutMissedCheckIn(eventId).then((result) => {
                if (!result.ok) {
                  setFailure(result.error);
                  setOpening(false);
                  return;
                }
                const key = `thread:${result.value}`;
                if (!readDraft(key)) {
                  writeDraft(key, `Hi, I was at ${eventTitle} but missed the check-in.`);
                }
                void navigate(`/chat/t/${result.value}`);
              });
            }}
            className="mt-3 flex min-h-11 w-full items-center justify-center rounded-[13px] border-[1.6px] border-emphasis px-4 font-bold font-head text-[0.875rem] text-emphasis disabled:opacity-50"
          >
            {opening ? 'Opening…' : 'Message an admin'}
          </button>
          {failure ? (
            <p role="alert" className="mt-2 text-[0.8125rem] text-destructive leading-[1.45]">
              {failure}
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
