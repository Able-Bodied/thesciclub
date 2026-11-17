import { ChevronDown, Mail } from 'lucide-react';
import { useEffect, useState } from 'react';
import { fetchInvitationEmails, type InvitationEmail } from '@/lib/events';
import { safeHref } from '@/routes/events/rich-text';

/** What the club did with the email, as its line says it. */
export function whatItDid(email: InvitationEmail): string {
  switch (email.outcome) {
    case 'added':
      return 'Added the event';
    case 'updated':
      return 'Changed the event';
    case 'held':
      return 'Waiting for approval';
    case 'cancelled':
      return 'Cancelled it';
    case 'refused':
      return 'Not added';
    case 'approved':
      return `Approved by ${email.decidedByName ?? 'an organizer'}`;
    default:
      return `Discarded by ${email.decidedByName ?? 'an organizer'}`;
  }
}

function received(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** When the email said the event is, in the invitation's own time zone. */
function saidWhen(email: InvitationEmail): string | null {
  if (!email.starts) return null;
  const when = new Date(email.starts).toLocaleString('en-US', {
    timeZone: email.timezone,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    ...(email.allDay ? {} : { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }),
  });
  return when;
}

/**
 * What a change changed, against the email before it: the list is newest
 * first, so the one before is the next one down that said anything.
 */
export function whatChanged(emails: InvitationEmail[], index: number): string | null {
  const email = emails[index];
  if (email?.outcome !== 'updated') return null;
  const before = emails.slice(index + 1).find((older) => older.title !== null);
  if (!before) return null;
  const changed = [
    email.title !== before.title ? 'name' : null,
    email.starts !== before.starts || email.allDay !== before.allDay ? 'time' : null,
    email.repeats !== before.repeats ? 'repeating' : null,
    email.place !== before.place ? 'place' : null,
    email.link !== before.link ? 'link' : null,
    email.description !== before.description ? 'description' : null,
  ].filter((part) => part !== null);
  return changed.length > 0
    ? `Changed: ${changed.join(', ')}`
    : 'Same name, time, place, link and description as before';
}

const LABEL = 'font-bold text-ink';

/**
 * On an event that came from a calendar invitation, for whoever may change
 * it (the owner, 2026-11-17: "see the e-mails that resulted in the current
 * event"; 20261117150000): each email the club got about it, newest first,
 * what it did with it and what the email said. Nothing on an event added by
 * hand, and nothing until they are read. Emails from before 2026-11-17 left
 * only the last one of each invitation.
 */
export function InvitationEmails({ eventId }: { eventId: string }) {
  const [emails, setEmails] = useState<InvitationEmail[]>([]);
  useEffect(() => {
    let live = true;
    setEmails([]);
    void fetchInvitationEmails(eventId).then((found) => {
      if (live) setEmails(found);
    });
    return () => {
      live = false;
    };
  }, [eventId]);

  return <InvitationEmailList emails={emails} />;
}

/** The list itself, apart from its read. */
export function InvitationEmailList({ emails }: { emails: InvitationEmail[] }) {
  if (emails.length === 0) return null;
  return (
    <section className="mt-5 rounded-[14px] border border-line bg-paper px-3.5 py-3">
      <h2 className="flex items-center gap-1.5 font-extrabold font-head text-[0.75rem] text-grey uppercase tracking-[0.13em]">
        <Mail className="h-[14px] w-[14px] flex-none" aria-hidden="true" />
        Invitation emails
      </h2>
      <p className="mt-1 text-[0.78125rem] text-ink2 leading-[1.45]">
        This event came from a calendar invitation. These are the emails the club got about it,
        newest first. Only people who can change the event see them.
      </p>
      <ul className="mt-2 divide-y divide-line">
        {emails.map((email, index) => {
          const when = saidWhen(email);
          const changed = whatChanged(emails, index);
          const link = email.link ? safeHref(email.link) : null;
          return (
            <li key={email.id}>
              <details className="group">
                <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 py-1.5 [&::-webkit-details-marker]:hidden">
                  <span className="min-w-0 flex-1">
                    <span className="block font-bold font-head text-[0.875rem] text-ink">
                      {whatItDid(email)}
                    </span>
                    {changed ? (
                      <span className="block text-[0.78125rem] text-ink">{changed}</span>
                    ) : null}
                    <span className="block text-[0.78125rem] text-ink2">
                      {received(email.receivedAt)}
                    </span>
                    <span className="block text-[0.78125rem] text-ink2 [overflow-wrap:anywhere]">
                      From {email.senderEmail}
                    </span>
                  </span>
                  <ChevronDown
                    className="h-[16px] w-[16px] flex-none text-grey transition-transform group-open:rotate-180"
                    aria-hidden="true"
                  />
                </summary>
                <div className="pb-3 text-[0.8125rem] text-ink2 leading-[1.5] [overflow-wrap:anywhere]">
                  {email.reason ? <p className="mb-1.5">{email.reason}</p> : null}
                  {email.verified ? null : (
                    <p className="mb-1.5">The sender of this email could not be verified.</p>
                  )}
                  <p className="font-bold font-head text-[0.71875rem] text-grey uppercase tracking-[0.1em]">
                    What the email said
                  </p>
                  {email.title ? (
                    <p>
                      <span className={LABEL}>Event:</span> {email.title}
                    </p>
                  ) : null}
                  {when ? (
                    <p>
                      <span className={LABEL}>When:</span> {when}
                    </p>
                  ) : null}
                  {email.repeats ? (
                    <p>
                      <span className={LABEL}>Repeats:</span> yes, from that date
                    </p>
                  ) : null}
                  {email.place ? (
                    <p>
                      <span className={LABEL}>Where:</span> {email.place}
                    </p>
                  ) : null}
                  {link ? (
                    <p>
                      <span className={LABEL}>Link:</span>{' '}
                      <a
                        href={link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-emphasis underline underline-offset-[3px]"
                      >
                        {email.link}
                      </a>
                    </p>
                  ) : null}
                  {email.description ? <p className={LABEL}>Description:</p> : null}
                  {email.description ? (
                    <p className="mt-1 max-h-[14rem] overflow-y-auto whitespace-pre-line rounded-[10px] bg-tint px-2.5 py-2">
                      {email.description}
                    </p>
                  ) : null}
                </div>
              </details>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
