import { photoUrlFor } from '@/lib/photos';
import { cn } from '@/lib/utils';
import { gradientFor, initialsOf } from '@/routes/peers/member-card';

/**
 * One member's face, wherever a member appears beside their name.
 *
 * Extracted from `routes/events/attendee-avatar.tsx`, which was the second
 * copy of the Peers deck's tile and is now a thin wrapper over this. Chat needs
 * a third — posts, bubbles and the stack of faces on a topic row — and three
 * copies of the same 34px square is how somebody ends up purple on their
 * profile and green on an event.
 *
 * It takes the four fields it draws rather than a domain type, because the
 * three callers have three different types (`EventAttendee`, `BrowseMember`,
 * `ChatAuthor`) that agree on exactly these. A shared component that named one
 * of them would make the other two convert.
 */
export function MemberAvatar({
  id,
  displayName,
  photoPath,
  photoAlt,
  className,
}: {
  id: string;
  displayName: string;
  photoPath?: string | null | undefined;
  photoAlt?: string | null | undefined;
  className?: string | undefined;
}) {
  const photo = photoUrlFor(photoPath);
  const [from, to] = gradientFor(id);

  return (
    <span
      className={cn(
        'relative grid h-[34px] w-[34px] flex-none place-items-center overflow-hidden rounded-[11px] font-extrabold font-head text-[0.8125rem] text-white',
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
          alt={photoAlt ?? ''}
          className="absolute inset-0 h-full w-full object-cover object-[50%_32%]"
        />
      ) : (
        initialsOf(displayName)
      )}
    </span>
  );
}

/**
 * The tile for somebody who is no longer in the club.
 *
 * Their words stay and their name does not, so there is nothing to make
 * initials from and nothing to make a stable colour from — `gradientFor` keys
 * on the member id, and the id is null. A flat neutral square, the same one
 * every time, which reads as "nobody" rather than as a member whose tile
 * happens to be grey.
 */
export function FormerMemberAvatar({ className }: { className?: string | undefined }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'grid h-[34px] w-[34px] flex-none place-items-center rounded-[11px] bg-tint font-extrabold font-head text-[0.8125rem] text-grey',
        className,
      )}
    >
      —
    </span>
  );
}

/**
 * The tile for a group, where a direct conversation would draw a face.
 *
 * Not a stack of the members' faces: the roster changes, a group of eleven has
 * no four representative people in it, and the list would redraw itself every
 * time somebody joined. Not initials either — "SR" for "Saturday ride" is two
 * letters that look like a member. So it is the mock's `.roomico`, the same
 * tinted square the discussion rooms use, with a glyph that is decorative and
 * a name printed beside it.
 *
 * It lives here rather than in a file of its own because this is the one tile
 * file: the alternative is a fourth 34px square drawn somewhere else, which is
 * how somebody ends up purple on their profile and green on an event.
 */
export function GroupAvatar({ className }: { className?: string | undefined }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'grid h-[34px] w-[34px] flex-none place-items-center rounded-[11px] bg-tint text-[1.0625rem] text-navy leading-none',
        className,
      )}
    >
      ◎
    </span>
  );
}
