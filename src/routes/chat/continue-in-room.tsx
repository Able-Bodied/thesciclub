import { ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useChatRooms } from '@/lib/chat/rooms';
import type { ChatRoom, RoomCategory } from '@/lib/chat/types';
import { roomsForTopics } from '@/routes/chat/room-map';

/**
 * From a member's topics to the rooms those conversations are already in.
 *
 * A profile says "Happy to talk about: Bowel programme, Back to school". Both
 * of those are rooms, with the whole history in them and more than one person
 * in each — and the club would rather somebody asked there than in a message to
 * one member who happens to be on screen. The mock had this as a card under a
 * question ("Continue in <room>"); a profile is where it is more use, because
 * it is where a member arrives holding a subject rather than a question.
 *
 * It does not replace the Message button and is not drawn instead of it. Some
 * questions are for one person.
 *
 * ---------------------------------------------------------------------------
 * Only rooms that are open, and that is not this component's decision
 * ---------------------------------------------------------------------------
 * `chat_rooms`' select policy is `is_member() and (opened_at is not null or
 * is_admin())`, so a member is never handed a closed room and there is nothing
 * here to hide from them. The `openedAt` filter below is for the other reader:
 * an administrator is exempt from that half of the policy and gets all twelve,
 * and offering them "Continue in Aging with SCI" would be offering a door into
 * a room no member can follow them through.
 *
 * ---------------------------------------------------------------------------
 * One link per room, and usually none
 * ---------------------------------------------------------------------------
 * Rooms open one at a time — CONTEXT.md's reason is that a room of two dozen
 * members is empty by construction — so for most of this club's life this draws
 * nothing at all, and when it draws it draws one. `roomsForTopics` deduplicates
 * for the case where it would not: two topics naming one room is one link,
 * because the member named one conversation twice.
 *
 * Nothing is drawn for a member whose topics reach no open room. There is no
 * "no rooms match" sentence: the reader did not ask a question, so there is
 * nothing to answer.
 */

/** A room's glyph colour by heading. Exported for Home's cards rather than copied a fourth time. */
export const ROOM_ICON_COLOUR: Record<RoomCategory, string> = {
  General: 'text-emphasis',
  Other: 'text-emphasis',
  Body: 'text-room-body',
  Mind: 'text-room-mind',
  Life: 'text-room-life',
  Family: 'text-room-family',
  Kit: 'text-room-kit',
  Places: 'text-room-places',
};

export function ContinueInRooms({
  topics,
  wrap,
}: {
  topics: readonly string[];
  /** Puts the links under a heading, called only when there are links to put there. */
  wrap: (links: ReactNode) => ReactNode;
}) {
  const { rooms } = useChatRooms();

  // Open rooms only, by slug. Built from what the database returned rather
  // than from the twelve slugs room-map.ts knows about, so a room that is
  // renamed or retired stops being offered without this file changing.
  const open = new Map<string, ChatRoom>(
    rooms.filter((room) => room.openedAt !== null).map((room) => [room.id, room]),
  );

  const matched = roomsForTopics(topics)
    .map((id) => open.get(id))
    .filter((room): room is ChatRoom => room !== undefined);

  if (matched.length === 0) return null;

  // Pills, not cards. Each was a full-width card with the room's description,
  // and a member whose topics reached a few open rooms had the person pushed
  // off a phone screen by signposts (owner, 2026-10-07). The room's name is
  // what the reader needs to decide; the description is one tap away. Still
  // 44px tall, because small is the size of the box and not of the target.
  return wrap(
    <div className="flex flex-wrap gap-2">
      {matched.map((room) => (
        <Link
          key={room.id}
          to={`/chat/rooms/${room.id}`}
          className="inline-flex min-h-[44px] max-w-full items-center gap-2 rounded-full border border-line bg-paper py-1.5 pr-3 pl-1.5 font-bold font-head text-[0.84375rem] text-ink transition-colors hover:bg-tint"
        >
          {/* Decorative: "◍" has no useful reading and the room's name is
              printed beside it. Sized in em so it grows with the text-size
              setting rather than leaving the name behind. */}
          <span
            aria-hidden="true"
            className={`grid h-[1.9em] w-[1.9em] flex-none place-items-center rounded-full bg-tint leading-none ${ROOM_ICON_COLOUR[room.category]}`}
          >
            {room.icon}
          </span>
          {/* The heading says these are rooms; a screen reader landing on a
              link alone still hears where it goes. */}
          <span className="min-w-0">
            <span className="sr-only">Continue in</span> {room.name}
          </span>
          <ChevronRight aria-hidden="true" className="h-3.5 w-3.5 flex-none text-grey" />
        </Link>
      ))}
    </div>,
  );
}
