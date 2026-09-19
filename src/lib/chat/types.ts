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

/**
 * Somebody who wrote something, as `chat_authors` projects them.
 *
 * Not a profile: no city, no bio, no age. A member who has turned themselves
 * off the directory is still an author here, which is the whole reason the view
 * exists — see src/lib/chat/authors.ts.
 */
export interface ChatAuthor {
  id: string;
  displayName: string;
  photoPath: string | null;
  photoAlt: string | null;
  avatarColor: string | null;
  /** Exact level where they gave one, the range otherwise. May be absent. */
  level: string | null;
  isAdmin: boolean;
  /** Whether /peers/:id will show them, and therefore whether to link. */
  hasProfile: boolean;
}

/** How many topics, posts and members a room has. Counts only, never who. */
export interface RoomStats {
  topicCount: number;
  postCount: number;
  memberCount: number;
}

/** One topic in a room, as `chat_topics_for` returns it. */
export interface ChatTopic {
  id: string;
  roomId: string;
  title: string;
  /** Null when the member who started it has been removed from the club. */
  authorId: string | null;
  createdAt: string;
  lastPostAt: string;
  replyCount: number;
  /** People who have opened it, not times it has been opened. */
  viewCount: number;
  unread: boolean;
  /** The first four people to post, in the order they first did. */
  participantIds: string[];
}

/**
 * The three orders the topic list can be read in, and the mock's labels.
 *
 * `activity` is first and is the default: a forum is a list of what is being
 * talked about now, and the other two are ways of asking a different question
 * of the same list.
 */
export const ROOM_SORTS = ['activity', 'replies', 'views'] as const;
export type RoomSort = (typeof ROOM_SORTS)[number];

/** One post in a topic. */
export interface ChatPost {
  id: string;
  topicId: string;
  /** Null when the member who wrote it has been removed from the club. */
  authorId: string | null;
  /** Empty once the post is removed — the database blanks the column. */
  body: string;
  createdAt: string;
  removedAt: string | null;
  /** Which sentence the reader gets: by its author, or by an administrator. */
  removedByAdmin: boolean;
}
