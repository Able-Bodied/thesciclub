import type { ChatRoom } from '@/lib/chat/types';
import type { FeedItem } from '@/lib/home/types';
import { roomsForTopics } from '@/routes/chat/room-map';
import { isSport } from '@/routes/events/filters';

/**
 * What "Filter your feed" narrows Home's list by. All pure.
 *
 * Rooms narrow the list drawn, so the count in the sheet is the list behind it:
 * "2 of 8 match" on Events means two of the eight cards on screen, not two
 * events somewhere in the next month that were never shown.
 *
 * Distance is for events and peers alone, and starts at any distance (the
 * owner, 2026-11-01): Worth meeting should not stop at the county line, and a
 * question has no location at all. Home applies it when it picks those two, in
 * page.tsx.
 *
 * An empty choice in a group means "do not narrow by this", never "match
 * nothing", for the reason `src/routes/events/filters.ts` gives. Within a
 * group a choice widens (this room or that one); across groups it narrows (in
 * this room and in this place).
 */

export interface FeedFilters {
  /** Room ids, as `chat_rooms.id` spells them. */
  rooms: string[];
  /** Of events and peers. Null is any distance. */
  withinMiles: number | null;
}

export const EMPTY_FEED_FILTERS: FeedFilters = { rooms: [], withinMiles: null };

/**
 * The room an event can be in: only Adaptive sport, and only for sport.
 *
 * An event is not written in a room, so this is the one place a room is
 * pinned on it. Sport is the only subject events and rooms both name
 * plainly; any other pairing would be a guess, and a wrong room is worse
 * than none (`src/routes/chat/room-map.ts` makes the same bargain).
 */
const SPORT_ROOM = 'sport';

/** What matching needs beyond the item itself. */
export interface FeedFilterContext {
  /** Room id -> the room, open rooms only. */
  openRooms: ReadonlyMap<string, ChatRoom>;
}

/** Open rooms by id, from whatever `useChatRooms` returned. */
export function openRoomsById(rooms: readonly ChatRoom[]): Map<string, ChatRoom> {
  // An administrator's read includes closed rooms. A chip for one would
  // narrow to members' profiles pointing at a room no member can open.
  return new Map(
    rooms
      .filter((room) => room.openedAt !== null && room.showInHome)
      .map((room) => [room.id, room]),
  );
}

/** Every open room an item belongs to. */
export function roomsOf(item: FeedItem, context: FeedFilterContext): string[] {
  const open = (ids: readonly string[]) => ids.filter((id) => context.openRooms.has(id));
  switch (item.kind) {
    case 'topic':
    case 'photo':
      return open([item.topic.roomId]);
    case 'event':
      return isSport(item.event) ? open([SPORT_ROOM]) : [];
    case 'person':
      return open(roomsForTopics(item.member.topics));
  }
}

/** Whether one item is in a chosen room. */
export function matchesFeedFilters(
  item: FeedItem,
  filters: FeedFilters,
  context: FeedFilterContext,
): boolean {
  if (filters.rooms.length > 0) {
    if (!roomsOf(item, context).some((room) => filters.rooms.includes(room))) return false;
  }
  return true;
}

/**
 * The open rooms something in the list belongs to, in Chat's own order.
 *
 * Built from the list a pill drew, the way Events builds its sheet from the
 * segment, so a chip is never offered that would empty the list.
 */
export function roomsIn(items: readonly FeedItem[], context: FeedFilterContext): ChatRoom[] {
  const named = new Set(items.flatMap((item) => roomsOf(item, context)));
  return [...context.openRooms.values()].filter((room) => named.has(room.id));
}

/**
 * The chips the sheet draws: what `roomsIn` offers, and every room that is on
 * even when this list has nothing in it, so a chip that is on can be turned off.
 */
export function chipsFor(
  items: readonly FeedItem[],
  filters: FeedFilters,
  context: FeedFilterContext,
): { rooms: ChatRoom[] } {
  const offered = new Set(roomsIn(items, context).map((room) => room.id));
  const rooms = [...context.openRooms.values()].filter(
    (room) => offered.has(room.id) || filters.rooms.includes(room.id),
  );
  return { rooms };
}

/** How many choices are on, for the dot on the button and Clear's count. */
export function activeFilterCount(filters: FeedFilters): number {
  return filters.rooms.length + (filters.withinMiles === null ? 0 : 1);
}

/** Toggle one room. */
export function toggleRoom(filters: FeedFilters, room: string): FeedFilters {
  const rooms = filters.rooms.includes(room)
    ? filters.rooms.filter((each) => each !== room)
    : [...filters.rooms, room];
  return { ...filters, rooms };
}
