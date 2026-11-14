import { useCallback, useMemo, useState } from 'react';
import {
  EmailPreview,
  linesFor,
  MessageField,
  PeopleListField,
  type SendLine,
  SendResults,
  sendEach,
} from '@/components/invite-list';
import { useAccount } from '@/lib/account';
import { describeThrown } from '@/lib/describe-error';
import { inviteListToEvent } from '@/lib/event-invite';
import { type ReadSheet, SHEET_LIMIT } from '@/lib/invite-sheet';
import type { ClubEvent } from '@/types/domain';
import { eventWhen, inviteEmail } from '../../../supabase/functions/send-invite/compose';

/**
 * An organizer invites a list to their event, people outside the club
 * included (the owner, 2026-11-14), with the same list as the administrator's
 * spreadsheet invite: a Google Sheet, or addresses pasted from Gmail or
 * anywhere. Each person outside the club gets an email that opens the event's
 * page with their name and address filled in and "Accept invite and join the
 * club" (20261114020000). Members on the list are invited in the club instead
 * when the event is invite only.
 */

const SAYS = {
  member_invited: { state: 'done' as const, why: 'In the club: invited, and told in the club' },
  member: { state: 'done' as const, why: 'In the club already, and can see the event' },
  on_list: { state: 'skipped' as const, why: 'already has an invite to the club waiting' },
  blocked: { state: 'skipped' as const, why: 'blocked from the club' },
  not_an_email: { state: 'skipped' as const, why: 'not an email address' },
  repeat: { state: 'skipped' as const, why: 'twice in the list' },
  limit: { state: 'skipped' as const, why: 'you have no invites left' },
};

/** What the message box starts with: short, about the event, nothing about anybody's health. */
export function suggestedEventMessage(title: string): string {
  return `I'd love for you to come to ${title}. Accept the invite and join The SCI Club so we can see who's coming and plan together.`;
}

export function EventInviteList({ event, onSent }: { event: ClubEvent; onSent?: () => void }) {
  const account = useAccount();
  const [open, setOpen] = useState(false);
  const [read, setRead] = useState<ReadSheet | null>(null);
  const [round, setRound] = useState(0);
  const [edited, setEdited] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lines, setLines] = useState<SendLine[] | null>(null);
  const [sending, setSending] = useState(false);
  const onRead = useCallback((next: ReadSheet | null) => {
    setRead(next);
  }, []);

  const suggested = suggestedEventMessage(event.title);
  const message = edited ?? suggested;
  const people = read?.people ?? [];
  const tooMany = people.length > SHEET_LIMIT;

  const preview = useMemo(
    () =>
      inviteEmail(
        {
          inviter: account.displayName ?? 'You',
          name: people[0]?.name ?? null,
          message: message.trim() || null,
          event: {
            title: event.title,
            when: eventWhen(event.startTime, event.timezone, event.allDay),
          },
        },
        `https://thesciclub.com/e/${event.id}?invite=…`,
      ),
    [account.displayName, people, message, event],
  );

  async function send() {
    if (people.length === 0 || tooMany) return;
    const count = people.length;
    if (!window.confirm(`Invite ${count} ${count === 1 ? 'person' : 'people'} to ${event.title}?`))
      return;
    setSending(true);
    setError(null);
    try {
      const added = await inviteListToEvent({
        eventId: event.id,
        people,
        message: message.trim() || null,
      });
      if (!added.ok) {
        setError(added.error);
        return;
      }
      const start = linesFor(added.entries, SAYS);
      setLines(start);
      await sendEach(added.entries, start, setLines);
      onSent?.();
    } catch (e) {
      setError(describeThrown(e, 'The invites did not all go. Check the list below.'));
    } finally {
      setSending(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setOpen(true);
        }}
        className="mt-3 flex min-h-[46px] w-full items-center justify-center rounded-[13px] border-[1.6px] border-emphasis bg-paper font-bold font-head text-[0.875rem] text-emphasis"
      >
        Invite from a list or spreadsheet
      </button>
    );
  }

  return (
    <section
      aria-label="Invite from a list or spreadsheet"
      className="mt-3 overflow-hidden rounded-[14px] border border-line bg-paper"
    >
      {lines ? (
        <SendResults
          lines={lines}
          sending={sending}
          error={error}
          onStartOver={() => {
            setLines(null);
            setRead(null);
            setRound((r) => r + 1);
            setEdited(null);
            setError(null);
          }}
        />
      ) : (
        <div className="p-3.5">
          <p className="font-bold font-head text-[0.9375rem] text-ink">
            Invite from a list or spreadsheet
          </p>
          <p className="mt-1 mb-3 text-[0.8125rem] text-ink2 leading-[1.45]">
            People outside the club get an email from you that opens this event with their name
            filled in, and a button to accept and join the club.
          </p>
          <PeopleListField key={round} id="event-invite" onRead={onRead} />
          <MessageField
            id="event-invite"
            suggested={suggested}
            edited={edited}
            onEdit={setEdited}
          />
          <EmailPreview email={preview} />
          {error ? (
            <p role="alert" className="mt-2.5 text-[0.78125rem] text-destructive leading-[1.45]">
              {error}
            </p>
          ) : null}
          <div className="mt-3 flex gap-2.5">
            <button
              type="button"
              disabled={sending}
              onClick={() => {
                setOpen(false);
              }}
              className="flex min-h-[48px] flex-none items-center justify-center rounded-[11px] border border-line px-4 font-bold font-head text-[0.875rem] text-emphasis disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={people.length === 0 || tooMany || sending}
              onClick={() => {
                void send();
              }}
              className="flex min-h-[48px] flex-1 items-center justify-center rounded-[11px] bg-action font-bold font-head text-[0.875rem] text-white disabled:opacity-40"
            >
              {people.length === 0
                ? 'Send the invites'
                : `Invite ${people.length} ${people.length === 1 ? 'person' : 'people'}`}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
