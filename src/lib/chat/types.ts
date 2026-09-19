/**
 * The shapes Chat passes around.
 *
 * Separate from `@/types/domain` deliberately: that file is the vocabulary of
 * the club — members, events, invites — and this one is the vocabulary of one
 * feature. Nothing outside src/lib/chat and src/routes/chat should need these.
 */

/**
 * The three groupings the twelve discussion rooms fall into, in the order they
 * are drawn. `chat_rooms.category` is checked against exactly these.
 */
export const ROOM_CATEGORIES = ['Body', 'Life', 'Kit'] as const;
export type RoomCategory = (typeof ROOM_CATEGORIES)[number];

export interface ChatRoom {
  /** A slug — `bowel`, `bladder` — and what is in the URL. */
  id: string;
  name: string;
  description: string;
  category: RoomCategory;
  /** A decorative text glyph. The room's name is always printed beside it. */
  icon: string;
  sortOrder: number;
  /**
   * When an administrator opened the room, or null while it is closed.
   *
   * A member never sees a closed room at all — the select policy excludes it,
   * so a null here means the reader is an administrator looking at /admin.
   */
  openedAt: string | null;
}

/**
 * The segments across the top of /chat, in the order they are drawn.
 *
 * The mock's, from `chatPage()`. `all` is first and is the default: it is the
 * one that answers "what is there", and the other three are narrowings of it.
 */
export const CHAT_SEGMENTS = ['all', 'direct', 'groups', 'rooms'] as const;
export type ChatSegment = (typeof CHAT_SEGMENTS)[number];
