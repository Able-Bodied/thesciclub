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
 * One card per room, and usually none
 * ---------------------------------------------------------------------------
 * Rooms open one at a time — CONTEXT.md's reason is that a room of two dozen
 * members is empty by construction — so for most of this club's life this draws
 * nothing at all, and when it draws it draws one. `roomsForTopics` deduplicates
 * for the case where it would not: two topics naming one room is one card,
 * because the member named one conversation twice.
 *
 * Nothing is drawn for a member whose topics reach no open room. There is no
 * "no rooms match" sentence: the reader did not ask a question, so there is
 * nothing to answer.
 */

const ICON_COLOUR: Record<RoomCategory, string> = {
  Body: 'text-room-body',
  Life: 'text-room-life',
  Kit: 'text-room-kit',
};

export function ContinueInRooms({ topics }: { topics: readonly string[] }) {
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

  return (
    <div className="mt-2.5">
      {matched.map((room) => (
        <Link
          key={room.id}
          to={`/chat/rooms/${room.id}`}
          className="mb-2 flex items-center gap-[11px] rounded-[17px] border border-line bg-paper p-3.5 last:mb-0"
        >
          {/* Decorative: "◍" has no useful reading and the room's name is
              printed beside it. Sized in em so it grows with the text-size
              setting rather than leaving the name behind. */}
          <span
            aria-hidden="true"
            className={`grid h-[2.4em] w-[2.4em] flex-none place-items-center rounded-[12px] bg-tint text-[1.125rem] leading-none ${ICON_COLOUR[room.category]}`}
          >
            {room.icon}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-extrabold font-head text-[0.90625rem] text-ink">
              Continue in {room.name}
            </span>
            <span className="mt-[3px] block text-[0.78125rem] text-ink2 leading-[1.45]">
              {room.description}
            </span>
          </span>
        </Link>
      ))}
    </div>
  );
}
