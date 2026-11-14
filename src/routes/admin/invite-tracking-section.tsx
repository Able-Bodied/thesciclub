import { ChevronDown } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  fetchInviteTracking,
  groupInvites,
  type InviteGroup,
  type TrackedInvite,
} from '@/routes/admin/invite-tracking';

/**
 * "How the invites did" on the administrator's Invites (the owner,
 * 2026-11-14): for each event's invites, and each day's from one sender, how
 * many were sent, opened, viewed, going and joined, and each person's steps.
 */

const SHOWN = 8;

function Step({ on, children }: { on: boolean; children: React.ReactNode }) {
  return (
    <span
      className={
        on
          ? 'rounded-full bg-tint px-2 py-0.5 font-bold text-emphasis'
          : 'rounded-full px-2 py-0.5 text-grey line-through decoration-grey/40'
      }
    >
      {children}
    </span>
  );
}

function Person({ invite, isEvent }: { invite: TrackedInvite; isEvent: boolean }) {
  const joined = invite.joinedAt !== null;
  const going = invite.rsvp === 'going';
  const viewed = invite.linkOpenedAt !== null || going || joined;
  const opened = invite.openedAt !== null || viewed;
  return (
    <li className="border-line border-t px-3 py-2.5 text-[0.8125rem] leading-[1.4]">
      <span className="block [overflow-wrap:anywhere]">
        {invite.name ? <span className="font-bold text-ink">{invite.name} · </span> : null}
        <span className="text-ink2">{invite.email}</span>
      </span>
      <span className="mt-1.5 flex flex-wrap gap-1 text-[0.75rem]">
        <Step on={opened}>Opened</Step>
        <Step on={viewed}>{isEvent ? 'Viewed the event' : 'Used the link'}</Step>
        {isEvent ? (
          <Step on={going}>{invite.rsvp === 'interested' ? 'Interested' : 'Going'}</Step>
        ) : null}
        <Step on={joined}>
          {joined && invite.memberName ? `Joined as ${invite.memberName}` : 'Joined'}
        </Step>
      </span>
    </li>
  );
}

function Count({ n, of, label }: { n: number; of: number; label: string }) {
  return (
    <span className="flex min-w-0 flex-col items-center">
      <span className="font-extrabold font-head text-[1rem] text-ink tabular-nums">{n}</span>
      <span className="text-[0.6875rem] text-grey">
        {label}
        {of > 0 && label !== 'sent' ? ` · ${Math.round((n / of) * 100)}%` : ''}
      </span>
    </span>
  );
}

function Group({ group }: { group: InviteGroup }) {
  const [open, setOpen] = useState(false);
  const c = group.counts;
  return (
    <div className="border-line border-b last:border-b-0">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => {
          setOpen((o) => !o);
        }}
        className="block w-full px-3 pt-3 pb-2.5 text-left"
      >
        <span className="flex items-start justify-between gap-2">
          <span className="min-w-0">
            <span className="block font-bold text-[0.875rem] text-ink [overflow-wrap:anywhere]">
              {group.title}
            </span>
            <span className="block text-[0.75rem] text-grey">
              {group.isEvent ? 'Event invites' : 'Club invites'}
              {group.when ? ` · ${group.when}` : ''}
            </span>
          </span>
          <ChevronDown
            aria-hidden="true"
            className={`mt-0.5 h-4 w-4 flex-none text-grey transition-transform ${open ? 'rotate-180' : ''}`}
          />
        </span>
        <span className="sr-only">
          {`${c.sent} sent, ${c.opened} opened, ${c.viewed} ${group.isEvent ? 'viewed' : 'used the link'}${group.isEvent ? `, ${c.going} going` : ''}, ${c.joined} joined`}
        </span>
        <span
          aria-hidden="true"
          className={`mt-2.5 grid gap-1 ${group.isEvent ? 'grid-cols-5' : 'grid-cols-4'}`}
        >
          <Count n={c.sent} of={c.sent} label="sent" />
          <Count n={c.opened} of={c.sent} label="opened" />
          <Count n={c.viewed} of={c.sent} label={group.isEvent ? 'viewed' : 'clicked'} />
          {group.isEvent ? <Count n={c.going} of={c.sent} label="going" /> : null}
          <Count n={c.joined} of={c.sent} label="joined" />
        </span>
      </button>
      {open ? (
        <ul>
          {group.invites.map((invite) => (
            <Person key={invite.id} invite={invite} isEvent={group.isEvent} />
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function InviteTrackingSection() {
  const [groups, setGroups] = useState<InviteGroup[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [all, setAll] = useState(false);

  useEffect(() => {
    void fetchInviteTracking().then((result) => {
      if (result.ok) setGroups(groupInvites(result.value));
      else setError(result.error);
    });
  }, []);

  if (error) {
    return (
      <p role="alert" className="p-3 text-[0.8125rem] text-destructive">
        {error}
      </p>
    );
  }
  if (!groups) {
    return (
      <p role="status" className="p-3 text-[0.8125rem] text-grey">
        Loading…
      </p>
    );
  }
  if (groups.length === 0) {
    return <p className="p-3 text-[0.8125rem] text-grey">No invite emails sent yet.</p>;
  }
  const shown = all ? groups : groups.slice(0, SHOWN);
  return (
    <>
      {shown.map((group) => (
        <Group key={group.key} group={group} />
      ))}
      {groups.length > SHOWN && !all ? (
        <button
          type="button"
          onClick={() => {
            setAll(true);
          }}
          className="block w-full border-line border-t px-3 py-2.5 font-bold font-head text-[0.8125rem] text-emphasis"
        >
          Show {groups.length - SHOWN} more
        </button>
      ) : null}
    </>
  );
}
