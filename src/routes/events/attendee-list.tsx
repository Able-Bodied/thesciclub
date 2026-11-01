import { ChevronRight } from 'lucide-react';
import { AttendeeAvatar } from '@/routes/events/attendee-avatar';
import { type EventAttendee, injuryLabel } from '@/types/domain';

/**
 * Who said yes, each opening their profile: on the event's page, and under the
 * count on a card.
 *
 * When the tally is higher than the number of people named, it says so instead
 * of quietly showing fewer. The difference is members who opted out of being
 * browsed, and leaving it unexplained makes the count look broken.
 */
export function AttendeeList({
  attendees,
  total,
  onOpen,
}: {
  attendees: EventAttendee[];
  total: number;
  onOpen: (memberId: string) => void;
}) {
  const unnamed = total - attendees.length;

  return (
    <>
      {attendees.map((attendee) => (
        <button
          key={attendee.memberId}
          type="button"
          onClick={() => {
            onOpen(attendee.memberId);
          }}
          className="flex w-full items-center gap-3 border-line border-b py-[13px] text-left last:border-b-0"
        >
          <AttendeeAvatar attendee={attendee} />
          <span className="min-w-0 flex-1">
            <span className="block font-extrabold font-head text-[0.90625rem] text-ink">
              {attendee.displayName}
            </span>
            <span className="block text-[0.78125rem] text-grey">
              {[injuryLabel(attendee), attendee.city].filter(Boolean).join(' · ')}
            </span>
          </span>
          <ChevronRight className="h-[19px] w-[19px] flex-none text-grey" />
        </button>
      ))}
      {unnamed > 0 ? (
        <p className="py-2.5 text-[0.78125rem] text-grey">
          {attendees.length === 0
            ? `${unnamed} member${unnamed === 1 ? '' : 's'}, not shown by choice`
            : `and ${unnamed} more who ${unnamed === 1 ? 'is' : 'are'} not shown by choice`}
        </p>
      ) : null}
    </>
  );
}
