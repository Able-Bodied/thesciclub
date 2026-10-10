import type { ChatRoom } from '@/lib/chat/types';
import type { FeedItem } from '@/lib/home/types';
import { roomsForTopics } from '@/routes/chat/room-map';
import { isOnline, isSport } from '@/routes/events/filters';

/**
 * What "Filter your feed" narrows Home's list by. All pure.
 *
 * The pills across the top say what kind of thing is listed; this narrows
 * what is inside them, by room and by place. It filters the list a pill
 * already drew and nothing else, so the count in the sheet is the list behind
 * it: "2 of 8 match" on Events means two of the eight cards on screen, not two
 * events somewhere in the next month that the pill never showed.
 *
 * An empty choice in a group means "do not narrow by this", never "match
 * nothing", for the reason `src/routes/events/filters.ts` gives. Within a
 * group a choice widens (this room or that one); across groups it narrows (in
 * this room and in this place).
 */

export interface FeedFilters {
  /** Room ids, as `chat_rooms.id` spells them. */
  rooms: string[];
  cities: string[];
  /**
   * "Online", beside the cities in Where.
   *
   * Its own flag rather than one more string among the cities, so a member
   * who typed "Online" as their city is not an online event.
   */
  online: boolean;
}

export const EMPTY_FEED_FILTERS: FeedFilters = { rooms: [], cities: [], online: false };

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
  /**
   * Member id -> their city, for members in Peers.
   *
   * A topic has no city of its own (`ChatAuthor` leaves it out on purpose).
   * It is placed by its author's city only when the author is in Peers, where
   * that city is already shown. An author hidden from Peers is not in this
   * map, so their topic matches no place and is not placed by what they wrote.
   */
  cityOf: ReadonlyMap<string, string | null>;
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

function tidyCity(city: string | null | undefined): string | null {
  const value = city?.trim() ?? '';
  return value === '' ? null : value;
}

/** The city an item is in, or null when it has none. */
export function cityOf(item: FeedItem, context: FeedFilterContext): string | null {
  switch (item.kind) {
    case 'topic':
    case 'photo':
      return item.topic.authorId ? tidyCity(context.cityOf.get(item.topic.authorId)) : null;
    case 'event':
      return tidyCity(item.event.city);
    case 'person':
      return tidyCity(item.member.city);
  }
}

/** Whether an item is somewhere a member can be without getting there. */
function isOnlineItem(item: FeedItem): boolean {
  // Only an event is. A topic is written from wherever its author is, and a
  // member lives somewhere.
  return item.kind === 'event' && isOnline(item.event);
}

/** Whether one item survives every group that has a choice in it. */
export function matchesFeedFilters(
  item: FeedItem,
  filters: FeedFilters,
  context: FeedFilterContext,
): boolean {
  if (filters.rooms.length > 0) {
    if (!roomsOf(item, context).some((room) => filters.rooms.includes(room))) return false;
  }
  if (filters.cities.length > 0 || filters.online) {
    const city = cityOf(item, context);
    const inCity = city !== null && filters.cities.includes(city);
    const online = filters.online && isOnlineItem(item);
    if (!inCity && !online) return false;
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
 * The places something in the list is in: its cities, most common first, and
 * whether anything is online.
 *
 * Frequency first for the reason `citiesIn` gives on Events: a city with one
 * thing in it is rarely what somebody is looking for.
 */
export function placesIn(
  items: readonly FeedItem[],
  context: FeedFilterContext,
): { cities: string[]; online: boolean } {
  const counts = new Map<string, number>();
  for (const item of items) {
    const city = cityOf(item, context);
    if (city) counts.set(city, (counts.get(city) ?? 0) + 1);
  }
  const cities = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([city]) => city);
  return { cities, online: items.some(isOnlineItem) };
}

/**
 * The chips the sheet draws: what `roomsIn` and `placesIn` offer, and every
 * choice that is on even when this pill has nothing it matches.
 *
 * The filters outlive a change of pill. A city chosen under People may have
 * no event in it, and on Events its chip would otherwise vanish while it still
 * held the list empty, with Clear the only way to find out why. A chip that is
 * on is always there to be turned off.
 */
export function chipsFor(
  items: readonly FeedItem[],
  filters: FeedFilters,
  context: FeedFilterContext,
): { rooms: ChatRoom[]; cities: string[]; online: boolean } {
  const offeredRooms = new Set(roomsIn(items, context).map((room) => room.id));
  const rooms = [...context.openRooms.values()].filter(
    (room) => offeredRooms.has(room.id) || filters.rooms.includes(room.id),
  );
  const places = placesIn(items, context);
  const cities = [
    ...places.cities,
    ...filters.cities.filter((city) => !places.cities.includes(city)),
  ];
  return { rooms, cities, online: places.online || filters.online };
}

/** How many choices are on, for the dot on the button and Clear's count. */
export function activeFilterCount(filters: FeedFilters): number {
  return filters.rooms.length + filters.cities.length + (filters.online ? 1 : 0);
}

/** Toggle one room or one city. */
export function toggleFeedFilter(
  filters: FeedFilters,
  key: 'rooms' | 'cities',
  value: string,
): FeedFilters {
  const current = filters[key];
  const next = current.includes(value)
    ? current.filter((each) => each !== value)
    : [...current, value];
  return { ...filters, [key]: next };
}
