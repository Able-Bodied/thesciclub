import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAnnounce } from '@/lib/announce';
import {
  fetchGuestList,
  GUEST_STATE_LABEL,
  type Guest,
  type GuestState,
  guestListCsv,
  inviteGuest,
} from '@/lib/event-audience';
import { useEvents } from '@/lib/events';
import { addedButNotSent, sendInvite } from '@/lib/send-invite';
import { cn } from '@/lib/utils';

/**
 * An event's guest list, for its organizers and the club's administrators
 * (event_guest_list, 20261022190000): members who said Going or Interested,
 * and people who registered on its public page and are not members yet. The
 * database refuses anybody else.
 *
 * "Not confirmed" is somebody who only filled in the form: the address has
 * not been proven theirs. "Joining" has an account and has not finished.
 */

const TAG: Record<GuestState, string> = {
  member: 'bg-[#e3efe6] text-[#23633a]',
  joining: 'bg-gold-lt text-gold-dp',
  unconfirmed: 'bg-tint text-ink2',
};

export default function GuestListPage() {
  const { id = '' } = useParams<{ id: string }>();
  const announce = useAnnounce();
  const { events } = useEvents({ id });
  const event = events.find((e) => e.id === id) ?? null;
  const [guests, setGuests] = useState<Guest[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchGuestList(id).then((result) => {
      if (cancelled) return;
      if (result.ok) setGuests(result.value);
      else setError(result.error);
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const going = guests?.filter((g) => g.status === 'going').length ?? 0;
  const interested = guests?.filter((g) => g.status === 'interested').length ?? 0;
  const outside = guests?.filter((g) => g.state !== 'member').length ?? 0;

  function copyList() {
    if (!guests) return;
    const text = guests
      .map((g) =>
        [g.name, g.status === 'going' ? 'Going' : 'Interested', g.email, g.phone]
          .filter(Boolean)
          .join(' · '),
      )
      .join('\n');
    void navigator.clipboard.writeText(text).then(
      () => {
        announce('The guest list is copied.');
      },
      () => {
        announce('Could not copy the list.');
      },
    );
  }

  function downloadCsv() {
    if (!guests) return;
    const blob = new Blob([guestListCsv(guests)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${(event?.title ?? 'event').replace(/[^\w -]+/g, '').trim() || 'event'} guests.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-[var(--events-measure)] px-4 pt-4 pb-10">
        <Link to={`/events/${id}`} className="font-bold text-[0.875rem] text-emphasis">
          ← {event?.title ?? 'The event'}
        </Link>
        <h1 className="mt-2 font-extrabold font-display text-[1.5rem] text-ink">Guest list</h1>
        <p className="mt-1 text-[0.8125rem] text-ink2 leading-[1.45]">
          For the event's organizers and the club's administrators only. Members are listed when
          they RSVP. Registrations from the public page are listed either way.
        </p>

        {error ? (
          <p role="alert" className="mt-4 text-[0.875rem] text-destructive">
            {error}
          </p>
        ) : null}
        {guests === null && !error ? (
          <p role="status" className="py-8 text-center text-[0.875rem] text-grey">
            Loading…
          </p>
        ) : null}

        {guests ? (
          <>
            <dl className="mt-4 grid grid-cols-3 gap-2">
              {[
                ['Going', going],
                ['Interested', interested],
                ['Not in the club', outside],
              ].map(([label, value]) => (
                <div key={label} className="rounded-[12px] border border-line bg-paper px-3 py-2">
                  <dd className="font-extrabold font-head text-[1.25rem] text-ink">{value}</dd>
                  <dt className="text-[0.75rem] text-grey">{label}</dt>
                </div>
              ))}
            </dl>

            {guests.length === 0 ? (
              <p className="mt-6 text-center text-[0.875rem] text-ink2">Nobody yet.</p>
            ) : (
              <ul className="mt-3 rounded-[14px] border border-line bg-paper px-3.5">
                {guests.map((guest, index) => (
                  <li
                    // Name and address together are the guest; the index keeps
                    // two who typed the same name apart.
                    key={`${guest.email ?? ''}-${guest.name}-${String(index)}`}
                    className="flex items-start justify-between gap-3 border-line border-b py-3 last:border-b-0"
                  >
                    <span className="min-w-0">
                      <span className="block font-bold text-[0.9375rem] text-ink">
                        {guest.name}
                      </span>
                      <span className="block break-words text-[0.8125rem] text-ink2 leading-[1.45]">
                        {[
                          guest.status === 'going' ? 'Going' : 'Interested',
                          guest.email,
                          guest.phone,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                      <GuestInvite
                        guest={guest}
                        onInvited={(inviteId) => {
                          setGuests((current) =>
                            (current ?? []).map((g) =>
                              g === guest ? { ...g, invite: 'pending', inviteId } : g,
                            ),
                          );
                        }}
                      />
                    </span>
                    <span
                      className={cn(
                        'flex-none whitespace-nowrap rounded-full px-2.5 py-1 font-bold font-head text-[0.6875rem]',
                        TAG[guest.state],
                      )}
                    >
                      {GUEST_STATE_LABEL[guest.state]}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {guests.length > 0 ? (
              <div className="mt-4 flex gap-2.5">
                <button
                  type="button"
                  onClick={copyList}
                  className="flex min-h-[46px] flex-1 items-center justify-center rounded-[13px] border-[1.6px] border-emphasis bg-paper font-bold font-head text-[0.875rem] text-emphasis"
                >
                  Copy the list
                </button>
                <button
                  type="button"
                  onClick={downloadCsv}
                  className="flex min-h-[46px] flex-1 items-center justify-center rounded-[13px] border-[1.6px] border-emphasis bg-paper font-bold font-head text-[0.875rem] text-emphasis"
                >
                  Download CSV
                </button>
              </div>
            ) : null}
            <p className="mt-3 text-[0.75rem] text-grey leading-[1.5]">
              <b>Member</b>: in the club. <b>Joining</b>: signed up, not finished.{' '}
              <b>Not confirmed</b>: filled in the form only; the address has not been proven theirs.
            </p>
          </>
        ) : null}
      </div>
    </div>
  );
}

/**
 * For somebody who registered on the public page and is not in the club (the
 * owner, 2026-11-04): an invite to their address, whose link starts
 * onboarding with the name and phone they gave (20261104000000). Once on the
 * list, it says so, and offers to send the email again where this viewer may.
 */
function GuestInvite({
  guest,
  onInvited,
}: {
  guest: Guest;
  onInvited: (inviteId: string) => void;
}) {
  const announce = useAnnounce();
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<{ text: string; failed: boolean } | null>(null);

  if (!guest.registrationId || guest.state === 'member' || guest.invite === 'consumed') {
    return null;
  }
  const registrationId = guest.registrationId;

  function invite() {
    setBusy(true);
    setSaid(null);
    void inviteGuest(registrationId).then((result) => {
      setBusy(false);
      if (!result.ok) {
        setSaid({ text: result.error, failed: true });
        return;
      }
      onInvited(result.inviteId);
      if (result.sendError) {
        setSaid({ text: addedButNotSent(result.sendError), failed: true });
        return;
      }
      setSaid({ text: `Invite sent to ${guest.email ?? 'them'}.`, failed: false });
      announce(`Invite sent to ${guest.name}.`);
    });
  }

  function sendAgain(inviteId: string) {
    setBusy(true);
    setSaid(null);
    void sendInvite(inviteId).then((result) => {
      setBusy(false);
      setSaid(
        result.ok
          ? { text: `Sent again to ${guest.email ?? 'them'}.`, failed: false }
          : { text: result.error, failed: true },
      );
    });
  }

  return (
    <span className="mt-1.5 block">
      {guest.invite === 'pending' ? (
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="font-bold text-[0.8125rem] text-ink2">Invited</span>
          {guest.inviteId ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                if (guest.inviteId) sendAgain(guest.inviteId);
              }}
              className="min-h-11 font-bold text-[0.8125rem] text-emphasis underline underline-offset-2 disabled:opacity-50"
            >
              Send again
            </button>
          ) : null}
        </span>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={invite}
          aria-label={`Invite ${guest.name} to the club`}
          className="inline-flex min-h-11 items-center rounded-[11px] bg-action px-3.5 font-bold font-head text-[0.8125rem] text-white transition-colors hover:bg-action-hi disabled:opacity-50"
        >
          {busy ? 'Sending…' : 'Invite to the club'}
        </button>
      )}
      {said ? (
        <span
          role={said.failed ? 'alert' : 'status'}
          className={cn(
            'mt-1 block text-[0.78125rem] leading-[1.45]',
            said.failed ? 'text-danger-ink' : 'text-ink2',
          )}
        >
          {said.text}
        </span>
      ) : null}
    </span>
  );
}
