import { MemberAvatar } from '@/components/member-avatar';
import { cn } from '@/lib/utils';
import type { EventAttendee } from '@/types/domain';

/**
 * One attendee's avatar, matching `.av.sm` in docs/index.html.
 *
 * Shared by the card's overlapping row and the detail page's Going list, so the
 * same person is the same square in both places. The square itself is
 * `components/member-avatar.tsx`, which the Peers deck and Chat also draw — a
 * member whose tile is purple on their profile should not be green on an event.
 */
export function AttendeeAvatar({
  attendee,
  className,
}: {
  attendee: EventAttendee;
  className?: string;
}) {
  return (
    <MemberAvatar
      id={attendee.memberId}
      displayName={attendee.displayName}
      photoPath={attendee.photoPath}
      photoAlt={attendee.photoAlt}
      className={className}
    />
  );
}

/**
 * The overlapping row on a card: up to `limit` faces, then a sentence.
 *
 * The sentence names people rather than counting them ("Nicole and Jake are
 * going"), which is the whole point of the row — a member decides whether to
 * turn up based on whether they know anybody who will be there, and "2 going"
 * does not answer that.
 */
export function AttendeeRow({
  attendees,
  limit = 2,
}: {
  attendees: EventAttendee[];
  limit?: number;
}) {
  const shown = attendees.slice(0, limit);
  if (shown.length === 0) return null;

  const names = shown.map((a) => a.displayName);
  const rest = attendees.length - shown.length;

  // The overflow takes the "and" slot, so two names plus more reads "Nicole,
  // Jake and 2 others" rather than "Nicole and Jake and 2 others".
  const tail = rest > 0 ? `${rest} other${rest === 1 ? '' : 's'}` : null;
  const parts = tail ? [...names, tail] : names;
  const listed =
    parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`;
  const verb = parts.length === 1 ? 'is' : 'are';

  return (
    <span className="mt-[7px] flex items-center gap-2 font-semibold text-[0.7875rem] text-ink2">
      <span className="flex">
        {shown.map((attendee, index) => (
          <AttendeeAvatar
            key={attendee.memberId}
            attendee={attendee}
            // Overlapped, with a paper ring so the stack reads as a stack
            // rather than as one wide smear.
            className={cn('ring-2 ring-paper', index > 0 && '-ml-2')}
          />
        ))}
      </span>
      <span>
        {listed} {verb} going
      </span>
    </span>
  );
}
