import { Link } from 'react-router-dom';
import type { ChatAuthor, ChatRoom, RoomCategory, RoomStats } from '@/lib/chat/types';

/**
 * One discussion room, in the list.
 *
 * The mock's `card cat`: a left border in the category's colour, the icon in a
 * tinted square, then the name and what the room is for. The colour is the
 * only thing that distinguishes the three categories on the card itself, so it
 * is never the only thing — every card sits under a category label that says
 * the word, because a member who cannot tell #1A3E70 from #2F6B57 should lose
 * nothing.
 *
 * A link to /chat/rooms/:id since the room page landed. It was deliberately
 * not a control while there was nothing behind it — a card that looks tappable
 * and does nothing is the failure CONTEXT.md keeps Home a placeholder to avoid.
 *
 * ---------------------------------------------------------------------------
 * A room with nothing in it says so in words
 * ---------------------------------------------------------------------------
 * The stats line is the mock's "N topics · N posts · N members", and it is left
 * off entirely when the room has no topics. "0 topics · 0 posts · 0 members" is
 * the invented-content rule broken in the other direction: three zeros read as
 * a room that failed rather than as one that has not started, and they are the
 * first thing a member would see on the day the first room opens.
 *
 * ---------------------------------------------------------------------------
 * The Closed chip is for an audience of one kind of person
 * ---------------------------------------------------------------------------
 * The select policy hides a closed room from a member, so an ordinary member
 * never sees this chip and it is not a state they can be confused by. An
 * administrator is exempt from that half of the policy — somebody has to be
 * able to look at a room before it is shown to anybody — so an administrator
 * gets all twelve cards here, and without the chip they would have no way to
 * tell which of them a member can actually see. Found by looking at the
 * screenshot as an administrator, not by reading the policy.
 *
 * ---------------------------------------------------------------------------
 * A room somebody started
 * ---------------------------------------------------------------------------
 * The seeded twelve came with the club and say nothing about who put them
 * there. A room a member started says so, because the two are different kinds
 * of room: one is a subject the club decided to have, the other is somebody
 * asking for a place to put a problem. "Started by a former member" rather than
 * nothing once they have left — the room outlived them, which is a fact about
 * the room.
 *
 * Their tile is the first letter of the room's name instead of a glyph. There
 * is no icon picker: every seeded glyph had to be checked in a screenshot and
 * one of them drew as a tofu box, which is not a problem to hand to somebody
 * who came here to ask about their shoulder.
 */

const CATEGORY_STYLE: Record<RoomCategory, { border: string; icon: string; label: string }> = {
  Body: { border: 'border-l-room-body', icon: 'text-room-body', label: 'bg-room-body' },
  Life: { border: 'border-l-room-life', icon: 'text-room-life', label: 'bg-room-life' },
  Kit: { border: 'border-l-room-kit', icon: 'text-room-kit', label: 'bg-room-kit' },
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
  joined,
}: {
  room: ChatRoom;
  /** Who started it, for a member room. Null for the seeded twelve, for a
      starter who has left the club, and while the name is still loading. */
  starter?: ChatAuthor | null;
  stats: RoomStats | undefined;
  joined: boolean;
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
          {joined ? (
            <span className="whitespace-nowrap rounded-full bg-gold px-2 py-[2px] font-semibold text-[#2A1E06] text-[0.6875rem]">
              Joined
            </span>
          ) : null}
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
          <span className="mt-1.5 block font-semibold text-[0.75rem] text-navy leading-[1.45]">
            {stats.topicCount} {stats.topicCount === 1 ? 'topic' : 'topics'} · {stats.postCount}{' '}
            {stats.postCount === 1 ? 'post' : 'posts'} · {stats.memberCount}{' '}
            {stats.memberCount === 1 ? 'member' : 'members'}
          </span>
        ) : (
          <span className="mt-1.5 block text-[0.75rem] text-grey leading-[1.45]">
            Nothing has been asked here yet.
          </span>
        )}

        {room.createdBy ? (
          <span className="mt-1 block text-[0.75rem] text-grey leading-[1.45]">
            Started by {starter?.displayName ?? 'a former member'}
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
 * The letter on a member room's tile.
 *
 * Decorative, like the glyphs — the room's name is printed beside it — so a
 * name with no letter in it falls back to the same neutral dash a removed
 * member's avatar uses rather than drawing an empty square.
 */
export function roomInitial(name: string): string {
  return name.trim().charAt(0).toUpperCase() || '—';
}
