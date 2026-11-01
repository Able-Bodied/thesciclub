import { ChevronDown } from 'lucide-react';
import { useId, useState } from 'react';
import { useAttendeesByEvent } from '@/lib/events';
import { cn } from '@/lib/utils';
import { AttendeeList } from '@/routes/events/attendee-list';

/**
 * "3 going" on a card, which opens who (the owner, 2026-10-31). A card says
 * only how many, so a list does not read every RSVP in it: each event's names
 * are read when somebody asks for them.
 */
export function GoingCount({
  eventId,
  going,
  interested,
  onOpenMember,
}: {
  eventId: string;
  going: number;
  interested: number;
  onOpenMember?: ((id: string) => void) | undefined;
}) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  // A count of zero is not drawn: "2 going", not "2 going · 0 interested".
  const interestedLine = interested ? `${interested} interested` : null;
  if (going === 0 && !interestedLine) return null;

  const line = 'font-bold text-[0.8125rem] text-emphasis';
  if (going === 0 || !onOpenMember) {
    return (
      <p className={cn('mt-2 pl-[calc(3.625rem+13px)]', line)}>
        {[going ? `${going} going` : null, interestedLine].filter(Boolean).join(' · ')}
      </p>
    );
  }

  return (
    <>
      <p className={cn('flex flex-wrap items-center gap-x-1 pl-[calc(3.625rem+13px)]', line)}>
        <button
          type="button"
          onClick={() => {
            setOpen((now) => !now);
          }}
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          className="inline-flex min-h-[44px] items-center gap-1 underline-offset-2 hover:underline"
        >
          {going} going
          <ChevronDown
            aria-hidden="true"
            className={cn('h-4 w-4 transition-transform', open && 'rotate-180')}
          />
        </button>
        {interestedLine ? <span>· {interestedLine}</span> : null}
      </p>
      {open ? (
        <div id={listId}>
          {/* Keyed by the count, to read again after an RSVP changes it. */}
          <GoingPeople key={going} eventId={eventId} going={going} onOpenMember={onOpenMember} />
        </div>
      ) : null}
    </>
  );
}

function GoingPeople({
  eventId,
  going,
  onOpenMember,
}: {
  eventId: string;
  going: number;
  onOpenMember: (id: string) => void;
}) {
  const { byEvent, loading, error } = useAttendeesByEvent([eventId]);
  if (error) {
    return (
      <p role="alert" className="py-2 text-[0.8125rem] text-destructive">
        {error}
      </p>
    );
  }
  if (loading) {
    return (
      <p role="status" className="py-2 text-[0.8125rem] text-grey">
        Loading…
      </p>
    );
  }
  const attendees = (byEvent.get(eventId) ?? []).filter((a) => a.status === 'going');
  return <AttendeeList attendees={attendees} total={going} onOpen={onOpenMember} />;
}
