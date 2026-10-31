import { MemberAvatar } from '@/components/member-avatar';
import type { EventAttendee } from '@/types/domain';

/**
 * One attendee's avatar, matching `.av.sm` in docs/index.html.
 *
 * For the detail page's Going list. The square itself is
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
