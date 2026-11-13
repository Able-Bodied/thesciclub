import { ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useChatRooms } from '@/lib/chat/rooms';
import type { ChatRoom, RoomCategory } from '@/lib/chat/types';
import { roomsForTopics } from '@/routes/chat/room-map';

/**
 * From a member's topics to the open rooms those conversations are in, on a profile: the club
 * would rather a subject were asked about in a room than in a message to one member. Shown beside
 * the Message button, never instead of it.
 *
 * `chat_rooms`' select policy already hides closed rooms from members; the `openedAt` filter is for
 * administrators, who see all twelve and should not be offered a room no member can follow them
 * into. Rooms open one at a time (CONTEXT.md), so this usually draws nothing; no "no rooms match".
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
  // Kit's colour: most of what changes hands here is kit.
  Classifieds: 'text-room-kit',
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

  // From the database, not room-map.ts's slugs, so a retired room stops being offered.
  const open = new Map<string, ChatRoom>(
    rooms.filter((room) => room.openedAt !== null).map((room) => [room.id, room]),
  );

  const matched = roomsForTopics(topics)
    .map((id) => open.get(id))
    .filter((room): room is ChatRoom => room !== undefined);

  if (matched.length === 0) return null;

  // Pills, not cards: cards pushed the person off a phone screen (owner, 2026-10-07).
  // Still a 44px target.
  return wrap(
    <div className="flex flex-wrap gap-2">
      {matched.map((room) => (
        <Link
          key={room.id}
          to={`/chat/rooms/${room.id}`}
          className="inline-flex min-h-[44px] max-w-full items-center gap-2 rounded-full border border-line bg-paper py-1.5 pr-3 pl-1.5 font-bold font-head text-[0.84375rem] text-ink transition-colors hover:bg-tint"
        >
          {/* Decorative; in em so it grows with the text-size setting. */}
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
