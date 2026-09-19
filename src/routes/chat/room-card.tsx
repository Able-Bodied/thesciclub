import type { ChatRoom, RoomCategory } from '@/lib/chat/types';

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
 * Deliberately not a button yet. Topics and posts are the next thing built,
 * and a card that looks tappable and does nothing is the failure CONTEXT.md
 * keeps Home a placeholder to avoid. It becomes a link to /chat/rooms/:id when
 * there is a room page to link to.
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

export function RoomCard({ room }: { room: ChatRoom }) {
  const style = CATEGORY_STYLE[room.category];
  const closed = room.openedAt === null;
  return (
    <article
      className={`mb-2.5 flex items-start gap-[11px] rounded-[6px_17px_17px_6px] border border-line border-l-4 bg-paper p-3.5 ${style.border}`}
    >
      {/* The glyph carries nothing the name does not — hidden rather than
          described, since "◍" has no useful reading. Sized in em so it grows
          with the text-size setting instead of leaving the name behind. */}
      <span
        aria-hidden="true"
        className={`grid h-[2.4em] w-[2.4em] flex-none place-items-center rounded-[12px] bg-tint text-[1.125rem] leading-none ${style.icon}`}
      >
        {room.icon}
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
        {/* The chip is short enough to scan; this is what it means. Both are
            drawn, because "Closed" alone invites the reading that the room is
            finished rather than not yet started. */}
        {closed ? (
          <span className="mt-1.5 block text-[0.75rem] text-grey leading-[1.45]">
            No member can see this room yet.
          </span>
        ) : null}
      </span>
    </article>
  );
}
