import { photoUrlFor } from '@/lib/photos';
import { cn } from '@/lib/utils';
import { gradientFor, initialsOf } from '@/routes/peers/member-card';
import type { EventAttendee } from '@/types/domain';

/**
 * One attendee's avatar, matching `.av.sm` in docs/index.html.
 *
 * Shared by the card's overlapping row and the detail page's Going list, so the
 * same person is the same square in both places. It reuses the Peers deck's
 * gradient and initials rather than defining a second palette — a member whose
 * tile is purple on their profile should not be green on an event.
 */
export function AttendeeAvatar({
  attendee,
  className,
}: {
  attendee: EventAttendee;
  className?: string;
}) {
  const photo = photoUrlFor(attendee.photoPath);
  const [from, to] = gradientFor(attendee.memberId);

  return (
    <span
      className={cn(
        'relative grid h-[34px] w-[34px] flex-none place-items-center overflow-hidden rounded-[11px] font-extrabold font-head text-[13px] text-white',
        className,
      )}
      style={{ background: `linear-gradient(140deg, ${from}, ${to})` }}
    >
      {photo ? (
        <img
          src={photo}
          // Empty alt, not the member's name: the name is already the next
          // element in the row, and a screen reader that reads both says it
          // twice. A decorative alt is the correct answer for an image whose
          // caption is beside it.
          alt={attendee.photoAlt ?? ''}
          className="absolute inset-0 h-full w-full object-cover object-[50%_32%]"
        />
      ) : (
        initialsOf(attendee.displayName)
      )}
    </span>
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
  const listed =
    names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
  const verb = names.length === 1 && rest === 0 ? 'is' : 'are';
  const tail = rest > 0 ? ` and ${rest} other${rest === 1 ? '' : 's'}` : '';

  return (
    <span className="mt-[7px] flex items-center gap-2 font-semibold text-[12.6px] text-ink2">
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
        {listed}
        {tail} {verb} going
      </span>
    </span>
  );
}
