import { useEffect, useState } from 'react';
import { InviteFunnel, InvitePerson } from '@/components/invite-tracking';
import { countInvites, fetchEventInviteTracking, type TrackedInvite } from '@/lib/invite-tracking';

/**
 * On an event's guest list, everybody invited to it by email and how each
 * did: opened the email, viewed the event, going, joined the club (the
 * owner, 2026-11-14: "put the invite list on the event itself ... status and
 * what happened in the guestlist"; event_invite_tracking, 20261114040000).
 * Nothing shows until somebody has been invited by email.
 */

const SHOWN = 10;

export function EventInviteTracking({ eventId }: { eventId: string }) {
  const [invites, setInvites] = useState<TrackedInvite[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [all, setAll] = useState(false);

  useEffect(() => {
    let live = true;
    void fetchEventInviteTracking(eventId).then((result) => {
      if (!live) return;
      if (result.ok) {
        setInvites(result.value);
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
  if (!invites || invites.length === 0) return null;
  const shown = all ? invites : invites.slice(0, SHOWN);

  return (
    <section aria-labelledby="invited-by-email" className="mt-5">
      <h2
        id="invited-by-email"
        className="font-extrabold font-head text-[0.75rem] text-grey uppercase tracking-[0.13em]"
      >
        Invited by email
      </h2>
      <p className="mt-1 mb-2 text-[0.75rem] text-grey leading-[1.45]">
        Everyone emailed an invite to this event, and how far each got. “Opened” is approximate:
        some mail apps open every email automatically, and others never report it.
      </p>
      <div className="overflow-hidden rounded-[14px] border border-line bg-paper">
        <div className="px-3 pt-3 pb-2.5">
          <InviteFunnel counts={countInvites(invites)} isEvent />
        </div>
        <ul>
          {shown.map((invite) => (
            <InvitePerson key={invite.id} invite={invite} isEvent />
          ))}
        </ul>
        {invites.length > SHOWN && !all ? (
          <button
            type="button"
            onClick={() => {
              setAll(true);
            }}
            className="block w-full border-line border-t px-3 py-2.5 font-bold font-head text-[0.8125rem] text-emphasis"
          >
            Show all {invites.length}
          </button>
        ) : null}
      </div>
    </section>
  );
}
