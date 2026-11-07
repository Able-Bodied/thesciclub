import { Link } from 'react-router-dom';
import type { ChatAuthor, ChatRoom, RoomCategory, RoomStats } from '@/lib/chat/types';

/**
 * One discussion room, in the list: the mock's `card cat`. The category colour is never the only
 * cue: every card sits under a label saying the word.
 *
 * Stats are "N topics · N posts", no members (nobody joins a room since 20260930000000), and left
 * off when there are no topics: two zeros read as a failed room.
 *
 * The Closed chip is for administrators only: the select policy hides closed rooms from members,
 * but administrators see all twelve and need to tell which members can see.
 *
 * A member-started room says who started it ("a former member" once gone). Its tile is the room
 * name's first letter: no icon picker, as one seeded glyph drew as a tofu box.
 */

const CATEGORY_STYLE: Record<RoomCategory, { border: string; icon: string; label: string }> = {
  // The link colour, rather than a seventh room colour: General is about
  // nothing in particular, and the emphasis colour is already checked in
  // light and dark.
  General: { border: 'border-l-emphasis', icon: 'text-emphasis', label: 'bg-emphasis' },
  Other: { border: 'border-l-emphasis', icon: 'text-emphasis', label: 'bg-emphasis' },
  Body: { border: 'border-l-room-body', icon: 'text-room-body', label: 'bg-room-body' },
  Mind: { border: 'border-l-room-mind', icon: 'text-room-mind', label: 'bg-room-mind' },
  Life: { border: 'border-l-room-life', icon: 'text-room-life', label: 'bg-room-life' },
  Family: { border: 'border-l-room-family', icon: 'text-room-family', label: 'bg-room-family' },
  Kit: { border: 'border-l-room-kit', icon: 'text-room-kit', label: 'bg-room-kit' },
  Places: { border: 'border-l-room-places', icon: 'text-room-places', label: 'bg-room-places' },
};

export function RoomCategoryLabel({ category }: { category: RoomCategory }) {
  return (
    <h3 className="mt-4 mb-2 flex items-center gap-[7px] font-extrabold font-head text-[0.71875rem] text-ink uppercase tracking-[0.13em]">
      {/* Decorative: the word is right beside it. */}
      <span
        aria-hidden="true"
        className={`h-[11px] w-[11px] flex-none rounded-[3px] ${CATEGORY_STYLE[category].label}`}
      />
      {category}
    </h3>
  );
}

export function RoomCard({
  room,
  starter,
  stats,
}: {
  room: ChatRoom;
  /** Who started it, for a member room. Null for the seeded twelve, for a
      starter who has left the club, and while the name is still loading. */
  starter?: ChatAuthor | null;
  stats: RoomStats | undefined;
}) {
  const style = CATEGORY_STYLE[room.category];
  const closed = room.openedAt === null;
  return (
    <Link
      to={`/chat/rooms/${room.id}`}
      className={`mb-2.5 flex items-start gap-[11px] rounded-[6px_17px_17px_6px] border border-line border-l-4 bg-paper p-3.5 ${style.border}`}
    >
      {/* The glyph carries nothing the name does not — hidden rather than
          described, since "◍" has no useful reading. Sized in em so it grows
          with the text-size setting instead of leaving the name behind. */}
      <span
        aria-hidden="true"
        className={`grid h-[2.4em] w-[2.4em] flex-none place-items-center rounded-[12px] bg-tint text-[1.125rem] leading-none ${style.icon}`}
      >
        {room.icon ?? roomInitial(room.name)}
      </span>
      <span className="min-w-0 flex-1">
        {/* Name and chip on one wrapping row rather than the chip inline in
            the heading: inline, "Closed — no member can see it" broke across
            two lines and took its own pill background with it. */}
        <span className="flex flex-wrap items-baseline gap-x-[7px] gap-y-1">
          <span className="font-extrabold font-head text-[0.9375rem] text-ink">{room.name}</span>
          {closed ? (
            <span className="whitespace-nowrap rounded-full bg-tint px-2 py-[2px] font-semibold text-[0.6875rem] text-ink2">
              Closed
            </span>
          ) : null}
        </span>
        <span className="mt-[3px] block text-[0.78125rem] text-ink2 leading-[1.45]">
          {room.description}
        </span>
        {stats && stats.topicCount > 0 ? (
          <span className="mt-1.5 block font-semibold text-[0.75rem] text-emphasis leading-[1.45]">
            {stats.topicCount} {stats.topicCount === 1 ? 'topic' : 'topics'} · {stats.postCount}{' '}
            {stats.postCount === 1 ? 'post' : 'posts'}
          </span>
        ) : (
          <span className="mt-1.5 block text-[0.75rem] text-grey leading-[1.45]">
            Nothing has been asked here yet.
          </span>
        )}

        {room.createdBy ? (
          <span className="mt-1 block text-[0.75rem] text-grey leading-[1.45]">
            Started by {starter?.displayName ?? 'a deleted member'}
          </span>
        ) : null}

        {/* The chip is short enough to scan; this is what it means. Both are
            drawn, because "Closed" alone invites the reading that the room is
            finished rather than not yet started. */}
        {closed ? (
          <span className="mt-1 block text-[0.75rem] text-grey leading-[1.45]">
            No member can see this room yet.
          </span>
        ) : null}
      </span>
    </Link>
  );
}

/**
 * The letter on a member room's tile. Decorative (the name is beside it); a name with no letter
 * gets the neutral dash rather than an empty square.
 */
export function roomInitial(name: string): string {
  return name.trim().charAt(0).toUpperCase() || '—';
}
