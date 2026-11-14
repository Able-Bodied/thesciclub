import { ChevronDown } from 'lucide-react';
import { useEffect, useState } from 'react';
import { InviteFunnel, InvitePerson } from '@/components/invite-tracking';
import { fetchInviteTracking, groupInvites, type InviteGroup } from '@/lib/invite-tracking';

/**
 * "How the invites did" on the administrator's Invites (the owner,
 * 2026-11-14): the club's own emailed invites, a card for each sender's day,
 * with how many were sent, opened, clicked and joined, and each person's
 * steps. An event's invites are on its guest list instead
 * (routes/events/event-invite-tracking.tsx; 20261114040000).
 */

const SHOWN = 8;

function Group({ group }: { group: InviteGroup }) {
  const [open, setOpen] = useState(false);
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
              {group.isEvent
                ? `Event invites${group.when ? ` · event on ${group.when}` : ''}`
                : `Club invites · sent ${group.when ?? ''}`}
            </span>
          </span>
          <ChevronDown
            aria-hidden="true"
            className={`mt-0.5 h-4 w-4 flex-none text-grey transition-transform ${open ? 'rotate-180' : ''}`}
          />
        </span>
        <InviteFunnel counts={group.counts} isEvent={group.isEvent} className="mt-2.5" />
      </button>
      {open ? (
        <ul>
          {group.invites.map((invite) => (
            <InvitePerson key={invite.id} invite={invite} isEvent={group.isEvent} />
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
    return <p className="p-3 text-[0.8125rem] text-grey">No club invite emails sent yet.</p>;
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
